import type { ActiveConversation, PinnedItem, StorageShape } from "../shared/types";
import {
  buildPinFromText,
  extractPreservedText,
  normalizeText,
  PIN_BUTTON_ATTR,
  scrollToTarget,
} from "./shared";

function getMessageContent(article: HTMLElement): HTMLElement {
  return (
    article.querySelector<HTMLElement>(".markdown") ??
    article.querySelector<HTMLElement>("[data-message-author-role='assistant']") ??
    article
  );
}

function getPreservedText(article: HTMLElement): string {
  return extractPreservedText(getMessageContent(article));
}

function getConversationId(): string {
  const path = window.location.pathname;
  const matched = path.match(/\/c\/([^/]+)/);
  return matched?.[1] ?? `page:${window.location.pathname}`;
}

function getConversationTitle(): string {
  const heading = document.querySelector("main h1");
  const title = heading?.textContent?.trim();
  return title || document.title.replace(/\s+-\s+ChatGPT$/i, "").trim() || "Untitled chat";
}

function getAssistantArticles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("article")).filter((article) => {
    const aria = article.getAttribute("aria-label")?.toLowerCase() ?? "";
    const author = article.querySelector("[data-message-author-role='assistant']");

    return aria.includes("assistant") || Boolean(author);
  });
}

export function getActiveConversation(): ActiveConversation {
  return {
    site: "chatgpt",
    conversationId: getConversationId(),
    title: getConversationTitle(),
    pageUrl: window.location.href,
  };
}

function buildPin(article: HTMLElement, messageIndex: number): PinnedItem | null {
  const fullText = getPreservedText(article);
  const conversation = getActiveConversation();
  return buildPinFromText("chatgpt", conversation, fullText, messageIndex);
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
      .filter((pin) => pin.site === "chatgpt")
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

function getMessageIndex(article: HTMLElement, fallbackMessageIndex: number): number {
  const parsed = Number(article.dataset.llmNoteMessageIndex ?? String(fallbackMessageIndex));
  return Number.isNaN(parsed) ? fallbackMessageIndex : parsed;
}

function isPinned(article: HTMLElement, fallbackMessageIndex: number): boolean {
  return pinnedKeys.has(createMessageKey(getConversationId(), getMessageIndex(article, fallbackMessageIndex)));
}

function setButtonLabel(button: HTMLButtonElement, pinned: boolean): void {
  button.textContent = pinned ? "Unpin" : "Pin";
  button.classList.toggle("is-pinned", pinned);
}

function bindPinButton(button: PinButton, article: HTMLElement, fallbackMessageIndex: number): void {
  if (button.__llmNoteBound) {
    return;
  }

  button.__llmNoteBound = true;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const messageIndex = getMessageIndex(article, fallbackMessageIndex);
    const pin = buildPin(article, messageIndex);
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

function createPinButton(article: HTMLElement, messageIndex: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "llm-note-pin-button";
  button.setAttribute(PIN_BUTTON_ATTR, "true");
  setButtonLabel(button, isPinned(article, messageIndex));
  bindPinButton(button as PinButton, article, messageIndex);

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

  const articles = getAssistantArticles();

  articles.forEach((article, index) => {
    article.dataset.llmNoteMessageIndex = String(index);

    const existingButton = article.querySelector<HTMLButtonElement>(`[${PIN_BUTTON_ATTR}]`);
    if (existingButton) {
      setButtonLabel(existingButton, isPinned(article, index));
      bindPinButton(existingButton as PinButton, article, index);
      return;
    }

    const anchor =
      article.querySelector<HTMLElement>("h1, h2, h3, .markdown, [data-message-author-role='assistant']") ??
      article;
    const wrapper = document.createElement("div");
    wrapper.className = "llm-note-pin-anchor";
    wrapper.appendChild(createPinButton(article, index));

    anchor.prepend(wrapper);
  });
}

export function jumpToPin(preview: string, messageIndex: number): boolean {
  const articles = getAssistantArticles();
  const directMatch = articles.find(
    (article) => Number(article.dataset.llmNoteMessageIndex ?? "-1") === messageIndex,
  );

  const fallback = articles.find((article) =>
    normalizeText(getPreservedText(article)).includes(preview.slice(0, 80)),
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
