import { Database } from "bun:sqlite";
import { newId } from "../../lib/id";
import type { ExportLink } from "../../services/exporter";

export interface Link {
  id: string;
  user_id: string;
  url: string;
  title: string;
  description: string | null;
  content: string | null;
  favicon_url: string | null;
  image_url: string | null;
  domain: string | null;
  collection_id: string | null;
  status: string;
  extraction_status: string;
  source: string;
  source_feed: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkWithTags extends Link {
  tags: { id: string; name: string }[];
}

export interface CreateLinkInput {
  url: string;
  title?: string;
  collectionId?: string;
  source?: string;
  sourceFeed?: string;
}

export interface UpdateLinkInput {
  title?: string;
  collectionId?: string;
  status?: string;
}

export interface UpdateExtractionInput {
  title?: string;
  description?: string;
  content?: string;
  raw_html?: string;
  favicon_url?: string;
  image_url?: string;
  domain?: string;
  extraction_status: string;
}

export interface ListLinksFilters {
  q?: string;
  collection_id?: string;
  tag?: string;
  domain?: string;
  status?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedLinks {
  data: LinkWithTags[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getInboxCollectionId(db: Database, userId: string): string | null {
  const inbox = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM collections WHERE user_id = ? AND name = ?"
    )
    .get(userId, "inbox");
  return inbox?.id ?? null;
}

function getTagsForLink(
  db: Database,
  linkId: string
): { id: string; name: string }[] {
  return db
    .query<{ id: string; name: string }, [string]>(
      `SELECT t.id, t.name FROM tags t
       INNER JOIN link_tags lt ON lt.tag_id = t.id
       WHERE lt.link_id = ?
       ORDER BY t.name`
    )
    .all(linkId);
}

export function createLink(
  db: Database,
  userId: string,
  input: CreateLinkInput
): Link {
  const id = newId();
  const domain = extractDomain(input.url);
  const title = input.title || domain;
  const collectionId = input.collectionId ?? getInboxCollectionId(db, userId);
  const source = input.source ?? "manual";
  const sourceFeed = input.sourceFeed ?? null;

  db.query(
    `INSERT INTO links (id, user_id, url, title, domain, collection_id, source, source_feed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, input.url, title, domain, collectionId, source, sourceFeed);

  return db
    .query<Link, [string]>("SELECT * FROM links WHERE id = ?")
    .get(id)!;
}

export function getLink(
  db: Database,
  userId: string,
  id: string
): LinkWithTags | null {
  const link = db
    .query<Link, [string, string]>(
      "SELECT * FROM links WHERE id = ? AND user_id = ?"
    )
    .get(id, userId);

  if (!link) return null;

  const tags = getTagsForLink(db, id);
  return { ...link, tags };
}

export function listLinks(
  db: Database,
  userId: string,
  filters: ListLinksFilters = {}
): PaginatedLinks {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["l.user_id = ?"];
  const params: (string | number)[] = [userId];

  let usesFts = false;
  let selectSnippet = "";

  if (filters.q) {
    usesFts = true;
    conditions.push("fts.links_fts MATCH ?");
    // Add * suffix for prefix matching (e.g., "type" matches "typescript")
    // Escape double quotes in the query and wrap each term with *
    const ftsQuery = filters.q
      .replace(/"/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"*`)
      .join(" ");
    params.push(ftsQuery);
    selectSnippet =
      ", snippet(links_fts, 1, '<mark>', '</mark>', '...', 32) as snippet";
  }

  if (filters.collection_id) {
    conditions.push("l.collection_id = ?");
    params.push(filters.collection_id);
  }

  if (filters.tag) {
    conditions.push(
      "EXISTS (SELECT 1 FROM link_tags lt INNER JOIN tags t ON t.id = lt.tag_id WHERE lt.link_id = l.id AND t.name = ?)"
    );
    params.push(filters.tag);
  }

  if (filters.domain) {
    conditions.push("l.domain = ?");
    params.push(filters.domain);
  }

  if (filters.status) {
    conditions.push("l.status = ?");
    params.push(filters.status);
  }

  if (filters.source) {
    conditions.push("l.source = ?");
    params.push(filters.source);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  let fromClause: string;
  if (usesFts) {
    fromClause = `FROM links l INNER JOIN links_fts fts ON l.id = fts.id`;
  } else {
    fromClause = `FROM links l`;
  }

  // Count query
  const countSql = `SELECT COUNT(*) as total ${fromClause} ${whereClause}`;
  const countResult = db
    .query<{ total: number }, (string | number)[]>(countSql)
    .get(...params);
  const total = countResult?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  // Data query
  const dataSql = `SELECT l.*${selectSnippet} ${fromClause} ${whereClause} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
  const dataParams = [...params, limit, offset];
  const rows = db
    .query<Link & { snippet?: string }, (string | number)[]>(dataSql)
    .all(...dataParams);

  // Attach tags to each link
  const data: LinkWithTags[] = rows.map((row) => {
    const tags = getTagsForLink(db, row.id);
    return { ...row, tags };
  });

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}

export function updateLink(
  db: Database,
  userId: string,
  id: string,
  input: UpdateLinkInput
): Link {
  const existing = db
    .query<Link, [string, string]>(
      "SELECT * FROM links WHERE id = ? AND user_id = ?"
    )
    .get(id, userId);

  if (!existing) {
    throw new Error("Link not found");
  }

  const title = input.title ?? existing.title;
  const collectionId =
    input.collectionId !== undefined
      ? input.collectionId
      : existing.collection_id;
  const status = input.status ?? existing.status;

  db.query(
    `UPDATE links SET title = ?, collection_id = ?, status = ? WHERE id = ? AND user_id = ?`
  ).run(title, collectionId, status, id, userId);

  return db
    .query<Link, [string]>("SELECT * FROM links WHERE id = ?")
    .get(id)!;
}

export function deleteLink(
  db: Database,
  userId: string,
  id: string
): void {
  db.query("DELETE FROM links WHERE id = ? AND user_id = ?").run(id, userId);
}

export function archiveLink(
  db: Database,
  userId: string,
  id: string
): void {
  db.query(
    "UPDATE links SET status = 'archived' WHERE id = ? AND user_id = ?"
  ).run(id, userId);
}

export function updateExtraction(
  db: Database,
  linkId: string,
  data: UpdateExtractionInput
): void {
  db.query(
    `UPDATE links SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       content = COALESCE(?, content),
       raw_html = COALESCE(?, raw_html),
       favicon_url = COALESCE(?, favicon_url),
       image_url = COALESCE(?, image_url),
       domain = COALESCE(?, domain),
       extraction_status = ?
     WHERE id = ?`
  ).run(
    data.title ?? null,
    data.description ?? null,
    data.content ?? null,
    data.raw_html ?? null,
    data.favicon_url ?? null,
    data.image_url ?? null,
    data.domain ?? null,
    data.extraction_status,
    linkId
  );
}

export function exportLinks(db: Database, userId: string): ExportLink[] {
  const rows = db
    .query<
      {
        id: string;
        url: string;
        title: string;
        description: string | null;
        domain: string | null;
        collection_name: string;
        source: string;
        created_at: string;
        updated_at: string;
      },
      [string]
    >(
      `SELECT l.id, l.url, l.title, l.description, l.domain,
              COALESCE(c.name, 'inbox') as collection_name,
              l.source, l.created_at, l.updated_at
       FROM links l
       LEFT JOIN collections c ON c.id = l.collection_id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC`
    )
    .all(userId);

  return rows.map((row) => {
    const tags = db
      .query<{ name: string }, [string]>(
        `SELECT t.name FROM tags t
         INNER JOIN link_tags lt ON lt.tag_id = t.id
         WHERE lt.link_id = ?
         ORDER BY t.name`
      )
      .all(row.id)
      .map((t) => t.name);

    return {
      url: row.url,
      title: row.title,
      description: row.description,
      domain: row.domain,
      collectionName: row.collection_name,
      tags,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}
