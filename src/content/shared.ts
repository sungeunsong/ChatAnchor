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
