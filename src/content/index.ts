import { saveConversation } from "../shared/storage";
import type { RuntimeMessage } from "../shared/types";
import { getActiveConversation as getChatGptConversation, injectPinButtons as injectChatGptPins, jumpToPin as jumpChatGptPin } from "./chatgpt";
import { getActiveConversation as getGeminiConversation, injectPinButtons as injectGeminiPins, jumpToPin as jumpGeminiPin } from "./gemini";
import type { ContentAdapter } from "./shared";
import "./styles.css";

function getAdapter(): ContentAdapter | null {
  const hostname = window.location.hostname;

  if (hostname === "chatgpt.com" || hostname === "chat.openai.com") {
    return {
      site: "chatgpt",
      getActiveConversation: getChatGptConversation,
      injectPinButtons: injectChatGptPins,
      jumpToPin: jumpChatGptPin,
    };
  }

  if (hostname === "gemini.google.com") {
    return {
      site: "gemini",
      getActiveConversation: getGeminiConversation,
      injectPinButtons: injectGeminiPins,
      jumpToPin: jumpGeminiPin,
    };
  }

  return null;
}

let lastConversationKey = "";
let lastUrl = window.location.href;

async function syncConversation(adapter: ContentAdapter): Promise<void> {
  const activeConversation = adapter.getActiveConversation();
  const conversationKey = `${activeConversation.site}:${activeConversation.conversationId}`;

  if (conversationKey === lastConversationKey) {
    return;
  }

  lastConversationKey = conversationKey;

  await saveConversation({
    site: activeConversation.site,
    conversationId: activeConversation.conversationId,
    title: activeConversation.title,
    pageUrl: activeConversation.pageUrl,
    updatedAt: Date.now(),
  });

  await chrome.runtime.sendMessage({
    type: "ACTIVE_CONVERSATION_CHANGED",
    payload: activeConversation,
  } satisfies RuntimeMessage);
}

function init(): void {
  const adapter = getAdapter();
  if (!adapter) {
    return;
  }

  const observer = new MutationObserver(() => {
    adapter.injectPinButtons();
  });

  void syncConversation(adapter);
  adapter.injectPinButtons();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "GET_ACTIVE_CONVERSATION") {
      sendResponse(adapter.getActiveConversation());
      return true;
    }

    if (message.type === "JUMP_TO_PIN") {
      if (message.payload.site !== adapter.site) {
        sendResponse({ success: false });
        return true;
      }

      const success = adapter.jumpToPin(message.payload.preview, message.payload.messageIndex);
      sendResponse({ success });
      return true;
    }

    return false;
  });

  window.addEventListener("popstate", () => {
    lastConversationKey = "";
    void syncConversation(adapter);
  });

  window.setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      lastConversationKey = "";
      void syncConversation(adapter);
      adapter.injectPinButtons();
    }
  }, 1000);
}

init();
