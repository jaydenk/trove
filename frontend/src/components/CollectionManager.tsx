import { useState } from "react";
import { api, ApiError } from "../api";
import type { Collection } from "../api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectionManagerProps {
  collections: Collection[];
  onRefresh: () => void;
  onClose: () => void;
}

interface EditState {
  name: string;
  icon: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Row component for each collection
// ---------------------------------------------------------------------------

function CollectionRow({
  collection,
  onRefresh,
}: {
  collection: Collection;
  onRefresh: () => void;
}) {
  const isInbox = collection.name.toLowerCase() === "inbox";

  const [fields, setFields] = useState<EditState>({
    name: collection.name,
    icon: collection.icon ?? "",
    color: collection.color ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    fields.name !== collection.name ||
    fields.icon !== (collection.icon ?? "") ||
    fields.color !== (collection.color ?? "");

  async function handleSave() {
    if (!fields.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.collections.update(collection.id, {
        name: fields.name.trim(),
        icon: fields.icon.trim() || undefined,
        color: fields.color.trim() || undefined,
      });
      onRefresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to save. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.collections.delete(collection.id);
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
        {/* Icon */}
        <input
          type="text"
          value={fields.icon}
          onChange={(e) => setFields({ ...fields, icon: e.target.value })}
          placeholder="Icon"
          maxLength={4}
          className={`${inputClass} w-14 text-center`}
          title="Emoji icon"
        />

        {/* Name */}
        <input
          type="text"
          value={fields.name}
          onChange={(e) => setFields({ ...fields, name: e.target.value })}
          placeholder="Collection name"
          className={`${inputClass} flex-1 min-w-0`}
        />

        {/* Colour */}
        <input
          type="text"
          value={fields.color}
          onChange={(e) => setFields({ ...fields, color: e.target.value })}
          placeholder="#hex"
          maxLength={7}
          className={`${inputClass} w-24`}
          title="Colour (hex)"
        />

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="shrink-0 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        {/* Delete — hidden for inbox */}
        {!isInbox && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="shrink-0 rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            Delete
          </button>
        )}

        {/* Delete confirmation */}
        {!isInbox && confirmDelete && (
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

      {/* Confirm delete warning */}
      {confirmDelete && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          Links in this collection will be moved to the inbox.
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
// Add collection form
// ---------------------------------------------------------------------------

function AddCollectionForm({ onRefresh }: { onRefresh: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setIcon("");
    setColor("");
    setError(null);
    setIsOpen(false);
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.collections.create({
        name: name.trim(),
        icon: icon.trim() || undefined,
        color: color.trim() || undefined,
      });
      onRefresh();
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create collection. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 disabled:opacity-50 transition-colors";

  if (!isOpen) {
    return (
      <div className="px-5 py-4">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add Collection
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 border-t border-border dark:border-dark-border">
      <p className="text-xs font-medium text-muted dark:text-dark-muted mb-3 uppercase tracking-wider">
        New Collection
      </p>
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="Icon"
          maxLength={4}
          className={`${inputClass} w-14 text-center`}
          title="Emoji icon"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Collection name"
          className={`${inputClass} flex-1 min-w-0`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          autoFocus
        />
        <input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#hex"
          maxLength={7}
          className={`${inputClass} w-24`}
          title="Colour (hex)"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          className="shrink-0 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="shrink-0 rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CollectionManager
// ---------------------------------------------------------------------------

export default function CollectionManager({
  collections,
  onRefresh,
  onClose,
}: CollectionManagerProps) {
  return (
    <div className="flex flex-1 flex-col min-w-0 h-full">
      {/* Header */}
      <header className="border-b border-border dark:border-dark-border px-5 py-4 flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          aria-label="Back"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 011.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Manage Collections
        </h2>
      </header>

      {/* Collection list */}
      <div className="flex-1 overflow-y-auto">
        {collections.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted dark:text-dark-muted">
              No collections yet
            </p>
          </div>
        ) : (
          collections.map((c) => (
            <CollectionRow
              key={c.id}
              collection={c}
              onRefresh={onRefresh}
            />
          ))
        )}

        {/* Add collection */}
        <AddCollectionForm onRefresh={onRefresh} />
      </div>
    </div>
  );
}
