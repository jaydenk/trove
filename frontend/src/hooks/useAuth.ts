import { useState, useEffect, useCallback } from "react";
import { api, getToken, setToken, clearToken, ApiError } from "../api";
import type { User } from "../api";

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const validate = useCallback(async (): Promise<boolean> => {
    try {
      const me = await api.me();
      setUser(me);
      return true;
    } catch (err) {
      // If the token is invalid, clear it silently.
      // ApiError with 401 will already have cleared the token and triggered
      // a reload via the fetch wrapper, but we guard against other errors too.
      if (err instanceof ApiError) {
        clearToken();
      }
      setUser(null);
      return false;
    }
  }, []);

  // On mount, check for an existing token and validate it
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    validate().finally(() => setIsLoading(false));
  }, [validate]);

  const login = useCallback(
    async (token: string) => {
      setIsLoading(true);
      setToken(token);
      const valid = await validate();
      if (!valid) {
        clearToken();
        throw new Error("Invalid token");
      }
      setIsLoading(false);
    },
    [validate],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
  };
}
