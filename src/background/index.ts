import { saveConversation, upsertPin } from "../shared/storage";
import type { RuntimeMessage } from "../shared/types";

function notifyActiveTabChanged(tabId: number | null, url?: string): void {
  void chrome.runtime.sendMessage({
    type: "ACTIVE_TAB_CHANGED",
    payload: { tabId, url },
  } satisfies RuntimeMessage);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  notifyActiveTabChanged(tabId, tab?.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    notifyActiveTabChanged(tabId, changeInfo.url ?? tab.url);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }

  const [tab] = await chrome.tabs
    .query({ active: true, windowId })
    .catch(() => [] as chrome.tabs.Tab[]);
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
