import { useState, useEffect, useRef, useCallback } from "react";
import { useLinks } from "../hooks/useLinks";
import { useCollections } from "../hooks/useCollections";
import { usePlugins } from "../hooks/usePlugins";
import { api, connectSSE } from "../api";
import CollectionSidebar from "./CollectionSidebar";
import SettingsView from "./SettingsView";
import type { SettingsTab } from "./SettingsView";
import LinkCard from "./LinkCard";
import type { SwipeAction } from "./LinkCard";
import LinkDetail from "./LinkDetail";
import SearchBar from "./SearchBar";
import AddLinkModal from "./AddLinkModal";
import BulkActionBar from "./BulkActionBar";
import MobileNav from "./MobileNav";
import ContextMenu from "./ContextMenu";
import TriageMode from "./TriageMode";
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

// ---------------------------------------------------------------------------
// Infinite scroll sentinel — triggers loadMore when visible in viewport
// ---------------------------------------------------------------------------

function InfiniteScrollSentinel({
  hasMore,
  isLoading,
  onLoadMore,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Keep mutable refs so the observer callback always reads fresh values
  // without causing the observer to be torn down and recreated.
  const isLoadingRef = useRef(isLoading);
  const onLoadMoreRef = useRef(onLoadMore);
  isLoadingRef.current = isLoading;
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingRef.current) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  if (!hasMore) return null;

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-4 shrink-0">
      {isLoading && (
        <svg
          className="animate-spin h-4 w-4 text-muted dark:text-dark-muted"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </div>
  );
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);

  // Bulk selection (Task 5)
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkModeActive, setBulkModeActive] = useState(false);

  // Triage mode
  const [triageMode, setTriageMode] = useState(false);

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
  // User preferences (synced via API)
  // -----------------------------------------------------------------------

  const [theme, setThemeState] = useState<"light" | "dark" | "system">("system");
  const [swipeLeftInner, setSwipeLeftInnerState] = useState<SwipeAction>("archive");
  const [swipeLeftOuter, setSwipeLeftOuterState] = useState<SwipeAction>("delete");
  const [swipeRightInner, setSwipeRightInnerState] = useState<SwipeAction>("none");
  const [swipeRightOuter, setSwipeRightOuterState] = useState<SwipeAction>("archive");
  const [viewMode, setViewModeState] = useState<"condensed" | "expanded">("condensed");
  const [showImages, setShowImagesState] = useState(true);
  const [sortOrder, setSortOrderState] = useState<"asc" | "desc">("desc");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Load preferences from the server on mount
  useEffect(() => {
    api.preferences.get().then((prefs) => {
      const t = prefs.theme;
      if (t === "light" || t === "dark" || t === "system") {
        setThemeState(t);
      }
      // Note: api.request() runs cameliseKeys on the response, so
      // snake_case DB keys arrive as camelCase.

      // New four-slot swipe prefs
      const sli = prefs.swipeLeftInner ?? prefs.swipe_left_inner;
      if (sli) setSwipeLeftInnerState(sli as SwipeAction);
      const slo = prefs.swipeLeftOuter ?? prefs.swipe_left_outer;
      if (slo) setSwipeLeftOuterState(slo as SwipeAction);
      const sri = prefs.swipeRightInner ?? prefs.swipe_right_inner;
      if (sri) setSwipeRightInnerState(sri as SwipeAction);
      const sro = prefs.swipeRightOuter ?? prefs.swipe_right_outer;
      if (sro) setSwipeRightOuterState(sro as SwipeAction);

      // Migration: if old keys exist but new ones don't, map old → outer
      const swipeLeft = prefs.swipeLeft ?? prefs.swipe_left;
      if (swipeLeft && !slo) {
        setSwipeLeftOuterState(swipeLeft as SwipeAction);
      }
      const swipeRight = prefs.swipeRight ?? prefs.swipe_right;
      if (swipeRight && !sro) {
        setSwipeRightOuterState(swipeRight as SwipeAction);
      }
      const vm = prefs.viewMode ?? prefs.view_mode;
      if (vm === "condensed" || vm === "expanded") {
        setViewModeState(vm);
      }
      const si = prefs.showImages ?? prefs.show_images;
      if (si !== undefined) {
        setShowImagesState(si === "true");
      }
      const so = prefs.sortOrder ?? prefs.sort_order;
      if (so === "asc" || so === "desc") {
        setSortOrderState(so);
      }
      setPrefsLoaded(true);

      // Clean up legacy localStorage values
      localStorage.removeItem("trove_theme");
      localStorage.removeItem("trove_swipe_left");
      localStorage.removeItem("trove_swipe_right");
    }).catch(() => {
      // If the API call fails, keep defaults and proceed
      setPrefsLoaded(true);
    });
  }, []);

  const setTheme = useCallback((value: "light" | "dark" | "system") => {
    setThemeState(value);
    api.preferences.set({ theme: value }).catch(() => {});
  }, []);

  const setSwipeLeftInner = useCallback((value: SwipeAction) => {
    setSwipeLeftInnerState(value);
    api.preferences.set({ swipe_left_inner: value }).catch(() => {});
  }, []);
  const setSwipeLeftOuter = useCallback((value: SwipeAction) => {
    setSwipeLeftOuterState(value);
    api.preferences.set({ swipe_left_outer: value }).catch(() => {});
  }, []);
  const setSwipeRightInner = useCallback((value: SwipeAction) => {
    setSwipeRightInnerState(value);
    api.preferences.set({ swipe_right_inner: value }).catch(() => {});
  }, []);
  const setSwipeRightOuter = useCallback((value: SwipeAction) => {
    setSwipeRightOuterState(value);
    api.preferences.set({ swipe_right_outer: value }).catch(() => {});
  }, []);

  const setViewMode = useCallback((value: "condensed" | "expanded") => {
    setViewModeState(value);
    api.preferences.set({ view_mode: value }).catch(() => {});
  }, []);

  const setShowImages = useCallback((value: boolean) => {
    setShowImagesState(value);
    api.preferences.set({ show_images: String(value) }).catch(() => {});
  }, []);

  const setSortOrder = useCallback((value: "asc" | "desc") => {
    setSortOrderState(value);
    api.preferences.set({ sort_order: value }).catch(() => {});
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(sortOrder === "desc" ? "asc" : "desc");
  }, [sortOrder, setSortOrder]);

  // Apply theme to the document
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
    setSelectedLinkId(null);
    setShowSettings(false);
    setSelectedLinkIds(new Set());
    setBulkModeActive(false);
    setFocusedLinkIndex(-1);
    setIsMobileSidebarOpen(false);
    setTriageMode(false);
  };

  const handleSelectTag = (tag: string | null) => {
    setSelectedTag(tag);
    setSelectedCollection(null);
    setSelectedLinkId(null);
    setShowSettings(false);
    setSelectedLinkIds(new Set());
    setBulkModeActive(false);
    setFocusedLinkIndex(-1);
    setIsMobileSidebarOpen(false);
    setTriageMode(false);
  };

  const isSearching = searchQuery.trim().length > 0;

  const linkFilters = (() => {
    if (isSearching) {
      return { q: searchQuery.trim(), sortOrder };
    }
    if (selectedCollection === "archive") {
      return { status: "archived", sortOrder };
    }
    if (selectedCollection) {
      return { collectionId: selectedCollection, sortOrder };
    }
    if (selectedTag) {
      return { tag: selectedTag, sortOrder };
    }
    return { sortOrder };
  })();

  const {
    links,
    isLoading: linksLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    refetch: refetchLinks,
  } = useLinks(linkFilters);

  // -----------------------------------------------------------------------
  // SSE auto-refresh — connect on mount, debounce rapid events
  // -----------------------------------------------------------------------

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefetch = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        refetchLinks();
        refetchCollections();
      }, 300);
    };

    const disconnect = connectSSE(debouncedRefetch, debouncedRefetch);

    // Refetch when the tab regains visibility (catches events missed while
    // the browser suspended this tab — Safari is particularly aggressive)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        debouncedRefetch();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
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
    setBulkModeActive(false);
  }, []);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedLinkIds);
    await api.links.bulkArchive(ids);
    setSelectedLinkIds(new Set());
    setBulkModeActive(false);
    refetchLinks();
    refetchCollections();
  }, [selectedLinkIds, refetchLinks, refetchCollections]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedLinkIds);
    await api.links.bulkDelete(ids);
    setSelectedLinkIds(new Set());
    setBulkModeActive(false);
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
      setBulkModeActive(false);
      refetchLinks();
      refetchCollections();
    },
    [selectedLinkIds, refetchLinks, refetchCollections],
  );

  const handleLongPress = useCallback(
    (id: string) => {
      setBulkModeActive(true);
      setSelectedLinkIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [],
  );

  const handleSelectAll = useCallback(() => {
    const allIds = new Set(links.map((l) => l.id));
    setSelectedLinkIds(allIds);
  }, [links]);

  const handleDeselectAll = useCallback(() => {
    setSelectedLinkIds(new Set());
  }, []);

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
        // Successful actions auto-archive on the backend — refetch to reflect
        if (result.type !== "error") {
          refetchLinks();
          refetchCollections();
        }
      } catch {
        // Silently fail
      }
    },
    [refetchLinks, refetchCollections],
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
  // Triage mode handlers
  // -----------------------------------------------------------------------

  const handleTriageArchive = useCallback(
    async (id: string) => {
      await api.links.archive(id);
      // Don't refetchLinks here — TriageMode's performAction calls
      // onRefresh after the exit animation to avoid double-refetch.
      refetchCollections();
    },
    [refetchCollections],
  );

  const handleTriageDelete = useCallback(
    async (id: string) => {
      await api.links.delete(id);
      if (selectedLinkId === id) setSelectedLinkId(null);
      refetchCollections();
    },
    [selectedLinkId, refetchCollections],
  );

  const handleTriagePluginAction = useCallback(
    async (linkId: string, pluginId: string) => {
      const result = await api.plugins.executeAction(linkId, pluginId);
      if (result.type === "error") {
        throw new Error(result.message ?? "Plugin action failed");
      }
      if (result.type === "redirect" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      // Backend auto-archives on successful action
      refetchCollections();
    },
    [refetchCollections],
  );

  const handleTriageExit = useCallback(() => {
    setTriageMode(false);
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

      // Triage mode has its own keyboard handler — only handle 't' to toggle off
      if (triageMode) return;

      const focusedLink =
        focusedLinkIndex >= 0 && focusedLinkIndex < links.length
          ? links[focusedLinkIndex]
          : null;

      switch (e.key) {
        case "t":
          if (!showSettings && links.length > 0) {
            e.preventDefault();
            setTriageMode(true);
          }
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "Escape":
          if (contextMenu) {
            setContextMenu(null);
          } else if (bulkModeActive || selectedLinkIds.size > 0) {
            setSelectedLinkIds(new Set());
            setBulkModeActive(false);
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
            if (!bulkModeActive) setBulkModeActive(true);
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
    bulkModeActive,
    toggleLinkSelection,
    executablePlugins,
    contextMenu,
    showFeedback,
    refetchLinks,
    refetchCollections,
    triageMode,
    showSettings,
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
    if (selectedCollection === "archive") return "archive";
    if (selectedCollection) {
      const col = collections.find((c) => c.id === selectedCollection);
      return col ? col.name : "Collection";
    }
    if (selectedTag) return `#${selectedTag}`;
    return "All Links";
  })();

  const isBulkMode = bulkModeActive || selectedLinkIds.size > 0;

  return (
    <div className="flex h-dvh bg-surface dark:bg-dark overflow-x-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <CollectionSidebar
          selectedCollection={selectedCollection}
          onSelectCollection={handleSelectCollection}
          selectedTag={selectedTag}
          onSelectTag={handleSelectTag}
          onOpenSettings={() => { setSettingsInitialTab(undefined); setShowSettings(true); }}
          onOpenHelp={() => { setSettingsInitialTab("help"); setShowSettings(true); }}
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
                setSettingsInitialTab(undefined);
                setShowSettings(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenHelp={() => {
                setSettingsInitialTab("help");
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
            bulkModeActive={false}
            onToggleBulkMode={() => {}}
          />
          <SettingsView
            key={settingsInitialTab ?? "default"}
            collections={collections}
            onRefreshCollections={refetchCollections}
            onRefreshLinks={refetchLinks}
            onRefreshPlugins={refetchPlugins}
            onClose={() => setShowSettings(false)}
            theme={theme}
            onThemeChange={setTheme}
            user={user}
            plugins={plugins}
            swipeLeftInner={swipeLeftInner}
            swipeLeftOuter={swipeLeftOuter}
            swipeRightInner={swipeRightInner}
            swipeRightOuter={swipeRightOuter}
            onSwipeLeftInnerChange={setSwipeLeftInner}
            onSwipeLeftOuterChange={setSwipeLeftOuter}
            onSwipeRightInnerChange={setSwipeRightInner}
            onSwipeRightOuterChange={setSwipeRightOuter}
            viewMode={viewMode}
            showImages={showImages}
            onViewModeChange={setViewMode}
            onShowImagesChange={setShowImages}
            initialTab={settingsInitialTab}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-w-0">
          {/* Mobile nav bar — hidden during triage (TriageMode has its own header) */}
          {!triageMode && (
            <MobileNav
              onToggleSidebar={() => setIsMobileSidebarOpen((v) => !v)}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              currentView={currentViewName}
              searchQuery={searchQuery}
              onSearchChange={(v) => {
                setSearchQuery(v);
                setSelectedLinkId(null);
              }}
              bulkModeActive={bulkModeActive}
              onToggleBulkMode={() => {
                if (bulkModeActive) {
                  setSelectedLinkIds(new Set());
                  setBulkModeActive(false);
                } else {
                  setBulkModeActive(true);
                }
              }}
              showTriageButton={links.length > 0}
              onToggleTriage={() => setTriageMode(true)}
              sortOrder={sortOrder}
              onToggleSortOrder={toggleSortOrder}
            />
          )}

          {/* Desktop header */}
          <header className="hidden lg:flex border-b border-border dark:border-dark-border px-6 py-4 items-center justify-between shrink-0">
            <SearchBar
              ref={searchRef}
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v);
                setSelectedLinkId(null);
              }}
            />
            <div className="flex items-center gap-2">
              {/* Sort order toggle */}
              <button
                type="button"
                onClick={toggleSortOrder}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border dark:border-dark-border text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
                title={sortOrder === "desc" ? "Newest first" : "Oldest first"}
              >
                {sortOrder === "desc" ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 01-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              {/* Triage button */}
              {links.length > 0 && !triageMode && (
                <button
                  type="button"
                  onClick={() => setTriageMode(true)}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border dark:border-dark-border text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
                  title="Triage mode (T)"
                >
                  {/* Lightning bolt icon */}
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
                  </svg>
                  Triage
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (bulkModeActive) {
                    setSelectedLinkIds(new Set());
                    setBulkModeActive(false);
                  } else {
                    setBulkModeActive(true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  bulkModeActive
                    ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                    : "border border-border dark:border-dark-border text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover"
                }`}
              >
                {/* Outlined checkbox with checkmark */}
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zm1.5 0v11h11v-11h-11z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M13.78 7.47a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L6.22 10.53a.75.75 0 011.06-1.06L9 11.19l3.72-3.72a.75.75 0 011.06 0z" clipRule="evenodd" />
                </svg>
                {bulkModeActive ? "Cancel" : "Select"}
              </button>
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
            </div>
          </header>

          {triageMode ? (
            <TriageMode
              links={links}
              plugins={plugins}
              collections={collections}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              loadMore={loadMore}
              onArchive={handleTriageArchive}
              onDelete={handleTriageDelete}
              onPluginAction={handleTriagePluginAction}
              onExit={handleTriageExit}
              onRefresh={refetchLinks}
            />
          ) : (
            <>
              <main className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
                {linksLoading && links.length === 0 ? (
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
                ) : !linksLoading && links.length === 0 ? (
                  <div className="flex items-center justify-center py-20">
                    <p className="text-sm text-muted dark:text-dark-muted">
                      No links found
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {links.map((link, index) => {
                      // FTS snippets use sanitiseSnippet() which escapes all
                      // HTML except <b>/<\/b> — safe for highlighted rendering.
                      const snippet = isSearching && link.snippet
                        ? sanitiseSnippet(link.snippet)
                        : null;
                      return (
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
                            onLongPress={() => handleLongPress(link.id)}
                            onContextMenu={handleContextMenu}
                            onArchive={handleContextArchive}
                            onDelete={handleContextDelete}
                            onPluginAction={handleContextPluginAction}
                            onActionSuccess={() => { refetchLinks(); refetchCollections(); }}
                            swipeLeftInner={swipeLeftInner}
                            swipeLeftOuter={swipeLeftOuter}
                            swipeRightInner={swipeRightInner}
                            swipeRightOuter={swipeRightOuter}
                            onSwipeAction={handleSwipeAction}
                            viewMode={viewMode}
                            showImages={showImages}
                          />
                          {snippet && (
                            <div className="px-4 pb-2 -mt-px border-b border-border dark:border-dark-border">
                              <p
                                className="pl-6 text-xs text-muted dark:text-dark-muted line-clamp-2 [&>b]:font-semibold [&>b]:text-neutral-700 dark:[&>b]:text-neutral-300"
                                dangerouslySetInnerHTML={{ __html: snippet }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Infinite scroll sentinel — inside the scroll container */}
                    <InfiniteScrollSentinel
                      hasMore={hasMore}
                      isLoading={isLoadingMore}
                      onLoadMore={loadMore}
                    />
                  </div>
                )}
              </main>

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
            </>
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
          totalCount={links.length}
          collections={collections}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onMoveToCollection={handleBulkMoveToCollection}
          onClearSelection={clearSelection}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
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
