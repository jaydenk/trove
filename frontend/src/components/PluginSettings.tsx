import { useState, useEffect } from "react";
import { api, ApiError } from "../api";
import type { PluginInfo, User } from "../api";

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
// Toggle switch
// ---------------------------------------------------------------------------

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 dark:focus:ring-offset-dark disabled:opacity-40 disabled:cursor-not-allowed ${
        enabled
          ? "bg-neutral-900 dark:bg-neutral-100"
          : "bg-neutral-200 dark:bg-neutral-700"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-neutral-900 shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Per-plugin config row
// ---------------------------------------------------------------------------

function PluginRow({
  plugin,
  onSaved,
  isAdmin,
}: {
  plugin: PluginInfo;
  onSaved: () => void;
  isAdmin: boolean;
}) {
  const hasConfig = Object.keys(plugin.configSchema).length > 0;
  const hasExpandableContent = hasConfig || plugin.hasExecute;
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [healthStatus, setHealthStatus] = useState<{
    type: "ok" | "error";
    message?: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
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
    setHealthStatus(null);
    try {
      await api.plugins.setConfig(plugin.id, fields);
      setFeedback({ type: "success", message: "Saved" });
      onSaved();

      // Auto-run health check if plugin has one
      if (plugin.hasHealthCheck) {
        setChecking(true);
        try {
          const result = await api.plugins.healthCheck(plugin.id);
          setHealthStatus(
            result.status === "ok"
              ? { type: "ok" }
              : { type: "error", message: result.message }
          );
        } catch {
          setHealthStatus({ type: "error", message: "Health check failed" });
        } finally {
          setChecking(false);
        }
      }
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

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.plugins.test(plugin.id);
      if (result.type === "redirect" && result.url) {
        // Use location.href for URL schemes (things://, shortcuts://) —
        // window.open gets blocked by Safari's popup blocker after async calls
        window.location.href = result.url;
        setTestResult({
          type: "success",
          message: `Sent "[Trove Test] Plugin Verification" to ${plugin.name}`,
        });
      } else if (result.type === "success") {
        setTestResult({
          type: "success",
          message: result.message ?? "Test succeeded",
        });
      } else {
        setTestResult({ type: "error", message: result.message ?? "Test failed" });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setTestResult({ type: "error", message: err.message });
      } else {
        setTestResult({ type: "error", message: "Test failed" });
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    setToggling(true);
    try {
      if (enabled) {
        await api.plugins.enable(plugin.id);
      } else {
        await api.plugins.disable(plugin.id);
      }
      onSaved();
    } catch {
      // Revert will happen on refetch
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete plugin "${plugin.name}"? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      await api.plugins.delete(plugin.id);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setFeedback({ type: "error", message: err.message });
      }
    } finally {
      setDeleting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 disabled:opacity-50 transition-colors";

  const dimmed = !plugin.enabled;

  return (
    <div className={`border-b border-border dark:border-dark-border ${dimmed ? "opacity-50" : ""}`}>
      {/* Summary row */}
      <div className="px-5 py-4 flex items-start gap-3">
        <span className="text-xl shrink-0 mt-0.5">{plugin.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
              {plugin.name}
            </span>
            {plugin.isSystem && (
              <span className="inline-block px-1.5 py-0.5 rounded text-[11px] leading-tight bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                System
              </span>
            )}
            {plugin.enabled && (
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[11px] leading-tight ${
                  plugin.isConfigured
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "bg-neutral-100 dark:bg-neutral-800 text-muted dark:text-dark-muted"
                }`}
              >
                {plugin.isConfigured ? "Configured" : "Not configured"}
              </span>
            )}
            {plugin.version && (
              <span className="text-[11px] text-muted dark:text-dark-muted">
                v{plugin.version}
              </span>
            )}
          </div>
          <p className="text-xs text-muted dark:text-dark-muted mt-0.5">
            {plugin.description}
          </p>
          {/* Ingest-only webhook URL hint */}
          {plugin.hasIngest && !plugin.hasExecute && plugin.enabled && (
            <p className="mt-1.5 text-xs text-muted dark:text-dark-muted font-mono bg-neutral-50 dark:bg-neutral-800/50 rounded px-2 py-1">
              POST /api/plugins/{plugin.id}/webhook
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Config/test expand */}
          {hasExpandableContent && plugin.enabled && (
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
          {/* Admin delete for non-system plugins */}
          {isAdmin && !plugin.isSystem && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors disabled:opacity-40"
              aria-label="Delete plugin"
              title="Delete plugin"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
          {/* Enable/disable toggle — always at far right */}
          <Toggle
            enabled={plugin.enabled}
            onChange={handleToggle}
            disabled={toggling}
          />
        </div>
      </div>

      {/* Expandable config form */}
      {expanded && hasExpandableContent && plugin.enabled && (
        <div className="px-5 pb-4 pt-0 ml-9 space-y-3">
          {hasConfig && loadingConfig ? (
            <div className="flex items-center gap-2 text-xs text-muted dark:text-dark-muted">
              <Spinner className="h-3 w-3" />
              Loading configuration...
            </div>
          ) : (
            <>
              {hasConfig && Object.entries(plugin.configSchema).map(([key, schema]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
                    {schema.label}
                    {schema.required && (
                      <span className="text-red-500 ml-0.5">*</span>
                    )}
                  </label>
                  {schema.options && schema.options.length > 0 ? (
                    <select
                      value={fields[key] ?? ""}
                      onChange={(e) =>
                        setFields({ ...fields, [key]: e.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="">
                        {schema.placeholder ?? `Select ${schema.label}`}
                      </option>
                      {schema.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={key.toLowerCase().includes("token") || key.toLowerCase().includes("password") || key.toLowerCase().includes("secret") ? "password" : "text"}
                      value={fields[key] ?? ""}
                      onChange={(e) =>
                        setFields({ ...fields, [key]: e.target.value })
                      }
                      placeholder={schema.placeholder ?? schema.label}
                      className={inputClass}
                    />
                  )}
                </div>
              ))}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-3">
                  {hasConfig && (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving && <Spinner className="h-3 w-3" />}
                      {saving ? "Saving..." : "Save"}
                    </button>
                  )}
                  {plugin.hasExecute && plugin.isConfigured && (
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={testing}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-900 dark:text-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {testing && <Spinner className="h-3 w-3" />}
                      {testing ? "Testing..." : "Test"}
                    </button>
                  )}
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
                {checking && (
                  <div className="flex items-center gap-2 text-xs text-muted dark:text-dark-muted">
                    <Spinner className="h-3 w-3" />
                    Checking connection...
                  </div>
                )}
                {healthStatus && (
                  <p
                    className={`text-xs ${
                      healthStatus.type === "ok"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {healthStatus.type === "ok"
                      ? "✓ Connected"
                      : `✗ Connection failed: ${healthStatus.message}`}
                  </p>
                )}
                {testResult && (
                  <p
                    className={`text-xs ${
                      testResult.type === "success"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {testResult.type === "success"
                      ? `✓ ${testResult.message}`
                      : `✗ ${testResult.message}`}
                  </p>
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
// Upload Plugin Modal
// ---------------------------------------------------------------------------

function UploadPluginModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [json, setJson] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    setError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Invalid JSON");
      return;
    }

    setUploading(true);
    try {
      await api.plugins.upload(parsed as object);
      onUploaded();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface dark:bg-dark border border-border dark:border-dark-border rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
          Upload Plugin
        </h3>
        <p className="text-xs text-muted dark:text-dark-muted mb-3">
          Paste a JSON plugin manifest below.
        </p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={12}
          placeholder='{"id": "my-plugin", "name": "My Plugin", ...}'
          className="w-full rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors"
        />
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || json.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {uploading && <Spinner className="h-3 w-3" />}
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PluginSettings
// ---------------------------------------------------------------------------

export interface PluginSettingsProps {
  onClose: () => void;
  hideHeader?: boolean;
  user?: User;
}

export default function PluginSettings({ onClose, hideHeader, user }: PluginSettingsProps) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const isAdmin = user?.isAdmin ?? false;

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

  const exportPlugins = plugins.filter(
    (p) => p.direction === "export" || p.direction === "both"
  );
  const ingestPlugins = plugins.filter(
    (p) => p.direction === "ingest" || p.direction === "both"
  );

  return (
    <div className="flex flex-1 flex-col min-w-0 h-full">
      {!hideHeader && (
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
      )}

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
          <>
            {/* Admin upload button */}
            {isAdmin && (
              <div className="px-5 py-3 border-b border-border dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowUpload(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  Upload Plugin
                </button>
              </div>
            )}

            {/* Export Plugins Section */}
            {exportPlugins.length > 0 && (
              <>
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-dark-muted">
                    Export Plugins
                  </h3>
                </div>
                {exportPlugins.map((p) => (
                  <PluginRow
                    key={p.id}
                    plugin={p}
                    onSaved={fetchPlugins}
                    isAdmin={isAdmin}
                  />
                ))}
              </>
            )}

            {/* Ingest Plugins Section */}
            {ingestPlugins.length > 0 && (
              <>
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-dark-muted">
                    Ingest Plugins
                  </h3>
                </div>
                {ingestPlugins.map((p) => (
                  <PluginRow
                    key={p.id}
                    plugin={p}
                    onSaved={fetchPlugins}
                    isAdmin={isAdmin}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadPluginModal
          onClose={() => setShowUpload(false)}
          onUploaded={fetchPlugins}
        />
      )}
    </div>
  );
}
