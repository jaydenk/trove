import type { Database } from "bun:sqlite";

/** Represents a link record passed to plugin execute functions */
export interface PluginLink {
  id: string;
  url: string;
  title: string;
  description: string | null;
  domain: string | null;
  tags: { id: string; name: string }[];
}

export interface PluginConfigField {
  label: string;
  type: "string" | "boolean";
  required: boolean;
}

export type PluginResult =
  | { type: "success"; message: string }
  | { type: "redirect"; url: string }
  | { type: "error"; message: string };

export interface IngestResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface TrovePlugin {
  id: string;
  name: string;
  icon: string;
  description: string;

  configSchema: Record<string, PluginConfigField>;

  execute?: {
    type: "api-call" | "url-redirect";
    actionLabel: string;
    run(link: PluginLink, config: Record<string, string>): Promise<PluginResult>;
  };

  ingest?: {
    description: string;
    handleIngest(
      body: unknown,
      config: Record<string, string>,
      db: Database,
      userId: string
    ): Promise<IngestResult>;
  };
}

/** Serialisable plugin info returned by the API (no functions) */
export interface PluginInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  configSchema: Record<string, PluginConfigField>;
  hasExecute: boolean;
  executeType: "api-call" | "url-redirect" | null;
  actionLabel: string | null;
  hasIngest: boolean;
  isConfigured: boolean;
}
