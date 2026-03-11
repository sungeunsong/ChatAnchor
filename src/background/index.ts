import { saveConversation, upsertPin } from "../shared/storage";
import type { RuntimeMessage } from "../shared/types";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "PIN_CREATED") {
    void upsertPin(message.payload);
  }

  if (message.type === "ACTIVE_CONVERSATION_CHANGED") {
    void saveConversation({
      conversationId: message.payload.conversationId,
      title: message.payload.title,
      pageUrl: message.payload.pageUrl,
      updatedAt: Date.now(),
    });
  }

  return false;
});
