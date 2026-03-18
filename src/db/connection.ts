import { Database } from "bun:sqlite";
import { runMigrations } from "./schema";

let dbInstance: Database | null = null;

export function getDb(): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.TROVE_DB_PATH;
  if (!dbPath) {
    throw new Error("TROVE_DB_PATH environment variable is not set");
  }

  dbInstance = new Database(dbPath, { create: true });
  runMigrations(dbInstance);
  return dbInstance;
}

export function createTestDb(): Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
