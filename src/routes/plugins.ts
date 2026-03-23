import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import {
  getPluginById,
  listPluginsForUser,
  insertPlugin,
  deletePlugin as deletePluginFromDb,
  enablePluginForUser,
  disablePluginForUser,
  isPluginEnabledForUser,
} from "../db/queries/plugins";
import { getPluginConfig, setPluginConfig } from "../db/queries/pluginConfig";
import { getLink } from "../db/queries/links";
import { recordAction } from "../db/queries/linkActions";
import { validateManifest } from "../plugins/manifest";
import type { PluginManifest } from "../plugins/manifest";
import { executePlugin, handleIngest, executeHealthCheck } from "../plugins/executor";
import type { TemplateContext } from "../plugins/template";
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../lib/errors";
import { emitLinkEvent } from "../lib/events";

const plugins = new Hono<{ Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTemplateContext(
  link: {
    url: string;
    title: string;
    description: string | null;
    domain: string | null;
    created_at: string;
    tags: { id: string; name: string }[];
  },
  config: Record<string, string>
): TemplateContext {
  const tagNames = link.tags.map((t) => t.name);
  return {
    link: {
      url: link.url,
      title: link.title,
      description: link.description,
      domain: link.domain,
      tags: tagNames.join(", "),
      tagsArray: JSON.stringify(tagNames),
      createdAt: link.created_at,
    },
    config,
  };
}

function manifestToPluginInfo(
  manifest: PluginManifest,
  opts: {
    isConfigured: boolean;
    enabled: boolean;
    isSystem: boolean;
    version: string | null;
  }
) {
  return {
    id: manifest.id,
    name: manifest.name,
    icon: manifest.icon ?? "",
    description: manifest.description ?? "",
    configSchema: manifest.config ?? {},
    hasExecute: !!manifest.execute,
    executeType: manifest.execute?.type ?? null,
    actionLabel:
      manifest.execute && "actionLabel" in manifest.execute
        ? manifest.execute.actionLabel
        : null,
    hasIngest: !!manifest.ingest,
    hasHealthCheck: !!manifest.healthCheck,
    isConfigured: opts.isConfigured,
    direction: manifest.direction,
    enabled: opts.enabled,
    isSystem: opts.isSystem,
    version: opts.version,
  };
}

// ---------------------------------------------------------------------------
// GET /api/plugins — List all plugins with user's enabled state + config
// ---------------------------------------------------------------------------

plugins.get("/api/plugins", (c) => {
  const db = getDb();
  const user = c.get("user");
  const allPlugins = listPluginsForUser(db, user.id);

  const result = allPlugins.map((p) => {
    const config = getPluginConfig(db, user.id, p.id);
    const requiredKeys = Object.entries(p.manifest.config ?? {})
      .filter(([, field]) => field.required)
      .map(([key]) => key);
    const isConfigured = requiredKeys.every(
      (key) => config[key]?.length > 0
    );

    return manifestToPluginInfo(p.manifest, {
      isConfigured,
      enabled: p.enabled,
      isSystem: p.is_system === 1,
      version: p.version,
    });
  });

  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/plugins — Upload new plugin manifest (admin only)
// ---------------------------------------------------------------------------

plugins.post("/api/plugins", async (c) => {
  const user = c.get("user");
  if (user.is_admin !== 1) {
    throw new ForbiddenError("Only admins can upload plugins");
  }

  const body = await c.req.json();
  const validation = validateManifest(body);

  if (!validation.valid) {
    throw new ValidationError(
      `Invalid manifest: ${validation.errors.join("; ")}`
    );
  }

  const db = getDb();

  // Check if plugin with this ID already exists
  const existing = getPluginById(db, validation.manifest.id);
  if (existing) {
    throw new ValidationError(
      `Plugin with ID '${validation.manifest.id}' already exists`
    );
  }

  insertPlugin(db, validation.manifest, false);

  const config = getPluginConfig(db, user.id, validation.manifest.id);
  const requiredKeys = Object.entries(validation.manifest.config ?? {})
    .filter(([, field]) => field.required)
    .map(([key]) => key);
  const isConfigured = requiredKeys.every(
    (key) => config[key]?.length > 0
  );

  return c.json(
    manifestToPluginInfo(validation.manifest, {
      isConfigured,
      enabled: false,
      isSystem: false,
      version: validation.manifest.version ?? null,
    }),
    201
  );
});

// ---------------------------------------------------------------------------
// DELETE /api/plugins/:id — Delete plugin (admin only, not system)
// ---------------------------------------------------------------------------

plugins.delete("/api/plugins/:id", (c) => {
  const user = c.get("user");
  if (user.is_admin !== 1) {
    throw new ForbiddenError("Only admins can delete plugins");
  }

  const db = getDb();
  const pluginId = c.req.param("id");
  const plugin = getPluginById(db, pluginId);

  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  if (plugin.is_system === 1) {
    throw new ValidationError("Cannot delete system plugins");
  }

  deletePluginFromDb(db, pluginId);
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// PUT /api/plugins/:id/enable — Enable plugin for current user
// ---------------------------------------------------------------------------

plugins.put("/api/plugins/:id/enable", (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  enablePluginForUser(db, user.id, pluginId);
  return c.json({ enabled: true });
});

// ---------------------------------------------------------------------------
// PUT /api/plugins/:id/disable — Disable plugin for current user
// ---------------------------------------------------------------------------

plugins.put("/api/plugins/:id/disable", (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  disablePluginForUser(db, user.id, pluginId);
  return c.json({ enabled: false });
});

// ---------------------------------------------------------------------------
// GET /api/plugins/:id/config — Get current user's config for a plugin
// ---------------------------------------------------------------------------

plugins.get("/api/plugins/:id/config", (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  const config = getPluginConfig(db, user.id, pluginId);
  return c.json({ config, schema: plugin.manifest.config ?? {} });
});

// ---------------------------------------------------------------------------
// PUT /api/plugins/:id/config — Set config for a plugin
// ---------------------------------------------------------------------------

plugins.put("/api/plugins/:id/config", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  const body = await c.req.json<Record<string, string>>();
  setPluginConfig(db, user.id, pluginId, body);

  const config = getPluginConfig(db, user.id, pluginId);
  return c.json({ config });
});

// ---------------------------------------------------------------------------
// POST /api/links/:id/actions/:pluginId — Execute a plugin action on a link
// ---------------------------------------------------------------------------

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

  // 2. Get the plugin from DB
  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  // 3. Check user has it enabled
  if (!isPluginEnabledForUser(db, user.id, pluginId)) {
    throw new ValidationError("Plugin is not enabled for your account");
  }

  // 4. Check plugin has execute capability
  if (!plugin.manifest.execute) {
    throw new ValidationError("Plugin does not support execute actions");
  }

  // 5. Get plugin config, check required keys
  const config = getPluginConfig(db, user.id, pluginId);
  const requiredKeys = Object.entries(plugin.manifest.config ?? {})
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

  // 6. Build TemplateContext
  const context = buildTemplateContext(link, config);

  // 7. Execute
  const result = await executePlugin(plugin.manifest, context);

  // 8. Record the action
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

  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/plugins/:id/health-check — Run health check for a plugin
// ---------------------------------------------------------------------------

plugins.post("/api/plugins/:id/health-check", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  if (!plugin.manifest.healthCheck) {
    throw new ValidationError("Plugin does not have a health check");
  }

  const config = getPluginConfig(db, user.id, pluginId);
  const result = await executeHealthCheck(plugin.manifest.healthCheck, config);

  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/plugins/:id/test — Test execute with synthetic data
// ---------------------------------------------------------------------------

plugins.post("/api/plugins/:id/test", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  if (!plugin.manifest.execute) {
    throw new ValidationError("Plugin does not support execute actions");
  }

  const config = getPluginConfig(db, user.id, pluginId);

  // Check required config keys
  const requiredKeys = Object.entries(plugin.manifest.config ?? {})
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

  // Build synthetic test context
  const context: TemplateContext = {
    link: {
      url: "https://trove.test/plugin-test",
      title: "[Trove Test] Plugin Verification",
      description:
        "This is a test item created by Trove to verify plugin configuration. Safe to delete.",
      domain: "trove.test",
      tags: "trove-test",
      tagsArray: '["trove-test"]',
      createdAt: new Date().toISOString(),
    },
    config,
  };

  const result = await executePlugin(plugin.manifest, context);

  // Do NOT record action — test executions should not pollute history

  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/plugins/:id/webhook — Inbound webhook for ingest plugins
// ---------------------------------------------------------------------------

plugins.post("/api/plugins/:id/webhook", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  // 1. Get the plugin from DB
  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  // 2. Check plugin has ingest capability
  if (!plugin.manifest.ingest) {
    throw new ValidationError("Plugin does not support ingest");
  }

  // 3. Handle ingest
  const body = await c.req.json();
  const result = await handleIngest(plugin.manifest, body, db, user.id);

  if (result.created > 0) {
    emitLinkEvent({ type: "link:created", linkId: "ingest", userId: user.id });
  }

  return c.json(result);
});

export default plugins;
