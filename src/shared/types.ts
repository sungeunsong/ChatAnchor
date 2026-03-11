export type SupportedSite = "chatgpt";

export type ConversationMeta = {
  conversationId: string;
  title: string;
  pageUrl: string;
  updatedAt: number;
};

export type PinnedItem = {
  id: string;
  site: SupportedSite;
  conversationId: string;
  conversationTitle: string;
  pageUrl: string;
  label: string;
  preview: string;
  fullText: string;
  messageIndex: number;
  createdAt: number;
};

export type StorageShape = {
  pins: PinnedItem[];
  conversations: ConversationMeta[];
};

export type ActiveConversation = {
  site: SupportedSite;
  conversationId: string;
  title: string;
  pageUrl: string;
};

export type RuntimeMessage =
  | { type: "GET_ACTIVE_CONVERSATION" }
  | { type: "ACTIVE_CONVERSATION_CHANGED"; payload: ActiveConversation }
  | { type: "JUMP_TO_PIN"; payload: Pick<PinnedItem, "conversationId" | "messageIndex" | "preview"> }
  | { type: "PIN_CREATED"; payload: PinnedItem }
  | { type: "PIN_DELETED"; payload: { pinId: string } };
