import { useState, useEffect, useRef, useCallback } from "react";
import { api, ApiError } from "../api";
import type { Link, Collection } from "../api";

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
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

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Extraction status badge
// ---------------------------------------------------------------------------

function ExtractionBadge({
  status,
  onRetry,
}: {
  status: string;
  onRetry: () => void;
}) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted dark:text-dark-muted">
        <Spinner className="h-3 w-3" />
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
      <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
        <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
        Failed
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 underline hover:no-underline text-red-600 dark:text-red-400"
        >
          Retry
        </button>
      </span>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tag input (inline for detail panel)
// ---------------------------------------------------------------------------

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
      setInputValue("");
    }
    if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function handleBlur() {
    if (inputValue.trim()) {
      addTag(inputValue);
      setInputValue("");
    }
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="flex flex-wrap items-center gap-1.5 w-full rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark px-3 py-2 text-sm cursor-text min-h-[38px]"
    >
      {tags.map((tag, i) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            aria-label={`Remove tag ${tag}`}
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={tags.length === 0 ? "Add tags..." : ""}
        className="flex-1 min-w-[60px] bg-transparent text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted focus:outline-none text-xs"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteConfirmation({
  onConfirm,
  onCancel,
  isDeleting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
      <p className="flex-1 text-xs text-red-700 dark:text-red-300">
        Delete this link permanently?
      </p>
      <button
        type="button"
        onClick={onCancel}
        disabled={isDeleting}
        className="text-xs px-2 py-1 rounded border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isDeleting}
        className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
      >
        {isDeleting && <Spinner className="h-3 w-3" />}
        Delete
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkDetail
// ---------------------------------------------------------------------------

export interface LinkDetailProps {
  linkId: string;
  collections: Collection[];
  onClose: () => void;
  onUpdated: () => void;
}

export default function LinkDetail({
  linkId,
  collections,
  onClose,
  onUpdated,
}: LinkDetailProps) {
  const [link, setLink] = useState<Link | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Archive loading
  const [isArchiving, setIsArchiving] = useState(false);

  // Retry extraction loading
  const [isRetrying, setIsRetrying] = useState(false);

  // ------- Fetch link data -------

  const fetchLink = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setShowDeleteConfirm(false);
    setIsEditingTitle(false);
    try {
      const data = await api.links.get(linkId);
      setLink(data);
      setEditTitle(data.title || "");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load link details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [linkId]);

  useEffect(() => {
    fetchLink();
  }, [fetchLink]);

  // ------- Escape key to close -------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isEditingTitle) {
          setIsEditingTitle(false);
          setEditTitle(link?.title || "");
          return;
        }
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isEditingTitle, link?.title]);

  // ------- Focus title input when editing -------

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  // ------- Actions -------

  async function handleTitleSave() {
    if (!link) return;
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === link.title) {
      setIsEditingTitle(false);
      setEditTitle(link.title || "");
      return;
    }
    try {
      const updated = await api.links.update(link.id, { title: trimmed });
      setLink(updated);
      setEditTitle(updated.title || "");
      setIsEditingTitle(false);
      onUpdated();
    } catch {
      // Revert on error
      setEditTitle(link.title || "");
      setIsEditingTitle(false);
    }
  }

  async function handleCollectionChange(collectionId: string) {
    if (!link) return;
    const newCollectionId = collectionId || undefined;
    try {
      const updated = await api.links.update(link.id, {
        collectionId: newCollectionId,
      });
      setLink(updated);
      onUpdated();
    } catch {
      // Silently fail — the select will revert on next fetch
    }
  }

  async function handleTagsChange(newTags: string[]) {
    if (!link) return;
    try {
      const updated = await api.links.update(link.id, { tags: newTags });
      setLink(updated);
      onUpdated();
    } catch {
      // Silently fail
    }
  }

  async function handleArchive() {
    if (!link) return;
    setIsArchiving(true);
    try {
      await api.links.archive(link.id);
      onUpdated();
      // Refresh local data to reflect archived status
      const updated = await api.links.get(link.id);
      setLink(updated);
    } catch {
      // Silently fail
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleDelete() {
    if (!link) return;
    setIsDeleting(true);
    try {
      await api.links.delete(link.id);
      onClose();
      onUpdated();
    } catch {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleRetryExtraction() {
    if (!link) return;
    setIsRetrying(true);
    try {
      await api.links.extract(link.id);
      // Re-fetch to get updated extraction status
      const updated = await api.links.get(link.id);
      setLink(updated);
      onUpdated();
    } catch {
      // Silently fail
    } finally {
      setIsRetrying(false);
    }
  }

  // ------- Render -------

  if (isLoading) {
    return (
      <aside className="w-96 shrink-0 border-l border-border dark:border-dark-border bg-card dark:bg-dark-card flex flex-col h-screen">
        <div className="flex items-center justify-center flex-1">
          <Spinner className="h-5 w-5 text-muted dark:text-dark-muted" />
        </div>
      </aside>
    );
  }

  if (error || !link) {
    return (
      <aside className="w-96 shrink-0 border-l border-border dark:border-dark-border bg-card dark:bg-dark-card flex flex-col h-screen">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-dark-border shrink-0">
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Link Details
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            aria-label="Close panel"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-center flex-1 px-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error || "Link not found."}
          </p>
        </div>
      </aside>
    );
  }

  const currentTags = link.tags?.map((t) => t.name) ?? [];

  return (
    <aside className="w-96 shrink-0 border-l border-border dark:border-dark-border bg-card dark:bg-dark-card flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-dark-border shrink-0">
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Link Details
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          aria-label="Close panel"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Title — editable on click */}
        <div>
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTitleSave();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setIsEditingTitle(false);
                  setEditTitle(link.title || "");
                }
              }}
              onBlur={handleTitleSave}
              className="w-full text-lg font-semibold text-neutral-900 dark:text-neutral-100 bg-transparent border-b-2 border-neutral-400 dark:border-neutral-500 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100 transition-colors pb-0.5"
            />
          ) : (
            <h2
              onClick={() => {
                setEditTitle(link.title || "");
                setIsEditingTitle(true);
              }}
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 cursor-text hover:bg-hover dark:hover:bg-dark-hover rounded px-1 -mx-1 py-0.5 transition-colors"
              title="Click to edit title"
            >
              {link.title || link.url}
            </h2>
          )}
        </div>

        {/* URL + domain + favicon */}
        <div className="flex items-center gap-2 min-w-0">
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
          {link.domain && (
            <span className="text-xs text-muted dark:text-dark-muted truncate">
              {link.domain}
            </span>
          )}
          <span className="text-muted dark:text-dark-muted">·</span>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 truncate transition-colors"
            title={link.url}
          >
            <span className="truncate">{link.url}</span>
            {/* External link icon */}
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
        </div>

        {/* Extraction status badge */}
        <div>
          {isRetrying ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted dark:text-dark-muted">
              <Spinner className="h-3 w-3" />
              Retrying extraction...
            </span>
          ) : (
            <ExtractionBadge
              status={link.extractionStatus}
              onRetry={handleRetryExtraction}
            />
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border dark:border-dark-border" />

        {/* Collection dropdown */}
        <div>
          <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
            Collection
          </label>
          <select
            value={link.collectionId ?? ""}
            onChange={(e) => handleCollectionChange(e.target.value)}
            className="w-full rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors appearance-none"
          >
            <option value="">No collection</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tags section */}
        <div>
          <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
            Tags
          </label>
          <TagInput tags={currentTags} onChange={handleTagsChange} />
        </div>

        {/* Divider */}
        <div className="border-t border-border dark:border-dark-border" />

        {/* Extracted content */}
        {link.content && (
          <div>
            <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
              Extracted Content
            </label>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark p-3">
              <p className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words leading-relaxed">
                {link.content}
              </p>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border dark:border-dark-border" />

        {/* Metadata */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted dark:text-dark-muted">
            Metadata
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <span className="text-muted dark:text-dark-muted">Source</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              {link.source}
            </span>

            {link.status && (
              <>
                <span className="text-muted dark:text-dark-muted">Status</span>
                <span className="text-neutral-700 dark:text-neutral-300 capitalize">
                  {link.status}
                </span>
              </>
            )}

            <span className="text-muted dark:text-dark-muted">Created</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              {formatDate(link.createdAt)}
            </span>

            <span className="text-muted dark:text-dark-muted">Updated</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              {formatDate(link.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-border dark:border-dark-border px-4 py-3 space-y-2 shrink-0">
        {showDeleteConfirm ? (
          <DeleteConfirmation
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
            isDeleting={isDeleting}
          />
        ) : (
          <div className="flex items-center gap-2">
            {link.status !== "archived" && (
              <button
                type="button"
                onClick={handleArchive}
                disabled={isArchiving}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
              >
                {isArchiving && <Spinner className="h-3 w-3" />}
                Archive
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
