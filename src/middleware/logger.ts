import { createMiddleware } from "hono/factory";
import pino from "pino";

export const logger = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
});

export function loggerMiddleware() {
  return createMiddleware(async (c, next) => {
    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        duration,
      },
      `${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`,
    );
  });
}
