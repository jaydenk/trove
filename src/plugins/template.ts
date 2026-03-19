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
  };
  config: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const filters: Record<string, (value: string) => string> = {
  urlencode: (v) => encodeURIComponent(v),
  json: (v) => JSON.stringify(v),
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
 * Interpolate all `{{...}}` expressions in a template string.
 *
 * Supports:
 * - `{{link.url}}` — simple variable
 * - `{{link.title|urlencode}}` — variable with filter
 * - `{{config.KEY}}` — config variable
 */
export function interpolate(
  template: string,
  context: TemplateContext
): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();
    const pipeIndex = trimmed.indexOf("|");

    let path: string;
    let filterName: string | null = null;

    if (pipeIndex !== -1) {
      path = trimmed.slice(0, pipeIndex).trim();
      filterName = trimmed.slice(pipeIndex + 1).trim();
    } else {
      path = trimmed;
    }

    let value = resolve(path, context);

    if (filterName && filters[filterName]) {
      value = filters[filterName](value);
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
