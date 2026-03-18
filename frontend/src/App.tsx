import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useLinks } from "./hooks/useLinks";
import LoginScreen from "./components/LoginScreen";
import CollectionSidebar from "./components/CollectionSidebar";
import LinkCard from "./components/LinkCard";
import SearchBar from "./components/SearchBar";

/**
 * Sanitise FTS snippet HTML — only allow <b> tags used by SQLite snippet().
 * All other HTML is escaped to prevent XSS from stored content.
 */
function sanitiseSnippet(html: string): string {
  // Temporarily replace <b> and </b> with placeholders
  const safe = html
    .replace(/<b>/gi, "\x00B_OPEN\x00")
    .replace(/<\/b>/gi, "\x00B_CLOSE\x00");
  // Escape everything else
  const escaped = safe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // Restore <b> tags
  return escaped
    .replace(/\x00B_OPEN\x00/g, "<b>")
    .replace(/\x00B_CLOSE\x00/g, "</b>");
}

export default function App() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectCollection = (id: string | null) => {
    setSelectedCollection(id);
    setSelectedTag(null);
    setPage(1);
    setSelectedLinkId(null);
  };

  const handleSelectTag = (tag: string | null) => {
    setSelectedTag(tag);
    setSelectedCollection(null);
    setPage(1);
    setSelectedLinkId(null);
  };

  const isSearching = searchQuery.trim().length > 0;

  const linkFilters = (() => {
    if (isSearching) {
      return { q: searchQuery.trim(), page };
    }
    if (selectedCollection === "archive") {
      return { status: "archived", page };
    }
    if (selectedCollection) {
      return { collectionId: selectedCollection, page };
    }
    if (selectedTag) {
      return { tag: selectedTag, page };
    }
    return { page };
  })();

  const { links, pagination, isLoading: linksLoading } = useLinks(linkFilters);

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
        onSelectCollection={handleSelectCollection}
        selectedTag={selectedTag}
        onSelectTag={handleSelectTag}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <header className="border-b border-border dark:border-dark-border px-6 py-4 flex items-center justify-between shrink-0">
          <SearchBar
            value={searchQuery}
            onChange={(v) => {
              setSearchQuery(v);
              setPage(1);
              setSelectedLinkId(null);
            }}
          />
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

        <main className="flex-1 overflow-y-auto">
          {linksLoading ? (
            <div className="flex items-center justify-center py-20">
              <svg
                className="animate-spin h-5 w-5 text-muted dark:text-dark-muted"
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
            </div>
          ) : links.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-muted dark:text-dark-muted">
                No links found
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {links.map((link) => (
                <div key={link.id}>
                  <LinkCard
                    link={link}
                    isSelected={link.id === selectedLinkId}
                    onClick={() => setSelectedLinkId(link.id)}
                  />
                  {isSearching && link.snippet && (
                    <div className="px-4 pb-2 -mt-px border-b border-border dark:border-dark-border">
                      <p
                        className="pl-6 text-xs text-muted dark:text-dark-muted line-clamp-2 [&>b]:font-semibold [&>b]:text-neutral-700 dark:[&>b]:text-neutral-300"
                        dangerouslySetInnerHTML={{
                          __html: sanitiseSnippet(link.snippet),
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>

        {pagination && pagination.totalPages > 1 && (
          <div className="border-t border-border dark:border-dark-border px-6 py-3 flex items-center justify-between shrink-0">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-sm px-3 py-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-muted dark:text-dark-muted tabular-nums">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() =>
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              className="text-sm px-3 py-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
