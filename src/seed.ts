import type { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  findByToken,
  findByUsername,
  createUser,
  createUserWithPassword,
} from "./db/queries/users";
import { seedDefaultCollections } from "./db/queries/collections";
import { insertPlugin, getPluginById, enableAllSystemPluginsForUser } from "./db/queries/plugins";
import { validateManifest } from "./plugins/manifest";

export interface SeedResult {
  created: boolean;
  userId: string;
  apiToken?: string;
}

// ---------------------------------------------------------------------------
// Seed System Plugins
// ---------------------------------------------------------------------------

/**
 * Load JSON manifests from data/plugins/ and insert them as system plugins.
 * Skips any that already exist in the database. Safe to call repeatedly.
 */
export function seedSystemPlugins(db: Database): void {
  const pluginsDir = join(import.meta.dir, "..", "data", "plugins");
  let files: string[];
  try {
    files = readdirSync(pluginsDir).filter((f) => f.endsWith(".json"));
  } catch {
    // Directory doesn't exist — nothing to seed
    return;
  }

  for (const file of files) {
    const filePath = join(pluginsDir, file);
    const raw = readFileSync(filePath, "utf-8");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      console.warn(`Warning: Skipping invalid JSON in ${file}`);
      continue;
    }

    const result = validateManifest(json);
    if (!result.valid) {
      console.warn(
        `Warning: Skipping invalid manifest ${file}: ${result.errors.join("; ")}`
      );
      continue;
    }

    const existing = getPluginById(db, result.manifest.id);
    if (existing) {
      // Update the manifest for system plugins in case it changed
      if (existing.is_system === 1) {
        insertPlugin(db, result.manifest, true);
      }
      continue;
    }

    insertPlugin(db, result.manifest, true);
  }
}

// ---------------------------------------------------------------------------
// Seed Admin User
// ---------------------------------------------------------------------------

/**
 * Core seed logic (legacy token-based) — importable for testing.
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
  enableAllSystemPluginsForUser(db, user.id);

  return { created: true, userId: user.id };
}

/**
 * Password-based seed logic — creates admin with username "admin",
 * hashes the password, and auto-generates an API token.
 */
export async function seedAdminWithPassword(
  db: Database,
  password: string
): Promise<SeedResult> {
  const existing = findByUsername(db, "admin");

  if (existing) {
    return { created: false, userId: existing.id };
  }

  const user = await createUserWithPassword(db, {
    name: "Admin",
    username: "admin",
    password,
    isAdmin: true,
  });

  seedDefaultCollections(db, user.id);
  enableAllSystemPluginsForUser(db, user.id);

  return { created: true, userId: user.id, apiToken: user.api_token };
}

/* --- CLI entry point --- */
if (import.meta.main) {
  const adminPassword = process.env.TROVE_ADMIN_PASSWORD;
  const adminToken = process.env.TROVE_ADMIN_TOKEN;

  if (!adminPassword && !adminToken) {
    console.error(
      "Error: TROVE_ADMIN_PASSWORD (or TROVE_ADMIN_TOKEN for legacy mode) environment variable is required"
    );
    process.exit(1);
  }

  // Dynamic import so getDb/closeDb are only loaded when running as a script
  const { getDb, closeDb } = await import("./db/connection");
  const db = getDb();

  try {
    // Seed system plugins first
    seedSystemPlugins(db);

    if (adminPassword) {
      const result = await seedAdminWithPassword(db, adminPassword);
      if (result.created) {
        console.log(
          `Admin created. Username: admin, API Token: ${result.apiToken}`
        );
      } else {
        console.log("Admin user already exists");
      }
    } else {
      // Legacy token-based flow
      console.warn(
        "Warning: TROVE_ADMIN_TOKEN is deprecated. Use TROVE_ADMIN_PASSWORD instead."
      );
      const result = seedAdmin(db, adminToken!);
      if (result.created) {
        console.log(`Admin user created with token: ${adminToken}`);
      } else {
        console.log("Admin user already exists");
      }
    }
  } finally {
    closeDb();
  }
}
