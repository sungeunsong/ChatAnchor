import type { ActiveConversation, PinnedItem } from "../shared/types";
import {
  buildPinFromText,
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
      if (normalizeText(element.innerText)) {
        elements.add(element);
      }
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
  const clone = getMessageContent(element).cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[${PIN_BUTTON_ATTR}]`).forEach((node) => node.remove());
  return clone.innerText.replace(/\n{3,}/g, "\n\n").trim();
}

function getAssistantBlocks(): HTMLElement[] {
  return getCandidateElements()
    .map((element) => getMessageContainer(element))
    .filter((element, index, array) => array.indexOf(element) === index)
    .filter((element) => normalizeText(getPreservedText(element)).length > 0);
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

function createPinButton(element: HTMLElement, messageIndex: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Pin";
  button.className = "llm-note-pin-button";
  button.setAttribute(PIN_BUTTON_ATTR, "true");
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const pin = buildPin(element, messageIndex);
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
  const blocks = getAssistantBlocks();

  blocks.forEach((block, index) => {
    block.dataset.llmNoteMessageIndex = String(index);

    if (block.querySelector(`[${PIN_BUTTON_ATTR}]`)) {
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
