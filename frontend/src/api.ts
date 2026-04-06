// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface Link {
  id: string;
  url: string;
  title: string;
  description: string | null;
  content: string | null;
  rawHtml: string | null;
  faviconUrl: string | null;
  imageUrl: string | null;
  domain: string | null;
  collectionId: string | null;
  status: string;
  extractionStatus: string;
  source: string;
  sourceFeed: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
  actions?: (LinkAction | ActionBadge)[];
  snippet?: string; // FTS search snippet
}

export interface Collection {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  createdAt: string;
  linkCount: number;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
  linkCount?: number;
}

export interface PluginInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  configSchema: Record<
    string,
    {
      label: string;
      type: string;
      required: boolean;
      options?: string[];
      placeholder?: string;
    }
  >;
  hasExecute: boolean;
  executeType: "api-call" | "url-redirect" | "file-write" | null;
  actionLabel: string | null;
  hasIngest: boolean;
  hasHealthCheck: boolean;
  isConfigured: boolean;
  direction: "export" | "ingest" | "both";
  enabled: boolean;
  isSystem: boolean;
  version: string | null;
}

export interface PluginActionResult {
  type: "success" | "redirect" | "error";
  message?: string;
  url?: string;
}

export interface HealthCheckResult {
  status: "ok" | "error";
  message?: string;
}

export interface LinkAction {
  id: string;
  pluginId: string;
  status: string;
  message: string | null;
  createdAt: string;
}

export interface ActionBadge {
  pluginId: string;
  pluginName: string;
  pluginIcon: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateLinkInput {
  url: string;
  title?: string;
  description?: string;
  content?: string;
  rawHtml?: string;
  collectionId?: string;
  tags?: string[];
  source?: string;
  sourceFeed?: string;
}

export interface UpdateLinkInput {
  title?: string;
  collectionId?: string;
  status?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = "trove_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Snake_case to camelCase conversion
// ---------------------------------------------------------------------------

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cameliseKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(cameliseKeys);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[snakeToCamel(key)] = cameliseKeys(value);
    }
    return result;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

const BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new ApiError(401, "UNAUTHORIZED", "Unauthorised");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json();

  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? "An unexpected error occurred",
    );
  }

  return cameliseKeys(body) as T;
}

// ---------------------------------------------------------------------------
// Link list params
// ---------------------------------------------------------------------------

export interface ListLinksParams {
  q?: string;
  collection_id?: string;
  tag?: string;
  domain?: string;
  status?: string;
  source?: string;
  page?: number;
  limit?: number;
  sort_order?: "asc" | "desc";
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  const qs = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
  return `?${qs}`;
}

