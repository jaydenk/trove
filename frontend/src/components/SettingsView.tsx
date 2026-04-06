import { useState } from "react";
import AccountSettings from "./AccountSettings";
import CollectionManager from "./CollectionManager";
import TagManagement from "./TagManagement";
import PluginSettings from "./PluginSettings";
import ImportExportSettings from "./ImportExportSettings";
import UserManagement from "./UserManagement";
import HelpScreen from "./HelpScreen";
import type { Collection, PluginInfo, User } from "../api";
import type { SwipeAction } from "./LinkCard";

type ThemePreference = "light" | "dark" | "system";

interface SettingsViewProps {
  collections: Collection[];
  onRefreshCollections: () => void;
  onRefreshLinks: () => void;
  onRefreshPlugins: () => void;
  onClose: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  user: User;
  plugins: PluginInfo[];
  swipeLeftInner: SwipeAction;
  swipeLeftOuter: SwipeAction;
  swipeRightInner: SwipeAction;
  swipeRightOuter: SwipeAction;
  onSwipeLeftInnerChange: (action: SwipeAction) => void;
  onSwipeLeftOuterChange: (action: SwipeAction) => void;
  onSwipeRightInnerChange: (action: SwipeAction) => void;
  onSwipeRightOuterChange: (action: SwipeAction) => void;
  viewMode: "condensed" | "expanded";
  showImages: boolean;
  onViewModeChange: (mode: "condensed" | "expanded") => void;
  onShowImagesChange: (show: boolean) => void;
  initialTab?: SettingsTab;
}

export type SettingsTab = "account" | "appearance" | "collections" | "tags" | "plugins" | "import-export" | "users" | "help";

