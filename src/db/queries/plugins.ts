import type { Database } from "bun:sqlite";
import type { PluginManifest } from "../../plugins/manifest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredPlugin {
  id: string;
  manifest: PluginManifest;
  name: string;
  icon: string | null;
  description: string | null;
  direction: string;
  version: string | null;
  is_system: number;
  created_at: string;
}

interface StoredPluginRow {
  id: string;
  manifest: string;
  name: string;
  icon: string | null;
  description: string | null;
  direction: string;
  version: string | null;
  is_system: number;
  created_at: string;
}

export interface PluginWithUserState extends StoredPlugin {
  enabled: boolean;
}

interface PluginWithUserStateRow extends StoredPluginRow {
  enabled: number | null;
}

function rowToStoredPlugin(row: StoredPluginRow): StoredPlugin {
  return {
    id: row.id,
    manifest: JSON.parse(row.manifest) as PluginManifest,
    name: row.name,
    icon: row.icon,
    description: row.description,
    direction: row.direction,
    version: row.version,
    is_system: row.is_system,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Plugin CRUD
// ---------------------------------------------------------------------------

export function insertPlugin(
  db: Database,
  manifest: PluginManifest,
  isSystem: boolean
): void {
  db.query(
    `INSERT OR REPLACE INTO plugins (id, manifest, name, icon, description, direction, version, is_system)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    manifest.id,
    JSON.stringify(manifest),
    manifest.name,
    manifest.icon ?? null,
    manifest.description ?? null,
    manifest.direction,
    manifest.version ?? null,
    isSystem ? 1 : 0
  );
}

export function getPluginById(
  db: Database,
  id: string
): StoredPlugin | null {
  const row = db
    .query<StoredPluginRow, [string]>(
      "SELECT * FROM plugins WHERE id = ?"
    )
    .get(id);

  if (!row) return null;
  return rowToStoredPlugin(row);
}

export function listAllPlugins(db: Database): StoredPlugin[] {
  const rows = db
    .query<StoredPluginRow, []>(
      "SELECT * FROM plugins ORDER BY name"
    )
    .all();

  return rows.map(rowToStoredPlugin);
}

export function deletePlugin(db: Database, id: string): void {
  // Delete related plugin_config rows manually (no FK on plugin_config.plugin_id)
  db.query("DELETE FROM plugin_config WHERE plugin_id = ?").run(id);
  // user_plugins will cascade via FK, but be explicit
  db.query("DELETE FROM user_plugins WHERE plugin_id = ?").run(id);
  db.query("DELETE FROM plugins WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// User plugin enable/disable
// ---------------------------------------------------------------------------

export function enablePluginForUser(
  db: Database,
  userId: string,
  pluginId: string
): void {
  db.query(
    `INSERT INTO user_plugins (user_id, plugin_id, enabled)
     VALUES (?, ?, 1)
     ON CONFLICT(user_id, plugin_id) DO UPDATE SET enabled = 1`
  ).run(userId, pluginId);
}

export function disablePluginForUser(
  db: Database,
  userId: string,
  pluginId: string
): void {
  db.query(
    `INSERT INTO user_plugins (user_id, plugin_id, enabled)
     VALUES (?, ?, 0)
     ON CONFLICT(user_id, plugin_id) DO UPDATE SET enabled = 0`
  ).run(userId, pluginId);
}

export function isPluginEnabledForUser(
  db: Database,
  userId: string,
  pluginId: string
): boolean {
  const row = db
    .query<{ enabled: number }, [string, string]>(
      "SELECT enabled FROM user_plugins WHERE user_id = ? AND plugin_id = ?"
    )
    .get(userId, pluginId);

  // If no row exists, check if it's a system plugin (default enabled)
  if (!row) {
    const plugin = db
      .query<{ is_system: number }, [string]>(
        "SELECT is_system FROM plugins WHERE id = ?"
      )
      .get(pluginId);
    return plugin?.is_system === 1;
  }

  return row.enabled === 1;
}

export function listPluginsForUser(
  db: Database,
  userId: string
): PluginWithUserState[] {
  const rows = db
    .query<PluginWithUserStateRow, [string]>(
      `SELECT p.*, up.enabled
       FROM plugins p
       LEFT JOIN user_plugins up ON up.plugin_id = p.id AND up.user_id = ?
       ORDER BY p.name`
    )
    .all(userId);

  return rows.map((row) => {
    // If no user_plugins row, default to enabled for system plugins
    const enabled =
      row.enabled !== null ? row.enabled === 1 : row.is_system === 1;

    return {
      ...rowToStoredPlugin(row),
      enabled,
    };
  });
}

export function enableAllSystemPluginsForUser(
  db: Database,
  userId: string
): void {
  const systemPlugins = db
    .query<{ id: string }, []>(
      "SELECT id FROM plugins WHERE is_system = 1"
    )
    .all();

  const stmt = db.query(
    `INSERT OR IGNORE INTO user_plugins (user_id, plugin_id, enabled)
     VALUES (?, ?, 1)`
  );

  for (const plugin of systemPlugins) {
    stmt.run(userId, plugin.id);
  }
}