// ---------------------------------------------------------------------------
// API object
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    login: async (username: string, password: string): Promise<{ token: string; user: User }> => {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(
          res.status,
          body.error?.code || "AUTH_FAILED",
          body.error?.message || "Invalid credentials",
        );
      }
      return cameliseKeys(await res.json()) as { token: string; user: User };
    },
  },

  me: () => request<User>("/me"),

  updateMe: (data: { name?: string; email?: string; password?: string; username?: string }) =>
    request<User>("/me", { method: "PATCH", body: JSON.stringify(data) }),

  regenerateToken: () =>
    request<{ token: string }>("/me/regenerate-token", { method: "POST" }),

  preferences: {
    get: () => request<Record<string, string>>("/me/preferences"),
    set: (prefs: Record<string, string>) =>
      request<Record<string, string>>("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(prefs),
      }),
  },

  links: {
    list: (params?: ListLinksParams) =>
      request<PaginatedResponse<Link>>(
        `/links${buildQuery({ ...params } as Record<string, string | number | undefined>)}`,
      ),

    get: (id: string) => request<Link>(`/links/${id}`),

    create: (data: CreateLinkInput) =>
      request<Link>("/links", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdateLinkInput) =>
      request<Link>(`/links/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/links/${id}`, { method: "DELETE" }),

    archive: (id: string) =>
      request<{ status: string }>(`/links/${id}/archive`, { method: "POST" }),

    extract: (id: string) =>
      request<{ extractionStatus: string }>(`/links/${id}/extract`, {
        method: "POST",
      }),

    bulkArchive: (ids: string[]) =>
      Promise.all(ids.map((id) => api.links.archive(id))),

    bulkDelete: (ids: string[]) =>
      Promise.all(ids.map((id) => api.links.delete(id))),

    bulkUpdate: (ids: string[], data: UpdateLinkInput) =>
      Promise.all(ids.map((id) => api.links.update(id, data))),
  },

  collections: {
    list: () => request<Collection[]>("/collections"),

    create: (data: { name: string; icon?: string; color?: string }) =>
      request<Collection>("/collections", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (
      id: string,
      data: { name?: string; icon?: string; color?: string },
    ) =>
      request<Collection>(`/collections/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/collections/${id}`, { method: "DELETE" }),
  },

  plugins: {
    list: () => request<PluginInfo[]>("/plugins"),

    getConfig: (id: string) =>
      request<{ config: Record<string, string>; schema: Record<string, any> }>(
        `/plugins/${id}/config`,
      ),

    setConfig: (id: string, config: Record<string, string>) =>
      request<Record<string, string>>(`/plugins/${id}/config`, {
        method: "PUT",
        body: JSON.stringify(config),
      }),

    executeAction: (linkId: string, pluginId: string) =>
      request<PluginActionResult>(`/links/${linkId}/actions/${pluginId}`, {
        method: "POST",
      }),

    upload: (manifest: object) =>
      request<PluginInfo>("/plugins", {
        method: "POST",
        body: JSON.stringify(manifest),
      }),

    delete: (id: string) =>
      request<void>(`/plugins/${id}`, { method: "DELETE" }),

    enable: (id: string) =>
      request<{ enabled: boolean }>(`/plugins/${id}/enable`, { method: "PUT" }),

    disable: (id: string) =>
      request<{ enabled: boolean }>(`/plugins/${id}/disable`, { method: "PUT" }),

    healthCheck: (id: string) =>
      request<HealthCheckResult>(`/plugins/${id}/health-check`, {
        method: "POST",
      }),

    test: (id: string) =>
      request<PluginActionResult>(`/plugins/${id}/test`, {
        method: "POST",
      }),
  },

  tags: {
    list: () => request<Tag[]>("/tags"),

    create: (name: string) =>
      request<Tag>("/tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),

    update: (id: string, name: string) =>
      request<Tag>(`/tags/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),

    delete: (id: string) =>
      request<void>(`/tags/${id}`, { method: "DELETE" }),

    deleteEmpty: () =>
      request<{ deleted: number }>("/tags/empty", { method: "DELETE" }),
  },

  admin: {
    listUsers: () => request<User[]>("/admin/users"),

    createUser: (data: { name: string; username: string; password: string; email?: string }) =>
      request<User & { apiToken: string }>("/admin/users", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    deleteUser: (id: string) =>
      request<void>(`/admin/users/${id}`, { method: "DELETE" }),
  },

  importExport: {
    preview: (data: string, format?: string) =>
      request<{
        detectedFormat: "html" | "json" | "csv" | "text";
        items: Array<{
          url: string;
          title?: string;
          description?: string;
          tags?: string[];
          collection?: string;
          createdAt?: string;
        }>;
        errors: string[];
      }>("/import/preview", {
        method: "POST",
        body: JSON.stringify({ data, format }),
      }),

    importItems: (
      items: Array<{
        url: string;
        title?: string;
        description?: string;
        tags?: string[];
        collection?: string;
        createdAt?: string;
      }>,
    ) =>
      request<{
        imported: number;
        skipped: number;
        errors: string[];
        detectedFormat: string;
      }>("/import", {
        method: "POST",
        body: JSON.stringify({ items }),
      }),

    importRaw: (data: string, format?: string) =>
      request<{
        imported: number;
        skipped: number;
        errors: string[];
        detectedFormat: "html" | "json" | "csv" | "text";
      }>("/import", {
        method: "POST",
        body: JSON.stringify({ data, format }),
      }),
  },
};

// ---------------------------------------------------------------------------
// Download helper for export endpoints
// ---------------------------------------------------------------------------

export async function downloadExport(
  path: string,
  filename: string,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new ApiError(res.status, "EXPORT_ERROR", "Export download failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// SSE connection for real-time updates
// ---------------------------------------------------------------------------

export function connectSSE(
  onEvent: (event: { type: string; linkId: string; timestamp: string }) => void,
  onReconnect?: () => void,
): () => void {
  const token = getToken();
  if (!token) return () => {};

  let openCount = 0;

  const es = new EventSource(
    `/api/events?token=${encodeURIComponent(token)}`,
  );

  es.onopen = () => {
    openCount++;
    console.debug("[Trove SSE] Connected");
    // On reconnection, refetch to catch events missed while disconnected
    if (openCount > 1 && onReconnect) {
      onReconnect();
    }
  };

  const eventTypes = [
    "link:created",
    "link:updated",
    "link:deleted",
    "link:archived",
  ];

  for (const type of eventTypes) {
    es.addEventListener(type, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onEvent({ type, ...data });
      } catch {
        // Ignore malformed events
      }
    });
  }

  es.onerror = () => {
    console.debug("[Trove SSE] Connection error — will auto-reconnect");
  };

  return () => {
    es.close();
  };
}
