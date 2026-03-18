import { useState } from "react";
import { api } from "../api";
import type { Link, PluginInfo } from "../api";

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(dateString: string): string {
  const now = Date.now();
  // SQLite datetime format "YYYY-MM-DD HH:MM:SS" needs T separator and Z suffix for UTC
  const normalised = dateString.includes("T") ? dateString : dateString.replace(" ", "T") + "Z";
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
// Extraction status icon
// ---------------------------------------------------------------------------

function ExtractionIcon({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <svg
        className="animate-spin h-3.5 w-3.5 text-muted dark:text-dark-muted shrink-0"
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

  if (status === "failed") {
    return (
      <svg
        className="h-3.5 w-3.5 text-amber-500 shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Plugin action button (inline on card)
// ---------------------------------------------------------------------------

function PluginActionButton({
  link,
  plugin,
}: {
  link: Link;
  plugin: PluginInfo;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (status === "loading") return;

    setStatus("loading");
    try {
      const result = await api.plugins.executeAction(link.id, plugin.id);
      if (result.type === "redirect" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setStatus("success");
    } catch {
      setStatus("error");
    }

    // Reset after 2 seconds
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      title={plugin.name}
      className="inline-flex items-center justify-center h-6 w-6 rounded text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 shrink-0"
    >
      {status === "loading" ? (
        <svg
          className="animate-spin h-3.5 w-3.5 text-muted dark:text-dark-muted"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : status === "success" ? (
        <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
      ) : status === "error" ? (
        <svg className="h-3.5 w-3.5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      ) : (
        <span>{plugin.icon}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// LinkCard
// ---------------------------------------------------------------------------

export interface LinkCardProps {
  link: Link;
  onClick: () => void;
  isSelected?: boolean;
  plugins?: PluginInfo[];
}

export default function LinkCard({ link, onClick, isSelected, plugins }: LinkCardProps) {
  const executablePlugins = plugins?.filter(
    (p) => p.hasExecute && p.isConfigured,
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left px-4 py-3 border-b border-border dark:border-dark-border transition-colors cursor-pointer ${
        isSelected
          ? "bg-hover dark:bg-dark-hover"
          : "hover:bg-hover dark:hover:bg-dark-hover"
      }`}
    >
      {/* Row 1: favicon + title + extraction status + plugin actions */}
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
        <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
          {link.title || link.url}
        </span>
        <ExtractionIcon status={link.extractionStatus} />
        {executablePlugins && executablePlugins.length > 0 && (
          <span className="ml-auto flex items-center gap-0.5 shrink-0">
            {executablePlugins.map((p) => (
              <PluginActionButton key={p.id} link={link} plugin={p} />
            ))}
          </span>
        )}
      </div>

      {/* Row 2: domain + relative time */}
      <div className="mt-0.5 pl-6 flex items-center gap-2 text-xs text-muted dark:text-dark-muted">
        {link.domain && <span className="truncate">{link.domain}</span>}
        {link.domain && <span aria-hidden>·</span>}
        <span className="whitespace-nowrap">{relativeTime(link.createdAt)}</span>
      </div>

      {/* Row 3: tags */}
      {link.tags && link.tags.length > 0 && (
        <div className="mt-1.5 pl-6 flex flex-wrap gap-1">
          {link.tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-block px-1.5 py-0.5 text-[11px] leading-tight rounded bg-neutral-100 dark:bg-neutral-800 text-muted dark:text-dark-muted"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
