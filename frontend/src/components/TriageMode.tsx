import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import type { Link, PluginInfo, Collection } from "../api";

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(dateString: string): string {
  const now = Date.now();
  const normalised = dateString.includes("T")
    ? dateString
    : dateString.replace(" ", "T") + "Z";
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
// Extraction status badge
// ---------------------------------------------------------------------------

function ExtractionBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted dark:text-dark-muted">
        <svg
          className="animate-spin h-3 w-3"
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
        Extracting...
      </span>
    );
  }

  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
        Extracted
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
        Extraction failed
      </span>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// TriageMode
// ---------------------------------------------------------------------------

export interface TriageModeProps {
  links: Link[];
  plugins: PluginInfo[];
  collections: Collection[];
  onArchive: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPluginAction: (linkId: string, pluginId: string) => Promise<void>;
  onExit: () => void;
  onRefresh: () => void;
}

export default function TriageMode({
  links,
  plugins,
  collections,
  onArchive,
  onDelete,
  onPluginAction,
  onExit,
  onRefresh,
}: TriageModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [exitingIndex, setExitingIndex] = useState<number | null>(null);
  const [skippedIds] = useState<Set<string>>(() => new Set());
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const executablePlugins = plugins.filter(
    (p) => p.hasExecute && p.isConfigured && p.enabled,
  );

  // The total count starts as the links length. As items are removed
  // the remaining count is links.length.
  const totalCount = links.length;
  const currentLink = currentIndex < totalCount ? links[currentIndex] : null;

  const showFeedback = useCallback((msg: string) => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    setActionFeedback(msg);
    feedbackTimeout.current = setTimeout(() => setActionFeedback(null), 2000);
  }, []);

  // Animate out then perform action
  const performAction = useCallback(
    async (action: () => Promise<void>, label: string) => {
      if (processing || !currentLink) return;
      setProcessing(true);
      setExitingIndex(currentIndex);
      showFeedback(label);

      try {
        await action();
      } catch {
        showFeedback(`${label} failed`);
      }

      // After action completes, the link list will be refreshed by the parent.
      // We keep currentIndex the same since the removed item shifts everything down.
      setTimeout(() => {
        setExitingIndex(null);
        setProcessing(false);
        onRefresh();
      }, 300);
    },
    [processing, currentLink, currentIndex, showFeedback, onRefresh],
  );

  const handleArchive = useCallback(() => {
    if (!currentLink) return;
    const id = currentLink.id;
    setHistory((prev) => [...prev, currentIndex]);
    return performAction(() => onArchive(id), "Archived");
  }, [currentLink, currentIndex, performAction, onArchive]);

  const handleDelete = useCallback(() => {
    if (!currentLink) return;
    const id = currentLink.id;
    setHistory((prev) => [...prev, currentIndex]);
    return performAction(() => onDelete(id), "Deleted");
  }, [currentLink, currentIndex, performAction, onDelete]);

  const handlePlugin = useCallback(
    (pluginIndex: number) => {
      if (!currentLink || pluginIndex >= executablePlugins.length) return;
      const plugin = executablePlugins[pluginIndex];
      const id = currentLink.id;
      setHistory((prev) => [...prev, currentIndex]);
      return performAction(
        () => onPluginAction(id, plugin.id),
        `Sent to ${plugin.name}`,
      );
    },
    [currentLink, currentIndex, executablePlugins, performAction, onPluginAction],
  );

  const handleSkip = useCallback(() => {
    if (processing || !currentLink) return;
    skippedIds.add(currentLink.id);
    setHistory((prev) => [...prev, currentIndex]);
    setCurrentIndex((prev) => Math.min(prev + 1, totalCount));
  }, [processing, currentLink, currentIndex, totalCount, skippedIds]);

  const handleBack = useCallback(() => {
    if (processing || history.length === 0) return;
    const prevIndex = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setCurrentIndex(prevIndex);
  }, [processing, history]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onExit();
          break;
        case "a":
        case "A":
          e.preventDefault();
          handleArchive();
          break;
        case "d":
        case "D":
          e.preventDefault();
          handleDelete();
          break;
        case "s":
        case "ArrowRight":
          e.preventDefault();
          handleSkip();
          break;
        case "k":
        case "ArrowLeft":
          e.preventDefault();
          handleBack();
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
          const idx = parseInt(e.key, 10) - 1;
          if (idx < executablePlugins.length) {
            e.preventDefault();
            handlePlugin(idx);
          }
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    onExit,
    handleArchive,
    handleDelete,
    handleSkip,
    handleBack,
    handlePlugin,
    executablePlugins.length,
  ]);

  // Find the collection name for the current link
  const currentCollection = currentLink?.collectionId
    ? collections.find((c) => c.id === currentLink.collectionId)
    : null;

  // Completed state
  if (!currentLink || currentIndex >= totalCount) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-20">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-2">
            <svg className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            All done!
          </h2>
          <p className="text-sm text-muted dark:text-dark-muted">
            You&apos;ve triaged all the links in this view.
          </p>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            Exit Triage
          </button>
        </div>
      </div>
    );
  }

  const remainingCount = totalCount - currentIndex;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Progress header */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-border dark:border-dark-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 text-sm text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
            <span className="hidden sm:inline">Exit</span>
          </button>
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Triage
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted dark:text-dark-muted tabular-nums">
            {remainingCount} of {totalCount} remaining
          </span>
          {/* Progress bar */}
          <div className="hidden sm:block w-24 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100 transition-all duration-300"
              style={{
                width: `${((totalCount - remainingCount) / totalCount) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Focused link card */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center px-4 lg:px-6 py-6 lg:py-10 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div
          className={`w-full max-w-2xl transition-all duration-300 ${
            exitingIndex === currentIndex
              ? "opacity-0 translate-x-8"
              : "opacity-100 translate-x-0"
          }`}
        >
          <div className="rounded-xl border border-border dark:border-dark-border bg-card dark:bg-dark-card shadow-sm overflow-hidden">
            {/* Link image if available */}
            {currentLink.imageUrl && (
              <div className="w-full h-40 lg:h-48 bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <img
                  src={currentLink.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="p-5 lg:p-6 space-y-4">
              {/* Title */}
              <div className="flex items-start gap-3">
                {currentLink.faviconUrl ? (
                  <img
                    src={currentLink.faviconUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="shrink-0 rounded-sm mt-0.5"
                  />
                ) : (
                  <span className="shrink-0 w-5 h-5 rounded-sm bg-border dark:bg-dark-border mt-0.5" />
                )}
                <h2 className="text-lg lg:text-xl font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">
                  {currentLink.title || currentLink.url}
                </h2>
              </div>

              {/* URL and domain */}
              <div className="flex items-center gap-2 text-sm text-muted dark:text-dark-muted">
                {currentLink.domain && (
                  <span className="font-medium">{currentLink.domain}</span>
                )}
                {currentLink.domain && <span aria-hidden>·</span>}
                <span className="whitespace-nowrap">
                  {relativeTime(currentLink.createdAt)}
                </span>
              </div>

              {/* Full URL (truncated) */}
              <a
                href={currentLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors truncate max-w-full"
                title={currentLink.url}
              >
                <span className="truncate">{currentLink.url}</span>
                <svg
                  className="h-3 w-3 shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.182a.75.75 0 01.182-.514l.042-.042a.75.75 0 01.514-.182h4.012a.75.75 0 01.75.75v4.012a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 11-1.06-1.06l5.22-5.22h-2.69a.75.75 0 01-.75-.75z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>

              {/* Description excerpt */}
              {currentLink.description && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed line-clamp-4">
                  {currentLink.description}
                </p>
              )}

              {/* Content excerpt (if no description but has content) */}
              {!currentLink.description && currentLink.content && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed line-clamp-4">
                  {currentLink.content.slice(0, 300)}
                  {currentLink.content.length > 300 ? "..." : ""}
                </p>
              )}

              {/* Tags and metadata row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Tags */}
                {currentLink.tags && currentLink.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {currentLink.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-block px-2 py-0.5 text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-muted dark:text-dark-muted"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Collection badge */}
                {currentCollection && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-muted dark:text-dark-muted">
                    {currentCollection.icon && (
                      <span>{currentCollection.icon}</span>
                    )}
                    {currentCollection.name}
                  </span>
                )}

                {/* Extraction status */}
                <ExtractionBadge status={currentLink.extractionStatus} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar — fixed at bottom */}
      <div className="border-t border-border dark:border-dark-border bg-card dark:bg-dark-card px-4 lg:px-6 py-3 shrink-0">
        {/* Mobile: button grid */}
        <div className="lg:hidden space-y-2">
          {/* Plugin actions */}
          {executablePlugins.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {executablePlugins.map((plugin, i) => (
                <button
                  key={plugin.id}
                  type="button"
                  onClick={() => handlePlugin(i)}
                  disabled={processing}
                  className="flex-1 min-w-[calc(50%-0.25rem)] inline-flex items-center justify-center gap-1.5 rounded-lg border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-3 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
                >
                  <span>{plugin.icon}</span>
                  <span className="truncate">
                    {plugin.actionLabel ?? plugin.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Standard actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleArchive}
              disabled={processing}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-3 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
            >
              <svg
                className="h-4 w-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                <path
                  fillRule="evenodd"
                  d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.72a.75.75 0 011.06 0L10 10.94l1.72-1.72a.75.75 0 111.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
              Archive
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={processing}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-3 py-3 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors"
            >
              <svg
                className="h-4 w-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                  clipRule="evenodd"
                />
              </svg>
              Delete
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={processing}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-3 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
            >
              Skip
              <svg
                className="h-4 w-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Desktop: single row with keyboard hints */}
        <div className="hidden lg:flex items-center justify-center gap-2 flex-wrap">
          {/* Plugin actions */}
          {executablePlugins.map((plugin, i) => (
            <button
              key={plugin.id}
              type="button"
              onClick={() => handlePlugin(i)}
              disabled={processing}
              className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-2 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
            >
              <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px] text-muted dark:text-dark-muted">
                {i + 1}
              </kbd>
              <span>{plugin.icon}</span>
              <span>{plugin.actionLabel ?? plugin.name}</span>
            </button>
          ))}

          {/* Divider if plugins exist */}
          {executablePlugins.length > 0 && (
            <span className="w-px h-6 bg-border dark:bg-dark-border mx-1" />
          )}

          {/* Archive */}
          <button
            type="button"
            onClick={handleArchive}
            disabled={processing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-2 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
          >
            <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px] text-muted dark:text-dark-muted">
              A
            </kbd>
            Archive
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={processing}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors"
          >
            <kbd className="px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/30 font-mono text-[10px] text-red-500 dark:text-red-400">
              D
            </kbd>
            Delete
          </button>

          {/* Skip */}
          <button
            type="button"
            onClick={handleSkip}
            disabled={processing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-2 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
          >
            <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px] text-muted dark:text-dark-muted">
              S
            </kbd>
            Skip
          </button>

          {/* Back */}
          <button
            type="button"
            onClick={handleBack}
            disabled={processing || history.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-2 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
          >
            <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px] text-muted dark:text-dark-muted">
              K
            </kbd>
            Back
          </button>

          {/* Divider */}
          <span className="w-px h-6 bg-border dark:bg-dark-border mx-1" />

          {/* Exit */}
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 rounded-md text-muted dark:text-dark-muted px-3 py-2 text-sm hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px]">
              Esc
            </kbd>
            Exit
          </button>
        </div>
      </div>

      {/* Feedback toast */}
      {actionFeedback && (
        <div className="fixed bottom-20 lg:bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm shadow-lg pointer-events-none">
          {actionFeedback}
        </div>
      )}
    </div>
  );
}
