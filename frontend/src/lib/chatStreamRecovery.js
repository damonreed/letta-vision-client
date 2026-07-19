/** Detect stalled SSE streams and surface recovery reasons for the chat UI. */

// Image MCP tools can take ~3 minutes with no assistant tokens; keepalives
// normally reset this, but leave headroom so a missed ping doesn't cancel a
// still-running generate_image (stall recovery now cancels the server run).
export const DEFAULT_STREAM_STALL_MS = 240_000;
export const DEFAULT_STREAM_MAX_MS = 600_000;
export const STALL_CHECK_INTERVAL_MS = 5_000;
export const RECOVERY_MESSAGES = {
  stall: "Stream stalled with no updates — synced conversation from server.",
  maxDuration: "Stream exceeded the maximum duration — synced conversation from server.",
  abrupt: "Connection closed before the stream finished — synced conversation from server.",
  online: "Network reconnected — refreshed conversation from server.",
  manual: "Conversation refreshed from server.",
  cancel: "Send cancelled — synced conversation from server.",
};

export function isKeepaliveEvent(event) {
  return event?.type === "keepalive" || event?.type === "ping";
}

export function isTerminalStreamEvent(event) {
  return event?.type === "done" || event?.type === "error";
}

export function isConversationBusyError(message) {
  return (
    typeof message === "string" &&
    (message.includes("ConversationBusyError") ||
      message.includes("currently being processed for this conversation"))
  );
}

/** Map upstream send failures to short UI copy. */
export function formatSendError(message) {
  if (!message || typeof message !== "string") return message || "Send failed";
  if (isConversationBusyError(message)) {
    return "The agent is still working on a previous message in this conversation. Wait for it to finish, or Refresh chat to cancel it and unlock.";
  }
  if (message.startsWith("CONFLICT:")) {
    return message.replace(/^CONFLICT:\s*/, "");
  }
  return message;
}

export function createStreamWatchdog({
  stallMs = DEFAULT_STREAM_STALL_MS,
  maxMs = DEFAULT_STREAM_MAX_MS,
  onStall,
  onMaxDuration,
  checkIntervalMs = STALL_CHECK_INTERVAL_MS,
} = {}) {
  let lastActivityAt = Date.now();
  let startedAt = Date.now();
  let timer = null;
  let stallTriggered = false;
  let maxTriggered = false;
  let paused = false;
  let pausedAt = 0;

  function touch() {
    lastActivityAt = Date.now();
  }

  /** Pause stall/max timers while the tab is hidden (timers are throttled in background). */
  function setPaused(isPaused) {
    if (isPaused && !paused) {
      paused = true;
      pausedAt = Date.now();
      return;
    }
    if (!isPaused && paused) {
      const hiddenMs = Date.now() - pausedAt;
      paused = false;
      pausedAt = 0;
      lastActivityAt += hiddenMs;
      startedAt += hiddenMs;
    }
  }

  function start() {
    startedAt = Date.now();
    touch();
    stop();
    timer = setInterval(() => {
      if (paused) return;
      const now = Date.now();
      if (maxMs > 0 && !maxTriggered && now - startedAt >= maxMs) {
        maxTriggered = true;
        onMaxDuration?.();
        return;
      }
      if (stallMs > 0 && !stallTriggered && now - lastActivityAt >= stallMs) {
        stallTriggered = true;
        onStall?.();
      }
    }, checkIntervalMs);
  }

  function stop() {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
    paused = false;
    pausedAt = 0;
  }

  return { touch, start, stop, setPaused };
}
