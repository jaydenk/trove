import { useState } from "react";
import type { Collection } from "../api";

export interface BulkActionBarProps {
  selectedCount: number;
  collections: Collection[];
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveToCollection: (collectionId: string) => Promise<void>;
  onClearSelection: () => void;
}

export default function BulkActionBar({
  selectedCount,
  collections,
  onArchive,
  onDelete,
  onMoveToCollection,
  onClearSelection,
}: BulkActionBarProps) {
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleArchive() {
    setIsProcessing(true);
    try {
      await onArchive();
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDelete() {
    setIsProcessing(true);
    try {
      await onDelete();
    } finally {
      setIsProcessing(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleMove(collectionId: string) {
    setIsProcessing(true);
    setShowMoveDropdown(false);
    try {
      await onMoveToCollection(collectionId);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-xl border border-border dark:border-dark-border bg-card dark:bg-dark-card shadow-lg px-4 py-2.5">
      {/* Selected count */}
      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 whitespace-nowrap tabular-nums">
        {selectedCount} selected
      </span>

      {/* Divider */}
      <span className="w-px h-5 bg-border dark:bg-dark-border" />

      {/* Move to collection */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowMoveDropdown((v) => !v);
            setShowDeleteConfirm(false);
          }}
          disabled={isProcessing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-2.5 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
        >
          {/* Folder icon */}
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 4.75C2 3.784 2.784 3 3.75 3h4.836c.464 0 .901.218 1.18.59l1.328 1.774A.25.25 0 0011.296 5.5h4.954c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0116.25 16.5H3.75A1.75 1.75 0 012 14.75V4.75z" />
          </svg>
          Move to...
        </button>

        {showMoveDropdown && (
          <div className="absolute bottom-full mb-1 left-0 w-48 rounded-lg border border-border dark:border-dark-border bg-card dark:bg-dark-card shadow-lg py-1 max-h-60 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleMove("")}
              className="w-full text-left px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
            >
              No collection
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleMove(c.id)}
                className="w-full text-left px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
              >
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Archive */}
      <button
        type="button"
        onClick={handleArchive}
        disabled={isProcessing}
        className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-2.5 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
      >
        {/* Archive icon */}
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
          <path
            fillRule="evenodd"
            d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zM7 11a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z"
            clipRule="evenodd"
          />
        </svg>
        Archive
      </button>

      {/* Delete */}
      {showDeleteConfirm ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-red-600 dark:text-red-400 whitespace-nowrap">
            Delete {selectedCount}?
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isProcessing}
            className="rounded-md bg-red-600 text-white px-2.5 py-1.5 text-sm hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={isProcessing}
            className="rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-2.5 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowDeleteConfirm(true);
            setShowMoveDropdown(false);
          }}
          disabled={isProcessing}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-2.5 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors"
        >
          {/* Trash icon */}
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
              clipRule="evenodd"
            />
          </svg>
          Delete
        </button>
      )}

      {/* Divider */}
      <span className="w-px h-5 bg-border dark:bg-dark-border" />

      {/* Clear selection */}
      <button
        type="button"
        onClick={onClearSelection}
        disabled={isProcessing}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 transition-colors"
        aria-label="Clear selection"
        title="Clear selection"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
