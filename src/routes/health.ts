import { Hono } from "hono";
import { getDb } from "../db/connection";

const health = new Hono();

health.get("/health", (c) => {
  const db = getDb();
  const row = db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM links")
    .get();
  const links = row?.count ?? 0;

  return c.json({ status: "ok", links });
});

export default health;
