import { useState, useEffect, useRef, useCallback } from "react";
import { useLinks } from "../hooks/useLinks";
import { useCollections } from "../hooks/useCollections";
import { usePlugins } from "../hooks/usePlugins";
import { api, connectSSE } from "../api";
import CollectionSidebar from "./CollectionSidebar";
import SettingsView from "./SettingsView";
import LinkCard from "./LinkCard";
import type { SwipeAction } from "./LinkCard";
import LinkDetail from "./LinkDetail";
import SearchBar from "./SearchBar";
import AddLinkModal from "./AddLinkModal";
import BulkActionBar from "./BulkActionBar";
import MobileNav from "./MobileNav";
import ContextMenu from "./ContextMenu";
import type { User, Link, PluginInfo } from "../api";

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

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    link: Link;
  } | null>(null);

  // Shortcut feedback toast
  const [shortcutFeedback, setShortcutFeedback] = useState<string | null>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Theme preference (Fix 1: dark/light/system toggle)
  // -----------------------------------------------------------------------

  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    const stored = localStorage.getItem("trove_theme");
    if (stored === "light" || stored === "dark") return stored;
    return "system";
  });

  // -----------------------------------------------------------------------
  // Swipe action preferences
  // -----------------------------------------------------------------------

  const [swipeLeftAction, setSwipeLeftAction] = useState<SwipeAction>(() => {
    return (localStorage.getItem("trove_swipe_left") as SwipeAction) || "delete";
  });
  const [swipeRightAction, setSwipeRightAction] = useState<SwipeAction>(() => {
    return (localStorage.getItem("trove_swipe_right") as SwipeAction) || "archive";
  });

  useEffect(() => {
    localStorage.setItem("trove_swipe_left", swipeLeftAction);
  }, [swipeLeftAction]);

  useEffect(() => {
    localStorage.setItem("trove_swipe_right", swipeRightAction);
  }, [swipeRightAction]);

  useEffect(() => {
    function applyTheme(pref: "light" | "dark" | "system") {
      const html = document.documentElement;
      if (pref === "dark") {
        html.classList.add("dark");
      } else if (pref === "light") {
        html.classList.remove("dark");
      } else {
        // system — check matchMedia
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          html.classList.add("dark");
        } else {
          html.classList.remove("dark");
        }
      }
    }

    applyTheme(theme);
    localStorage.setItem("trove_theme", theme);

    // Listen for system changes when in "system" mode
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const { collections, refetch: refetchCollections } = useCollections();
  const { plugins, refetch: refetchPlugins } = usePlugins();

  // Default to inbox collection once collections are loaded
  const inboxCollection = collections.find(
    (c) => c.name.toLowerCase() === "inbox",
  );

  useEffect(() => {
    if (
      inboxCollection &&
      selectedCollection === null &&
      selectedTag === null &&
      !showSettings
    ) {
      setSelectedCollection(inboxCollection.id);
    }
  }, [inboxCollection]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // SSE auto-refresh — connect on mount, debounce rapid events
  // -----------------------------------------------------------------------

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const disconnect = connectSSE(() => {
      // Debounce: wait 300ms after last event before refetching
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        refetchLinks();
        refetchCollections();
      }, 300);
    });

    return () => {
      disconnect();
      if (timeout) clearTimeout(timeout);
    };
  }, [refetchLinks, refetchCollections]);

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
  // Context menu handlers
  // -----------------------------------------------------------------------

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, link: Link) => {
      setContextMenu({ x: e.clientX, y: e.clientY, link });
    },
    [],
  );

  const handleContextArchive = useCallback(
    async (link: Link) => {
      try {
        if (link.status === "archived") {
          await api.links.update(link.id, { status: "saved" });
        } else {
          await api.links.archive(link.id);
        }
        refetchLinks();
        refetchCollections();
      } catch {
        // Silently fail
      }
    },
    [refetchLinks, refetchCollections],
  );

  const handleContextDelete = useCallback(
    async (link: Link) => {
      if (!window.confirm("Delete this link permanently?")) return;
      try {
        await api.links.delete(link.id);
        if (selectedLinkId === link.id) setSelectedLinkId(null);
        refetchLinks();
        refetchCollections();
      } catch {
        // Silently fail
      }
    },
    [selectedLinkId, refetchLinks, refetchCollections],
  );

  const handleContextPluginAction = useCallback(
    async (link: Link, plugin: PluginInfo) => {
      try {
        const result = await api.plugins.executeAction(link.id, plugin.id);
        if (result.type === "redirect" && result.url) {
          window.open(result.url, "_blank", "noopener,noreferrer");
        }
      } catch {
        // Silently fail
      }
    },
    [],
  );

  const handleContextCopyUrl = useCallback(
    async (link: Link) => {
      try {
        await navigator.clipboard.writeText(link.url);
      } catch {
        // Silently fail
      }
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Swipe action handler
  // -----------------------------------------------------------------------

  const handleSwipeAction = useCallback(
    async (link: Link, action: SwipeAction) => {
      try {
        if (action === "archive") {
          await api.links.archive(link.id);
          refetchLinks();
          refetchCollections();
        } else if (action === "delete") {
          await api.links.delete(link.id);
          if (selectedLinkId === link.id) setSelectedLinkId(null);
          refetchLinks();
          refetchCollections();
        } else if (action.startsWith("plugin:")) {
          const pluginId = action.slice("plugin:".length);
          const result = await api.plugins.executeAction(link.id, pluginId);
          if (result.type === "redirect" && result.url) {
            window.open(result.url, "_blank", "noopener,noreferrer");
          }
          refetchLinks();
        }
      } catch {
        // Silently fail
      }
    },
    [selectedLinkId, refetchLinks, refetchCollections],
  );

  // -----------------------------------------------------------------------
  // Shortcut feedback helper
  // -----------------------------------------------------------------------

  const showFeedback = useCallback((msg: string) => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    setShortcutFeedback(msg);
    feedbackTimeout.current = setTimeout(() => setShortcutFeedback(null), 2000);
  }, []);

  // -----------------------------------------------------------------------
  // Executable plugins list (for keyboard shortcuts + hints)
  // -----------------------------------------------------------------------

  const executablePlugins = plugins.filter(
    (p) => p.hasExecute && p.isConfigured && p.enabled,
  );

  // -----------------------------------------------------------------------
  // Keyboard shortcuts (Task 6)
  // -----------------------------------------------------------------------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const focusedLink =
        focusedLinkIndex >= 0 && focusedLinkIndex < links.length
          ? links[focusedLinkIndex]
          : null;

      switch (e.key) {
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "Escape":
          if (contextMenu) {
            setContextMenu(null);
          } else if (selectedLinkIds.size > 0) {
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
          if (focusedLink) {
            setSelectedLinkId(focusedLink.id);
          }
          break;
        case "x":
          if (focusedLink) {
            toggleLinkSelection(focusedLink.id);
          }
          break;
        case "a":
          if (focusedLink) {
            e.preventDefault();
            (async () => {
              try {
                if (focusedLink.status === "archived") {
                  await api.links.update(focusedLink.id, { status: "saved" });
                  showFeedback("Unarchived");
                } else {
                  await api.links.archive(focusedLink.id);
                  showFeedback("Archived");
                }
                refetchLinks();
                refetchCollections();
              } catch {
                showFeedback("Archive failed");
              }
            })();
          }
          break;
        case "d":
          if (focusedLink) {
            e.preventDefault();
            if (window.confirm("Delete this link permanently?")) {
              (async () => {
                try {
                  await api.links.delete(focusedLink.id);
                  if (selectedLinkId === focusedLink.id) setSelectedLinkId(null);
                  showFeedback("Deleted");
                  refetchLinks();
                  refetchCollections();
                } catch {
                  showFeedback("Delete failed");
                }
              })();
            }
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          if (!focusedLink) break;
          const pluginIndex = parseInt(e.key, 10) - 1;
          if (pluginIndex >= executablePlugins.length) break;
          const plugin = executablePlugins[pluginIndex];
          e.preventDefault();
          showFeedback(`Sending to ${plugin.name}...`);
          (async () => {
            try {
              const result = await api.plugins.executeAction(
                focusedLink.id,
                plugin.id,
              );
              if (result.type === "redirect" && result.url) {
                window.open(result.url, "_blank", "noopener,noreferrer");
                showFeedback(`Opened ${plugin.name}`);
              } else if (result.type === "success") {
                showFeedback(result.message ?? `Sent to ${plugin.name}`);
              } else {
                showFeedback(result.message ?? `${plugin.name} failed`);
              }
              refetchLinks();
            } catch {
              showFeedback(`${plugin.name} failed`);
            }
          })();
          break;
        }
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
    executablePlugins,
    contextMenu,
    showFeedback,
    refetchLinks,
    refetchCollections,
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
    <div className="flex h-dvh bg-surface dark:bg-dark overflow-x-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <CollectionSidebar
          selectedCollection={selectedCollection}
          onSelectCollection={handleSelectCollection}
          selectedTag={selectedTag}
          onSelectTag={handleSelectTag}
          onOpenSettings={() => setShowSettings(true)}
          isSettingsActive={showSettings}
          userName={user.name}
          onSignOut={onLogout}
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
              userName={user.name}
              onSignOut={onLogout}
            />
          </div>
        </div>
      )}

      {showSettings ? (
        <div className="flex flex-1 flex-col min-w-0">
          {/* Mobile nav for settings — allows navigating back */}
          <MobileNav
            onToggleSidebar={() => setIsMobileSidebarOpen((v) => !v)}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            currentView="Settings"
          />
          <SettingsView
            collections={collections}
            onRefreshCollections={refetchCollections}
            onRefreshPlugins={refetchPlugins}
            onClose={() => setShowSettings(false)}
            theme={theme}
            onThemeChange={setTheme}
            user={user}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-w-0">
          {/* Mobile nav bar */}
          <MobileNav
            onToggleSidebar={() => setIsMobileSidebarOpen((v) => !v)}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            currentView={currentViewName}
            searchQuery={searchQuery}
            onSearchChange={(v) => {
              setSearchQuery(v);
              setPage(1);
              setSelectedLinkId(null);
            }}
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
                      onContextMenu={handleContextMenu}
                      onArchive={handleContextArchive}
                      onDelete={handleContextDelete}
                      onPluginAction={handleContextPluginAction}
                      swipeLeftAction={swipeLeftAction}
                      swipeRightAction={swipeRightAction}
                      onSwipeAction={handleSwipeAction}
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

          {/* Keyboard shortcut hints when a link is focused */}
          {focusedLinkIndex >= 0 && focusedLinkIndex < links.length && (
            <div className="hidden lg:flex border-t border-border dark:border-dark-border px-4 py-2 items-center gap-3 text-[11px] text-muted dark:text-dark-muted shrink-0 flex-wrap">
              <span>
                <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px]">a</kbd>{" "}
                {links[focusedLinkIndex].status === "archived"
                  ? "Unarchive"
                  : "Archive"}
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px]">d</kbd>{" "}
                Delete
              </span>
              {executablePlugins.map((p, i) => (
                <span key={p.id}>
                  <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px]">
                    {i + 1}
                  </kbd>{" "}
                  {p.actionLabel ?? p.name}
                </span>
              ))}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          link={contextMenu.link}
          plugins={plugins}
          onClose={() => setContextMenu(null)}
          onArchive={handleContextArchive}
          onDelete={handleContextDelete}
          onPluginAction={handleContextPluginAction}
          onCopyUrl={handleContextCopyUrl}
        />
      )}

      {/* Shortcut action feedback toast */}
      {shortcutFeedback && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm shadow-lg">
          {shortcutFeedback}
        </div>
      )}
    </div>
  );
}
