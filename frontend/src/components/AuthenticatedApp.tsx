import { useState, useEffect } from "react";
import { useLinks } from "../hooks/useLinks";
import { useCollections } from "../hooks/useCollections";
import { usePlugins } from "../hooks/usePlugins";
import CollectionSidebar from "./CollectionSidebar";
import CollectionManager from "./CollectionManager";
import PluginSettings from "./PluginSettings";
import LinkCard from "./LinkCard";
import LinkDetail from "./LinkDetail";
import SearchBar from "./SearchBar";
import AddLinkModal from "./AddLinkModal";
import type { User } from "../api";

/**
 * Sanitise FTS snippet HTML — only allow <b> tags used by SQLite snippet().
 * All other HTML is escaped to prevent XSS from stored content.
 * This is safe because we control the SQLite snippet() output format (only <b> tags)
 * and all other content is escaped before being rendered.
 */
function sanitiseSnippet(html: string): string {
  const safe = html
    .replace(/<b>/gi, "\x00B_OPEN\x00")
    .replace(/<\/b>/gi, "\x00B_CLOSE\x00");
  const escaped = safe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped
    .replace(/\x00B_OPEN\x00/g, "<b>")
    .replace(/\x00B_CLOSE\x00/g, "</b>");
}

interface AuthenticatedAppProps {
  user: User;
  onLogout: () => void;
}

export default function AuthenticatedApp({
  user,
  onLogout,
}: AuthenticatedAppProps) {
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [showPluginSettings, setShowPluginSettings] = useState(false);
  const { collections, refetch: refetchCollections } = useCollections();
  const { plugins, refetch: refetchPlugins } = usePlugins();

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

  // Cmd+N / Ctrl+N to open add modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setIsAddModalOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const {
    links,
    pagination,
    isLoading: linksLoading,
    refetch: refetchLinks,
  } = useLinks(linkFilters);

  return (
    <div className="flex h-screen bg-surface dark:bg-dark">
      <CollectionSidebar
        selectedCollection={selectedCollection}
        onSelectCollection={handleSelectCollection}
        selectedTag={selectedTag}
        onSelectTag={handleSelectTag}
        onManageCollections={() => {
          setShowCollectionManager(true);
          setShowPluginSettings(false);
        }}
        onManagePlugins={() => {
          setShowPluginSettings(true);
          setShowCollectionManager(false);
        }}
      />

      {showCollectionManager ? (
        <CollectionManager
          collections={collections}
          onRefresh={refetchCollections}
          onClose={() => setShowCollectionManager(false)}
        />
      ) : showPluginSettings ? (
        <PluginSettings
          onClose={() => {
            setShowPluginSettings(false);
            refetchPlugins();
          }}
        />
      ) : (
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
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Add
              </button>
              <span className="text-sm text-muted dark:text-dark-muted">
                {user.name}
              </span>
              <button
                onClick={onLogout}
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
                      plugins={plugins}
                    />
                    {/* FTS snippets use dangerouslySetInnerHTML because SQLite
                        snippet() returns <b> tags for match highlighting.
                        sanitiseSnippet() escapes all HTML except <b>/<\/b>. */}
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
      )}

      {selectedLinkId && (
        <LinkDetail
          linkId={selectedLinkId}
          collections={collections}
          plugins={plugins}
          onClose={() => setSelectedLinkId(null)}
          onUpdated={() => {
            refetchLinks();
            refetchCollections();
          }}
        />
      )}

      <AddLinkModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaved={() => {
          refetchLinks();
          refetchCollections();
        }}
        collections={collections}
      />
    </div>
  );
}
