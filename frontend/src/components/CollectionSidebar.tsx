import { useCollections } from "../hooks/useCollections";
import { useTags } from "../hooks/useTags";

export interface CollectionSidebarProps {
  selectedCollection: string | null;
  onSelectCollection: (id: string | null) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export default function CollectionSidebar({
  selectedCollection,
  onSelectCollection,
  selectedTag,
  onSelectTag,
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
            onClick={() => {
              onSelectCollection(null);
              onSelectTag(null);
            }}
            className={`${itemBase} ${selectedCollection === null && selectedTag === null ? itemActive : itemIdle}`}
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
                onClick={() => {
                  onSelectCollection(c.id);
                  onSelectTag(null);
                }}
                className={`${itemBase} ${selectedCollection === c.id ? itemActive : itemIdle}`}
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
            onClick={() => {
              onSelectCollection("archive");
              onSelectTag(null);
            }}
            className={`${itemBase} ${selectedCollection === "archive" ? itemActive : itemIdle}`}
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
                onClick={() => {
                  onSelectTag(t.name);
                  onSelectCollection(null);
                }}
                className={`${itemBase} ${selectedTag === t.name ? itemActive : itemIdle}`}
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
    </aside>
  );
}
