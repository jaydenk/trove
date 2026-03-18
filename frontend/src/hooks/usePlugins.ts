import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { PluginInfo } from "../api";

export interface UsePluginsResult {
  plugins: PluginInfo[];
  isLoading: boolean;
  refetch: () => void;
}

export function usePlugins(): UsePluginsResult {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.plugins.list();
      setPlugins(data);
    } catch {
      setPlugins([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { plugins, isLoading, refetch: fetch };
}
