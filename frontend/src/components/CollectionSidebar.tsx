import { useCollections } from "../hooks/useCollections";
import { useTags } from "../hooks/useTags";

export interface CollectionSidebarProps {
  selectedCollection: string | null;
  onSelectCollection: (id: string | null) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  isSettingsActive?: boolean;
  userName?: string;
  onSignOut?: () => void;
}

export default function CollectionSidebar({
  selectedCollection,
  onSelectCollection,
  selectedTag,
  onSelectTag,
  onOpenSettings,
  onOpenHelp,
  isSettingsActive = false,
  userName,
  onSignOut,
}: CollectionSidebarProps) {
  const { collections, isLoading: collectionsLoading } = useCollections();
  const { tags, isLoading: tagsLoading } = useTags();

  const visibleTags = tags.filter((t) => (t.linkCount ?? 0) > 0);

  const inboxCollectionId = collections.find(
    (c) => c.name.toLowerCase() === "inbox",
  )?.id ?? null;

  const itemBase =
    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors select-none";
  const itemIdle =
    "text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover";
  const itemActive =
    "bg-hover dark:bg-dark-hover text-neutral-900 dark:text-neutral-100 font-medium";

  return (
    <aside className="w-56 shrink-0 border-r border-border dark:border-dark-border bg-surface dark:bg-dark flex flex-col h-dvh overflow-y-auto">
      {/* Logo / header */}
      <div className="px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => onSelectCollection(inboxCollectionId)}
          className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight hover:opacity-70 transition-opacity cursor-pointer"
        >
          Trove
        </button>
      </div>

      {/* Collections section */}
      <div className="px-3 flex-1">
        <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted dark:text-dark-muted">
          Collections
        </p>

        <nav className="flex flex-col gap-0.5">
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
            <span className="flex-1 truncate text-left">archive</span>
          </button>

          {/* All links — below collections, muted styling */}
          <button
            type="button"
            onClick={() => onSelectCollection(null)}
            className={`${itemBase} text-xs ${!isSettingsActive && selectedCollection === null && selectedTag === null ? itemActive : "text-muted dark:text-dark-muted hover:bg-hover dark:hover:bg-dark-hover"}`}
          >
            <span className="w-5 text-center text-muted dark:text-dark-muted">*</span>
            <span className="flex-1 truncate text-left">All Links</span>
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
          ) : visibleTags.length === 0 ? (
            <span className="px-3 py-1.5 text-xs text-muted dark:text-dark-muted">
              No tags
            </span>
          ) : (
            visibleTags.map((t) => (
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
        <div className="px-3 pb-2 pt-2 border-t border-border dark:border-dark-border mt-auto shrink-0">
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

      {/* User section */}
      {userName && (
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-muted dark:text-dark-muted truncate">
                {userName}
              </span>
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center justify-center h-5 w-5 rounded text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-hover dark:hover:bg-dark-hover transition-colors shrink-0"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-muted/60 dark:text-dark-muted/60">
                v{__APP_VERSION__}
              </span>
              {onOpenHelp && (
                <button
                  type="button"
                  onClick={onOpenHelp}
                  className="inline-flex items-center justify-center h-5 w-5 rounded text-muted dark:text-dark-muted hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
                  aria-label="Help"
                  title="Help"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
