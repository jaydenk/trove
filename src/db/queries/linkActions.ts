import { Database } from "bun:sqlite";
import { newId } from "../../lib/id";

export interface LinkAction {
  id: string;
  linkId: string;
  pluginId: string;
  status: string;
  message: string | null;
  createdAt: string;
}

interface LinkActionRow {
  id: string;
  link_id: string;
  plugin_id: string;
  status: string;
  message: string | null;
  created_at: string;
}

function rowToLinkAction(row: LinkActionRow): LinkAction {
  return {
    id: row.id,
    linkId: row.link_id,
    pluginId: row.plugin_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  };
}

export function recordAction(
  db: Database,
  input: {
    linkId: string;
    pluginId: string;
    status: string;
    message?: string | null;
  }
): LinkAction {
  const id = newId();
  const message = input.message ?? null;

  db.query(
    "INSERT INTO link_actions (id, link_id, plugin_id, status, message) VALUES (?, ?, ?, ?, ?)"
  ).run(id, input.linkId, input.pluginId, input.status, message);

  const row = db
    .query<LinkActionRow, [string]>(
      "SELECT * FROM link_actions WHERE id = ?"
    )
    .get(id)!;

  return rowToLinkAction(row);
}

export function listActionsForLink(
  db: Database,
  linkId: string
): LinkAction[] {
  const rows = db
    .query<LinkActionRow, [string]>(
      "SELECT * FROM link_actions WHERE link_id = ? ORDER BY created_at DESC"
    )
    .all(linkId);

  return rows.map(rowToLinkAction);
}
