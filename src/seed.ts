import type { Database } from "bun:sqlite";
import { findByToken, createUser } from "./db/queries/users";
import { seedDefaultCollections } from "./db/queries/collections";

export interface SeedResult {
  created: boolean;
  userId: string;
}

/**
 * Core seed logic — importable for testing.
 * Accepts a DB instance and an admin token, creates the admin user
 * and default collections if they do not already exist.
 */
export function seedAdmin(db: Database, adminToken: string): SeedResult {
  const existing = findByToken(db, adminToken);

  if (existing) {
    return { created: false, userId: existing.id };
  }

  const user = createUser(db, {
    name: "Admin",
    apiToken: adminToken,
    isAdmin: true,
  });

  seedDefaultCollections(db, user.id);

  return { created: true, userId: user.id };
}

/* --- CLI entry point --- */
if (import.meta.main) {
  const adminToken = process.env.TROVE_ADMIN_TOKEN;
  if (!adminToken) {
    console.error("Error: TROVE_ADMIN_TOKEN environment variable is required");
    process.exit(1);
  }

  // Dynamic import so getDb/closeDb are only loaded when running as a script
  const { getDb, closeDb } = await import("./db/connection");
  const db = getDb();

  try {
    const result = seedAdmin(db, adminToken);
    if (result.created) {
      console.log(`Admin user created with token: ${adminToken}`);
    } else {
      console.log("Admin user already exists");
    }
  } finally {
    closeDb();
  }
}
