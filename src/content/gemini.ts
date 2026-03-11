import type { ActiveConversation, PinnedItem, StorageShape } from "../shared/types";
import {
  buildPinFromText,
  extractPreservedText,
  normalizeText,
  PIN_BUTTON_ATTR,
  scrollToTarget,
} from "./shared";

function getConversationId(): string {
  const matched = window.location.pathname.match(/\/app\/([^/?#]+)/);
  return matched?.[1] ?? `page:${window.location.pathname}`;
}

function getConversationTitle(): string {
  const heading = document.querySelector("h1");
  const title = heading?.textContent?.trim();
  return title || document.title.replace(/\s*-\s*Gemini$/i, "").trim() || "Untitled chat";
}

function getCandidateElements(): HTMLElement[] {
  const selectors = [
    "model-response",
    "[data-response-id]",
    ".response-container",
    "message-content[model-response]",
    "message-content.model-response",
  ];

  const elements = new Set<HTMLElement>();

  selectors.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      elements.add(element);
    });
  });

  return Array.from(elements);
}

function getMessageContainer(element: HTMLElement): HTMLElement {
  return (
    element.closest<HTMLElement>("model-response, [data-response-id], .response-container") ??
    element
  );
}

function getMessageContent(element: HTMLElement): HTMLElement {
  return (
    element.querySelector<HTMLElement>("message-content, .markdown, .response-content") ??
    element
  );
}

function getPreservedText(element: HTMLElement): string {
  return extractPreservedText(getMessageContent(element));
}

function getAssistantBlocks(): HTMLElement[] {
  return getCandidateElements()
    .map((element) => getMessageContainer(element))
    .filter((element, index, array) => array.indexOf(element) === index);
}

export function getActiveConversation(): ActiveConversation {
  return {
    site: "gemini",
    conversationId: getConversationId(),
    title: getConversationTitle(),
    pageUrl: window.location.href,
  };
}

function buildPin(element: HTMLElement, messageIndex: number): PinnedItem | null {
  const fullText = getPreservedText(element);
  return buildPinFromText("gemini", getActiveConversation(), fullText, messageIndex);
}

const STORAGE_KEY = "llm-note-storage";
type PinButton = HTMLButtonElement & { __llmNoteBound?: boolean };

let pinnedKeys = new Set<string>();
let isPinnedReady = false;
let loadingPinnedKeys: Promise<void> | null = null;
let storageListenerBound = false;

function createMessageKey(conversationId: string, messageIndex: number): string {
  return `${conversationId}:${messageIndex}`;
}

async function loadPinnedKeys(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = (result[STORAGE_KEY] as StorageShape | undefined) ?? {
    pins: [],
    conversations: [],
  };

  pinnedKeys = new Set(
    state.pins
      .filter((pin) => pin.site === "gemini")
      .map((pin) => createMessageKey(pin.conversationId, pin.messageIndex)),
  );
  isPinnedReady = true;
}

async function ensurePinnedReady(): Promise<void> {
  if (isPinnedReady) {
    return;
  }

  if (!loadingPinnedKeys) {
    loadingPinnedKeys = loadPinnedKeys().finally(() => {
      loadingPinnedKeys = null;
    });
  }

  await loadingPinnedKeys;
}

function ensurePinnedSyncListener(): void {
  if (storageListenerBound) {
    return;
  }

  storageListenerBound = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
      return;
    }

    isPinnedReady = false;
    void ensurePinnedReady().then(() => {
      injectPinButtons();
    });
  });
}

function getMessageIndex(element: HTMLElement, fallbackMessageIndex: number): number {
  const parsed = Number(element.dataset.llmNoteMessageIndex ?? String(fallbackMessageIndex));
  return Number.isNaN(parsed) ? fallbackMessageIndex : parsed;
}

function isPinned(element: HTMLElement, fallbackMessageIndex: number): boolean {
  return pinnedKeys.has(createMessageKey(getConversationId(), getMessageIndex(element, fallbackMessageIndex)));
}

function setButtonLabel(button: HTMLButtonElement, pinned: boolean): void {
  button.textContent = pinned ? "Unpin" : "Pin";
  button.classList.toggle("is-pinned", pinned);
}

function bindPinButton(button: PinButton, element: HTMLElement, fallbackMessageIndex: number): void {
  if (button.__llmNoteBound) {
    return;
  }

  button.__llmNoteBound = true;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const messageIndex = getMessageIndex(element, fallbackMessageIndex);
    const pin = buildPin(element, messageIndex);
    if (!pin) {
      return;
    }

    const key = createMessageKey(pin.conversationId, pin.messageIndex);
    const pinned = pinnedKeys.has(key);

    if (pinned) {
      await chrome.runtime.sendMessage({
        type: "PIN_DELETED",
        payload: { pinId: pin.id },
      });
      pinnedKeys.delete(key);
      setButtonLabel(button, false);
      return;
    }

    await chrome.runtime.sendMessage({
      type: "PIN_CREATED",
      payload: pin,
    });
    pinnedKeys.add(key);
    setButtonLabel(button, true);
  });
}

function createPinButton(element: HTMLElement, messageIndex: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "llm-note-pin-button";
  button.setAttribute(PIN_BUTTON_ATTR, "true");
  setButtonLabel(button, isPinned(element, messageIndex));
  bindPinButton(button as PinButton, element, messageIndex);

  return button;
}

export function injectPinButtons(): void {
  ensurePinnedSyncListener();
  if (!isPinnedReady) {
    void ensurePinnedReady().then(() => {
      injectPinButtons();
    });
    return;
  }

  const blocks = getAssistantBlocks();

  blocks.forEach((block, index) => {
    block.dataset.llmNoteMessageIndex = String(index);

    const existingButton = block.querySelector<HTMLButtonElement>(`[${PIN_BUTTON_ATTR}]`);
    if (existingButton) {
      setButtonLabel(existingButton, isPinned(block, index));
      bindPinButton(existingButton as PinButton, block, index);
      return;
    }

    const anchor = getMessageContent(block);
    const wrapper = document.createElement("div");
    wrapper.className = "llm-note-pin-anchor";
    wrapper.appendChild(createPinButton(block, index));
    anchor.prepend(wrapper);
  });
}

export function jumpToPin(preview: string, messageIndex: number): boolean {
  const blocks = getAssistantBlocks();
  const directMatch = blocks.find(
    (block) => Number(block.dataset.llmNoteMessageIndex ?? "-1") === messageIndex,
  );
  const fallback = blocks.find((block) =>
    normalizeText(getPreservedText(block)).includes(preview.slice(0, 80)),
  );

  const target = directMatch ?? fallback;
  if (!target) {
    return false;
  }

  scrollToTarget(target);
  target.classList.add("llm-note-highlight");
  window.setTimeout(() => target.classList.remove("llm-note-highlight"), 1800);
  return true;
}
