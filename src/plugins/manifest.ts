// ---------------------------------------------------------------------------
// Plugin Manifest Types
// ---------------------------------------------------------------------------

export interface HealthCheckBlock {
  url: string;
  headers?: Record<string, string>;
  expectedStatus?: number;
}

export interface PluginConfigField {
  label: string;
  type: "string" | "boolean";
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export type ExecuteBlock = ApiCallExecute | UrlRedirectExecute | FileWriteExecute;

export interface ApiCallExecute {
  type: "api-call";
  actionLabel: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  successMessage?: string;
}

export interface UrlRedirectExecute {
  type: "url-redirect";
  actionLabel: string;
  urlTemplate: string;
}

export interface FileWriteExecute {
  type: "file-write";
  actionLabel: string;
  directory: string;
  filename: string;
  content: string;
  mode?: "create" | "overwrite";
  successMessage?: string;
}

export interface IngestBlock {
  description?: string;
  itemMapping: {
    url: string;
    title?: string;
    tags?: string;
    collection?: string;
    sourceFeed?: string;
  };
}

export interface PluginManifest {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  version?: string;
  direction: "export" | "ingest" | "both";
  config?: Record<string, PluginConfigField>;
  execute?: ExecuteBlock;
  ingest?: IngestBlock;
  healthCheck?: HealthCheckBlock;
}

// ---------------------------------------------------------------------------
// Manifest Validation
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { valid: true; manifest: PluginManifest }
  | { valid: false; errors: string[] };

export function validateManifest(json: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { valid: false, errors: ["Manifest must be a JSON object"] };
  }

  const obj = json as Record<string, unknown>;

  // id
  if (typeof obj.id !== "string" || obj.id.length === 0) {
    errors.push("'id' is required and must be a non-empty string");
  } else if (!/^[a-z0-9-]+$/.test(obj.id)) {
    errors.push(
      "'id' must contain only lowercase alphanumeric characters and hyphens"
    );
  }

  // name
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    errors.push("'name' is required and must be a non-empty string");
  }

  // direction
  const validDirections = ["export", "ingest", "both"];
  if (
    typeof obj.direction !== "string" ||
    !validDirections.includes(obj.direction)
  ) {
    errors.push(
      "'direction' is required and must be one of: export, ingest, both"
    );
  }

  const direction = obj.direction as string;

  // execute block
  if (direction === "export" || direction === "both") {
    if (!obj.execute || typeof obj.execute !== "object") {
      errors.push(
        "'execute' block is required when direction is 'export' or 'both'"
      );
    } else {
      const exec = obj.execute as Record<string, unknown>;
      const validExecTypes = ["api-call", "url-redirect", "file-write"];
      if (
        typeof exec.type !== "string" ||
        !validExecTypes.includes(exec.type)
      ) {
        errors.push(
          "execute.type must be 'api-call', 'url-redirect', or 'file-write'"
        );
      } else if (exec.type === "api-call") {
        if (typeof exec.method !== "string" || exec.method.length === 0) {
          errors.push("execute.method is required for api-call");
        }
        if (typeof exec.url !== "string" || exec.url.length === 0) {
          errors.push("execute.url is required for api-call");
        }
        if (
          typeof exec.actionLabel !== "string" ||
          exec.actionLabel.length === 0
        ) {
          errors.push("execute.actionLabel is required for api-call");
        }
      } else if (exec.type === "url-redirect") {
        if (
          typeof exec.urlTemplate !== "string" ||
          exec.urlTemplate.length === 0
        ) {
          errors.push(
            "execute.urlTemplate is required for url-redirect"
          );
        }
        if (
          typeof exec.actionLabel !== "string" ||
          exec.actionLabel.length === 0
        ) {
          errors.push(
            "execute.actionLabel is required for url-redirect"
          );
        }
      } else if (exec.type === "file-write") {
        if (typeof exec.actionLabel !== "string" || exec.actionLabel.length === 0) {
          errors.push("execute.actionLabel is required for file-write");
        }
        if (typeof exec.directory !== "string" || exec.directory.length === 0) {
          errors.push("execute.directory is required for file-write");
        }
        if (typeof exec.filename !== "string" || exec.filename.length === 0) {
          errors.push("execute.filename is required for file-write");
        }
        if (typeof exec.content !== "string") {
          errors.push("execute.content is required for file-write");
        }
      }
    }
  }

  // ingest block
  if (direction === "ingest" || direction === "both") {
    if (!obj.ingest || typeof obj.ingest !== "object") {
      errors.push(
        "'ingest' block is required when direction is 'ingest' or 'both'"
      );
    } else {
      const ing = obj.ingest as Record<string, unknown>;
      if (!ing.itemMapping || typeof ing.itemMapping !== "object") {
        errors.push("ingest.itemMapping is required");
      } else {
        const mapping = ing.itemMapping as Record<string, unknown>;
        if (typeof mapping.url !== "string" || mapping.url.length === 0) {
          errors.push("ingest.itemMapping.url is required");
        }
      }
    }
  }

  // config fields validation (optional)
  if (obj.config !== undefined) {
    if (typeof obj.config !== "object" || obj.config === null) {
      errors.push("'config' must be an object if provided");
    } else {
      const config = obj.config as Record<string, unknown>;
      for (const [key, field] of Object.entries(config)) {
        if (typeof field !== "object" || field === null) {
          errors.push(`config.${key} must be an object`);
          continue;
        }
        const f = field as Record<string, unknown>;
        if (typeof f.label !== "string" || f.label.length === 0) {
          errors.push(`config.${key}.label is required`);
        }
        if (f.type !== "string" && f.type !== "boolean") {
          errors.push(
            `config.${key}.type must be 'string' or 'boolean'`
          );
        }
        if (typeof f.required !== "boolean") {
          errors.push(`config.${key}.required must be a boolean`);
        }
        if (f.options !== undefined) {
          if (!Array.isArray(f.options)) {
            errors.push(`config.${key}.options must be an array if provided`);
          } else if (f.options.some((o: unknown) => typeof o !== "string" || (o as string).length === 0)) {
            errors.push(`config.${key}.options must contain non-empty strings`);
          }
        }
        if (f.placeholder !== undefined && typeof f.placeholder !== "string") {
          errors.push(`config.${key}.placeholder must be a string if provided`);
        }
      }
    }
  }

  // healthCheck block validation (optional)
  if (obj.healthCheck !== undefined) {
    if (typeof obj.healthCheck !== "object" || obj.healthCheck === null) {
      errors.push("'healthCheck' must be an object if provided");
    } else {
      const hc = obj.healthCheck as Record<string, unknown>;
      if (typeof hc.url !== "string" || hc.url.length === 0) {
        errors.push("healthCheck.url is required and must be a non-empty string");
      }
      if (hc.expectedStatus !== undefined && typeof hc.expectedStatus !== "number") {
        errors.push("healthCheck.expectedStatus must be a number if provided");
      }
      if (hc.headers !== undefined) {
        if (typeof hc.headers !== "object" || hc.headers === null) {
          errors.push("healthCheck.headers must be an object if provided");
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, manifest: json as PluginManifest };
}
