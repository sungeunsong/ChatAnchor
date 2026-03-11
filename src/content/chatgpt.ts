import type { ActiveConversation, PinnedItem } from "../shared/types";
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
    const text = normalizeText(getPreservedText(article));
    if (!text) {
      return false;
    }

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

function createPinButton(article: HTMLElement, messageIndex: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Pin";
  button.className = "llm-note-pin-button";
  button.setAttribute(PIN_BUTTON_ATTR, "true");
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const pin = buildPin(article, messageIndex);
    if (!pin) {
      return;
    }

    await chrome.runtime.sendMessage({
      type: "PIN_CREATED",
      payload: pin,
    });

    button.textContent = "Pinned";
    window.setTimeout(() => {
      button.textContent = "Pin";
    }, 1200);
  });

  return button;
}

export function injectPinButtons(): void {
  const articles = getAssistantArticles();

  articles.forEach((article, index) => {
    article.dataset.llmNoteMessageIndex = String(index);

    if (article.querySelector(`[${PIN_BUTTON_ATTR}]`)) {
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
