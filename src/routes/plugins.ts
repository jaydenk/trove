import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import { getPlugin, listPluginInfo } from "../plugins/registry";
import { getPluginConfig, setPluginConfig } from "../db/queries/pluginConfig";
import { getLink } from "../db/queries/links";
import { recordAction } from "../db/queries/linkActions";
import { NotFoundError, ValidationError } from "../lib/errors";
import type { PluginLink } from "../plugins/types";

const plugins = new Hono<{ Variables: AppVariables }>();

// GET /api/plugins — List all registered plugins with config status
plugins.get("/api/plugins", (c) => {
  const db = getDb();
  const user = c.get("user");
  const info = listPluginInfo(db, user.id);
  return c.json(info);
});

// GET /api/plugins/:id/config — Get current user's config for a specific plugin
plugins.get("/api/plugins/:id/config", (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  const config = getPluginConfig(db, user.id, pluginId);
  return c.json({ config, schema: plugin.configSchema });
});

// PUT /api/plugins/:id/config — Set config for a plugin
plugins.put("/api/plugins/:id/config", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  const body = await c.req.json<Record<string, string>>();
  setPluginConfig(db, user.id, pluginId, body);

  const config = getPluginConfig(db, user.id, pluginId);
  return c.json({ config });
});

// POST /api/links/:id/actions/:pluginId — Execute a plugin action on a link
plugins.post("/api/links/:id/actions/:pluginId", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const linkId = c.req.param("id");
  const pluginId = c.req.param("pluginId");

  // 1. Get the link
  const link = getLink(db, user.id, linkId);
  if (!link) {
    throw new NotFoundError("Link not found");
  }

  // 2. Get the plugin
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  // 3. Check plugin has execute capability
  if (!plugin.execute) {
    throw new ValidationError("Plugin does not support execute actions");
  }

  // 4. Get plugin config, check all required keys are present
  const config = getPluginConfig(db, user.id, pluginId);
  const requiredKeys = Object.entries(plugin.configSchema)
    .filter(([, field]) => field.required)
    .map(([key]) => key);

  const missingKeys = requiredKeys.filter(
    (key) => !config[key] || config[key].length === 0
  );
  if (missingKeys.length > 0) {
    throw new ValidationError(
      `Plugin is not configured. Missing: ${missingKeys.join(", ")}`
    );
  }

  // 5. Build a PluginLink from the link data
  const pluginLink: PluginLink = {
    id: link.id,
    url: link.url,
    title: link.title,
    description: link.description,
    domain: link.domain,
    tags: link.tags,
  };

  // 6. Call plugin.execute.run
  const result = await plugin.execute.run(pluginLink, config);

  // 7. Record the action
  const message =
    result.type === "error"
      ? result.message
      : result.type === "redirect"
        ? result.url
        : result.message;

  recordAction(db, {
    linkId,
    pluginId,
    status: result.type,
    message,
  });

  // 8. Return the PluginResult
  return c.json(result);
});

// POST /api/plugins/:id/webhook — Inbound webhook for ingest plugins
plugins.post("/api/plugins/:id/webhook", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  // 1. Get the plugin
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  // 2. Check plugin has ingest capability
  if (!plugin.ingest) {
    throw new ValidationError("Plugin does not support ingest");
  }

  // 3. Get plugin config for the user
  const config = getPluginConfig(db, user.id, pluginId);

  // 4. Call plugin.ingest.handleIngest
  const body = await c.req.json();
  const result = await plugin.ingest.handleIngest(body, config, db, user.id);

  // 5. Return the IngestResult
  return c.json(result);
});

export default plugins;
