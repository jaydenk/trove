import type { TrovePlugin } from "./types";

export const readerPlugin: TrovePlugin = {
  id: "reader",
  name: "Readwise Reader",
  icon: "📖",
  description: "Send links to Readwise Reader for reading later",

  configSchema: {
    READWISE_TOKEN: {
      label: "Readwise API Token",
      type: "string",
      required: true,
    },
  },

  execute: {
    type: "api-call",
    async run(link, config) {
      const token = config.READWISE_TOKEN;

      try {
        const response = await fetch("https://readwise.io/api/v3/save/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${token}`,
          },
          body: JSON.stringify({
            url: link.url,
            tags: link.tags.map((t) => t.name),
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Readwise API returned ${response.status}: ${text}`
          );
        }

        return { type: "success", message: "Sent to Readwise Reader" };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return { type: "error", message };
      }
    },
  },
};
