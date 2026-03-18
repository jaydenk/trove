import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { Link, PaginatedResponse } from "../api";

export interface UseLinksFilters {
  q?: string;
  collectionId?: string;
  tag?: string;
  status?: string;
  page?: number;
}

export interface UseLinksResult {
  links: Link[];
  pagination: PaginatedResponse<Link>["pagination"] | null;
  isLoading: boolean;
  refetch: () => void;
}

export function useLinks(filters: UseLinksFilters = {}): UseLinksResult {
  const { q, collectionId, tag, status, page } = filters;

  const [links, setLinks] = useState<Link[]>([]);
  const [pagination, setPagination] = useState<
    PaginatedResponse<Link>["pagination"] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLinks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.links.list({
        q: q || undefined,
        collection_id: collectionId || undefined,
        tag: tag || undefined,
        status: status || undefined,
        page: page ?? 1,
      });
      setLinks(res.data);
      setPagination(res.pagination);
    } catch {
      setLinks([]);
      setPagination(null);
    } finally {
      setIsLoading(false);
    }
  }, [q, collectionId, tag, status, page]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  return { links, pagination, isLoading, refetch: fetchLinks };
}
