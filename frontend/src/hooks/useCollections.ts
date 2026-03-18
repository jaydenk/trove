import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { Collection } from "../api";

export interface UseCollectionsResult {
  collections: Collection[];
  isLoading: boolean;
  refetch: () => void;
}

export function useCollections(): UseCollectionsResult {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.collections.list();
      setCollections(data);
    } catch {
      setCollections([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { collections, isLoading, refetch: fetch };
}
