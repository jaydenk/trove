import { useEffect, useRef } from "react";
import type { Link, PluginInfo } from "../api";

export interface ContextMenuAction {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  link: Link;
  plugins: PluginInfo[];
  onClose: () => void;
  onArchive: (link: Link) => void;
  onDelete: (link: Link) => void;
  onPluginAction: (link: Link, plugin: PluginInfo) => void;
  onCopyUrl: (link: Link) => void;
}

export default function ContextMenu({
  x,
  y,
  link,
  plugins,
  onClose,
  onArchive,
  onDelete,
  onPluginAction,
  onCopyUrl,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Reposition if overflowing viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${Math.max(4, vw - rect.width - 8)}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${Math.max(4, vh - rect.height - 8)}px`;
    }
  }, [x, y]);

  const executablePlugins = plugins.filter(
    (p) => p.hasExecute && p.isConfigured && p.enabled,
  );

  const isArchived = link.status === "archived";

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-border dark:border-dark-border bg-card dark:bg-dark-card shadow-lg py-1 text-sm"
      style={{ left: x, top: y }}
    >
      {/* Archive / Unarchive */}
      <button
        type="button"
        onClick={() => {
          onArchive(link);
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors flex items-center gap-2"
      >
        <span className="w-4 text-center text-xs">
          {isArchived ? "↩" : "📦"}
        </span>
        {isArchived ? "Unarchive" : "Archive"}
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={() => {
          onDelete(link);
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-2"
      >
        <span className="w-4 text-center text-xs">🗑</span>
        Delete
      </button>

      {/* Plugin actions */}
      {executablePlugins.length > 0 && (
        <>
          <div className="my-1 border-t border-border dark:border-dark-border" />
          {executablePlugins.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onPluginAction(link, p);
                onClose();
              }}
              className="w-full text-left px-3 py-1.5 text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors flex items-center gap-2"
            >
              <span className="w-4 text-center text-xs">{p.icon}</span>
              {p.actionLabel ?? p.name}
            </button>
          ))}
        </>
      )}

      {/* Copy URL */}
      <div className="my-1 border-t border-border dark:border-dark-border" />
      <button
        type="button"
        onClick={() => {
          onCopyUrl(link);
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors flex items-center gap-2"
      >
        <span className="w-4 text-center text-xs">📋</span>
        Copy URL
      </button>
    </div>
  );
}
