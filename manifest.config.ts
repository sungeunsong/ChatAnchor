import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "ChatAnchor",
  description: "Pin important answers in ChatGPT and Gemini, then jump back instantly.",
  version: "0.1.0",
  permissions: ["storage", "sidePanel", "tabs"],
  host_permissions: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://gemini.google.com/*",
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*",
        "https://gemini.google.com/*",
      ],
      js: ["src/content/index.ts"],
    },
  ],
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  action: {
    default_title: "ChatAnchor",
  },
});
