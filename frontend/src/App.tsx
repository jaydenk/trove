import { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import LoginScreen from "./components/LoginScreen";
import AuthenticatedApp from "./components/AuthenticatedApp";

export default function App() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-dark">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="animate-spin h-6 w-6 text-muted dark:text-dark-muted"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm text-muted dark:text-dark-muted">
            Loading...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginScreen onLogin={login} />;
  }

  return <AuthenticatedApp user={user} onLogout={logout} />;
}
