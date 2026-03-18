import { createMiddleware } from "hono/factory";
import type { Database } from "bun:sqlite";
import { findByToken, type User } from "../db/queries/users";
import { UnauthorizedError } from "../lib/errors";

export type AppVariables = {
  user: User;
};

export function authMiddleware(db: Database) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const header = c.req.header("Authorization");

    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }

    const token = header.slice(7);
    if (!token) {
      throw new UnauthorizedError();
    }

    const user = findByToken(db, token);
    if (!user) {
      throw new UnauthorizedError();
    }

    c.set("user", user);
    await next();
  });
}
