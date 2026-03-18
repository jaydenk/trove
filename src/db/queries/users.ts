import { Database } from "bun:sqlite";
import { newId } from "../../lib/id";

export interface User {
  id: string;
  name: string;
  email: string | null;
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

export function deleteUser(db: Database, id: string): void {
  db.query("DELETE FROM users WHERE id = ?").run(id);
}
