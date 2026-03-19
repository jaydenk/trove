import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getDb } from "../db/connection";
import { findByToken } from "../db/queries/users";
import { createLink, getLink, listLinks } from "../db/queries/links";
import {
  listCollections,
  getCollectionByName,
} from "../db/queries/collections";
import { listTags, getOrCreateTag, addTagToLink } from "../db/queries/tags";
import { getPluginConfig } from "../db/queries/pluginConfig";
import { recordAction } from "../db/queries/linkActions";
import { getPluginById, isPluginEnabledForUser } from "../db/queries/plugins";
import { executePlugin } from "../plugins/executor";
import { seedSystemPlugins } from "../seed";
import { extractAndUpdate } from "../services/extractor";

import type { TemplateContext } from "../plugins/template";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const db = getDb();
seedSystemPlugins(db);

// ---------------------------------------------------------------------------
// Auth — resolve the user from TROVE_API_TOKEN
// ---------------------------------------------------------------------------

const token = process.env.TROVE_API_TOKEN;
if (!token) {
  console.error("Error: TROVE_API_TOKEN environment variable is not set");
  process.exit(1);
}

const user = findByToken(db, token);
if (!user) {
  console.error("Error: TROVE_API_TOKEN is invalid — no matching user found");
  process.exit(1);
}

const userId = user.id;

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "trove", version: "1.0.0" });

// ---------------------------------------------------------------------------
// Tool: search_links
// ---------------------------------------------------------------------------

