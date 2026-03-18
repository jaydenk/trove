export interface ExportLink {
  url: string;
  title: string;
  description: string | null;
  domain: string | null;
  collectionName: string;
  tags: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

export function exportJson(links: ExportLink[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      links,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// CSV export (RFC 4180)
// ---------------------------------------------------------------------------

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function exportCsv(links: ExportLink[]): string {
  const header = "url,title,description,domain,collection,tags,source,created_at";
  const rows = links.map((link) => {
    const fields = [
      link.url,
      link.title,
      link.description ?? "",
      link.domain ?? "",
      link.collectionName,
      link.tags.join(";"),
      link.source,
      link.createdAt,
    ];
    return fields.map(escapeCsvField).join(",");
  });

  return [header, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// HTML export (Netscape bookmark format)
// ---------------------------------------------------------------------------

export function exportHtml(links: ExportLink[]): string {
  // Group links by collection
  const grouped = new Map<string, ExportLink[]>();
  for (const link of links) {
    const collection = link.collectionName || "Unsorted";
    if (!grouped.has(collection)) {
      grouped.set(collection, []);
    }
    grouped.get(collection)!.push(link);
  }

  const lines: string[] = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file.",
    "     It will be read and overwritten.",
    "     DO NOT EDIT! -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  ];

  for (const [collection, collectionLinks] of grouped) {
    lines.push(`    <DT><H3>${escapeHtml(collection)}</H3>`);
    lines.push("    <DL><p>");

    for (const link of collectionLinks) {
      const addDate = Math.floor(new Date(link.createdAt).getTime() / 1000);
      lines.push(
        `        <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${addDate}">${escapeHtml(link.title)}</A>`,
      );
    }

    lines.push("    </DL><p>");
  }

  lines.push("</DL><p>");

  return lines.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
