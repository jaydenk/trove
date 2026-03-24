export interface MobileNavProps {
  onToggleSidebar: () => void;
  onOpenAddModal: () => void;
  currentView: string;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  bulkModeActive: boolean;
  onToggleBulkMode: () => void;
  showTriageButton?: boolean;
  onToggleTriage?: () => void;
}

export default function MobileNav({
  onToggleSidebar,
  onOpenAddModal,
  currentView,
  searchQuery = "",
  onSearchChange,
  bulkModeActive,
  onToggleBulkMode,
  showTriageButton,
  onToggleTriage,
}: MobileNavProps) {
  return (
    <header className="flex lg:hidden flex-col border-b border-border dark:border-dark-border shrink-0 bg-surface dark:bg-dark pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Hamburger — 44px touch target */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex items-center justify-center h-11 w-11 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
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

        <div className="flex items-center gap-1">
          {/* Triage button — 44px touch target */}
          {showTriageButton && onToggleTriage && (
            <button
              type="button"
              onClick={onToggleTriage}
              className="inline-flex items-center justify-center h-11 w-11 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
              aria-label="Triage mode"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
              </svg>
            </button>
          )}

          {/* Select / Cancel button — 44px touch target */}
          <button
            type="button"
            onClick={onToggleBulkMode}
            className={`inline-flex items-center justify-center h-11 w-11 rounded-md transition-colors ${
              bulkModeActive
                ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover"
            }`}
            aria-label={bulkModeActive ? "Cancel selection" : "Select links"}
          >
            {bulkModeActive ? (
              /* X icon for cancel */
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            ) : (
              /* Checkbox icon */
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.5 2A1.5 1.5 0 002 3.5v3A1.5 1.5 0 003.5 8h3A1.5 1.5 0 008 6.5v-3A1.5 1.5 0 006.5 2h-3zm3.354 1.854a.5.5 0 00-.708-.708L4.5 4.793l-.646-.647a.5.5 0 10-.708.708l1 1a.5.5 0 00.708 0l2-2zM10.5 4a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-6zM10.5 14.5a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-6zM10.5 9.25a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-6zM3.5 12A1.5 1.5 0 002 13.5v3A1.5 1.5 0 003.5 18h3A1.5 1.5 0 008 16.5v-3A1.5 1.5 0 006.5 12h-3zm3.354 1.854a.5.5 0 00-.708-.708L4.5 14.793l-.646-.647a.5.5 0 10-.708.708l1 1a.5.5 0 00.708 0l2-2zM3.5 7A1.5 1.5 0 002 8.5v3A1.5 1.5 0 003.5 13h3A1.5 1.5 0 008 11.5v-3A1.5 1.5 0 006.5 7h-3z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Add button — 44px touch target */}
          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center justify-center h-11 w-11 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
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
