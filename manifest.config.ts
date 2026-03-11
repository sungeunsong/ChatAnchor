import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "LLM Note",
  description: "Pin important ChatGPT answers into a side panel for quick reference.",
  version: "0.1.0",
  permissions: ["storage", "sidePanel", "tabs"],
  host_permissions: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
      js: ["src/content/index.ts"],
    },
  ],
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  action: {
    default_title: "LLM Note",
  },
});