export default function SettingsView({
  collections,
  onRefreshCollections,
  onRefreshLinks,
  onRefreshPlugins,
  onClose,
  theme,
  onThemeChange,
  user,
  plugins,
  swipeLeftInner,
  swipeLeftOuter,
  swipeRightInner,
  swipeRightOuter,
  onSwipeLeftInnerChange,
  onSwipeLeftOuterChange,
  onSwipeRightInnerChange,
  onSwipeRightOuterChange,
  viewMode,
  showImages,
  onViewModeChange,
  onShowImagesChange,
  initialTab,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "appearance");

  const tabBase =
    "px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap shrink-0";
  const tabActive =
    "text-neutral-900 dark:text-neutral-100 border-neutral-900 dark:border-neutral-100";
  const tabIdle =
    "text-muted dark:text-dark-muted border-transparent hover:text-neutral-700 dark:hover:text-neutral-300";

  return (
    <div className="flex flex-1 flex-col min-w-0 pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <div className="border-b border-border dark:border-dark-border shrink-0">
        <div className="px-6 pt-4 pb-0 flex items-center gap-4">
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
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Settings
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-6 mt-3 overflow-x-auto -mx-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`${tabBase} ${activeTab === "account" ? tabActive : tabIdle}`}
          >
            Account
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("appearance")}
            className={`${tabBase} ${activeTab === "appearance" ? tabActive : tabIdle}`}
          >
            Appearance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("collections")}
            className={`${tabBase} ${activeTab === "collections" ? tabActive : tabIdle}`}
          >
            Collections
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tags")}
            className={`${tabBase} ${activeTab === "tags" ? tabActive : tabIdle}`}
          >
            Tags
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("plugins")}
            className={`${tabBase} ${activeTab === "plugins" ? tabActive : tabIdle}`}
          >
            Plugins
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("import-export")}
            className={`${tabBase} ${activeTab === "import-export" ? tabActive : tabIdle}`}
          >
            Import / Export
          </button>
          {user.isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`${tabBase} ${activeTab === "users" ? tabActive : tabIdle}`}
            >
              Users
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("help")}
            className={`${tabBase} ${activeTab === "help" ? tabActive : tabIdle}`}
          >
            Help
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "account" ? (
        <AccountSettings user={user} />
      ) : activeTab === "appearance" ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Theme */}
          <div>
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-3">
              Theme
            </h3>
            <div className="inline-flex rounded-md border border-border dark:border-dark-border overflow-hidden">
              {(["light", "dark", "system"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onThemeChange(opt)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors capitalize ${
                    theme === opt
                      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Layout */}
          <div>
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-3">
              Layout
            </h3>
            <div className="space-y-4">
              <div className="inline-flex rounded-md border border-border dark:border-dark-border overflow-hidden">
                {(["condensed", "expanded"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onViewModeChange(opt)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors capitalize ${
                      viewMode === opt
                        ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                        : "text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {viewMode === "expanded" && (
                <div className="flex items-center justify-between max-w-sm">
                  <label className="text-sm text-neutral-700 dark:text-neutral-300">
                    Show image thumbnails
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showImages}
                    onClick={() => onShowImagesChange(!showImages)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      showImages
                        ? "bg-neutral-900 dark:bg-neutral-100"
                        : "bg-neutral-300 dark:bg-neutral-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-neutral-900 shadow transition-transform ${
                        showImages ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Swipe Actions */}
          <div>
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
              Swipe Actions
            </h3>
            <p className="text-xs text-muted dark:text-dark-muted mb-4">
              Configure what swiping on link cards does on mobile. Partial swipe reveals both actions; full swipe triggers the outer action.
            </p>
            <div className="space-y-6 max-w-sm">
              <div>
                <h4 className="text-xs font-medium text-muted dark:text-dark-muted uppercase tracking-wide mb-2">Swipe Left</h4>
                <div className="space-y-3">
                  <SwipeActionSelect label="Partial" value={swipeLeftInner} onChange={onSwipeLeftInnerChange} plugins={plugins} />
                  <SwipeActionSelect label="Full swipe" value={swipeLeftOuter} onChange={onSwipeLeftOuterChange} plugins={plugins} />
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted dark:text-dark-muted uppercase tracking-wide mb-2">Swipe Right</h4>
                <div className="space-y-3">
                  <SwipeActionSelect label="Partial" value={swipeRightInner} onChange={onSwipeRightInnerChange} plugins={plugins} />
                  <SwipeActionSelect label="Full swipe" value={swipeRightOuter} onChange={onSwipeRightOuterChange} plugins={plugins} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === "collections" ? (
        <CollectionManager
          collections={collections}
          onRefresh={onRefreshCollections}
          onClose={onClose}
          hideHeader
        />
      ) : activeTab === "tags" ? (
        <TagManagement />
      ) : activeTab === "plugins" ? (
        <PluginSettings
          onClose={onClose}
          hideHeader
          user={user}
        />
      ) : activeTab === "users" ? (
        <UserManagement currentUser={user} />
      ) : activeTab === "help" ? (
        <HelpScreen />
      ) : (
        <ImportExportSettings
          onImportComplete={() => {
            onRefreshCollections();
            onRefreshLinks();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swipe action dropdown
// ---------------------------------------------------------------------------

function SwipeActionSelect({
  label,
  value,
  onChange,
  plugins,
}: {
  label: string;
  value: SwipeAction;
  onChange: (action: SwipeAction) => void;
  plugins: PluginInfo[];
}) {
  const executablePlugins = plugins.filter(
    (p) => p.hasExecute && p.isConfigured && p.enabled,
  );

  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-neutral-700 dark:text-neutral-300 shrink-0">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SwipeAction)}
        className="text-sm rounded-md border border-border dark:border-dark-border bg-surface dark:bg-dark px-3 py-1.5 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-500"
      >
        <option value="archive">Archive</option>
        <option value="delete">Delete</option>
        <option value="none">None</option>
        {executablePlugins.map((p) => (
          <option key={p.id} value={`plugin:${p.id}`}>
            {p.icon} {p.actionLabel ?? p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
