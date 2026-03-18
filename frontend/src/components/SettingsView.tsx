import { useState } from "react";
import CollectionManager from "./CollectionManager";
import PluginSettings from "./PluginSettings";
import type { Collection } from "../api";

interface SettingsViewProps {
  collections: Collection[];
  onRefreshCollections: () => void;
  onRefreshPlugins: () => void;
  onClose: () => void;
}

type SettingsTab = "collections" | "plugins";

export default function SettingsView({
  collections,
  onRefreshCollections,
  onRefreshPlugins,
  onClose,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("collections");

  const tabBase =
    "px-4 py-2 text-sm font-medium transition-colors border-b-2";
  const tabActive =
    "text-neutral-900 dark:text-neutral-100 border-neutral-900 dark:border-neutral-100";
  const tabIdle =
    "text-muted dark:text-dark-muted border-transparent hover:text-neutral-700 dark:hover:text-neutral-300";

  return (
    <div className="flex flex-1 flex-col min-w-0">
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
        <div className="flex gap-0 px-6 mt-3">
          <button
            type="button"
            onClick={() => setActiveTab("collections")}
            className={`${tabBase} ${activeTab === "collections" ? tabActive : tabIdle}`}
          >
            Collections
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("plugins")}
            className={`${tabBase} ${activeTab === "plugins" ? tabActive : tabIdle}`}
          >
            Plugins
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "collections" ? (
        <CollectionManager
          collections={collections}
          onRefresh={onRefreshCollections}
          onClose={onClose}
          hideHeader
        />
      ) : (
        <PluginSettings
          onClose={onClose}
          hideHeader
        />
      )}
    </div>
  );
}
