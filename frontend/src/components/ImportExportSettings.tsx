import { useState, useRef, useMemo, useCallback } from "react";
import { api, downloadExport, ApiError } from "../api";

// ---------------------------------------------------------------------------
// Spinner (matches the pattern used across the app)
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
// Types
// ---------------------------------------------------------------------------

interface ImportExportSettingsProps {
  onImportComplete?: () => void;
}

interface PreviewItem {
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
  collection?: string;
  createdAt?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  detectedFormat: string;
}

interface ImportProgress {
  current: number;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORMAT_LABELS: Record<string, string> = {
  html: "HTML bookmarks",
  json: "JSON",
  csv: "CSV/TSV",
  text: "Plain text",
  preview: "Preview",
};

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportExportSettings({
  onImportComplete,
}: ImportExportSettingsProps) {
  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Preview state
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(),
  );
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);

  // Import options
  const [includeTags, setIncludeTags] = useState(true);

  // Export state
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const showingPreview = previewItems.length > 0;
  const selectedCount = selectedIndices.size;

  // Memoised list of unique collections in the preview
  const previewCollections = useMemo(() => {
    const set = new Set<string>();
    for (const item of previewItems) {
      if (item.collection) set.add(item.collection);
    }
    return Array.from(set).sort();
  }, [previewItems]);

  // -----------------------------------------------------------------------
  // Import handlers
  // -----------------------------------------------------------------------

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setImportResult(null);
    setImportError(null);
    clearPreview();
  }

  function clearPreview() {
    setPreviewItems([]);
    setSelectedIndices(new Set());
    setDetectedFormat(null);
    setPreviewErrors([]);
  }

  function resetAll() {
    setSelectedFile(null);
    setImportResult(null);
    setImportError(null);
    clearPreview();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handlePreview() {
    if (!selectedFile) return;

    setPreviewing(true);
    setImportResult(null);
    setImportError(null);
    clearPreview();

    try {
      const data = await selectedFile.text();
      const result = await api.importExport.preview(data);
      setPreviewItems(result.items);
      setSelectedIndices(new Set(result.items.map((_, i) => i)));
      setDetectedFormat(result.detectedFormat);
      setPreviewErrors(result.errors);
    } catch (err) {
      if (err instanceof ApiError) {
        setImportError(err.message);
      } else {
        setImportError("Failed to preview file. Please try again.");
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImportSelected() {
    if (selectedCount === 0) return;

    setImporting(true);
    setImportError(null);
    setImportResult(null);
    setImportProgress(null);

    const itemsToImport = previewItems
      .filter((_, i) => selectedIndices.has(i))
      .map((item) => includeTags ? item : { ...item, tags: undefined });
    const batchSize = 5;
    const total = itemsToImport.length;
    let imported = 0;
    let skipped = 0;
    const allErrors: string[] = [];

    setImportProgress({ current: 0, total, imported: 0, skipped: 0, errors: [] });

    try {
      for (let i = 0; i < total; i += batchSize) {
        const batch = itemsToImport.slice(i, i + batchSize);
        const result = await api.importExport.importItems(batch);
        imported += result.imported;
        skipped += result.skipped;
        allErrors.push(...result.errors);

        const current = Math.min(i + batchSize, total);
        setImportProgress({ current, total, imported, skipped, errors: [...allErrors] });
      }

      setImportResult({ imported, skipped, errors: allErrors, detectedFormat: "preview" });
      setImportProgress(null);
      clearPreview();
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (imported > 0) {
        onImportComplete?.();
      }
    } catch (err) {
      setImportProgress(null);
      if (err instanceof ApiError) {
        setImportError(err.message);
      } else {
        setImportError("Import failed. Please try again.");
      }
    } finally {
      setImporting(false);
    }
  }

  const toggleItem = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  function toggleAll() {
    if (selectedCount === previewItems.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(previewItems.map((_, i) => i)));
    }
  }

  // -----------------------------------------------------------------------
  // Export handlers
  // -----------------------------------------------------------------------

  async function handleExport(
    format: "json" | "csv" | "html",
    filename: string,
  ) {
    setExportingFormat(format);
    try {
      await downloadExport(`/export/${format}`, filename);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExportingFormat(null);
    }
  }

  // -----------------------------------------------------------------------
  // Styles
  // -----------------------------------------------------------------------

  const sectionTitle =
    "text-sm font-semibold text-neutral-900 dark:text-neutral-100";
  const sectionDesc = "text-xs text-muted dark:text-dark-muted mt-1";
  const btnPrimary =
    "inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  const btnSecondary =
    "inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  const btnDanger =
    "inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-red-600 dark:text-red-400 px-3 py-1.5 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-5 py-5 space-y-8">
        {/* ----------------------------------------------------------------- */}
        {/* Import section                                                     */}
        {/* ----------------------------------------------------------------- */}
        <div>
          <h3 className={sectionTitle}>Import</h3>
          <p className={sectionDesc}>
            Import links from any file — browser bookmarks, JSON exports,
            spreadsheets, or plain text with URLs. The format is auto-detected
            and you can review items before importing.
          </p>

          <div className="mt-3 space-y-3">
            {!showingPreview && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm,.csv,.tsv,.json,.txt,.md"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-muted dark:text-dark-muted file:mr-3 file:rounded-md file:border file:border-border dark:file:border-dark-border file:bg-surface dark:file:bg-dark file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-900 dark:file:text-neutral-100 file:cursor-pointer hover:file:bg-neutral-50 dark:hover:file:bg-neutral-800 file:transition-colors"
                />

                {selectedFile && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted dark:text-dark-muted truncate">
                      {selectedFile.name} (
                      {(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={handlePreview}
                      disabled={previewing}
                      className={btnPrimary}
                    >
                      {previewing && <Spinner className="h-3 w-3" />}
                      {previewing ? "Scanning..." : "Preview"}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ------------------------------------------------------------- */}
            {/* Preview table                                                   */}
            {/* ------------------------------------------------------------- */}
            {showingPreview && (
              <div className="space-y-3">
                {/* Header: format badge + counts */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {detectedFormat && (
                      <span className="inline-flex items-center rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {FORMAT_LABELS[detectedFormat] ?? detectedFormat}
                      </span>
                    )}
                    <span className="text-xs text-muted dark:text-dark-muted">
                      {selectedCount} of {previewItems.length} item
                      {previewItems.length !== 1 ? "s" : ""} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleAll}
                      className={btnSecondary}
                    >
                      {selectedCount === previewItems.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>
                </div>

                {/* Preview warnings */}
                {previewErrors.length > 0 && (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                    <ul className="space-y-0.5">
                      {previewErrors.map((err, i) => (
                        <li
                          key={i}
                          className="text-xs text-amber-700 dark:text-amber-400"
                        >
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Collection filter legend */}
                {previewCollections.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {previewCollections.map((col) => (
                      <span
                        key={col}
                        className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-400"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                )}

                {/* Scrollable item list */}
                <div className="max-h-80 overflow-y-auto rounded-md border border-border dark:border-dark-border divide-y divide-border dark:divide-dark-border">
                  {previewItems.map((item, index) => {
                    const checked = selectedIndices.has(index);
                    return (
                      <label
                        key={index}
                        className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          checked
                            ? "bg-white dark:bg-dark-surface"
                            : "bg-neutral-50 dark:bg-neutral-900/50 opacity-60"
                        } hover:bg-neutral-50 dark:hover:bg-neutral-800/50`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(index)}
                          className="mt-0.5 rounded border-border dark:border-dark-border text-neutral-900 dark:text-neutral-100 focus:ring-1 focus:ring-neutral-400 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-neutral-900 dark:text-neutral-100 truncate">
                            {item.title || item.url}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="text-[11px] text-muted dark:text-dark-muted truncate">
                              {getDomain(item.url)}
                            </span>
                            {item.collection && (
                              <span className="text-[11px] text-blue-600 dark:text-blue-400">
                                {item.collection}
                              </span>
                            )}
                            {item.tags && item.tags.length > 0 && (
                              <span className="text-[11px] text-muted dark:text-dark-muted">
                                {item.tags.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Progress bar (shown during import) */}
                {importProgress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-neutral-700 dark:text-neutral-300">
                      <span>
                        Importing... {importProgress.current} of {importProgress.total}
                        {importProgress.total > 0 && (
                          <> ({Math.round((importProgress.current / importProgress.total) * 100)}%)</>
                        )}
                      </span>
                      <span className="text-muted dark:text-dark-muted">
                        Imported: {importProgress.imported} | Skipped: {importProgress.skipped}
                      </span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: importProgress.total > 0
                            ? `${(importProgress.current / importProgress.total) * 100}%`
                            : "0%",
                        }}
                      />
                    </div>
                    {importProgress.errors.length > 0 && (
                      <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                        <ul className="space-y-0.5">
                          {importProgress.errors.map((err, i) => (
                            <li
                              key={i}
                              className="text-xs text-amber-700 dark:text-amber-400"
                            >
                              {err}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Import options */}
                {!importProgress && (
                  <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer select-none mb-2">
                    <input
                      type="checkbox"
                      checked={includeTags}
                      onChange={(e) => setIncludeTags(e.target.checked)}
                      className="rounded border-border dark:border-dark-border"
                    />
                    Include tags
                  </label>
                )}

                {/* Action buttons */}
                {!importProgress && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleImportSelected}
                      disabled={importing || selectedCount === 0}
                      className={btnPrimary}
                    >
                      {`Import ${selectedCount} item${selectedCount !== 1 ? "s" : ""}`}
                    </button>
                    <button
                      type="button"
                      onClick={resetAll}
                      disabled={importing}
                      className={btnDanger}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
                <p className="text-sm text-green-700 dark:text-green-400">
                  Imported {importResult.imported} link
                  {importResult.imported !== 1 ? "s" : ""}
                  {importResult.skipped > 0 && (
                    <>
                      , skipped {importResult.skipped} duplicate
                      {importResult.skipped !== 1 ? "s" : ""}
                    </>
                  )}
                  .
                </p>
                {importResult.errors.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {importResult.errors.map((err, i) => (
                      <li
                        key={i}
                        className="text-xs text-amber-700 dark:text-amber-400"
                      >
                        {err}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Import error */}
            {importError && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                <p className="text-sm text-red-700 dark:text-red-400">
                  {importError}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Export section                                                      */}
        {/* ----------------------------------------------------------------- */}
        <div>
          <h3 className={sectionTitle}>Export</h3>
          <p className={sectionDesc}>
            Download your entire link library in your preferred format.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleExport("json", "trove-export.json")}
              disabled={exportingFormat !== null}
              className={btnSecondary}
            >
              {exportingFormat === "json" && <Spinner className="h-3 w-3" />}
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv", "trove-export.csv")}
              disabled={exportingFormat !== null}
              className={btnSecondary}
            >
              {exportingFormat === "csv" && <Spinner className="h-3 w-3" />}
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport("html", "trove-bookmarks.html")}
              disabled={exportingFormat !== null}
              className={btnSecondary}
            >
              {exportingFormat === "html" && <Spinner className="h-3 w-3" />}
              Export HTML Bookmarks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
