import { saveConversation } from "../shared/storage";
import type { RuntimeMessage } from "../shared/types";
import { getActiveConversation, injectPinButtons, jumpToPin } from "./chatgpt";
import "./styles.css";

let lastConversationId = "";
let lastUrl = window.location.href;

async function syncConversation(): Promise<void> {
  const activeConversation = getActiveConversation();

  if (activeConversation.conversationId === lastConversationId) {
    return;
  }

  lastConversationId = activeConversation.conversationId;

  await saveConversation({
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

const observer = new MutationObserver(() => {
  injectPinButtons();
});

function init(): void {
  void syncConversation();
  injectPinButtons();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "GET_ACTIVE_CONVERSATION") {
    sendResponse(getActiveConversation());
    return true;
  }

  if (message.type === "JUMP_TO_PIN") {
    const success = jumpToPin(message.payload.preview, message.payload.messageIndex);
    sendResponse({ success });
    return true;
  }

  return false;
});

window.addEventListener("popstate", () => {
  lastConversationId = "";
  void syncConversation();
});

window.setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    lastConversationId = "";
    void syncConversation();
    injectPinButtons();
  }
}, 1000);

init();
