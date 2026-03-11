import { useEffect, useMemo, useState } from "react";
import { deletePin, getPins, updatePinLabel } from "../shared/storage";
import type { ActiveConversation, PinnedItem, SupportedSite } from "../shared/types";

type SiteFilter = SupportedSite | "all";

function PencilIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 16 16">
      <path
        d="M11.8 1.8a1.7 1.7 0 0 1 2.4 2.4l-7.7 7.7-3 .6.6-3 7.7-7.7Zm-7 8.5-.3 1.3 1.3-.3 6.9-6.9-1-1-6.9 6.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 16 16">
      <path
        d="M5 2.5A1.5 1.5 0 0 1 6.5 1h5A1.5 1.5 0 0 1 13 2.5v7A1.5 1.5 0 0 1 11.5 11h-5A1.5 1.5 0 0 1 5 9.5v-7Zm1.5-.5a.5.5 0 0 0-.5.5v7c0 .3.2.5.5.5h5c.3 0 .5-.2.5-.5v-7a.5.5 0 0 0-.5-.5h-5Z"
        fill="currentColor"
      />
      <path
        d="M3.5 5A1.5 1.5 0 0 0 2 6.5v6A1.5 1.5 0 0 0 3.5 14h5A1.5 1.5 0 0 0 10 12.5V12H9v.5c0 .3-.2.5-.5.5h-5a.5.5 0 0 1-.5-.5v-6c0-.3.2-.5.5-.5H4V5h-.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function JumpIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 16 16">
      <path
        d="M3 8a.5.5 0 0 1 .5-.5h6.3L7.4 5.1l.7-.7 3.6 3.6-3.6 3.6-.7-.7 2.4-2.3H3.5A.5.5 0 0 1 3 8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 16 16">
      <path
        d="M5.5 2h5l.5 1H13v1H3V3h2l.5-1Zm-1 3h1v7h-1V5Zm3 0h1v7h-1V5Zm3 0h1v7h-1V5ZM4 5h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg aria-hidden="true" className="icon small" viewBox="0 0 16 16">
      <path
        d="M9 2h5v5h-1V3.7L8.4 8.3l-.7-.7L12.3 3H9V2Z"
        fill="currentColor"
      />
      <path d="M3 4h4v1H4v7h7V9h1v4H3V4Z" fill="currentColor" />
    </svg>
  );
}

async function getCurrentTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function getActiveConversationFromTab(): Promise<ActiveConversation | null> {
  const tabId = await getCurrentTabId();
  if (!tabId) {
    return null;
  }

  try {
    return (await chrome.tabs.sendMessage(tabId, {
      type: "GET_ACTIVE_CONVERSATION",
    })) as ActiveConversation;
  } catch {
    return null;
  }
}

async function jumpToPin(pin: PinnedItem): Promise<boolean> {
  const tabId = await getCurrentTabId();
  if (!tabId) {
    return false;
  }

  const sendJumpMessage = async (): Promise<boolean> => {
    try {
      const response = (await chrome.tabs.sendMessage(tabId, {
        type: "JUMP_TO_PIN",
        payload: {
          site: pin.site,
          conversationId: pin.conversationId,
          messageIndex: pin.messageIndex,
          preview: pin.preview,
        },
      })) as { success?: boolean } | undefined;

      return Boolean(response?.success);
    } catch {
      return false;
    }
  };

  const currentConversation = await getActiveConversationFromTab();
  if (
    currentConversation?.site === pin.site &&
    currentConversation.conversationId === pin.conversationId
  ) {
    return sendJumpMessage();
  }

  await chrome.tabs.update(tabId, { url: pin.pageUrl });
  await waitForTabComplete(tabId);
  return sendJumpMessage();
}

async function openConversation(pin: PinnedItem): Promise<void> {
  const tabId = await getCurrentTabId();
  if (!tabId) {
    return;
  }

  await chrome.tabs.update(tabId, { url: pin.pageUrl });
}

async function copyPin(pin: PinnedItem): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(pin.fullText);
    return true;
  } catch {
    return false;
  }
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatSiteLabel(site: SupportedSite): string {
  return site === "chatgpt" ? "ChatGPT" : "Gemini";
}

