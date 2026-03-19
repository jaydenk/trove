import type { TrovePlugin, PluginInfo } from "./types";
import type { Database } from "bun:sqlite";
import { getPluginConfig } from "../db/queries/pluginConfig";

const plugins = new Map<string, TrovePlugin>();

export function registerPlugin(plugin: TrovePlugin): void {
  if (plugins.has(plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already registered`);
  }
  if (!plugin.execute && !plugin.ingest) {
    throw new Error(`Plugin "${plugin.id}" must implement execute or ingest`);
  }
  plugins.set(plugin.id, plugin);
}

export function getPlugin(id: string): TrovePlugin | undefined {
  return plugins.get(id);
}

export function listPlugins(): TrovePlugin[] {
  return Array.from(plugins.values());
}

export function listPluginInfo(db: Database, userId: string): PluginInfo[] {
  return listPlugins().map((p) => {
    const config = getPluginConfig(db, userId, p.id);
    const requiredKeys = Object.entries(p.configSchema)
      .filter(([, field]) => field.required)
      .map(([key]) => key);
    const isConfigured = requiredKeys.every((key) => config[key]?.length > 0);

    return {
      id: p.id,
      name: p.name,
      icon: p.icon,
      description: p.description,
      configSchema: p.configSchema,
      hasExecute: !!p.execute,
      executeType: p.execute?.type ?? null,
      actionLabel: p.execute?.actionLabel ?? null,
      hasIngest: !!p.ingest,
      isConfigured,
    };
  });
}

export function clearPlugins(): void {
  plugins.clear();
}
