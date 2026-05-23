/** Detect failed LLM rounds and resolve user content to resend. */

export function unpackPackedFailure(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && raw.type === "system_alert") {
    if (raw.llm_failure_stats || raw.degraded_failure_stats) return raw;
    return null;
  }
  if (typeof raw !== "string") return null;
  try {
    const packed = JSON.parse(raw);
    if (
      packed?.type === "system_alert" &&
      (packed.llm_failure_stats || packed.degraded_failure_stats)
    ) {
      return packed;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function packedFailureFromContent(content) {
  return unpackPackedFailure(content);
}

export function isFailureNoticeText(text) {
  return (
    typeof text === "string" &&
    text.includes("The model provider failed to return a usable response")
  );
}

export function isLlmFailureMessage(msg) {
  if (msg?.injectedContextJson) return true;
  if (msg?.isStreamFailureNotice) return true;
  if (isFailureNoticeText(msg?.content)) return true;
  return Boolean(packedFailureFromContent(msg?.content));
}

export function isRealUserMessage(msg) {
  return msg?.role === "user" && !isLlmFailureMessage(msg);
}

export function isStreamErrorMessage(msg) {
  return msg?.role === "error";
}

export function isRegeneratableFailure(msg) {
  return isLlmFailureMessage(msg) || isStreamErrorMessage(msg);
}

export function groupEvents(group) {
  if (group?.type === "turn") return group.visible || [];
  if (group?.type === "single") return group.messages || [];
  return [];
}

export function isFailedTurnGroup(group) {
  return groupEvents(group).some(isRegeneratableFailure);
}

export function findPrecedingUserGroup(groups, index) {
  for (let i = index - 1; i >= 0; i--) {
    const group = groups[i];
    if (group?.type === "user" && isRealUserMessage(group.messages?.[0])) {
      return group;
    }
  }
  return null;
}

export function mergeCachedUserTurn(cached, messages) {
  if (!cached?.userMsg) return messages;
  if (messages.some(isRealUserMessage)) return messages;
  if (!messages.some(isRegeneratableFailure)) return messages;
  const idx = messages.findIndex(isRegeneratableFailure);
  if (idx < 0) return messages;
  return [
    ...messages.slice(0, idx),
    { ...cached.userMsg, role: "user", type: "user_message", collapsed: false },
    ...messages.slice(idx),
  ];
}

export function failureInjectedJsonFromContent(content) {
  const packed = unpackPackedFailure(content);
  if (!packed) return null;
  try {
    return JSON.stringify(packed, null, 2);
  } catch {
    return typeof content === "string" ? content : null;
  }
}

export function enrichStreamFailureRow(row, content) {
  const packed = unpackPackedFailure(content);
  if (packed) {
    row.injectedContextJson = failureInjectedJsonFromContent(content);
    row.content = stripFailureNoticeText(packed.message || row.content);
    return row;
  }
  if (isFailureNoticeText(content)) {
    row.injectedContextJson = row.injectedContextJson || null;
    row.isStreamFailureNotice = true;
  }
  return row;
}

function stripFailureNoticeText(text) {
  if (!text || typeof text !== "string") return text;
  const marker = "```json";
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd() || text;
}

export function outgoingFromUserMessage(msg) {
  if (!msg) return null;
  if (Array.isArray(msg.contentBlocks) && msg.contentBlocks.length) {
    return msg.contentBlocks;
  }
  const text = typeof msg.content === "string" ? msg.content.trim() : "";
  return text || null;
}

export function turnMessageIds(group) {
  return new Set(groupEvents(group).map((m) => m.id));
}

export function outgoingHasImage(outgoing) {
  return Array.isArray(outgoing) && outgoing.some((b) => b?.type === "image");
}
