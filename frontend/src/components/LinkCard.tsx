import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "../api";
import type { Link, PluginInfo, ActionBadge, LinkAction } from "../api";

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(dateString: string): string {
  const now = Date.now();
  // SQLite datetime format "YYYY-MM-DD HH:MM:SS" needs T separator and Z suffix for UTC
  const normalised = dateString.includes("T") ? dateString : dateString.replace(" ", "T") + "Z";
  const then = new Date(normalised).getTime();
  const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSeconds < 60) return "just now";

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

// ---------------------------------------------------------------------------
// Extraction status icon
// ---------------------------------------------------------------------------

function ExtractionIcon({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <svg
        className="animate-spin h-3.5 w-3.5 text-muted dark:text-dark-muted shrink-0"
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
    );
  }

  if (status === "failed") {
    return (
      <svg
        className="h-3.5 w-3.5 text-amber-500 shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Plugin action button (inline on card)
// ---------------------------------------------------------------------------

function PluginActionButton({
  link,
  plugin,
  onSuccess,
}: {
  link: Link;
  plugin: PluginInfo;
  onSuccess?: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (status === "loading") return;

    setStatus("loading");
    try {
      const result = await api.plugins.executeAction(link.id, plugin.id);
      if (result.type === "redirect" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setStatus("success");
      onSuccess?.();
    } catch {
      setStatus("error");
    }

    // Reset after 2 seconds
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      title={plugin.actionLabel ?? plugin.name}
      className="inline-flex items-center justify-center h-6 w-6 rounded text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 shrink-0"
    >
      {status === "loading" ? (
        <svg
          className="animate-spin h-3.5 w-3.5 text-muted dark:text-dark-muted"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : status === "success" ? (
        <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
      ) : status === "error" ? (
        <svg className="h-3.5 w-3.5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      ) : (
        <span>{plugin.icon}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// LinkCard
// ---------------------------------------------------------------------------

export type SwipeAction = "archive" | "delete" | "none" | `plugin:${string}`;

export interface LinkCardProps {
  link: Link;
  onClick: () => void;
  isSelected?: boolean;
  isFocused?: boolean;
  plugins?: PluginInfo[];
  isSelectable?: boolean;
  isChecked?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
  onContextMenu?: (e: React.MouseEvent, link: Link) => void;
  onArchive?: (link: Link) => void;
  onDelete?: (link: Link) => void;
  onPluginAction?: (link: Link, plugin: PluginInfo) => void;
  onActionSuccess?: () => void;
  swipeLeftInner?: SwipeAction;
  swipeLeftOuter?: SwipeAction;
  swipeRightInner?: SwipeAction;
  swipeRightOuter?: SwipeAction;
  onSwipeAction?: (link: Link, action: SwipeAction) => void;
  viewMode?: "condensed" | "expanded";
  showImages?: boolean;
}

// ---------------------------------------------------------------------------
// Swipe threshold and helpers
// ---------------------------------------------------------------------------

const REVEAL_THRESHOLD = 60;
const FULL_SWIPE_THRESHOLD = 160;
const BUTTON_WIDTH = 72;

type SwipeState = "idle" | "swiping" | "revealed";

function useSwipe(
  enabled: boolean,
  hasLeftActions: boolean,
  hasRightActions: boolean,
) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentOffset = useRef(0);
  const directionLocked = useRef(false);
  const isSwiping = useRef(false);
  const [offset, setOffset] = useState(0);
  const [swipeState, setSwipeState] = useState<SwipeState>("idle");
  const [revealedDirection, setRevealedDirection] = useState<"left" | "right" | null>(null);
  const [fullSwipeTriggered, setFullSwipeTriggered] = useState<"left" | "right" | null>(null);

  const dismiss = useCallback(() => {
    setOffset(0);
    setSwipeState("idle");
    setRevealedDirection(null);
    currentOffset.current = 0;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      // If revealed, a touch on the card should dismiss
      if (swipeState === "revealed") return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      currentOffset.current = 0;
      directionLocked.current = false;
      isSwiping.current = false;
      setFullSwipeTriggered(null);
    },
    [enabled, swipeState],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || swipeState === "revealed") return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      // If vertical scroll is dominant, bail out
      if (!directionLocked.current && Math.abs(dy) > Math.abs(dx)) return;
      directionLocked.current = true;
      isSwiping.current = true;

      // Constrain by available actions
      if (dx < 0 && !hasLeftActions) return;
      if (dx > 0 && !hasRightActions) return;

      // Rubber-band clamp
      const max = FULL_SWIPE_THRESHOLD + 40;
      const clamped = Math.max(-max, Math.min(max, dx));

      currentOffset.current = clamped;
      setOffset(clamped);
      setSwipeState("swiping");
    },
    [enabled, hasLeftActions, hasRightActions, swipeState],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled || !isSwiping.current || swipeState === "revealed") return;

    const off = currentOffset.current;
    const absOff = Math.abs(off);
    const direction = off < 0 ? "left" : "right";

    if (absOff >= FULL_SWIPE_THRESHOLD) {
      // Full swipe — trigger outermost action
      setFullSwipeTriggered(direction);
      // Briefly hold then reset
      setTimeout(() => {
        setOffset(0);
        setSwipeState("idle");
        setRevealedDirection(null);
        currentOffset.current = 0;
      }, 200);
    } else if (absOff >= REVEAL_THRESHOLD) {
      // Partial swipe — snap to revealed position
      const revealOffset = BUTTON_WIDTH * 2; // 144px
      setOffset(direction === "left" ? -revealOffset : revealOffset);
      currentOffset.current = direction === "left" ? -revealOffset : revealOffset;
      setSwipeState("revealed");
      setRevealedDirection(direction);
    } else {
      // Below threshold — snap back
      setOffset(0);
      setSwipeState("idle");
    }

    isSwiping.current = false;
  }, [enabled, swipeState]);

  return {
    offset,
    swipeState,
    revealedDirection,
    fullSwipeTriggered,
    dismiss,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

// ---------------------------------------------------------------------------
// Swipe action appearance helpers
// ---------------------------------------------------------------------------

function swipeActionBg(action: SwipeAction): string {
  if (action === "delete") return "bg-red-500";
  if (action === "archive") return "bg-green-500";
  if (action.startsWith("plugin:")) return "bg-blue-500";
  return "";
}

function swipeActionLabel(action: SwipeAction, plugins?: PluginInfo[]): string {
  if (action === "delete") return "Delete";
  if (action === "archive") return "Archive";
  if (action.startsWith("plugin:") && plugins) {
    const pluginId = action.slice("plugin:".length);
    const plugin = plugins.find((p) => p.id === pluginId);
    if (plugin) return plugin.actionLabel ?? plugin.name;
  }
  return "";
}

function swipeActionIcon(action: SwipeAction, plugins?: PluginInfo[]): React.ReactNode {
  if (action === "delete") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
      </svg>
    );
  }
  if (action === "archive") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
        <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.72a.75.75 0 011.06 0L10 10.94l1.72-1.72a.75.75 0 111.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 010-1.06z" clipRule="evenodd" />
      </svg>
    );
  }
  if (action.startsWith("plugin:") && plugins) {
    const pluginId = action.slice("plugin:".length);
    const plugin = plugins.find((p) => p.id === pluginId);
    if (plugin) return <span className="text-sm">{plugin.icon}</span>;
  }
  return null;
}

function SwipeButton({
  action,
  plugins,
  onClick,
}: {
  action: SwipeAction;
  plugins?: PluginInfo[];
  onClick: () => void;
}) {
  if (action === "none") return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex flex-col items-center justify-center w-[72px] h-full text-white text-xs font-medium ${swipeActionBg(action)}`}
    >
      {swipeActionIcon(action, plugins)}
      <span className="mt-0.5">{swipeActionLabel(action, plugins)}</span>
    </button>
  );
}

export default function LinkCard({
  link,
  onClick,
  isSelected,
  isFocused,
  plugins,
  isSelectable,
  isChecked,
  onToggleSelect,
  onLongPress,
  onContextMenu,
  onArchive,
  onDelete,
  onPluginAction,
  onActionSuccess,
  swipeLeftInner = "archive",
  swipeLeftOuter = "delete",
  swipeRightInner = "none",
  swipeRightOuter = "archive",
  onSwipeAction,
  viewMode = "condensed",
  showImages = false,
}: LinkCardProps) {
  const executablePlugins = plugins?.filter(
    (p) => p.hasExecute && p.isConfigured,
  );

  // Mobile swipe: only on narrow viewports
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < 1024,
  );

  // Long-press for mobile bulk selection
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleLongPressStart = useCallback(
    (e: React.TouchEvent) => {
      if (!onLongPress || isSelectable) return;
      longPressTriggered.current = false;
      touchStartPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        onLongPress();
        // Provide haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(30);
      }, 500);
    },
    [onLongPress, isSelectable],
  );

  const handleLongPressMove = useCallback(
    (e: React.TouchEvent) => {
      if (!longPressTimer.current || !touchStartPos.current) return;
      const dx = e.touches[0].clientX - touchStartPos.current.x;
      const dy = e.touches[0].clientY - touchStartPos.current.y;
      // Cancel long-press if finger moved more than 10px
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    },
    [],
  );

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  // Listen for resize to keep isMobile in sync
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const hasLeftActions = (swipeLeftInner !== "none" || swipeLeftOuter !== "none") && !!onSwipeAction;
  const hasRightActions = (swipeRightInner !== "none" || swipeRightOuter !== "none") && !!onSwipeAction;

  const {
    offset, swipeState, revealedDirection, fullSwipeTriggered, dismiss,
    onTouchStart, onTouchMove, onTouchEnd,
  } = useSwipe(isMobile && !isSelectable, hasLeftActions, hasRightActions);

  // Handle full swipe trigger
  useEffect(() => {
    if (fullSwipeTriggered && onSwipeAction) {
      const action = fullSwipeTriggered === "left" ? swipeLeftOuter : swipeRightOuter;
      if (action !== "none") onSwipeAction(link, action);
    }
  }, [fullSwipeTriggered, onSwipeAction, link, swipeLeftOuter, swipeRightOuter]);

  return (
    <div className="relative overflow-hidden flex flex-col">
      {/* Swipe action buttons (mobile only) */}
      {isMobile && (offset !== 0 || swipeState === "revealed") && (
        <div className="absolute inset-0 flex">
          {offset > 0 ? (
            /* Right swipe — buttons on left side */
            <div className="flex h-full">
              <SwipeButton
                action={swipeRightOuter}
                plugins={plugins}
                onClick={() => {
                  dismiss();
                  if (onSwipeAction && swipeRightOuter !== "none") onSwipeAction(link, swipeRightOuter);
                }}
              />
              <SwipeButton
                action={swipeRightInner}
                plugins={plugins}
                onClick={() => {
                  dismiss();
                  if (onSwipeAction && swipeRightInner !== "none") onSwipeAction(link, swipeRightInner);
                }}
              />
            </div>
          ) : offset < 0 ? (
            /* Left swipe — buttons on right side */
            <div className="flex h-full ml-auto">
              <SwipeButton
                action={swipeLeftInner}
                plugins={plugins}
                onClick={() => {
                  dismiss();
                  if (onSwipeAction && swipeLeftInner !== "none") onSwipeAction(link, swipeLeftInner);
                }}
              />
              <SwipeButton
                action={swipeLeftOuter}
                plugins={plugins}
                onClick={() => {
                  dismiss();
                  if (onSwipeAction && swipeLeftOuter !== "none") onSwipeAction(link, swipeLeftOuter);
                }}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Full-swipe colour indicator */}
      {isMobile && swipeState === "swiping" && Math.abs(offset) >= FULL_SWIPE_THRESHOLD && (
        <div className={`absolute inset-0 flex items-center ${offset < 0 ? "justify-end" : "justify-start"} px-5 ${swipeActionBg(offset < 0 ? swipeLeftOuter : swipeRightOuter)} text-white text-sm font-medium`}>
          <span className="flex items-center gap-1.5">
            {swipeActionIcon(offset < 0 ? swipeLeftOuter : swipeRightOuter, plugins)}
            {swipeActionLabel(offset < 0 ? swipeLeftOuter : swipeRightOuter, plugins)}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          if (swipeState === "revealed") {
            dismiss();
            return;
          }
          if (Math.abs(offset) > 5) return;
          if (longPressTriggered.current) {
            longPressTriggered.current = false;
            return;
          }
          onClick();
        }}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            onContextMenu(e, link);
          }
        }}
        onTouchStart={(e) => {
          handleLongPressStart(e);
          onTouchStart(e);
        }}
        onTouchMove={(e) => {
          handleLongPressMove(e);
          onTouchMove(e);
        }}
        onTouchEnd={(e) => {
          handleLongPressEnd();
          onTouchEnd();
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: swipeState === "swiping" ? "none" : "transform 0.2s ease-out",
        }}
        className={`group w-full text-left px-4 py-3 border-b border-border dark:border-dark-border transition-colors cursor-pointer relative bg-surface dark:bg-dark ${
          isFocused
            ? "border-l-2 border-l-neutral-500 dark:border-l-neutral-400 pl-[14px]"
            : ""
        } ${
          isSelected
            ? "bg-hover dark:bg-dark-hover"
            : isChecked
              ? "bg-blue-50 dark:bg-blue-950/20"
              : "hover:bg-hover dark:hover:bg-dark-hover"
        }`}
      >
        <div className={`flex ${viewMode === "expanded" && showImages && link.imageUrl ? "gap-3" : ""}`}>
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Row 1: checkbox + favicon + title + extraction status + plugin actions */}
            <div className="flex items-center gap-2 min-w-0">
              {(isSelectable || isChecked) && (
                <span
                  role="checkbox"
                  aria-checked={isChecked}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.stopPropagation();
                      e.preventDefault();
                      onToggleSelect?.();
                    }
                  }}
                  tabIndex={0}
                  className={`shrink-0 flex items-center justify-center h-4 w-4 rounded border transition-colors cursor-pointer ${
                    isChecked
                      ? "bg-neutral-900 dark:bg-neutral-100 border-neutral-900 dark:border-neutral-100"
                      : "border-neutral-400 dark:border-neutral-500 hover:border-neutral-600 dark:hover:border-neutral-300"
                  }`}
                >
                  {isChecked && (
                    <svg className="h-3 w-3 text-white dark:text-neutral-900" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
              )}
              {link.faviconUrl ? (
                <img
                  src={link.faviconUrl}
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0 rounded-sm"
                />
              ) : (
                <span className="shrink-0 w-4 h-4 rounded-sm bg-border dark:bg-dark-border" />
              )}
              <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
                {link.title || link.url}
              </span>
              <ExtractionIcon status={link.extractionStatus} />
              {executablePlugins && executablePlugins.length > 0 && (
                <span className="ml-auto flex items-center gap-0.5 shrink-0">
                  {executablePlugins.map((p) => (
                    <PluginActionButton key={p.id} link={link} plugin={p} onSuccess={onActionSuccess} />
                  ))}
                </span>
              )}
            </div>

            {/* Row 2: domain + relative time */}
            <div className="mt-0.5 pl-6 flex items-center gap-2 text-xs text-muted dark:text-dark-muted">
              {link.domain && <span className="truncate">{link.domain}</span>}
              {link.domain && <span aria-hidden>·</span>}
              <span className="whitespace-nowrap">{relativeTime(link.createdAt)}</span>
            </div>

            {/* Expanded view: excerpt */}
            {viewMode === "expanded" && (link.description || link.content) && (
              <div className="mt-1.5 pl-6 pr-1">
                <p className="text-[13px] leading-relaxed text-muted dark:text-dark-muted line-clamp-2">
                  {link.description || link.content}
                </p>
              </div>
            )}

            {/* Row 3: tags */}
            {link.tags && link.tags.length > 0 && (
              <div className="mt-1.5 pl-6 flex flex-wrap gap-1">
                {link.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-block px-1.5 py-0.5 text-[11px] leading-tight rounded bg-neutral-100 dark:bg-neutral-800 text-muted dark:text-dark-muted"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Row 4: action badges (archive view only) */}
            {(() => {
              const isActionBadge = (a: LinkAction | ActionBadge): a is ActionBadge => "pluginName" in a;
              const badges = link.actions?.filter(isActionBadge);
              if (!badges || badges.length === 0) return null;
              return (
                <div className="mt-1.5 pl-6 flex flex-wrap gap-1">
                  {badges.map((action) => (
                    <span
                      key={action.pluginId}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] leading-tight rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                    >
                      <span>{action.pluginIcon}</span>
                      Sent to {action.pluginName}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Image thumbnail */}
          {viewMode === "expanded" && showImages && link.imageUrl && (
            <img
              src={link.imageUrl}
              alt=""
              className="shrink-0 w-[72px] h-[72px] rounded-md object-cover self-center"
            />
          )}
        </div>
      </button>
    </div>
  );
}
