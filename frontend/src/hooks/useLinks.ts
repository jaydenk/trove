import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import type { Link } from "../api";

const PAGE_SIZE = 20;

export interface UseLinksFilters {
  q?: string;
  collectionId?: string;
  tag?: string;
  status?: string;
  sortOrder?: "asc" | "desc";
}

export interface UseLinksResult {
  links: Link[];
  /** True only on initial load / filter change (no links to show yet) */
  isLoading: boolean;
  /** True when fetching the next page (links already visible) */
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export function useLinks(filters: UseLinksFilters = {}): UseLinksResult {
  const { q, collectionId, tag, status, sortOrder } = filters;

  const [links, setLinks] = useState<Link[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Monotonic counter — incrementing forces the fetch effect to re-run
  // even when page is already 1 (e.g. refetch while on the first page).
  const [fetchId, setFetchId] = useState(0);

  // Synchronous lock — prevents duplicate loadMore calls between renders
  const loadingLockRef = useRef(false);

  // Track current filters to detect changes
  const filtersRef = useRef({ q, collectionId, tag, status, sortOrder });

  // Reset when filters change
  useEffect(() => {
    const prev = filtersRef.current;
    if (
      prev.q !== q ||
      prev.collectionId !== collectionId ||
      prev.tag !== tag ||
      prev.status !== status ||
      prev.sortOrder !== sortOrder
    ) {
      filtersRef.current = { q, collectionId, tag, status, sortOrder };
      loadingLockRef.current = false;
      setLinks([]);
      setPage(1);
      setHasMore(true);
      setIsLoading(true);
    }
  }, [q, collectionId, tag, status, sortOrder]);

  // Fetch the current page
  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      try {
        const res = await api.links.list({
          q: q || undefined,
          collection_id: collectionId || undefined,
          tag: tag || undefined,
          status: status || undefined,
          sort_order: sortOrder || undefined,
          page: pageNum,
          limit: PAGE_SIZE,
        });
        if (append) {
          setLinks((prev) => {
            // Deduplicate by id in case of concurrent fetches
            const existingIds = new Set(prev.map((l) => l.id));
            const newLinks = res.data.filter((l) => !existingIds.has(l.id));
            return [...prev, ...newLinks];
          });
        } else {
          setLinks(res.data);
        }
        setHasMore(pageNum < res.pagination.totalPages);
      } catch {
        if (!append) {
          setLinks([]);
        }
        setHasMore(false);
      } finally {
        loadingLockRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [q, collectionId, tag, status, sortOrder],
  );

  // Fetch when page, filters, or fetchId changes
  useEffect(() => {
    fetchPage(page, page > 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, fetchPage, fetchId]);

  const loadMore = useCallback(() => {
    if (loadingLockRef.current || !hasMore) return;
    loadingLockRef.current = true;
    setPage((p) => p + 1);
  }, [hasMore]);

  const refetch = useCallback(() => {
    loadingLockRef.current = false;
    setPage(1);
    setHasMore(true);
    // Don't clear links — keep existing data visible until the fresh fetch
    // resolves. This prevents flash-of-empty-state (e.g. triage showing
    // "All done!" momentarily). fetchPage(1, false) will replace links.
    setFetchId((n) => n + 1);
  }, []);

  return { links, isLoading, isLoadingMore, hasMore, loadMore, refetch };
}
