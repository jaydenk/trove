import { useState, useRef } from "react";
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

type ImportFormat = "html" | "csv" | "json";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectFormat(filename: string): ImportFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "html";
    case "csv":
      return "csv";
    case "json":
      return "json";
    default:
      return null;
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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Export state
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Import handlers
  // -----------------------------------------------------------------------

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setImportResult(null);
    setImportError(null);
  }

  async function handleImport() {
    if (!selectedFile) return;

    const format = detectFormat(selectedFile.name);
    if (!format) {
      setImportError(
        "Unsupported file type. Please select a .html, .csv, or .json file."
      );
      return;
    }

    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const data = await selectedFile.text();
      const result = await api.importExport.import(format, data);
      setImportResult(result);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (result.imported > 0) {
        onImportComplete?.();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setImportError(err.message);
      } else {
        setImportError("Import failed. Please try again.");
      }
    } finally {
      setImporting(false);
    }
  }

  // -----------------------------------------------------------------------
  // Export handlers
  // -----------------------------------------------------------------------

  async function handleExport(
    format: "json" | "csv" | "html",
    filename: string
  ) {
    setExportingFormat(format);
    try {
      await downloadExport(`/export/${format}`, filename);
    } catch (err) {
      // Silently fail — the download just won't happen
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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-5 py-5 space-y-8">
        {/* ----------------------------------------------------------------- */}
        {/* Import section                                                     */}
        {/* ----------------------------------------------------------------- */}
        <div>
          <h3 className={sectionTitle}>Import</h3>
          <p className={sectionDesc}>
            Import links from a browser bookmark export (.html), a spreadsheet
            (.csv), or a Trove JSON export (.json).
          </p>

          <div className="mt-3 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.csv,.json"
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
                  onClick={handleImport}
                  disabled={importing}
                  className={btnPrimary}
                >
                  {importing && <Spinner className="h-3 w-3" />}
                  {importing ? "Importing..." : "Import"}
                </button>
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
                <p className="text-sm text-green-700 dark:text-green-400">
                  Imported {importResult.imported} link
                  {importResult.imported !== 1 ? "s" : ""}
                  {importResult.skipped > 0 && (
                    <>, skipped {importResult.skipped} duplicate
                    {importResult.skipped !== 1 ? "s" : ""}</>
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
