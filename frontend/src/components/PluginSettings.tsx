import { useState, useEffect } from "react";
import { api, ApiError } from "../api";
import type { PluginInfo } from "../api";

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
// Per-plugin config row
// ---------------------------------------------------------------------------

function PluginRow({
  plugin,
  onSaved,
}: {
  plugin: PluginInfo;
  onSaved: () => void;
}) {
  const hasConfig = Object.keys(plugin.configSchema).length > 0;
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Load existing config when expanded
  useEffect(() => {
    if (!expanded || !hasConfig) return;
    let cancelled = false;
    setLoadingConfig(true);
    api.plugins
      .getConfig(plugin.id)
      .then((data) => {
        if (!cancelled) {
          setFields(data.config ?? {});
        }
      })
      .catch(() => {
        // Silently fail — fields stay empty
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, hasConfig, plugin.id]);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      await api.plugins.setConfig(plugin.id, fields);
      setFeedback({ type: "success", message: "Saved" });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setFeedback({ type: "error", message: err.message });
      } else {
        setFeedback({ type: "error", message: "Failed to save configuration." });
      }
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 disabled:opacity-50 transition-colors";

  return (
    <div className="border-b border-border dark:border-dark-border">
      {/* Summary row */}
      <div className="px-5 py-4 flex items-start gap-3">
        <span className="text-xl shrink-0 mt-0.5">{plugin.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
              {plugin.name}
            </span>
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[11px] leading-tight ${
                plugin.isConfigured
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : "bg-neutral-100 dark:bg-neutral-800 text-muted dark:text-dark-muted"
              }`}
            >
              {plugin.isConfigured ? "Configured" : "Not configured"}
            </span>
          </div>
          <p className="text-xs text-muted dark:text-dark-muted mt-0.5">
            {plugin.description}
          </p>
          {/* Ingest-only webhook URL hint */}
          {plugin.hasIngest && !plugin.hasExecute && (
            <p className="mt-1.5 text-xs text-muted dark:text-dark-muted font-mono bg-neutral-50 dark:bg-neutral-800/50 rounded px-2 py-1">
              POST /api/plugins/{plugin.id}/webhook
            </p>
          )}
        </div>
        {hasConfig && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <svg
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Expandable config form */}
      {expanded && hasConfig && (
        <div className="px-5 pb-4 pt-0 ml-9 space-y-3">
          {loadingConfig ? (
            <div className="flex items-center gap-2 text-xs text-muted dark:text-dark-muted">
              <Spinner className="h-3 w-3" />
              Loading configuration...
            </div>
          ) : (
            <>
              {Object.entries(plugin.configSchema).map(([key, schema]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
                    {schema.label}
                    {schema.required && (
                      <span className="text-red-500 ml-0.5">*</span>
                    )}
                  </label>
                  <input
                    type={schema.type === "password" ? "password" : "text"}
                    value={fields[key] ?? ""}
                    onChange={(e) =>
                      setFields({ ...fields, [key]: e.target.value })
                    }
                    placeholder={schema.label}
                    className={inputClass}
                  />
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving && <Spinner className="h-3 w-3" />}
                  {saving ? "Saving..." : "Save"}
                </button>
                {feedback && (
                  <span
                    className={`text-xs ${
                      feedback.type === "error"
                        ? "text-red-600 dark:text-red-400"
                        : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {feedback.message}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PluginSettings
// ---------------------------------------------------------------------------

export interface PluginSettingsProps {
  onClose: () => void;
}

export default function PluginSettings({ onClose }: PluginSettingsProps) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchPlugins() {
    setIsLoading(true);
    try {
      const data = await api.plugins.list();
      setPlugins(data);
    } catch {
      setPlugins([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchPlugins();
  }, []);

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
          Plugin Settings
        </h2>
      </header>

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="h-5 w-5 text-muted dark:text-dark-muted" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted dark:text-dark-muted">
              No plugins registered
            </p>
          </div>
        ) : (
          plugins.map((p) => (
            <PluginRow
              key={p.id}
              plugin={p}
              onSaved={fetchPlugins}
            />
          ))
        )}
      </div>
    </div>
  );
}
