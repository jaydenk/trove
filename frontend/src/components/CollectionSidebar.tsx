import { useCollections } from "../hooks/useCollections";
import { useTags } from "../hooks/useTags";

export interface CollectionSidebarProps {
  selectedCollection: string | null;
  onSelectCollection: (id: string | null) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onOpenSettings?: () => void;
  isSettingsActive?: boolean;
}

export default function CollectionSidebar({
  selectedCollection,
  onSelectCollection,
  selectedTag,
  onSelectTag,
  onOpenSettings,
  isSettingsActive = false,
}: CollectionSidebarProps) {
  const { collections, isLoading: collectionsLoading } = useCollections();
  const { tags, isLoading: tagsLoading } = useTags();

  const itemBase =
    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors select-none";
  const itemIdle =
    "text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover";
  const itemActive =
    "bg-hover dark:bg-dark-hover text-neutral-900 dark:text-neutral-100 font-medium";

  return (
    <aside className="w-56 shrink-0 border-r border-border dark:border-dark-border bg-surface dark:bg-dark flex flex-col h-screen overflow-y-auto">
      {/* Logo / header */}
      <div className="px-4 py-4">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
          Trove
        </h1>
      </div>

      {/* Collections section */}
      <div className="px-3 flex-1">
        <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted dark:text-dark-muted">
          Collections
        </p>

        <nav className="flex flex-col gap-0.5">
          {/* All links */}
          <button
            type="button"
            onClick={() => onSelectCollection(null)}
            className={`${itemBase} ${!isSettingsActive &&selectedCollection === null && selectedTag === null ? itemActive : itemIdle}`}
          >
            <span className="w-5 text-center">{"*"}</span>
            <span className="flex-1 truncate text-left">All Links</span>
          </button>

          {collectionsLoading ? (
            <span className="px-3 py-1.5 text-xs text-muted dark:text-dark-muted">
              Loading...
            </span>
          ) : (
            collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectCollection(c.id)}
                className={`${itemBase} ${!isSettingsActive &&selectedCollection === c.id ? itemActive : itemIdle}`}
              >
                <span className="w-5 text-center">{c.icon ?? "📁"}</span>
                <span className="flex-1 truncate text-left">{c.name}</span>
                <span className="text-xs tabular-nums text-muted dark:text-dark-muted">
                  {c.linkCount}
                </span>
              </button>
            ))
          )}

          {/* Archive virtual entry */}
          <button
            type="button"
            onClick={() => onSelectCollection("archive")}
            className={`${itemBase} ${!isSettingsActive && selectedCollection === "archive" ? itemActive : itemIdle}`}
          >
            <span className="w-5 text-center">🗄️</span>
            <span className="flex-1 truncate text-left">Archive</span>
          </button>
        </nav>

        {/* Divider */}
        <div className="my-3 border-t border-border dark:border-dark-border" />

        {/* Tags section */}
        <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted dark:text-dark-muted">
          Tags
        </p>

        <nav className="flex flex-col gap-0.5 pb-4">
          {tagsLoading ? (
            <span className="px-3 py-1.5 text-xs text-muted dark:text-dark-muted">
              Loading...
            </span>
          ) : tags.length === 0 ? (
            <span className="px-3 py-1.5 text-xs text-muted dark:text-dark-muted">
              No tags yet
            </span>
          ) : (
            tags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTag(t.name)}
                className={`${itemBase} ${!isSettingsActive &&selectedTag === t.name ? itemActive : itemIdle}`}
              >
                <span className="w-5 text-center text-muted dark:text-dark-muted">
                  #
                </span>
                <span className="flex-1 truncate text-left">{t.name}</span>
                {t.linkCount !== undefined && (
                  <span className="text-xs tabular-nums text-muted dark:text-dark-muted">
                    {t.linkCount}
                  </span>
                )}
              </button>
            ))
          )}
        </nav>

      </div>

      {/* Settings at bottom */}
      {onOpenSettings && (
        <div className="px-3 pb-4 pt-2 border-t border-border dark:border-dark-border mt-auto shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className={`${itemBase} w-full ${isSettingsActive ? itemActive : itemIdle}`}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <span className="flex-1 truncate text-left">Settings</span>
          </button>
        </div>
      )}
    </aside>
  );
}
