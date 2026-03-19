import type { TrovePlugin } from "./types";

export const thingsPlugin: TrovePlugin = {
  id: "things",
  name: "Things",
  icon: "✅",
  description: "Create a task in Things from a link",

  configSchema: {},

  execute: {
    type: "url-redirect",
    actionLabel: "Send to Things",
    async run(link) {
      const thingsUrl = `things:///add?title=${encodeURIComponent(link.title)}&notes=${encodeURIComponent(link.url)}&tags=trove`;
      return { type: "redirect", url: thingsUrl };
    },
  },
};