server.registerTool(
  "search_links",
  {
    description:
      "Full-text search across all saved links. Returns matching links with title, URL, description, tags, and relevance snippets.",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max results to return (default 10)"),
      collection: z
        .string()
        .optional()
        .describe("Filter by collection name"),
      tag: z.string().optional().describe("Filter by tag name"),
    },
  },
  async ({ query, limit, collection, tag }) => {
    try {
      let collectionId: string | undefined;
      if (collection) {
        const col = getCollectionByName(db, userId, collection);
        if (!col) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Collection "${collection}" not found`,
              },
            ],
            isError: true,
          };
        }
        collectionId = col.id;
      }

      const result = listLinks(db, userId, {
        q: query,
        collection_id: collectionId,
        tag,
        limit,
        page: 1,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_link
// ---------------------------------------------------------------------------

server.registerTool(
  "get_link",
  {
    description:
      "Get a single link by ID. Returns full link data including title, URL, description, extracted content, tags, and metadata.",
    inputSchema: {
      id: z.string().describe("The link ID"),
    },
  },
  async ({ id }) => {
    try {
      const link = getLink(db, userId, id);
      if (!link) {
        return {
          content: [{ type: "text" as const, text: "Error: Link not found" }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(link, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: list_links
// ---------------------------------------------------------------------------

server.registerTool(
  "list_links",
  {
    description:
      "Browse saved links with optional filters. Supports filtering by collection, tag, and domain with pagination.",
    inputSchema: {
      collection: z
        .string()
        .optional()
        .describe("Filter by collection name"),
      tag: z.string().optional().describe("Filter by tag name"),
      domain: z.string().optional().describe("Filter by domain"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Max results to return (default 20)"),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe("Number of results to skip (default 0)"),
    },
  },
  async ({ collection, tag, domain, limit, offset }) => {
    try {
      let collectionId: string | undefined;
      if (collection) {
        const col = getCollectionByName(db, userId, collection);
        if (!col) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Collection "${collection}" not found`,
              },
            ],
            isError: true,
          };
        }
        collectionId = col.id;
      }

      const page = Math.floor(offset / limit) + 1;

      const result = listLinks(db, userId, {
        collection_id: collectionId,
        tag,
        domain,
        page,
        limit,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: list_collections
// ---------------------------------------------------------------------------

server.registerTool(
  "list_collections",
  {
    description:
      "List all collections with their link counts. Collections are used to organise links into groups.",
    inputSchema: {},
  },
  async () => {
    try {
      const collections = listCollections(db, userId);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(collections, null, 2) },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: list_tags
// ---------------------------------------------------------------------------

server.registerTool(
  "list_tags",
  {
    description:
      "List all tags with their link counts. Tags provide flexible cross-collection categorisation.",
    inputSchema: {},
  },
  async () => {
    try {
      const tags = listTags(db, userId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(tags, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: add_link
// ---------------------------------------------------------------------------

server.registerTool(
  "add_link",
  {
    description:
      "Save a new link to Trove. Content will be automatically extracted in the background. Optionally assign to a collection and add tags.",
    inputSchema: {
      url: z.url().describe("The URL to save"),
      title: z.string().optional().describe("Optional title override"),
      collection: z
        .string()
        .optional()
        .describe("Collection name to save into (defaults to inbox)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags to apply to the link"),
    },
  },
  async ({ url, title, collection, tags }) => {
    try {
      let collectionId: string | undefined;
      if (collection) {
        const col = getCollectionByName(db, userId, collection);
        if (!col) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Collection "${collection}" not found`,
              },
            ],
            isError: true,
          };
        }
        collectionId = col.id;
      }

      const link = createLink(db, userId, {
        url,
        title,
        collectionId,
        source: "mcp",
      });

      if (tags && tags.length > 0) {
        for (const tagName of tags) {
          const tag = getOrCreateTag(db, userId, tagName);
          addTagToLink(db, link.id, tag.id);
        }
      }

      // Fire extraction async — don't await
      extractAndUpdate(db, link.id, url);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(link, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: execute_action
// ---------------------------------------------------------------------------

server.registerTool(
  "execute_action",
  {
    description:
      "Run a plugin action on a saved link. For example, send a link to Readwise Reader or create a task in Things.",
    inputSchema: {
      link_id: z.string().describe("The link ID to act on"),
      plugin_id: z.string().describe("The plugin ID to execute"),
    },
  },
  async ({ link_id, plugin_id }) => {
    try {
      const link = getLink(db, userId, link_id);
      if (!link) {
        return {
          content: [{ type: "text" as const, text: "Error: Link not found" }],
          isError: true,
        };
      }

      // Fetch plugin from the database
      const plugin = getPluginById(db, plugin_id);
      if (!plugin) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Plugin "${plugin_id}" not found`,
            },
          ],
          isError: true,
        };
      }

      if (!plugin.manifest.execute) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Plugin "${plugin_id}" does not support execute actions`,
            },
          ],
          isError: true,
        };
      }

      // Check plugin is enabled for the user
      if (!isPluginEnabledForUser(db, userId, plugin_id)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Plugin "${plugin_id}" is not enabled for your account`,
            },
          ],
          isError: true,
        };
      }

      const config = getPluginConfig(db, userId, plugin_id);

      // Check required config keys are present
      const requiredKeys = Object.entries(plugin.manifest.config ?? {})
        .filter(([, field]) => field.required)
        .map(([key]) => key);

      const missingKeys = requiredKeys.filter(
        (key) => !config[key]?.length,
      );

      if (missingKeys.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Plugin "${plugin_id}" is not configured. Missing: ${missingKeys.join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // Build TemplateContext
      const tagNames = link.tags.map((t) => t.name);
      const context: TemplateContext = {
        link: {
          url: link.url,
          title: link.title,
          description: link.description,
          domain: link.domain,
          tags: tagNames.join(", "),
          tagsArray: JSON.stringify(tagNames),
        },
        config,
      };

      const result = await executePlugin(plugin.manifest, context);

      const actionMessage =
        result.type === "redirect" ? result.url : result.message;

      recordAction(db, {
        linkId: link_id,
        pluginId: plugin_id,
        status: result.type,
        message: actionMessage,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Connect via stdio
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Trove MCP server running on stdio");
