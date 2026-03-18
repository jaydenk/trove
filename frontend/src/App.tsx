import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import LoginScreen from "./components/LoginScreen";
import CollectionSidebar from "./components/CollectionSidebar";

export default function App() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

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

  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <div className="flex h-screen bg-surface dark:bg-dark">
      <CollectionSidebar
        selectedCollection={selectedCollection}
        onSelectCollection={setSelectedCollection}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <header className="border-b border-border dark:border-dark-border px-6 py-4 flex items-center justify-end shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted dark:text-dark-muted">
              {user?.name}
            </span>
            <button
              onClick={logout}
              className="text-sm text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <p className="text-muted dark:text-dark-muted">
            {selectedCollection === "archive"
              ? "Viewing archived links"
              : selectedCollection
                ? "Viewing collection"
                : selectedTag
                  ? `Viewing links tagged #${selectedTag}`
                  : "Select a collection or search"}
          </p>
        </main>
      </div>
    </div>
  );
}
