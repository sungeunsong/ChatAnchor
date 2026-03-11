import { saveConversation, upsertPin } from "../shared/storage";
import type { RuntimeMessage } from "../shared/types";

const SUPPORTED_HOSTS = new Set(["chatgpt.com", "chat.openai.com", "gemini.google.com"]);
const ACTIVE_CONVERSATION_PING: RuntimeMessage = { type: "GET_ACTIVE_CONVERSATION" };

function notifyActiveTabChanged(tabId: number | null, url?: string): void {
  void chrome.runtime.sendMessage({
    type: "ACTIVE_TAB_CHANGED",
    payload: { tabId, url },
  } satisfies RuntimeMessage);
}

function isSupportedUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return SUPPORTED_HOSTS.has(parsedUrl.hostname);
  } catch {
    return false;
  }
}

async function canTalkToContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, ACTIVE_CONVERSATION_PING);
    return true;
  } catch {
    return false;
  }
}

async function injectManifestContentScript(tabId: number): Promise<void> {
  const contentScript = chrome.runtime.getManifest().content_scripts?.[0];
  if (!contentScript) {
    return;
  }

  if (contentScript.css?.length) {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: contentScript.css,
    });
  }

  if (contentScript.js?.length) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: contentScript.js,
    });
  }
}

async function ensureContentScriptReady(tabId: number, url?: string): Promise<void> {
  if (!isSupportedUrl(url)) {
    return;
  }

  if (await canTalkToContentScript(tabId)) {
    return;
  }

  await injectManifestContentScript(tabId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await canTalkToContentScript(tabId)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

async function ensureActiveTabReady(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.id) {
    return;
  }

  await ensureContentScriptReady(tab.id, tab.url).catch(() => undefined);
}

async function ensureMatchingTabsReady(): Promise<void> {
  const tabs = await chrome.tabs
    .query({
      url: [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*",
        "https://gemini.google.com/*",
      ],
    })
    .catch(() => [] as chrome.tabs.Tab[]);

  await Promise.all(
    tabs.map((tab) =>
      tab.id ? ensureContentScriptReady(tab.id, tab.url).catch(() => undefined) : Promise.resolve(),
    ),
  );
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void ensureMatchingTabsReady();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureMatchingTabsReady();
});

void ensureMatchingTabsReady();

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await ensureActiveTabReady(tabId);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  notifyActiveTabChanged(tabId, tab?.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    void ensureContentScriptReady(tabId, changeInfo.url ?? tab.url).finally(() => {
      notifyActiveTabChanged(tabId, changeInfo.url ?? tab.url);
    });
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }

  const [tab] = await chrome.tabs
    .query({ active: true, windowId })
    .catch(() => [] as chrome.tabs.Tab[]);

  if (tab?.id) {
    await ensureContentScriptReady(tab.id, tab.url).catch(() => undefined);
  }

  notifyActiveTabChanged(tab?.id ?? null, tab?.url);
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "PIN_CREATED") {
    void upsertPin(message.payload);
  }

  if (message.type === "ACTIVE_CONVERSATION_CHANGED") {
    void saveConversation({
      site: message.payload.site,
      conversationId: message.payload.conversationId,
      title: message.payload.title,
      pageUrl: message.payload.pageUrl,
      updatedAt: Date.now(),
    });
  }

  return false;
});
