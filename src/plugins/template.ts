// ---------------------------------------------------------------------------
// Template Context
// ---------------------------------------------------------------------------

export interface TemplateContext {
  link: {
    url: string;
    title: string;
    description: string | null;
    domain: string | null;
    tags: string; // comma-separated
    tagsArray: string; // JSON array string e.g. '["dev","reading"]'
    createdAt: string;
  };
  config: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type FilterFn = (value: string, arg?: string) => string;

const filters: Record<string, FilterFn> = {
  urlencode: (v) => encodeURIComponent(v),
  json: (v) => JSON.stringify(v),
  yamllist: (v) => {
    if (!v.trim()) return "";
    return v
      .split(",")
      .map((t) => `\n  - ${t.trim()}`)
      .join("");
  },
  default: (v, arg) => (v === "" && arg !== undefined ? arg : v),
};

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Resolve a dotted path against the template context.
 * e.g. "link.url" -> context.link.url, "config.API_TOKEN" -> context.config.API_TOKEN
 */
function resolve(path: string, context: TemplateContext): string {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = context;

  for (const part of parts) {
    if (current === null || current === undefined) return "";
    if (typeof current !== "object") return "";
    current = current[part];
  }

  if (current === null || current === undefined) return "";
  return String(current);
}

/**
 * Parse a filter segment like "urlencode" or "default:trove" into name + optional arg.
 */
function parseFilter(segment: string): { name: string; arg?: string } {
  const colonIndex = segment.indexOf(":");
  if (colonIndex === -1) {
    return { name: segment.trim() };
  }
  return {
    name: segment.slice(0, colonIndex).trim(),
    arg: segment.slice(colonIndex + 1),
  };
}

/**
 * Interpolate all `{{...}}` expressions in a template string.
 *
 * Supports:
 * - `{{link.url}}` — simple variable
 * - `{{link.title|urlencode}}` — variable with filter
 * - `{{config.TAGS|default:trove|urlencode}}` — chained filters
 * - `{{config.KEY}}` — config variable
 */
export function interpolate(
  template: string,
  context: TemplateContext
): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();
    const segments = trimmed.split("|");
    const path = segments[0].trim();

    let value = resolve(path, context);

    for (let i = 1; i < segments.length; i++) {
      const { name, arg } = parseFilter(segments[i]);
      if (filters[name]) {
        value = filters[name](value, arg);
      }
    }

    return value;
  });
}

/**
 * Recursively interpolate all string values in an object.
 * Returns a new object with all template expressions resolved.
 */
export function interpolateObject(
  obj: Record<string, unknown>,
  context: TemplateContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = interpolate(value, context);
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = interpolateObject(
        value as Record<string, unknown>,
        context
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
