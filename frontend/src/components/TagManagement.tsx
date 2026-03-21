import { useState, useEffect, useCallback, useRef } from "react";
import { api, ApiError } from "../api";
import type { Tag } from "../api";

// ---------------------------------------------------------------------------
// Tag row with inline rename and delete
// ---------------------------------------------------------------------------

function TagRow({
  tag,
  onRefresh,
}: {
  tag: Tag;
  onRefresh: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(tag.name);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  async function handleRename() {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (trimmed === tag.name) {
      setIsEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.tags.update(tag.id, trimmed);
      setIsEditing(false);
      onRefresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to rename. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setEditName(tag.name);
    setIsEditing(false);
    setError(null);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.tags.delete(tag.id);
      onRefresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to delete. Please try again.");
      }
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const inputClass =
    "rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 disabled:opacity-50 transition-colors";

  return (
    <div className="border-b border-border dark:border-dark-border px-5 py-3">
      <div className="flex items-center gap-3">
        {/* Tag hash icon */}
        <span className="w-8 text-center text-muted dark:text-dark-muted text-sm shrink-0">
          #
        </span>

        {/* Name — click to edit */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRename();
              } else if (e.key === "Escape") {
                handleCancelEdit();
              }
            }}
            disabled={saving}
            className={`${inputClass} flex-1 min-w-0`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex-1 min-w-0 text-left text-sm text-neutral-900 dark:text-neutral-100 hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors truncate"
            title="Click to rename"
          >
            {tag.name}
          </button>
        )}

        {/* Link count */}
        <span className="text-xs tabular-nums text-muted dark:text-dark-muted shrink-0">
          {tag.linkCount ?? 0} {(tag.linkCount ?? 0) === 1 ? "link" : "links"}
        </span>

        {/* Edit actions */}
        {isEditing ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRename}
              disabled={saving}
              className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={saving}
              className="rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : !confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover transition-colors"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 dark:bg-red-500 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation warning */}
      {confirmDelete && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          Are you sure? This tag will be removed from all links.
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TagManagement
// ---------------------------------------------------------------------------

export default function TagManagement() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.tags.list();
      setTags(data);
    } catch {
      setTags([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const emptyTagCount = tags.filter((t) => (t.linkCount ?? 0) === 0).length;

  async function handleDeleteEmpty() {
    setBulkDeleting(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const result = await api.tags.deleteEmpty();
      setBulkResult(
        result.deleted === 0
          ? "No empty tags to delete."
          : `Deleted ${result.deleted} empty ${result.deleted === 1 ? "tag" : "tags"}.`,
      );
      fetchTags();
    } catch (err) {
      if (err instanceof ApiError) {
        setBulkError(err.message);
      } else {
        setBulkError("Failed to delete empty tags. Please try again.");
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col min-w-0 h-full">
      {/* Bulk action bar */}
      {emptyTagCount > 0 && (
        <div className="px-5 py-3 border-b border-border dark:border-dark-border flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDeleteEmpty}
            disabled={bulkDeleting}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 transition-colors"
          >
            {bulkDeleting ? "Deleting..." : `Delete all empty tags (${emptyTagCount})`}
          </button>
          {bulkError && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {bulkError}
            </span>
          )}
          {bulkResult && (
            <span className="text-xs text-muted dark:text-dark-muted">
              {bulkResult}
            </span>
          )}
        </div>
      )}

      {/* Bulk result when no empty tags */}
      {emptyTagCount === 0 && bulkResult && (
        <div className="px-5 py-3 border-b border-border dark:border-dark-border shrink-0">
          <span className="text-xs text-muted dark:text-dark-muted">
            {bulkResult}
          </span>
        </div>
      )}

      {/* Tag list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
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
        ) : tags.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted dark:text-dark-muted">
              No tags yet
            </p>
          </div>
        ) : (
          tags.map((t) => (
            <TagRow key={t.id} tag={t} onRefresh={fetchTags} />
          ))
        )}
      </div>
    </div>
  );
}
