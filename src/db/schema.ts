import { Database } from "bun:sqlite";

export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT UNIQUE,
      api_token  TEXT NOT NULL UNIQUE,
      is_admin   INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      icon       TEXT,
      color      TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url               TEXT NOT NULL,
      title             TEXT NOT NULL,
      description       TEXT,
      content           TEXT,
      raw_html          TEXT,
      favicon_url       TEXT,
      image_url         TEXT,
      domain            TEXT,
      collection_id     TEXT REFERENCES collections(id) ON DELETE SET NULL,
      status            TEXT DEFAULT 'saved',
      extraction_status TEXT DEFAULT 'pending',
      source            TEXT DEFAULT 'manual',
      source_feed       TEXT,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, url)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS link_tags (
      link_id TEXT REFERENCES links(id) ON DELETE CASCADE,
      tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (link_id, tag_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS link_actions (
      id         TEXT PRIMARY KEY,
      link_id    TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      plugin_id  TEXT NOT NULL,
      status     TEXT NOT NULL CHECK(status IN ('success', 'error', 'redirect')),
      message    TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_link_actions_link_id ON link_actions(link_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_config (
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      key       TEXT NOT NULL,
      value     TEXT NOT NULL,
      PRIMARY KEY (user_id, plugin_id, key)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id          TEXT PRIMARY KEY,
      manifest    TEXT NOT NULL,
      name        TEXT NOT NULL,
      icon        TEXT,
      description TEXT,
      direction   TEXT NOT NULL,
      version     TEXT,
      is_system   INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_plugins (
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
      enabled   INTEGER DEFAULT 1,
      PRIMARY KEY (user_id, plugin_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );
  `);

  // Migration: add username + password_hash columns to users table
  const userColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(users)")
    .all()
    .map((col) => col.name);

  if (!userColumns.includes("username")) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");
  }
  if (!userColumns.includes("password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }

  // Trigger: auto-update updated_at on links
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS links_updated_at AFTER UPDATE ON links
    WHEN old.updated_at = new.updated_at
    BEGIN
      UPDATE links SET updated_at = datetime('now') WHERE id = new.id;
    END;
  `);

  // FTS5 virtual table — cannot use IF NOT EXISTS, so check manually
  const ftsExists = db
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='links_fts'"
    )
    .get();

  if (!ftsExists) {
    db.exec(`
      CREATE VIRTUAL TABLE links_fts USING fts5(
        id UNINDEXED,
        title,
        description,
        content,
        content='links',
        content_rowid='rowid'
      );
    `);
  }

  // FTS sync triggers — check before creating
  const triggerAiExists = db
    .query(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='links_ai'"
    )
    .get();

  if (!triggerAiExists) {
    db.exec(`
      CREATE TRIGGER links_ai AFTER INSERT ON links BEGIN
        INSERT INTO links_fts(rowid, id, title, description, content)
        VALUES (new.rowid, new.id, new.title, new.description, new.content);
      END;
    `);
  }

  const triggerAuExists = db
    .query(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='links_au'"
    )
    .get();

  if (!triggerAuExists) {
    db.exec(`
      CREATE TRIGGER links_au AFTER UPDATE ON links BEGIN
        INSERT INTO links_fts(links_fts, rowid, id, title, description, content)
        VALUES ('delete', old.rowid, old.id, old.title, old.description, old.content);
        INSERT INTO links_fts(rowid, id, title, description, content)
        VALUES (new.rowid, new.id, new.title, new.description, new.content);
      END;
    `);
  }

  const triggerAdExists = db
    .query(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='links_ad'"
    )
    .get();

  if (!triggerAdExists) {
    db.exec(`
      CREATE TRIGGER links_ad AFTER DELETE ON links BEGIN
        INSERT INTO links_fts(links_fts, rowid, id, title, description, content)
        VALUES ('delete', old.rowid, old.id, old.title, old.description, old.content);
      END;
    `);
  }
}