function PinCard({
  pin,
  showConversation,
  onCopy,
  onDelete,
  onJump,
  onOpenConversation,
  onSaveLabel,
}: {
  pin: PinnedItem;
  showConversation: boolean;
  onCopy: (pin: PinnedItem) => Promise<void>;
  onDelete: (pinId: string) => Promise<void>;
  onJump: (pin: PinnedItem) => Promise<void>;
  onOpenConversation: (pin: PinnedItem) => Promise<void>;
  onSaveLabel: (pinId: string, label: string) => Promise<void>;
}) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState(pin.label);

  useEffect(() => {
    setDraftLabel(pin.label);
  }, [pin.label]);

  async function submitLabel(): Promise<void> {
    const nextLabel = draftLabel.trim() || pin.label;
    await onSaveLabel(pin.id, nextLabel);
    setIsEditingLabel(false);
  }

  return (
    <article className="pin-card">
      <div className="pin-card-top">
        <div className="pin-title-group">
          {isEditingLabel ? (
            <input
              autoFocus
              className="label-input"
              maxLength={40}
              onBlur={() => void submitLabel()}
              onChange={(event) => setDraftLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitLabel();
                }

                if (event.key === "Escape") {
                  setDraftLabel(pin.label);
                  setIsEditingLabel(false);
                }
              }}
              value={draftLabel}
            />
          ) : (
            <strong className="pin-label" title={pin.label}>
              {pin.label}
            </strong>
          )}
          <button
            aria-label="Edit label"
            className="icon-button"
            onClick={() => setIsEditingLabel(true)}
            type="button"
          >
            <PencilIcon />
          </button>
        </div>
        <div className="pin-meta">
          <span>{formatDate(pin.createdAt)}</span>
          <span className="site-chip">{formatSiteLabel(pin.site)}</span>
          {showConversation ? (
            <button className="conversation-link" onClick={() => void onOpenConversation(pin)} type="button">
              <span className="conversation-link-text">{pin.conversationTitle}</span>
              <LinkIcon />
            </button>
          ) : null}
        </div>
      </div>
      <p className="pin-preview">{pin.preview}</p>
      <div className="pin-actions">
        <button onClick={() => void onJump(pin)} title="Jump to source" type="button">
          <JumpIcon />
          <span>Jump</span>
        </button>
        <button onClick={() => void onCopy(pin)} title="Copy pin content" type="button">
          <CopyIcon />
          <span>Copy</span>
        </button>
        <button className="danger" onClick={() => void onDelete(pin.id)} title="Delete pin" type="button">
          <DeleteIcon />
          <span>Delete</span>
        </button>
      </div>
    </article>
  );
}

export function App() {
  const [pins, setPins] = useState<PinnedItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<ActiveConversation | null>(null);
  const [siteFilter, setSiteFilter] = useState<SiteFilter>("all");
  const [currentChatOnly, setCurrentChatOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState("");

  async function refresh(): Promise<void> {
    const [nextPins, nextConversation] = await Promise.all([
      getPins(),
      getActiveConversationFromTab(),
    ]);

    setPins(nextPins);
    setActiveConversation(nextConversation);
  }

  function showToast(message: string, timeout = 1400): void {
    setToast(message);
    window.setTimeout(() => setToast(""), timeout);
  }

  useEffect(() => {
    void refresh();

    const storageListener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area === "local" && changes["llm-note-storage"]) {
        void refresh();
      }
    };

    chrome.storage.onChanged.addListener(storageListener);
    const runtimeListener = (message: unknown) => {
      const candidate = message as { type?: string };
      if (candidate.type === "ACTIVE_TAB_CHANGED") {
        void refresh();
      }
    };

    chrome.runtime.onMessage.addListener(runtimeListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  }, []);

  useEffect(() => {
    if (activeConversation) {
      setSiteFilter(activeConversation.site);
    }
  }, [activeConversation?.site]);

  const visiblePins = useMemo(() => {
    let filteredPins = pins;
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (siteFilter !== "all") {
      filteredPins = filteredPins.filter((pin) => pin.site === siteFilter);
    }

    if (currentChatOnly && activeConversation) {
      filteredPins = filteredPins.filter(
        (pin) =>
          pin.site === activeConversation.site &&
          pin.conversationId === activeConversation.conversationId,
      );
    }

    if (normalizedQuery) {
      filteredPins = filteredPins.filter((pin) =>
        [pin.label, pin.preview, pin.conversationTitle]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      );
    }

    return filteredPins;
  }, [activeConversation, currentChatOnly, pins, searchQuery, siteFilter]);

  async function handleDelete(pinId: string): Promise<void> {
    await deletePin(pinId);
    showToast("Deleted");
  }

  async function handleCopy(pin: PinnedItem): Promise<void> {
    const success = await copyPin(pin);
    showToast(success ? "Copied" : "Copy failed");
  }

  async function handleJump(pin: PinnedItem): Promise<void> {
    const success = await jumpToPin(pin);
    showToast(success ? "Moved to source" : "Source not found", 1700);
  }

  async function handleOpenConversation(pin: PinnedItem): Promise<void> {
    await openConversation(pin);
    showToast("Opened chat");
  }

  async function handleSaveLabel(pinId: string, label: string): Promise<void> {
    await updatePinLabel(pinId, label);
    showToast("Label saved");
  }

  return (
    <main className="panel-shell">
      <header className="panel-header">
        <p className="eyebrow">Chat Anchor</p>
        <h1>{activeConversation?.title ?? "AI chat not detected"}</h1>
        <div className="service-tabs">
          {(["chatgpt", "gemini", "all"] as const).map((site) => (
            <button
              className={siteFilter === site ? "active" : ""}
              key={site}
              onClick={() => setSiteFilter(site)}
              type="button"
            >
              {site === "all" ? "All" : formatSiteLabel(site)}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search pins"
          type="search"
          value={searchQuery}
        />
        <label className="current-toggle">
          <input
            checked={currentChatOnly}
            onChange={(event) => setCurrentChatOnly(event.target.checked)}
            type="checkbox"
          />
          <span>Current chat only</span>
        </label>
      </header>

      <section className="pin-list">
        {visiblePins.length === 0 ? (
          <div className="empty-state">No pins match this filter yet.</div>
        ) : (
          visiblePins.map((pin) => (
            <PinCard
              key={pin.id}
              onCopy={handleCopy}
              onDelete={handleDelete}
              onJump={handleJump}
              onOpenConversation={handleOpenConversation}
              onSaveLabel={handleSaveLabel}
              pin={pin}
              showConversation={siteFilter === "all" || !currentChatOnly}
            />
          ))
        )}
      </section>

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
