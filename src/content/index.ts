import { EXTENSION_SETTINGS_KEY, saveConversation } from "../shared/storage";
import type { RuntimeMessage } from "../shared/types";
import {
  getActiveConversation as getChatGptConversation,
  injectPinButtons as injectChatGptPins,
  jumpToPin as jumpChatGptPin,
} from "./chatgpt";
import {
  getActiveConversation as getGeminiConversation,
  injectPinButtons as injectGeminiPins,
  jumpToPin as jumpGeminiPin,
} from "./gemini";
import { PIN_BUTTON_ATTR } from "./shared";
import type { ContentAdapter } from "./shared";
import "./styles.css";

const CONTENT_SCRIPT_INIT_KEY = "__chatAnchorContentScriptInitialized";

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
let injectScheduled = false;
let started = false;
let observer: MutationObserver | null = null;
let intervalId: number | null = null;
let runtimeListener: ((message: RuntimeMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean) | null = null;
let popstateListener: (() => void) | null = null;
let storageListenerBound = false;

async function syncConversation(adapter: ContentAdapter): Promise<void> {
  if (!started) {
    return;
  }

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

function removeInjectedPinButtons(): void {
  document.querySelectorAll<HTMLElement>(`.llm-note-pin-anchor, [${PIN_BUTTON_ATTR}]`).forEach((element) => {
    if (element.classList.contains("llm-note-pin-anchor")) {
      element.remove();
      return;
    }

    const wrapper = element.closest(".llm-note-pin-anchor");
    if (wrapper instanceof HTMLElement) {
      wrapper.remove();
      return;
    }

    element.remove();
  });
}

function start(adapter: ContentAdapter): void {
  if (started) {
    return;
  }

  started = true;
  lastConversationKey = "";

  const scheduleInjectPinButtons = (): void => {
    if (!started || injectScheduled) {
      return;
    }

    injectScheduled = true;
    window.requestAnimationFrame(() => {
      injectScheduled = false;
      if (!started) {
        return;
      }
      adapter.injectPinButtons();
    });
  };

  observer = new MutationObserver(() => {
    scheduleInjectPinButtons();
  });

  void syncConversation(adapter);
  scheduleInjectPinButtons();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  runtimeListener = (message: RuntimeMessage, _sender, sendResponse) => {
    if (!started) {
      return false;
    }

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
  };
  chrome.runtime.onMessage.addListener(runtimeListener);

  popstateListener = () => {
    lastConversationKey = "";
    void syncConversation(adapter);
  };
  window.addEventListener("popstate", popstateListener);

  intervalId = window.setInterval(() => {
    if (!started) {
      return;
    }

    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      lastConversationKey = "";
      void syncConversation(adapter);
      scheduleInjectPinButtons();
    }
  }, 1000);
}

function stop(): void {
  if (!started) {
    return;
  }

  started = false;
  injectScheduled = false;

  observer?.disconnect();
  observer = null;

  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }

  if (runtimeListener) {
    chrome.runtime.onMessage.removeListener(runtimeListener);
    runtimeListener = null;
  }

  if (popstateListener) {
    window.removeEventListener("popstate", popstateListener);
    popstateListener = null;
  }

  removeInjectedPinButtons();
}

async function applyEnabledState(adapter: ContentAdapter): Promise<void> {
  const result = await chrome.storage.local.get(EXTENSION_SETTINGS_KEY);
  const enabled =
    (result[EXTENSION_SETTINGS_KEY] as { enabled?: boolean } | undefined)?.enabled ?? true;

  if (enabled) {
    start(adapter);
  } else {
    stop();
  }
}

function bindSettingsListener(adapter: ContentAdapter): void {
  if (storageListenerBound) {
    return;
  }

  storageListenerBound = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[EXTENSION_SETTINGS_KEY]) {
      return;
    }

    const enabled =
      (changes[EXTENSION_SETTINGS_KEY].newValue as { enabled?: boolean } | undefined)?.enabled ??
      true;

    if (enabled) {
      start(adapter);
    } else {
      stop();
    }
  });
}

function init(): void {
  const adapter = getAdapter();
  if (!adapter) {
    return;
  }

  const context = window as Window & Record<string, boolean>;
  if (context[CONTENT_SCRIPT_INIT_KEY]) {
    void applyEnabledState(adapter);
    return;
  }

  context[CONTENT_SCRIPT_INIT_KEY] = true;

  bindSettingsListener(adapter);
  void applyEnabledState(adapter);
}

init();
