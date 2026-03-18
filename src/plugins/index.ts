import { registerPlugin } from "./registry";
import { readerPlugin } from "./reader";
import { thingsPlugin } from "./things";
import { n8nPlugin } from "./n8n";

export function registerAllPlugins(): void {
  registerPlugin(readerPlugin);
  registerPlugin(thingsPlugin);
  registerPlugin(n8nPlugin);
}
