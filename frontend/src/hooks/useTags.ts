import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { Tag } from "../api";

export interface UseTagsResult {
  tags: Tag[];
  isLoading: boolean;
  refetch: () => void;
}

export function useTags(): UseTagsResult {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.tags.list();
      setTags(data);
    } catch {
      setTags([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { tags, isLoading, refetch: fetch };
}
