import { writable } from "svelte/store";

export const agents = writable([]);
export const selectedAgentId = writable(null);
export const currentTab = writable("agents");
export const conversations = writable([]);
export const activeConversationId = writable(null);
export const modelsCache = writable([]);

/** @param {string} modelHandle */
export function modelSupportsVision(modelHandle, models) {
  if (!modelHandle || !models?.length) return false;
  const m = models.find(
    (x) => x.handle === modelHandle || x.name === modelHandle || x.model === modelHandle
  );
  return Boolean(m?.supports_vision);
}

export const DEFAULT_CONVERSATION_ID = "default";

const SELECTED_AGENT_KEY = "letta-vision-client/selected-agent";
const LEGACY_SELECTED_AGENT_KEY = "letta-bridge/selected-agent";

export function loadSelectedAgent() {
  if (typeof localStorage === "undefined") return null;
  return (
    localStorage.getItem(SELECTED_AGENT_KEY) ??
    localStorage.getItem(LEGACY_SELECTED_AGENT_KEY)
  );
}

export function saveSelectedAgent(agentId) {
  if (typeof localStorage === "undefined" || !agentId) return;
  localStorage.setItem(SELECTED_AGENT_KEY, agentId);
  localStorage.removeItem(LEGACY_SELECTED_AGENT_KEY);
}

export function clearSelectedAgent() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SELECTED_AGENT_KEY);
  localStorage.removeItem(LEGACY_SELECTED_AGENT_KEY);
}

export function activeConversationKey(agentId) {
  return `letta-vision-client/active-conversation:${agentId}`;
}

function legacyActiveConversationKey(agentId) {
  return `letta-bridge/active-conversation:${agentId}`;
}

export function loadActiveConversation(agentId) {
  if (typeof localStorage === "undefined" || !agentId) return null;
  return (
    localStorage.getItem(activeConversationKey(agentId)) ??
    localStorage.getItem(legacyActiveConversationKey(agentId))
  );
}

export function saveActiveConversation(agentId, conversationId) {
  if (typeof localStorage === "undefined" || !agentId) return;
  localStorage.setItem(activeConversationKey(agentId), conversationId);
  localStorage.removeItem(legacyActiveConversationKey(agentId));
}

/** Per-agent conversation: saved selection, else default. Validates against list when provided. */
export function pickConversationForAgent(agentId, convList) {
  const saved = loadActiveConversation(agentId);
  if (convList?.length) {
    if (saved && convList.some((c) => c.id === saved)) return saved;
    return DEFAULT_CONVERSATION_ID;
  }
  return saved || DEFAULT_CONVERSATION_ID;
}

export function initFromHash() {
  const hash = window.location.hash.replace("#", "");
  if (hash === "chat") currentTab.set("chat");
  else if (hash === "files") currentTab.set("files");
  else currentTab.set("agents");
}

export function setTab(tab) {
  currentTab.set(tab);
  const hash =
    tab === "chat" ? "#chat" : tab === "files" ? "#files" : "#agents";
  window.location.hash = hash;
}

const chatDrafts = new Map();

export function chatDraftKey(agentId, conversationId) {
  if (!agentId || !conversationId) return null;
  return `${agentId}\0${conversationId}`;
}

export function loadChatDraft(agentId, conversationId) {
  const key = chatDraftKey(agentId, conversationId);
  return key ? chatDrafts.get(key) ?? "" : "";
}

export function saveChatDraft(agentId, conversationId, text) {
  const key = chatDraftKey(agentId, conversationId);
  if (!key) return;
  if (text) chatDrafts.set(key, text);
  else chatDrafts.delete(key);
}
