import { Database } from "bun:sqlite";
import { newId } from "../../lib/id";

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface TagWithCount extends Tag {
  link_count: number;
}

export function createTag(db: Database, userId: string, name: string): Tag {
  const id = newId();
  db.query(
    `INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)`
  ).run(id, userId, name);

  return db.query<Tag, [string]>("SELECT * FROM tags WHERE id = ?").get(id)!;
}

export function listTags(db: Database, userId: string): TagWithCount[] {
  return db
    .query<TagWithCount, [string]>(
      `SELECT t.*, COALESCE(COUNT(lt.link_id), 0) as link_count
       FROM tags t
       LEFT JOIN link_tags lt ON lt.tag_id = t.id
       WHERE t.user_id = ?
       GROUP BY t.id
       ORDER BY t.name`
    )
    .all(userId);
}

export function updateTag(
  db: Database,
  userId: string,
  id: string,
  name: string
): Tag {
  const existing = db
    .query<Tag, [string, string]>(
      "SELECT * FROM tags WHERE id = ? AND user_id = ?"
    )
    .get(id, userId);

  if (!existing) {
    throw new Error("Tag not found");
  }

  db.query("UPDATE tags SET name = ? WHERE id = ? AND user_id = ?").run(
    name,
    id,
    userId
  );

  return db.query<Tag, [string]>("SELECT * FROM tags WHERE id = ?").get(id)!;
}

export function deleteTag(
  db: Database,
  userId: string,
  id: string
): void {
  db.query("DELETE FROM tags WHERE id = ? AND user_id = ?").run(id, userId);
}

export function addTagToLink(
  db: Database,
  linkId: string,
  tagId: string
): void {
  db.query(
    `INSERT OR IGNORE INTO link_tags (link_id, tag_id) VALUES (?, ?)`
  ).run(linkId, tagId);
}

export function removeTagFromLink(
  db: Database,
  linkId: string,
  tagId: string
): void {
  db.query("DELETE FROM link_tags WHERE link_id = ? AND tag_id = ?").run(
    linkId,
    tagId
  );
}

export function getOrCreateTag(
  db: Database,
  userId: string,
  name: string
): Tag {
  const existing = db
    .query<Tag, [string, string]>(
      "SELECT * FROM tags WHERE user_id = ? AND name = ?"
    )
    .get(userId, name);

  if (existing) {
    return existing;
  }

  return createTag(db, userId, name);
}
