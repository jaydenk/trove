export interface MobileNavProps {
  onToggleSidebar: () => void;
  onOpenAddModal: () => void;
  currentView: string;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export default function MobileNav({
  onToggleSidebar,
  onOpenAddModal,
  currentView,
  searchQuery = "",
  onSearchChange,
}: MobileNavProps) {
  return (
    <header className="flex lg:hidden flex-col border-b border-border dark:border-dark-border shrink-0">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Hamburger — 44px touch target */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex items-center justify-center h-11 w-11 -ml-1.5 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Current view name */}
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate px-2">
          {currentView}
        </span>

        {/* Add button — 44px touch target */}
        <button
          type="button"
          onClick={onOpenAddModal}
          className="inline-flex items-center justify-center h-11 w-11 -mr-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          aria-label="Add link"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        </button>
      </div>

      {/* Mobile search bar */}
      {onSearchChange && (
        <div className="px-4 pb-2">
          <div className="relative flex items-center">
            <svg
              className="absolute left-2.5 h-4 w-4 text-muted dark:text-dark-muted pointer-events-none"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search links..."
              className="w-full h-9 pl-8 pr-3 text-sm rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark text-neutral-900 dark:text-neutral-100 placeholder:text-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors"
            />
          </div>
        </div>
      )}
    </header>
  );
}
