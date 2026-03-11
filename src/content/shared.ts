import type { ActiveConversation, PinnedItem, SupportedSite } from "../shared/types";

export const PIN_BUTTON_ATTR = "data-chat-anchor-pin";
const LABEL_LENGTH = 16;

export type ContentAdapter = {
  site: SupportedSite;
  getActiveConversation: () => ActiveConversation;
  injectPinButtons: () => void;
  jumpToPin: (preview: string, messageIndex: number) => boolean;
};

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const BLOCK_TAGS = new Set([
  "ARTICLE",
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TR",
  "UL",
]);

function collapseInlineWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

function getCodeBlockLanguage(element: HTMLElement): string {
  const dataLanguage =
    element.getAttribute("data-language") ||
    element.getAttribute("data-code-language") ||
    element.querySelector<HTMLElement>("[data-language]")?.getAttribute("data-language");

  if (dataLanguage) {
    return dataLanguage.trim().toLowerCase();
  }

  const classLanguage = Array.from(element.classList)
    .map((className) => className.match(/language-([a-z0-9#+-]+)/i)?.[1])
    .find(Boolean);

  if (classLanguage) {
    return classLanguage.toLowerCase();
  }

  const codeElement = element.querySelector("code");
  const nestedClassLanguage = codeElement
    ? Array.from(codeElement.classList)
        .map((className) => className.match(/language-([a-z0-9#+-]+)/i)?.[1])
        .find(Boolean)
    : undefined;

  return nestedClassLanguage?.toLowerCase() ?? "";
}

function extractTextWithHardBreaks(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  if (element.tagName === "BR") {
    return "\n";
  }

  return Array.from(element.childNodes)
    .map((child) => extractTextWithHardBreaks(child))
    .join("");
}

function isCodeBlockElement(element: HTMLElement): boolean {
  if (element.tagName === "PRE") {
    return true;
  }

  const classNames = Array.from(element.classList);
  return classNames.some((className) =>
    ["cm-content", "cm-scroller", "cm-editor", "code-block", "codeBlock"].some((token) =>
      className.includes(token),
    ),
  );
}

function getCodeBlockText(element: HTMLElement): string {
  const codeMirrorContent = element.querySelector<HTMLElement>(".cm-content");
  if (codeMirrorContent) {
    return extractTextWithHardBreaks(codeMirrorContent)
      .replace(/\r\n/g, "\n")
      .trimEnd();
  }

  return extractTextWithHardBreaks(element)
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

function serializeNode(node: Node, preserveWhitespace = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return preserveWhitespace ? text : collapseInlineWhitespace(text);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tagName = element.tagName;

  if (tagName === "BR") {
    return "\n";
  }

  if (isCodeBlockElement(element)) {
    const codeText = getCodeBlockText(element);
    if (!codeText) {
      return "";
    }

    const language = getCodeBlockLanguage(element);
    return `\n\`\`\`${language}\n${codeText}\n\`\`\`\n`;
  }

  if (tagName === "LI") {
    const itemText = Array.from(element.childNodes)
      .map((child) => serializeNode(child, preserveWhitespace))
      .join("")
      .trim();

    return itemText ? `\n- ${itemText}` : "";
  }

  const content = Array.from(element.childNodes)
    .map((child) => serializeNode(child, preserveWhitespace || tagName === "CODE"))
    .join("");

  if (!content.trim()) {
    return "";
  }

  if (BLOCK_TAGS.has(tagName)) {
    return `\n${content.trim()}\n`;
  }

  return content;
}

export function extractPreservedText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[${PIN_BUTTON_ATTR}]`).forEach((element) => element.remove());

  const serialized = Array.from(clone.childNodes)
    .map((node) => serializeNode(node))
    .join("");

  return serialized
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function trimForLabel(text: string): string {
  return normalizeText(text).slice(0, LABEL_LENGTH).trim();
}

export function buildPinFromText(
  site: SupportedSite,
  conversation: ActiveConversation,
  fullText: string,
  messageIndex: number,
): PinnedItem | null {
  if (!fullText.trim()) {
    return null;
  }

  const createdAt = Date.now();
  const preview = normalizeText(fullText).slice(0, 180);
  const label = trimForLabel(fullText) || "Untitled pin";

  return {
    id: `${site}:${conversation.conversationId}:${messageIndex}`,
    site,
    conversationId: conversation.conversationId,
    conversationTitle: conversation.title,
    pageUrl: conversation.pageUrl,
    label,
    preview,
    fullText,
    messageIndex,
    createdAt,
  };
}

export function getScrollableAncestor(target: HTMLElement): HTMLElement | null {
  let current = target.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const isScrollable =
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight + 20;

    if (isScrollable) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

export function scrollToTarget(target: HTMLElement): void {
  const scrollableAncestor = getScrollableAncestor(target);

  if (scrollableAncestor) {
    const ancestorRect = scrollableAncestor.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop =
      scrollableAncestor.scrollTop + (targetRect.top - ancestorRect.top) - 20;

    scrollableAncestor.scrollTo({
      top: Math.max(nextTop, 0),
      behavior: "smooth",
    });
    return;
  }

  const offsetTop = window.scrollY + target.getBoundingClientRect().top - 20;
  window.scrollTo({
    top: Math.max(offsetTop, 0),
    behavior: "smooth",
  });
}
