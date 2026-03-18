export interface MobileNavProps {
  onToggleSidebar: () => void;
  onOpenAddModal: () => void;
  currentView: string;
}

export default function MobileNav({
  onToggleSidebar,
  onOpenAddModal,
  currentView,
}: MobileNavProps) {
  return (
    <header className="flex lg:hidden items-center justify-between border-b border-border dark:border-dark-border px-4 py-3 shrink-0">
      {/* Hamburger */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
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

      {/* Add button */}
      <button
        type="button"
        onClick={onOpenAddModal}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
        aria-label="Add link"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
      </button>
    </header>
  );
}
