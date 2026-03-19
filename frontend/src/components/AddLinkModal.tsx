import { useState, useEffect, useRef, useCallback } from "react";
import { api, ApiError } from "../api";
import type { Collection, Link } from "../api";

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className = "h-5 w-5" }: { className?: string }) {
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
// Tag pill input
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
        className="flex-1 min-w-[80px] bg-transparent text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted focus:outline-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal states
// ---------------------------------------------------------------------------

type ModalStep = "url" | "creating" | "extracting" | "preview" | "saving";

// ---------------------------------------------------------------------------
// AddLinkModal
// ---------------------------------------------------------------------------

export interface AddLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  collections: Collection[];
  initialUrl?: string;
  initialTitle?: string;
}

export default function AddLinkModal({
  isOpen,
  onClose,
  onSaved,
  collections,
  initialUrl,
  initialTitle,
}: AddLinkModalProps) {
  const [step, setStep] = useState<ModalStep>("url");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);

  // Preview / editable fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);

  // Reset all state when the modal opens or closes
  const resetState = useCallback(() => {
    setStep("url");
    setUrl("");
    setError(null);
    setLinkId(null);
    setTitle("");
    setDescription(null);
    setFaviconUrl(null);
    setDomain(null);
    setCollectionId("");
    setTags([]);
    pollCountRef.current = 0;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Focus URL input when modal opens; pre-fill from bookmarklet params
  useEffect(() => {
    if (isOpen) {
      resetState();
      if (initialUrl) {
        setUrl(initialUrl);
        if (initialTitle) {
          setTitle(initialTitle);
        }
        // Auto-submit the URL so extraction starts immediately
        requestAnimationFrame(() => {
          urlInputRef.current?.focus();
        });
      } else {
        // Delay focus slightly so the element is in the DOM
        requestAnimationFrame(() => {
          urlInputRef.current?.focus();
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cleanup poll timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, linkId]);

  // ------- Helpers -------

  function applyLinkData(link: Link) {
    setTitle(link.title || "");
    setDescription(link.description ?? null);
    setFaviconUrl(link.faviconUrl ?? null);
    setDomain(link.domain ?? null);
    if (link.collectionId) setCollectionId(link.collectionId);
    if (link.tags) setTags(link.tags.map((t) => t.name));
  }

  function pollExtraction(id: string) {
    pollCountRef.current += 1;

    if (pollCountRef.current > 15) {
      // Stop polling — show whatever we have
      setStep("preview");
      return;
    }

    pollTimerRef.current = setTimeout(async () => {
      try {
        const link = await api.links.get(id);
        if (
          link.extractionStatus === "completed" ||
          link.extractionStatus === "failed"
        ) {
          applyLinkData(link);
          setStep("preview");
        } else {
          pollExtraction(id);
        }
      } catch {
        // If polling fails, just go to preview with what we have
        setStep("preview");
      }
    }, 1000);
  }

  // ------- Actions -------

  async function handleSubmitUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setError(null);
    setStep("creating");

    try {
      const link = await api.links.create({ url: trimmed });
      setLinkId(link.id);
      applyLinkData(link);

      if (
        link.extractionStatus === "completed" ||
        link.extractionStatus === "failed"
      ) {
        setStep("preview");
      } else {
        setStep("extracting");
        pollCountRef.current = 0;
        pollExtraction(link.id);
      }
    } catch (err) {
      setStep("url");
      if (err instanceof ApiError) {
        if (err.code === "DUPLICATE_URL") {
          setError("This URL has already been saved.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to create link. Please try again.");
      }
    }
  }

  async function handleSave() {
    if (!linkId) return;

    setStep("saving");
    setError(null);

    try {
      await api.links.update(linkId, {
        title: title.trim() || undefined,
        collectionId: collectionId || undefined,
        tags,
      });
      onSaved();
      onClose();
    } catch (err) {
      setStep("preview");
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to save link. Please try again.");
      }
    }
  }

  async function handleCancel() {
    // If we've created a link, delete it
    if (linkId) {
      try {
        await api.links.delete(linkId);
      } catch {
        // Ignore — best-effort cleanup
      }
    }
    // Stop polling
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    onClose();
  }

  if (!isOpen) return null;

  const isProcessing =
    step === "creating" || step === "extracting" || step === "saving";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add link"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={handleCancel}
      />

      {/* Modal card */}
      <div className="relative w-full max-w-lg sm:mx-4 rounded-t-xl sm:rounded-xl bg-card dark:bg-dark-card border border-border dark:border-dark-border shadow-xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-dark-border shrink-0">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Add Link
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            className="text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto min-h-0 flex-1">
          {/* URL input — always shown */}
          <div>
            <label
              htmlFor="add-link-url"
              className="block text-xs font-medium text-muted dark:text-dark-muted mb-1"
            >
              URL
            </label>
            <div className="flex gap-2">
              <input
                ref={urlInputRef}
                id="add-link-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmitUrl();
                  }
                }}
                placeholder="https://..."
                disabled={step !== "url"}
                className="flex-1 rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 disabled:opacity-50 transition-colors"
              />
              {step === "url" && (
                <button
                  type="button"
                  onClick={handleSubmitUrl}
                  disabled={!url.trim()}
                  className="shrink-0 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Fetch
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {/* Creating spinner */}
          {step === "creating" && (
            <div className="flex items-center gap-2 py-4 justify-center text-muted dark:text-dark-muted">
              <Spinner className="h-4 w-4" />
              <span className="text-sm">Creating link...</span>
            </div>
          )}

          {/* Extracting spinner */}
          {step === "extracting" && (
            <div className="flex items-center gap-2 py-4 justify-center text-muted dark:text-dark-muted">
              <Spinner className="h-4 w-4" />
              <span className="text-sm">Extracting content...</span>
            </div>
          )}

          {/* Saving spinner */}
          {step === "saving" && (
            <div className="flex items-center gap-2 py-4 justify-center text-muted dark:text-dark-muted">
              <Spinner className="h-4 w-4" />
              <span className="text-sm">Saving...</span>
            </div>
          )}

          {/* Preview / edit form */}
          {step === "preview" && (
            <>
              {/* Extraction preview */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-surface dark:bg-dark border border-border dark:border-dark-border">
                {faviconUrl ? (
                  <img
                    src={faviconUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="shrink-0 rounded-sm mt-0.5"
                  />
                ) : (
                  <span className="shrink-0 w-5 h-5 rounded-sm bg-border dark:bg-dark-border mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  {domain && (
                    <p className="text-xs text-muted dark:text-dark-muted truncate mb-0.5">
                      {domain}
                    </p>
                  )}
                  {description && (
                    <p className="text-xs text-muted dark:text-dark-muted line-clamp-2">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              {/* Title (editable) */}
              <div>
                <label
                  htmlFor="add-link-title"
                  className="block text-xs font-medium text-muted dark:text-dark-muted mb-1"
                >
                  Title
                </label>
                <input
                  id="add-link-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Link title"
                  className="w-full rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors"
                />
              </div>

              {/* Collection dropdown */}
              <div>
                <label
                  htmlFor="add-link-collection"
                  className="block text-xs font-medium text-muted dark:text-dark-muted mb-1"
                >
                  Collection
                </label>
                <select
                  id="add-link-collection"
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
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

              {/* Tags */}
              <div>
                <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
                  Tags
                </label>
                <TagInput tags={tags} onChange={setTags} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border dark:border-dark-border shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            disabled={step === "saving"}
            className="rounded-md border border-border dark:border-dark-border text-neutral-700 dark:text-neutral-300 px-4 py-2 text-sm hover:bg-hover dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          {step === "preview" && (
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
