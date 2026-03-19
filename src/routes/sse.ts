import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getDb } from "../db/connection";
import { findByToken } from "../db/queries/users";
import { onLinkEvent } from "../lib/events";
import { UnauthorizedError } from "../lib/errors";

const sse = new Hono();

sse.get("/api/events", async (c) => {
  // Auth via query param — EventSource doesn't support custom headers
  const token = c.req.query("token");
  if (!token) {
    throw new UnauthorizedError();
  }

  const db = getDb();
  const user = findByToken(db, token);
  if (!user) {
    throw new UnauthorizedError();
  }

  return streamSSE(c, async (stream) => {
    // Subscribe to link events, filtered by this user's ID
    const unsubscribe = onLinkEvent((event) => {
      if (event.userId === user.id) {
        stream.writeSSE({
          event: event.type,
          data: JSON.stringify({
            linkId: event.linkId,
            timestamp: event.timestamp,
          }),
        });
      }
    });

    // Heartbeat every 30 seconds to keep the connection alive
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify({ timestamp: new Date().toISOString() }),
      });
    }, 30000);

    // Clean up on disconnect
    stream.onAbort(() => {
      unsubscribe();
      clearInterval(heartbeat);
    });

    // Keep the stream open — it will close when the client disconnects
    await new Promise(() => {});
  });
});

export default sse;
