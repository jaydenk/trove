import { Database } from "bun:sqlite";

export function getPreferences(
  db: Database,
  userId: string,
): Record<string, string> {
  const rows = db
    .query<{ key: string; value: string }, [string]>(
      "SELECT key, value FROM user_preferences WHERE user_id = ?",
    )
    .all(userId);

  const prefs: Record<string, string> = {};
  for (const row of rows) {
    prefs[row.key] = row.value;
  }
  return prefs;
}

export function setPreferences(
  db: Database,
  userId: string,
  prefs: Record<string, string>,
): void {
  const stmt = db.query(
    "INSERT OR REPLACE INTO user_preferences (user_id, key, value) VALUES (?, ?, ?)",
  );

  for (const [key, value] of Object.entries(prefs)) {
    stmt.run(userId, key, value);
  }
}
