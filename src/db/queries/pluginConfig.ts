import { Database } from "bun:sqlite";

export function getPluginConfig(
  db: Database,
  userId: string,
  pluginId: string
): Record<string, string> {
  const rows = db
    .query<{ key: string; value: string }, [string, string]>(
      "SELECT key, value FROM plugin_config WHERE user_id = ? AND plugin_id = ?"
    )
    .all(userId, pluginId);

  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

export function setPluginConfig(
  db: Database,
  userId: string,
  pluginId: string,
  config: Record<string, string>
): void {
  const stmt = db.query(
    "INSERT OR REPLACE INTO plugin_config (user_id, plugin_id, key, value) VALUES (?, ?, ?, ?)"
  );

  for (const [key, value] of Object.entries(config)) {
    stmt.run(userId, pluginId, key, value);
  }
}

export function deletePluginConfig(
  db: Database,
  userId: string,
  pluginId: string
): void {
  db.query(
    "DELETE FROM plugin_config WHERE user_id = ? AND plugin_id = ?"
  ).run(userId, pluginId);
}
