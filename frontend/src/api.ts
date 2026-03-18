// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface Link {
  id: string;
  url: string;
  title: string;
  description: string | null;
  content: string | null;
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
    // The reload will prevent further execution, but we throw to satisfy TS
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

  return body as T;
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
  me: () => request<User>("/me"),

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
  },
};
