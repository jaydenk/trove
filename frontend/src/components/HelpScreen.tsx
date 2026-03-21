// ---------------------------------------------------------------------------
// HelpScreen — in-app help with getting started, shortcuts, features, and FAQ
// ---------------------------------------------------------------------------

const DOCS_BASE = "https://github.com/jaydenk/trove/blob/main/docs";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-xs text-neutral-700 dark:text-neutral-300 border border-border dark:border-dark-border">
      {children}
    </kbd>
  );
}

function DocLink({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <a
      href={`${DOCS_BASE}/${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-neutral-700 dark:text-neutral-300 underline underline-offset-2 decoration-neutral-400 dark:decoration-neutral-600 hover:decoration-neutral-700 dark:hover:decoration-neutral-300 transition-colors"
    >
      {children}
    </a>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed space-y-2">
      {children}
    </div>
  );
}

export default function HelpScreen() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Help
          </h2>
          <p className="text-sm text-muted dark:text-dark-muted mt-1">
            Quick reference for using Trove. Full documentation is available on{" "}
            <a
              href="https://github.com/jaydenk/trove/blob/main/docs/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              GitHub
            </a>
            .
          </p>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Getting Started                                                    */}
        {/* ----------------------------------------------------------------- */}

        <Section title="Getting Started">
          <Prose>
            <p>
              Trove is a self-hosted link inbox. Save links from your browser,
              phone, or automation tools, then route them to services like
              Readwise Reader or Things via the plugin system.
            </p>
            <p>
              <strong>Save links</strong> using the browser extension, iOS share
              extension, bookmarklet, the <strong>Add</strong> button in the top
              bar, or the API.
            </p>
            <p>
              <strong>Triage mode</strong> lets you process links one at a time
              like flipping through a card deck. Press <Kbd>T</Kbd> or click the
              lightning bolt icon, then use keyboard shortcuts to archive, delete,
              or send each link to a plugin.
            </p>
          </Prose>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* Keyboard Shortcuts                                                 */}
        {/* ----------------------------------------------------------------- */}

        <Section title="Keyboard Shortcuts">
          <Prose>
            <p>These shortcuts work when no input field is focused.</p>
          </Prose>

          <div className="rounded-lg border border-border dark:border-dark-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/50">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted dark:text-dark-muted">
                    Key
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted dark:text-dark-muted">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-dark-border">
                {[
                  ["/", "Focus the search bar"],
                  ["Escape", "Clear selection / close panel / exit triage"],
                  ["j / k", "Move focus down / up in the link list"],
                  ["o / Enter", "Open the focused link's detail panel"],
                  ["x", "Toggle bulk selection on the focused link"],
                  ["a", "Archive or unarchive the focused link"],
                  ["d", "Delete the focused link"],
                  ["1-9", "Send the focused link to the corresponding plugin"],
                  ["t", "Enter triage mode"],
                ].map(([key, action]) => (
                  <tr
                    key={key}
                    className="text-neutral-700 dark:text-neutral-300"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Kbd>{key}</Kbd>
                    </td>
                    <td className="px-3 py-2">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Prose>
            <p className="font-medium text-neutral-700 dark:text-neutral-300">
              Triage Mode Shortcuts
            </p>
          </Prose>

          <div className="rounded-lg border border-border dark:border-dark-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border dark:divide-dark-border">
                {[
                  ["1-9", "Send to the corresponding plugin"],
                  ["A", "Archive the current link"],
                  ["D", "Delete the current link"],
                  ["S / Right Arrow", "Skip to the next link"],
                  ["K / Left Arrow", "Go back to the previous link"],
                  ["Escape", "Exit triage mode"],
                ].map(([key, action]) => (
                  <tr
                    key={key}
                    className="text-neutral-700 dark:text-neutral-300"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Kbd>{key}</Kbd>
                    </td>
                    <td className="px-3 py-2">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* Features                                                           */}
        {/* ----------------------------------------------------------------- */}

        <Section title="Features">
          <Prose>
            <p>
              <strong>Collections and Tags</strong> — organise links into
              collections (one per link) and apply any number of tags. The
              sidebar filters by collection or tag. Tags with zero links are
              hidden from the sidebar automatically. Manage both in Settings.
            </p>
            <p>
              <strong>Search</strong> — full-text search across titles,
              descriptions, and extracted content. Supports prefix matching
              (e.g. "prog" finds "programming") and shows highlighted
              snippets in results.
            </p>
            <p>
              <strong>Import / Export</strong> — import from HTML bookmarks,
              JSON, CSV/TSV, or plain text. The format is auto-detected and
              you can preview and select items before importing. Export to
              JSON, CSV, or HTML bookmarks. Access from{" "}
              <strong>Settings &gt; Import / Export</strong>.
            </p>
            <p>
              <strong>Plugins</strong> — declarative JSON plugins that
              export links to external services or ingest links via webhooks.
              Enable, disable, and configure plugins in{" "}
              <strong>Settings &gt; Plugins</strong>. See the{" "}
              <DocLink path="plugin-development.md">
                Plugin Development Guide
              </DocLink>{" "}
              for creating your own.
            </p>
            <p>
              <strong>Swipe Actions (mobile)</strong> — swipe left or right on
              link cards to perform quick actions. Customise what each swipe
              direction does in{" "}
              <strong>Settings &gt; Appearance &gt; Swipe Actions</strong>.
            </p>
            <p>
              <strong>Right-click Menu (desktop)</strong> — right-click any link
              card to archive, delete, send to a plugin, or copy the URL.
            </p>
            <p>
              <strong>Dark Mode</strong> — light, dark, or system theme. Set in{" "}
              <strong>Settings &gt; Appearance</strong>.
            </p>
          </Prose>
        </Section>

        {/* ----------------------------------------------------------------- */}
        {/* FAQ                                                                */}
        {/* ----------------------------------------------------------------- */}

        <Section title="Frequently Asked Questions">
          <div className="space-y-4">
            <FaqItem question="How do I set up the browser extension?">
              Install in Chrome via <code>chrome://extensions</code> (load
              unpacked from the <code>extension/shared/</code> directory) or
              build the Safari wrapper in Xcode. See the{" "}
              <DocLink path="browser-extension.md">
                Browser Extension Guide
              </DocLink>{" "}
              for full steps.
            </FaqItem>

            <FaqItem question="How do I set up the iOS share extension?">
              Build the Safari extension Xcode project for iOS and enable it
              in Settings &gt; Apps &gt; Safari &gt; Extensions. Alternatively,
              use an Apple Shortcut — see the{" "}
              <DocLink path="ios-shortcut.md">iOS Shortcut Guide</DocLink>.
            </FaqItem>

            <FaqItem question="How do I create a plugin?">
              Plugins are declarative JSON manifests — no code required. Define
              an <code>execute</code> block for export actions or an{" "}
              <code>ingest</code> block for webhooks. Upload via Settings &gt;
              Plugins. See the{" "}
              <DocLink path="plugin-development.md">
                Plugin Development Guide
              </DocLink>{" "}
              for the full manifest format and walkthroughs.
            </FaqItem>

            <FaqItem question="How do I import from another bookmark manager?">
              Go to <strong>Settings &gt; Import / Export</strong>, select your
              export file, and click <strong>Preview</strong>. Trove
              auto-detects HTML bookmarks, JSON, CSV, and plain text. Review
              the items, toggle any you want to skip, then click Import.
            </FaqItem>

            <FaqItem question="How do I export my data?">
              Go to <strong>Settings &gt; Import / Export</strong> and click one
              of the export buttons (JSON, CSV, or HTML Bookmarks). The file
              downloads immediately.
            </FaqItem>

            <FaqItem question="What's the difference between archive and delete?">
              <strong>Archive</strong> moves a link out of your active view
              but keeps it searchable and accessible from the Archive sidebar
              entry. <strong>Delete</strong> permanently removes the link and
              all its data.
            </FaqItem>

            <FaqItem question="How do I connect Claude to Trove?">
              Trove includes an MCP server with 7 tools for searching,
              browsing, saving links, and running plugin actions. Add the
              server config to Claude Desktop or Claude Code. See the{" "}
              <DocLink path="mcp-server.md">MCP Server Guide</DocLink> for
              setup instructions.
            </FaqItem>
          </div>
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ Item
// ---------------------------------------------------------------------------

function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {question}
      </p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
