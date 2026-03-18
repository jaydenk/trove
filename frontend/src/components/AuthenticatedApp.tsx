import { useState, useEffect, useRef, useCallback } from "react";
import { useLinks } from "../hooks/useLinks";
import { useCollections } from "../hooks/useCollections";
import { usePlugins } from "../hooks/usePlugins";
import { api } from "../api";
import CollectionSidebar from "./CollectionSidebar";
import SettingsView from "./SettingsView";
import LinkCard from "./LinkCard";
import LinkDetail from "./LinkDetail";
import SearchBar from "./SearchBar";
import AddLinkModal from "./AddLinkModal";
import BulkActionBar from "./BulkActionBar";
import MobileNav from "./MobileNav";
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
  const [showSettings, setShowSettings] = useState(false);

  // Bulk selection (Task 5)
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(
    new Set(),
  );

  // Keyboard navigation (Task 6)
  const [focusedLinkIndex, setFocusedLinkIndex] = useState<number>(-1);
  const searchRef = useRef<HTMLInputElement>(null);

  // Mobile layout (Task 7)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Bookmarklet (Task 8)
  const [bookmarkletUrl, setBookmarkletUrl] = useState<string | undefined>(
    undefined,
  );
  const [bookmarkletTitle, setBookmarkletTitle] = useState<string | undefined>(
    undefined,
  );

  const { collections, refetch: refetchCollections } = useCollections();
  const { plugins, refetch: refetchPlugins } = usePlugins();

  const handleSelectCollection = (id: string | null) => {
    setSelectedCollection(id);
    setSelectedTag(null);
    setPage(1);
    setSelectedLinkId(null);
    setShowSettings(false);
    setSelectedLinkIds(new Set());
    setFocusedLinkIndex(-1);
    setIsMobileSidebarOpen(false);
  };

  const handleSelectTag = (tag: string | null) => {
    setSelectedTag(tag);
    setSelectedCollection(null);
    setPage(1);
    setSelectedLinkId(null);
    setShowSettings(false);
    setSelectedLinkIds(new Set());
    setFocusedLinkIndex(-1);
    setIsMobileSidebarOpen(false);
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

  const {
    links,
    pagination,
    isLoading: linksLoading,
    refetch: refetchLinks,
  } = useLinks(linkFilters);

  // -----------------------------------------------------------------------
  // Bulk action handlers (Task 5)
  // -----------------------------------------------------------------------

  const toggleLinkSelection = useCallback((id: string) => {
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedLinkIds(new Set());
  }, []);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedLinkIds);
    await api.links.bulkArchive(ids);
    setSelectedLinkIds(new Set());
    refetchLinks();
    refetchCollections();
  }, [selectedLinkIds, refetchLinks, refetchCollections]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedLinkIds);
    await api.links.bulkDelete(ids);
    setSelectedLinkIds(new Set());
    refetchLinks();
    refetchCollections();
  }, [selectedLinkIds, refetchLinks, refetchCollections]);

  const handleBulkMoveToCollection = useCallback(
    async (collectionId: string) => {
      const ids = Array.from(selectedLinkIds);
      await api.links.bulkUpdate(ids, {
        collectionId: collectionId || undefined,
      });
      setSelectedLinkIds(new Set());
      refetchLinks();
      refetchCollections();
    },
    [selectedLinkIds, refetchLinks, refetchCollections],
  );

  // -----------------------------------------------------------------------
  // Keyboard shortcuts (Task 6)
  // -----------------------------------------------------------------------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "Escape":
          if (selectedLinkIds.size > 0) {
            setSelectedLinkIds(new Set());
          } else if (selectedLinkId) {
            setSelectedLinkId(null);
          }
          setFocusedLinkIndex(-1);
          break;
        case "j":
          if (links.length > 0) {
            setFocusedLinkIndex((prev) =>
              prev < links.length - 1 ? prev + 1 : 0,
            );
          }
          break;
        case "k":
          if (links.length > 0) {
            setFocusedLinkIndex((prev) =>
              prev > 0 ? prev - 1 : links.length - 1,
            );
          }
          break;
        case "o":
        case "Enter":
          if (focusedLinkIndex >= 0 && focusedLinkIndex < links.length) {
            setSelectedLinkId(links[focusedLinkIndex].id);
          }
          break;
        case "x":
          if (focusedLinkIndex >= 0 && focusedLinkIndex < links.length) {
            toggleLinkSelection(links[focusedLinkIndex].id);
          }
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    links,
    focusedLinkIndex,
    selectedLinkId,
    selectedLinkIds,
    toggleLinkSelection,
  ]);

  // Reset focused index when links change
  useEffect(() => {
    setFocusedLinkIndex(-1);
  }, [links]);

  // -----------------------------------------------------------------------
  // Bookmarklet URL param handling (Task 8)
  // -----------------------------------------------------------------------

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    if (url) {
      setBookmarkletUrl(url);
      setBookmarkletTitle(params.get("title") || undefined);
      setIsAddModalOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Current view name (for mobile nav)
  // -----------------------------------------------------------------------

  const currentViewName = (() => {
    if (showSettings) return "Settings";
    if (isSearching) return "Search Results";
    if (selectedCollection === "archive") return "Archive";
    if (selectedCollection) {
      const col = collections.find((c) => c.id === selectedCollection);
      return col ? col.name : "Collection";
    }
    if (selectedTag) return `#${selectedTag}`;
    return "All Links";
  })();

  const isBulkMode = selectedLinkIds.size > 0;

  return (
    <div className="flex h-screen bg-surface dark:bg-dark">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <CollectionSidebar
          selectedCollection={selectedCollection}
          onSelectCollection={handleSelectCollection}
          selectedTag={selectedTag}
          onSelectTag={handleSelectTag}
          onOpenSettings={() => setShowSettings(true)}
          isSettingsActive={showSettings}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 dark:bg-black/70"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-56">
            <CollectionSidebar
              selectedCollection={selectedCollection}
              onSelectCollection={handleSelectCollection}
              selectedTag={selectedTag}
              onSelectTag={handleSelectTag}
              onOpenSettings={() => {
                setShowSettings(true);
                setIsMobileSidebarOpen(false);
              }}
              isSettingsActive={showSettings}
            />
          </div>
        </div>
      )}

      {showSettings ? (
        <SettingsView
          collections={collections}
          onRefreshCollections={refetchCollections}
          onRefreshPlugins={refetchPlugins}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <div className="flex flex-1 flex-col min-w-0">
          {/* Mobile nav bar */}
          <MobileNav
            onToggleSidebar={() => setIsMobileSidebarOpen((v) => !v)}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            currentView={currentViewName}
          />

          {/* Desktop header */}
          <header className="hidden lg:flex border-b border-border dark:border-dark-border px-6 py-4 items-center justify-between shrink-0">
            <SearchBar
              ref={searchRef}
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
                {links.map((link, index) => (
                  <div key={link.id}>
                    <LinkCard
                      link={link}
                      isSelected={link.id === selectedLinkId}
                      isFocused={index === focusedLinkIndex}
                      onClick={() => setSelectedLinkId(link.id)}
                      plugins={plugins}
                      isSelectable={isBulkMode}
                      isChecked={selectedLinkIds.has(link.id)}
                      onToggleSelect={() => toggleLinkSelection(link.id)}
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
        onClose={() => {
          setIsAddModalOpen(false);
          setBookmarkletUrl(undefined);
          setBookmarkletTitle(undefined);
        }}
        onSaved={() => {
          refetchLinks();
          refetchCollections();
        }}
        collections={collections}
        initialUrl={bookmarkletUrl}
        initialTitle={bookmarkletTitle}
      />

      {isBulkMode && (
        <BulkActionBar
          selectedCount={selectedLinkIds.size}
          collections={collections}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onMoveToCollection={handleBulkMoveToCollection}
          onClearSelection={clearSelection}
        />
      )}
    </div>
  );
}
