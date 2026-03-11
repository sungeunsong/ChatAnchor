import type { ConversationMeta, PinnedItem, StorageShape } from "./types";

const STORAGE_KEY = "llm-note-storage";

const defaultState: StorageShape = {
  pins: [],
  conversations: [],
};

async function readState(): Promise<StorageShape> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as StorageShape | undefined) ?? defaultState;
}

async function writeState(state: StorageShape): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function getPins(): Promise<PinnedItem[]> {
  const state = await readState();
  return state.pins.sort((left, right) => right.createdAt - left.createdAt);
}

export async function saveConversation(meta: ConversationMeta): Promise<void> {
  const state = await readState();
  const nextConversations = state.conversations.filter(
    (item) => item.conversationId !== meta.conversationId,
  );

  nextConversations.unshift(meta);

  await writeState({
    ...state,
    conversations: nextConversations.slice(0, 200),
  });
}

export async function upsertPin(pin: PinnedItem): Promise<PinnedItem> {
  const state = await readState();
  const existingPin = state.pins.find(
    (item) =>
      item.conversationId === pin.conversationId &&
      item.messageIndex === pin.messageIndex,
  );
  const nextPins = state.pins.filter(
    (item) =>
      !(
        item.conversationId === pin.conversationId &&
        item.messageIndex === pin.messageIndex
      ),
  );

  nextPins.unshift(pin);

  const mergedPins = [
    {
      ...pin,
      label: existingPin?.label || pin.label,
    },
    ...nextPins,
  ];

  const dedupedPins = mergedPins.filter((item, index, array) => {
    return (
      array.findIndex(
        (candidate) =>
          candidate.conversationId === item.conversationId &&
          candidate.messageIndex === item.messageIndex,
      ) === index
    );
  });

  await writeState({
    ...state,
    pins: dedupedPins,
  });

  return pin;
}

export async function deletePin(pinId: string): Promise<void> {
  const state = await readState();
  await writeState({
    ...state,
    pins: state.pins.filter((item) => item.id !== pinId),
  });
}

export async function updatePinLabel(pinId: string, label: string): Promise<void> {
  const state = await readState();
  await writeState({
    ...state,
    pins: state.pins.map((item) =>
      item.id === pinId
        ? {
            ...item,
            label,
          }
        : item,
    ),
  });
}
