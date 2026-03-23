import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import type { Link } from "../api";

const PAGE_SIZE = 20;

export interface UseLinksFilters {
  q?: string;
  collectionId?: string;
  tag?: string;
  status?: string;
}

export interface UseLinksResult {
  links: Link[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export function useLinks(filters: UseLinksFilters = {}): UseLinksResult {
  const { q, collectionId, tag, status } = filters;

  const [links, setLinks] = useState<Link[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Track current filters to detect changes
  const filtersRef = useRef({ q, collectionId, tag, status });

  // Reset when filters change
  useEffect(() => {
    const prev = filtersRef.current;
    if (
      prev.q !== q ||
      prev.collectionId !== collectionId ||
      prev.tag !== tag ||
      prev.status !== status
    ) {
      filtersRef.current = { q, collectionId, tag, status };
      setLinks([]);
      setPage(1);
      setHasMore(true);
    }
  }, [q, collectionId, tag, status]);

  // Fetch the current page
  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      setIsLoading(true);
      try {
        const res = await api.links.list({
          q: q || undefined,
          collection_id: collectionId || undefined,
          tag: tag || undefined,
          status: status || undefined,
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
        setIsLoading(false);
      }
    },
    [q, collectionId, tag, status],
  );

  // Fetch when page or filters change
  useEffect(() => {
    fetchPage(page, page > 1);
  }, [page, fetchPage]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setPage((p) => p + 1);
    }
  }, [isLoading, hasMore]);

  const refetch = useCallback(() => {
    setLinks([]);
    setPage(1);
    setHasMore(true);
    // fetchPage will be triggered by the page/filter effect
  }, []);

  return { links, isLoading, hasMore, loadMore, refetch };
}
