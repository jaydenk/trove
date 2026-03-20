import { Database } from "bun:sqlite";
import { newId } from "../../lib/id";

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: string;
}

export interface CollectionWithCount extends Collection {
  link_count: number;
}

export interface CreateCollectionInput {
  name: string;
  icon?: string;
  color?: string;
}

export interface UpdateCollectionInput {
  name?: string;
  icon?: string;
  color?: string;
}

const DEFAULT_COLLECTIONS = [
  { name: "inbox", icon: "\u{1F4E5}" },
  { name: "reference", icon: "\u{1F4DA}" },
  { name: "tools", icon: "\u{1F6E0}\uFE0F" },
  { name: "manuals", icon: "\u{1F4D6}" },
  { name: "inspiration", icon: "\u2728" },
];

export function seedDefaultCollections(db: Database, userId: string): void {
  const stmt = db.query(
    `INSERT INTO collections (id, user_id, name, icon, color) VALUES (?, ?, ?, ?, ?)`
  );

  for (const col of DEFAULT_COLLECTIONS) {
    stmt.run(newId(), userId, col.name, col.icon, null);
  }
}

export function listCollections(
  db: Database,
  userId: string
): CollectionWithCount[] {
  return db
    .query<CollectionWithCount, [string, string]>(
      `SELECT c.*, COALESCE(COUNT(l.id), 0) as link_count
       FROM collections c
       LEFT JOIN links l ON l.collection_id = c.id
         OR (l.collection_id IS NULL AND l.user_id = c.user_id AND c.name = ?)
       WHERE c.user_id = ?
       GROUP BY c.id
       ORDER BY c.name`
    )
    .all("inbox", userId);
}

export function createCollection(
  db: Database,
  userId: string,
  input: CreateCollectionInput
): Collection {
  const id = newId();
  db.query(
    `INSERT INTO collections (id, user_id, name, icon, color) VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, input.name, input.icon ?? null, input.color ?? null);

  return db
    .query<Collection, [string]>("SELECT * FROM collections WHERE id = ?")
    .get(id)!;
}

export function updateCollection(
  db: Database,
  userId: string,
  id: string,
  input: UpdateCollectionInput
): Collection {
  const existing = db
    .query<Collection, [string, string]>(
      "SELECT * FROM collections WHERE id = ? AND user_id = ?"
    )
    .get(id, userId);

  if (!existing) {
    throw new Error("Collection not found");
  }

  const name = input.name ?? existing.name;
  const icon = input.icon ?? existing.icon;
  const color = input.color ?? existing.color;

  db.query(
    `UPDATE collections SET name = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?`
  ).run(name, icon, color, id, userId);

  return db
    .query<Collection, [string]>("SELECT * FROM collections WHERE id = ?")
    .get(id)!;
}

export function getCollectionByName(
  db: Database,
  userId: string,
  name: string
): Collection | null {
  return db
    .query<Collection, [string, string]>(
      "SELECT * FROM collections WHERE user_id = ? AND name = ?"
    )
    .get(userId, name) as Collection | null;
}

export function deleteCollection(
  db: Database,
  userId: string,
  id: string
): void {
  // Find the user's inbox collection
  const inbox = db
    .query<Collection, [string, string]>(
      "SELECT * FROM collections WHERE user_id = ? AND name = ?"
    )
    .get(userId, "inbox");

  if (!inbox) {
    throw new Error("Inbox collection not found");
  }

  if (inbox.id === id) {
    throw new Error("Cannot delete the inbox collection");
  }

  // Move links from the deleted collection to inbox
  db.query(
    `UPDATE links SET collection_id = ? WHERE collection_id = ? AND user_id = ?`
  ).run(inbox.id, id, userId);

  // Delete the collection
  db.query("DELETE FROM collections WHERE id = ? AND user_id = ?").run(
    id,
    userId
  );
}
