import { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import { newId } from "../../lib/id";

export interface User {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  password_hash: string | null;
  api_token: string;
  is_admin: number;
  created_at: string;
}

export interface CreateUserInput {
  name: string;
  email?: string;
  apiToken: string;
  isAdmin?: boolean;
}

export interface CreateUserWithPasswordInput {
  name: string;
  username: string;
  password: string;
  email?: string;
  isAdmin?: boolean;
}

export function findByToken(db: Database, token: string): User | null {
  return (
    db.query<User, [string]>("SELECT * FROM users WHERE api_token = ?").get(token) ??
    null
  );
}

export function createUser(db: Database, input: CreateUserInput): User {
  const id = newId();
  const { name, email, apiToken, isAdmin } = input;

  db.query(
    `INSERT INTO users (id, name, email, api_token, is_admin) VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, email ?? null, apiToken, isAdmin ? 1 : 0);

  return db.query<User, [string]>("SELECT * FROM users WHERE id = ?").get(id)!;
}

export function listUsers(db: Database): User[] {
  return db.query<User, []>("SELECT * FROM users").all();
}

export function findById(db: Database, id: string): User | null {
  return (
    db.query<User, [string]>("SELECT * FROM users WHERE id = ?").get(id) ??
    null
  );
}

export function updateUser(
  db: Database,
  id: string,
  input: { name?: string; email?: string }
): User {
  const existing = db
    .query<User, [string]>("SELECT * FROM users WHERE id = ?")
    .get(id);

  if (!existing) {
    throw new Error("User not found");
  }

  const name = input.name ?? existing.name;
  const email = input.email !== undefined ? input.email : existing.email;

  db.query("UPDATE users SET name = ?, email = ? WHERE id = ?").run(
    name,
    email,
    id
  );

  return db.query<User, [string]>("SELECT * FROM users WHERE id = ?").get(id)!;
}

export function deleteUser(db: Database, id: string): void {
  db.query("DELETE FROM users WHERE id = ?").run(id);
}

export function findByUsername(db: Database, username: string): User | null {
  return (
    db.query<User, [string]>("SELECT * FROM users WHERE username = ?").get(username) ??
    null
  );
}

export async function createUserWithPassword(
  db: Database,
  input: CreateUserWithPasswordInput
): Promise<User> {
  const id = newId();
  const { name, username, password, email, isAdmin } = input;

  const passwordHash = await Bun.password.hash(password);
  const apiToken = nanoid(32);

  db.query(
    `INSERT INTO users (id, name, email, username, password_hash, api_token, is_admin)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, email ?? null, username, passwordHash, apiToken, isAdmin ? 1 : 0);

  return db.query<User, [string]>("SELECT * FROM users WHERE id = ?").get(id)!;
}

export async function verifyPassword(
  db: Database,
  username: string,
  password: string
): Promise<User | null> {
  const user = findByUsername(db, username);
  if (!user || !user.password_hash) {
    return null;
  }

  const valid = await Bun.password.verify(password, user.password_hash);
  return valid ? user : null;
}

export async function updatePassword(
  db: Database,
  userId: string,
  newPassword: string
): Promise<void> {
  const hash = await Bun.password.hash(newPassword);
  db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
}

export function regenerateToken(db: Database, userId: string): string {
  const newToken = nanoid(32);
  db.query("UPDATE users SET api_token = ? WHERE id = ?").run(newToken, userId);
  return newToken;
}

export function updateUsername(
  db: Database,
  userId: string,
  username: string
): void {
  db.query("UPDATE users SET username = ? WHERE id = ?").run(username, userId);
}
