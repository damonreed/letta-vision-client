<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { api } from "../lib/api.js";
  import { messageListKey, sortMessagesChronological, withUniqueMessageIds } from "../lib/messages.js";
  import { renderAgentMarkdown, splitAgentContent } from "../lib/markdown.js";
  import { buildDisplayGroups } from "../lib/chatDisplay.js";
  import {
    enrichStreamFailureRow,
    failureInjectedJsonFromContent,
    dedupeServerHistory,
    findPrecedingUserGroup,
    userGroupForFailedTurn,
    isDismissibleFailureMessage,
    isFailedTurnGroup,
    isRegeneratableFailure,
    isRealUserMessage,
    topPendingUserTurn,
    userTurnPresentInHistory,
    mergeCachedUserTurn,
    outgoingFromUserMessage,
    outgoingHasImage,
    unpackPackedFailure,
  } from "../lib/chatFailures.js";
  import {
    dismissMessageId,
    filterDismissedMessages,
  } from "../lib/chatDismissed.js";
  import {
    cachedOutgoing,
    cachedUserGroup,
    commitUserTurnSuccess,
    loadUserTurn,
    saveUserTurn,
  } from "../lib/chatTurnCache.js";
  import {
    createStreamWatchdog,
    isKeepaliveEvent,
    isTerminalStreamEvent,
    RECOVERY_MESSAGES,
  } from "../lib/chatStreamRecovery.js";
  import { parseContent, imageSrcFromBlock, previewSrcForAttachment } from "../lib/contentBlocks.js";
  import {
    buildMessageContent,
    fileToImageBlock,
    fetchUrlToImageBlock,
  } from "../lib/imagePipeline.ts";
  import AttachmentThumbnail from "../lib/components/AttachmentThumbnail.svelte";
  import ImageViewer from "../lib/components/ImageViewer.svelte";
  import {
    extractToolName,
    formatStructuredToolReturnText,
    formatToolCallContent,
    getToolResultBlocks,
    getToolResultDisplayImages,
    getToolResultText,
    redactToolResultDisplayText,
  } from "../lib/toolResultImages.js";
  import { copyTextToClipboard } from "../lib/clipboard.js";
  import ConversationList from "../lib/ConversationList.svelte";
  import SystemContextModal from "../lib/SystemContextModal.svelte";
  import {
    activeConversationId,
    agents,
    loadChatDraft,
    loadSelectedAgent,
    pickConversationForAgent,
    saveChatDraft,
    saveSelectedAgent,
    selectedAgentId,
    modelsCache,
    modelSupportsVision,
  } from "../lib/stores.js";

  let agentList = $state([]);
  let agentId = $state(null);
  let conversationId = $state(null);
  let messages = $state([]);
  let input = $state("");
  let streaming = $state(false);
  let error = $state("");
  let recoveryNotice = $state("");
  let showMemory = $state(false);
  let showSystemContext = $state(false);
  let systemContextContent = $state("");
  let systemContextSummary = $state("");
  let systemContextLoading = $state(false);
  let systemContextRefreshing = $state(false);
  let systemContextRefreshError = $state("");
  let convIdCopied = $state(false);
  let memoryBlocks = $state([]);
  let memoryTab = $state("blocks");
  let openFiles = $state([]);
  let expanded = $state({});
  let expandedTurns = $state({});
  let listEl = $state(null);
  let historyRequest = 0;
  let stickToBottom = $state(true);
  let draftAgentId = null;
  let draftConversationId = null;
  /** @type {{ abort: AbortController, agentId: string, conversationId: string, streamId: number, lifecycleDone: Promise<void> } | null} */
  let activeStream = null;
  let streamIdCounter = 0;
  let pendingAttachment = $state(null);
  let modelsList = $state([]);
  let showUrlAttach = $state(false);
  let urlAttachInput = $state("");
  let dropOverlay = $state(false);
  let viewerSrc = $state(null);
  let viewerOpen = $state(false);
  let fileInput = $state(null);
  let streamUserCancelled = false;
  let streamRecoveryReason = null;
  /** @type {ReturnType<typeof createStreamWatchdog> | null} */
  let activeWatchdog = null;
  let historyHasMore = $state(false);
  let loadingOlder = $state(false);
  let memoryLoadedFor = null;

  const HISTORY_PAGE_SIZE = 50;

  const activeAgent = $derived(agentList.find((a) => a.id === agentId));
  const visionCapable = $derived(
    modelSupportsVision(activeAgent?.model, modelsList)
  );

  const SCROLL_BOTTOM_THRESHOLD = 64;

  const chatMessages = $derived(messages.filter((m) => m.role !== "system"));
  const displayGroups = $derived(buildDisplayGroups(chatMessages));

  function extractSystemContent(msgs) {
    const sys = msgs.find((m) => m.role === "system");
    return sys?.content || "";
  }

  function refreshSystemContextFromMessages(msgs) {
    const text = extractSystemContent(msgs);
    systemContextContent = text;
    systemContextSummary = text ? systemSummary(text) : "";
  }

  async function openSystemContext() {
    showSystemContext = true;
    systemContextRefreshError = "";
    systemContextLoading = true;
    try {
      refreshSystemContextFromMessages(messages);
      if (!systemContextContent && agentId && conversationId) {
        const { messages: hist } = await api.getHistory(agentId, conversationId, {
          full: true,
        });
        const normalized = sortMessagesChronological(
          hist.map(normalizeMessage).filter(Boolean)
        );
        refreshSystemContextFromMessages(normalized);
      }
    } catch (err) {
      refreshSystemContextFromMessages(messages);
      error = err.message;
    } finally {
      systemContextLoading = false;
    }
  }

  async function refreshSystemContext() {
    if (!agentId || !conversationId || systemContextRefreshing) return;
    systemContextRefreshing = true;
    systemContextRefreshError = "";
    try {
      const { content } = await api.recompileContext(agentId, conversationId);
      systemContextContent = content || "";
      systemContextSummary = content ? systemSummary(content) : "";
      await loadHistory(agentId, conversationId);
    } catch (err) {
      systemContextRefreshError = err.message;
    } finally {
      systemContextRefreshing = false;
    }
  }

  async function copyConversationId() {
    if (!conversationId) return;
    const ok = await copyTextToClipboard(conversationId);
    if (ok) {
      convIdCopied = true;
      setTimeout(() => {
        convIdCopied = false;
      }, 1500);
    }
  }

  function isNearBottom(el = listEl, threshold = SCROLL_BOTTOM_THRESHOLD) {
    if (!el) return true;
    return el.scrollHeight - el.clientHeight - el.scrollTop <= threshold;
  }

  function onMessagesScroll() {
    stickToBottom = isNearBottom();
  }

  $effect(() => {
    if (!stickToBottom || !listEl) return;
    // Track length and last message content so streaming updates trigger scroll.
    const last = messages.at(-1);
    void messages.length;
    void last?.content;
    void last?.reasoning;
    scrollToBottom();
  });

  $effect(() => {
    const same =
      agentId === draftAgentId && conversationId === draftConversationId;
    if (same) return;

    if (draftAgentId != null && draftConversationId != null) {
      saveChatDraft(draftAgentId, draftConversationId, input);
    }

    draftAgentId = agentId;
    draftConversationId = conversationId;
    input =
      agentId && conversationId ? loadChatDraft(agentId, conversationId) : "";
  });

  onDestroy(() => {
    stopActiveStream();
    if (agentId && conversationId) saveChatDraft(agentId, conversationId, input);
  });

  function stopActiveStream() {
    if (!activeStream) return;
    activeStream.abort.abort();
    activeStream = null;
    streaming = false;
  }

  function isCurrentStream(streamId) {
    return activeStream?.streamId === streamId;
  }

  $effect(() => {
    if (showMemory && agentId) {
      void ensureMemoryLoaded(agentId);
    }
  });

  $effect(() => {
    void agentId;
    memoryLoadedFor = null;
    memoryBlocks = [];
    openFiles = [];
  });

  onMount(() => {
    loadAgents();
    const u1 = agents.subscribe((a) => (agentList = a));
    const u2 = selectedAgentId.subscribe((id) => {
      if (id) {
        agentId = id;
      }
    });
    const u3 = activeConversationId.subscribe((cid) => {
      conversationId = cid;
    });

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        activeWatchdog?.setPaused(true);
        return;
      }
      activeWatchdog?.setPaused(false);
      activeWatchdog?.touch();
    }

    function onOnline() {
      if (streaming) {
        void recoverChat(RECOVERY_MESSAGES.online);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      u1();
      u2();
      u3();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  });

  $effect(() => {
    const aid = agentId;
    const cid = conversationId;
    stopActiveStream();
    if (aid && cid) {
      loadHistory(aid, cid);
    } else {
      messages = [];
      historyHasMore = false;
    }
  });

  async function loadAgents() {
    try {
      const [a, models] = await Promise.all([api.listAgents(), api.listModels()]);
      modelsList = Array.isArray(models) ? models : [];
      modelsCache.set(modelsList);
      agents.set(a);
      if (!agentId && a.length) {
        const saved = loadSelectedAgent();
        const pick =
          saved && a.some((ag) => ag.id === saved) ? saved : a[0].id;
        agentId = pick;
        selectedAgentId.set(agentId);
        activeConversationId.set(pickConversationForAgent(pick));
      }
    } catch (err) {
      error = err.message;
    }
  }

  async function onAgentChange(e) {
    const id = e.target.value;
    agentId = id;
    selectedAgentId.set(id);
    saveSelectedAgent(id);
    historyRequest++;
    messages = [];
    historyHasMore = false;
    activeConversationId.set(pickConversationForAgent(id));
  }

  function applyServerHistory(
    hist,
    { id = agentId, convId = conversationId, hasMore = false } = {}
  ) {
    let normalized = sortMessagesChronological(
      dedupeServerHistory(hist).map(normalizeMessage).filter(Boolean)
    );
    normalized = mergeCachedUserTurn(loadUserTurn(id, convId), normalized);
    messages = filterDismissedMessages(
      withUniqueMessageIds(normalized),
      id,
      convId
    );
    historyHasMore = hasMore;
    refreshSystemContextFromMessages(messages);
  }

  function oldestLoadedMessageId() {
    const visible = messages.filter((m) => m.role !== "system");
    if (visible.length) return visible[0].id;
    return messages[0]?.id ?? null;
  }

  function prependServerHistory(
    hist,
    { id = agentId, convId = conversationId, hasMore = false } = {}
  ) {
    const existingIds = new Set(messages.map((m) => m.id));
    let older = sortMessagesChronological(
      dedupeServerHistory(hist).map(normalizeMessage).filter(Boolean)
    );
    older = older.filter((m) => !existingIds.has(m.id));
    if (!older.length) {
      historyHasMore = hasMore;
      return false;
    }
    messages = filterDismissedMessages(
      withUniqueMessageIds([...older, ...messages]),
      id,
      convId
    );
    historyHasMore = hasMore;
    return true;
  }

  function restoreComposerFromPendingTurn(id, convId, hist) {
    const pending = topPendingUserTurn(loadUserTurn(id, convId));
    if (!pending?.userMsg || userTurnPresentInHistory(pending, hist)) return false;
    const text = typeof pending.userMsg.content === "string" ? pending.userMsg.content : "";
    input = text;
    saveChatDraft(id, convId, text);
    const imageBlock = pending.userMsg.contentBlocks?.find((b) => b?.type === "image");
    pendingAttachment = imageBlock || null;
    return true;
  }

  async function syncConversationFromServer(
    streamAgentId,
    streamConversationId,
    { reason = null } = {}
  ) {
    if (!streamAgentId || !streamConversationId) return;
    try {
      const { messages: hist, has_more: hasMore } = await api.getHistory(
        streamAgentId,
        streamConversationId,
        { limit: HISTORY_PAGE_SIZE }
      );
      if (streamAgentId !== agentId || streamConversationId !== conversationId) {
        return;
      }
      applyServerHistory(hist, {
        id: streamAgentId,
        convId: streamConversationId,
        hasMore,
      });
      const restoredToComposer = restoreComposerFromPendingTurn(
        streamAgentId,
        streamConversationId,
        messages
      );
      if (reason) {
        recoveryNotice = restoredToComposer
          ? `${reason} Your message was restored to the composer so you can send again.`
          : reason;
        error = "";
      } else {
        recoveryNotice = "";
        error = "";
      }
      streamRecoveryReason = null;
      stickToBottom = true;
      await scrollToBottom();
    } catch (err) {
      if (streamAgentId === agentId && streamConversationId === conversationId) {
        const detail = reason ? `${reason} (${err.message})` : err.message;
        error = detail;
        recoveryNotice = "";
      }
    }
  }

  async function recoverChat(reason = RECOVERY_MESSAGES.manual) {
    const isManual = reason === RECOVERY_MESSAGES.manual;
    const notifyReason = isManual ? null : reason;

    if (activeStream) {
      streamRecoveryReason = notifyReason;
      const lifecycleDone = activeStream.lifecycleDone;
      activeStream.abort.abort();
      if (lifecycleDone) {
        await lifecycleDone;
      }
      return;
    }
    stopActiveStream();
    if (agentId && conversationId) {
      await syncConversationFromServer(agentId, conversationId, { reason: notifyReason });
      if (showMemory) await ensureMemoryLoaded(agentId);
    }
  }

  function cancelActiveStream() {
    if (!activeStream || !streaming) return;
    streamUserCancelled = true;
    streamRecoveryReason = RECOVERY_MESSAGES.cancel;
    activeStream.abort.abort();
  }

  async function loadHistory(id, convId = conversationId) {
    if (!id || !convId) return;
    const requestId = ++historyRequest;
    error = "";
    recoveryNotice = "";
    try {
      const { messages: hist, has_more: hasMore } = await api.getHistory(id, convId, {
        limit: HISTORY_PAGE_SIZE,
      });
      if (requestId !== historyRequest) return;
      applyServerHistory(hist, { id, convId, hasMore });
      stickToBottom = true;
      await scrollToBottom();
    } catch (err) {
      if (requestId !== historyRequest) return;
      error = err.message;
    }
  }

  async function loadOlderHistory() {
    if (!agentId || !conversationId || !historyHasMore || loadingOlder) return;
    const before = oldestLoadedMessageId();
    if (!before) return;

    const requestId = historyRequest;
    loadingOlder = true;
    const el = listEl;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    stickToBottom = false;
    error = "";

    try {
      const { messages: hist, has_more: hasMore } = await api.getHistory(
        agentId,
        conversationId,
        { limit: HISTORY_PAGE_SIZE, before }
      );
      if (requestId !== historyRequest) return;
      const added = prependServerHistory(hist, {
        id: agentId,
        convId: conversationId,
        hasMore,
      });
      if (added) {
        await tick();
        if (el) {
          el.scrollTop += el.scrollHeight - prevScrollHeight;
        }
      }
    } catch (err) {
      if (requestId === historyRequest) error = err.message;
    } finally {
      loadingOlder = false;
    }
  }

  async function ensureMemoryLoaded(id) {
    if (!id || memoryLoadedFor === id) return;
    memoryLoadedFor = id;
    await loadMemory(id);
  }

  async function loadMemory(id) {
    try {
      memoryBlocks = await api.listBlocks(id);
    } catch {
      memoryBlocks = [];
    }
    try {
      openFiles = await api.listOpenFiles(id);
    } catch {
      openFiles = [];
    }
  }

  function systemSummary(content) {
    const text = typeof content === "string" ? content : JSON.stringify(content);
    const blockCount = (text.match(/<memory_blocks>/g) || []).length
      ? (text.match(/label=/gi) || []).length
      : 0;
    const blocks = blockCount || (text.includes("memory") ? "?" : "0");
    return `System context (${blocks} memory blocks, ${text.length} chars)`;
  }

  function rawMessageContent(m) {
    if (typeof m?.content === "string") return m.content;
    if (Array.isArray(m?.content) && m.content[0]?.text) return m.content[0].text;
    return null;
  }

  function unpackLlmFailureNotice(m) {
    if (m?.llm_failure_stats || m?.degraded_failure_stats) {
      if (typeof m.summary === "string") return m.summary;
      if (typeof m.message === "string") return m.message;
    }
    const packed = unpackPackedFailure(rawMessageContent(m));
    return packed?.message || null;
  }

  function llmFailureInjectedJson(m) {
    if (m?.llm_failure_stats || m?.degraded_failure_stats) {
      const packed = {
        type: "system_alert",
        message: m.summary || m.message || unpackLlmFailureNotice(m),
        llm_failure_stats: m.llm_failure_stats,
        degraded_failure_stats: m.degraded_failure_stats || m.llm_failure_stats,
      };
      return failureInjectedJsonFromContent(JSON.stringify(packed));
    }
    return failureInjectedJsonFromContent(rawMessageContent(m));
  }

  /** Legacy stream appended a second assistant chunk with fenced JSON; strip from main text. */
  function stripEmbeddedFailureJsonFence(text) {
    if (!text || typeof text !== "string") return text;
    const marker = "```json";
    const idx = text.indexOf(marker);
    if (idx === -1) return text;
    const before = text.slice(0, idx).trimEnd();
    return before || text;
  }

  function isLegacyInjectedJsonStreamMessage(event) {
    const id = event?.id || "";
    if (typeof id === "string" && id.endsWith("-injected-json")) return true;
    const content = typeof event?.content === "string" ? event.content : "";
    return content.trimStart().startsWith("```json");
  }

  function normalizeMessage(m) {
    if (typeof m?.id === "string" && m.id.endsWith("-injected-json")) {
      return null;
    }
    const failureNotice = unpackLlmFailureNotice(m);
    const injectedJson = llmFailureInjectedJson(m);
    const type = m.message_type || "unknown";
    let role = "system";
    if (type === "error_message") role = "error";
    else if (failureNotice) role = "agent";
    else if (type === "user_message") role = "user";
    else if (type === "assistant_message" || type === "summary_message") role = "agent";
    else if (type === "tool_call_message") role = "tool_call";
    else if (type === "tool_return_message") role = "tool_result";
    else if (type === "reasoning_message" || type === "hidden_reasoning_message")
      role = "reasoning";
    else if (type === "system_message") role = "system";

    let content = "";
    let contentBlocks = null;

    if (role === "reasoning") {
      content = extractReasoning(m);
    } else if (role === "tool_result" || m.tool_return != null || m.tool_returns?.length) {
      const blocks = getToolResultBlocks(m);
      if (blocks) {
        content = parseContent(blocks).text;
      } else {
        content = getToolResultText(m);
        if (!content) {
          const structured =
            m.tool_return ?? m.tool_returns?.[0]?.tool_return ?? null;
          if (structured != null) {
            if (typeof structured === "string") {
              content = structured;
            } else {
              content =
                formatStructuredToolReturnText(structured) ||
                JSON.stringify(structured, null, 2);
            }
          }
        }
      }
    } else if (failureNotice) {
      content = stripEmbeddedFailureJsonFence(failureNotice);
    } else if (type === "error_message") {
      content = m.message || m.content || "";
    } else if (type === "summary_message" && typeof m.summary === "string") {
      content = m.summary;
    } else if (m.content != null) {
      if (typeof m.content === "string") {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        const parsed = parseContent(m.content);
        content = parsed.text;
        contentBlocks = m.content;
      } else {
        content = JSON.stringify(m.content, null, 2);
      }
    } else if (m.tool_call) {
      content = formatToolCallContent(m.tool_call);
    }

    const toolName = extractToolName(m);

    if (
      type === "assistant_message" &&
      !failureNotice &&
      typeof content === "string" &&
      !content.trim()
    ) {
      return null;
    }

    const toolDisplayImages =
      role === "tool_result" ? getToolResultDisplayImages(m) : [];

    const id = m.id || crypto.randomUUID();

    if (role === "tool_result" && content) {
      content = redactToolResultDisplayText(content);
    }

    return {
      id,
      role,
      type,
      content,
      contentBlocks,
      toolDisplayImages,
      toolName,
      injectedContextJson: injectedJson,
      errorDetail:
        type === "error_message"
          ? m.upstream_error || m.detail || null
          : null,
      date: m.date,
      seq_id: m.seq_id ?? m.sequence_id ?? null,
      seq_sub: m.seq_sub ?? null,
      collapsed: ["tool_call", "tool_result", "reasoning"].includes(role),
      systemSummary: role === "system" ? systemSummary(content) : null,
    };
  }

  async function scrollToBottom() {
    await tick();
    requestAnimationFrame(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  }

  function toggleExpand(id) {
    expanded = { ...expanded, [id]: !expanded[id] };
  }

  function toggleTurnExpand(key) {
    expandedTurns = { ...expandedTurns, [key]: !expandedTurns[key] };
  }

  function extractReasoning(event) {
    return (
      event.reasoning ||
      event.hidden_reasoning ||
      (typeof event.content === "string" ? event.content : "")
    );
  }


  function openViewer(src) {
    viewerSrc = src;
    viewerOpen = true;
  }

  async function attachFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      error = "Only image files can be attached.";
      return;
    }
    error = "";
    try {
      pendingAttachment = await fileToImageBlock(file);
    } catch (err) {
      error = err.message;
    }
  }

  function onFilePick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) attachFile(file);
  }

  function onDragOver(e) {
    e.preventDefault();
    dropOverlay = true;
  }

  function onDragLeave() {
    dropOverlay = false;
  }

  async function onDrop(e) {
    e.preventDefault();
    dropOverlay = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      error = "Only image files can be attached.";
      return;
    }
    await attachFile(file);
  }

  async function onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await attachFile(file);
        return;
      }
    }
  }

  async function attachFromUrl() {
    const url = urlAttachInput.trim();
    if (!url) return;
    error = "";
    try {
      pendingAttachment = await fetchUrlToImageBlock(url);
      showUrlAttach = false;
      urlAttachInput = "";
    } catch (err) {
      error = err.message.includes("fetch")
        ? err.message
        : `Could not attach image: ${err.message}`;
    }
  }

  function clearAttachment() {
    pendingAttachment = null;
  }

  async function runMessageStream(outgoing, { appendUserBubble = false, userBubble = null } = {}) {
    const streamAgentId = agentId;
    const streamConversationId = conversationId;
    const streamId = ++streamIdCounter;
    const abort = new AbortController();
    let resolveLifecycle = null;
    const lifecycleDone = new Promise((resolve) => {
      resolveLifecycle = resolve;
    });
    activeStream = {
      abort,
      agentId: streamAgentId,
      conversationId: streamConversationId,
      streamId,
      lifecycleDone,
    };

    streaming = true;
    stickToBottom = true;
    error = "";
    recoveryNotice = "";
    streamUserCancelled = false;
    streamRecoveryReason = null;

    if (appendUserBubble && userBubble) {
      messages = withUniqueMessageIds([...messages, userBubble]);
      await scrollToBottom();
    }

    let assistantIdx = null;
    let pendingReasoning = "";
    let streamPart = 0;
    let sawTerminal = false;
    let streamHadFailure = false;

    const watchdog = createStreamWatchdog({
      onStall: () => {
        if (abort.signal.aborted || !isCurrentStream(streamId)) return;
        streamRecoveryReason = RECOVERY_MESSAGES.stall;
        abort.abort();
      },
      onMaxDuration: () => {
        if (abort.signal.aborted || !isCurrentStream(streamId)) return;
        streamRecoveryReason = RECOVERY_MESSAGES.maxDuration;
        abort.abort();
      },
    });
    activeWatchdog = watchdog;
    if (document.visibilityState === "hidden") {
      watchdog.setPaused(true);
    }
    watchdog.start();

    try {
      for await (const event of api.streamMessage(
        streamAgentId,
        outgoing,
        streamConversationId,
        { signal: abort.signal }
      )) {
        if (!isCurrentStream(streamId)) return;

        if (isKeepaliveEvent(event)) {
          watchdog.touch();
          continue;
        }
        watchdog.touch();

        if (isTerminalStreamEvent(event)) {
          sawTerminal = true;
        }

        if (event.type === "stream_end") {
          if (!sawTerminal) {
            streamRecoveryReason = RECOVERY_MESSAGES.abrupt;
          }
          continue;
        }

        if (event.type === "reasoning") {
          pendingReasoning += extractReasoning(event);
          if (assistantIdx === null) {
            const row = {
              id: event.id
                ? `${event.id}-reasoning`
                : `stream-reasoning-${Date.now()}`,
              role: "agent",
              type: "assistant_message",
              content: "",
              reasoning: pendingReasoning,
              date: event.date,
              collapsed: false,
            };
            messages = withUniqueMessageIds([...messages, row]);
            assistantIdx = messages.length - 1;
          } else {
            messages[assistantIdx].reasoning = pendingReasoning;
            messages = [...messages];
          }
        } else if (event.type === "message") {
          if (isLegacyInjectedJsonStreamMessage(event)) {
            continue;
          }
          const chunk =
            typeof event.content === "string"
              ? event.content
              : extractText(event.content);
          if (assistantIdx === null) {
            let row = {
              id: event.id
                ? `${event.id}-part-${streamPart++}`
                : `stream-${Date.now()}-${streamPart++}`,
              role: "agent",
              type: "assistant_message",
              content: chunk,
              reasoning: pendingReasoning || undefined,
              date: event.date,
              collapsed: false,
            };
            row = enrichStreamFailureRow(row, chunk);
            if (isRegeneratableFailure(row)) streamHadFailure = true;
            messages = withUniqueMessageIds([...messages, row]);
            assistantIdx = messages.length - 1;
          } else {
            const merged = (messages[assistantIdx].content || "") + (chunk || "");
            messages[assistantIdx].content = stripEmbeddedFailureJsonFence(merged);
            enrichStreamFailureRow(messages[assistantIdx], messages[assistantIdx].content);
            if (isRegeneratableFailure(messages[assistantIdx])) streamHadFailure = true;
            messages = [...messages];
          }
        } else if (event.type === "tool_call") {
          const toolCallRow = normalizeMessage({
            ...event,
            message_type: "tool_call_message",
          });
          if (toolCallRow) {
            messages = withUniqueMessageIds([...messages, toolCallRow]);
          }
          assistantIdx = null;
          pendingReasoning = "";
        } else if (event.type === "tool_result") {
          const toolResultRow = normalizeMessage({
            ...event,
            message_type: "tool_return_message",
          });
          if (toolResultRow) {
            messages = withUniqueMessageIds([...messages, toolResultRow]);
          }
          assistantIdx = null;
        } else if (event.type === "done") {
          break;
        } else if (event.type === "error") {
          streamHadFailure = true;
          const errText =
            event.message ||
            event.detail ||
            (typeof event.error_type === "string" ? event.error_type : "") ||
            "Stream error";
          error = errText;
          const rawUpstream = event.upstream_error || event.detail || null;
          messages = withUniqueMessageIds([
            ...messages,
            {
              id: event.run_id ? `${event.run_id}-error` : `stream-error-${Date.now()}`,
              role: "error",
              type: "error_message",
              content: errText,
              errorDetail: rawUpstream,
              date: event.date || new Date().toISOString(),
              collapsed: false,
            },
          ]);
        }
      }
      if (!isCurrentStream(streamId)) return;
      if (stickToBottom) await scrollToBottom();
    } catch (err) {
      if (err.name === "AbortError") {
        if (!streamRecoveryReason && streamUserCancelled) {
          streamRecoveryReason = RECOVERY_MESSAGES.cancel;
        }
      } else if (isCurrentStream(streamId)) {
        error = err.message;
      }
    } finally {
      watchdog.stop();
      if (activeWatchdog === watchdog) {
        activeWatchdog = null;
      }
      try {
        if (isCurrentStream(streamId)) {
          activeStream = null;
          streaming = false;
          try {
            await syncConversationFromServer(streamAgentId, streamConversationId, {
              reason: streamRecoveryReason,
            });
            await loadMemory(streamAgentId);
            if (!streamRecoveryReason && !streamHadFailure) {
              commitUserTurnSuccess(streamAgentId, streamConversationId);
            }
          } catch {
            /* syncConversationFromServer sets error when needed */
          }
        }
      } finally {
        resolveLifecycle?.();
      }
    }
  }

  async function send() {
    const text = input.trim();
    const attachment = pendingAttachment;
    if ((!text && !attachment) || !agentId || streaming) return;
    if (attachment && !visionCapable) {
      error = "This agent's model can't see images. Switch to a vision-capable agent.";
      return;
    }

    const streamAgentId = agentId;
    const streamConversationId = conversationId;
    input = "";
    saveChatDraft(streamAgentId, streamConversationId, "");

    const outgoing = buildMessageContent(text, attachment);
    const userMsg = {
      id: `local-${Date.now()}`,
      role: "user",
      type: "user_message",
      content: typeof outgoing === "string" ? outgoing : text || "",
      contentBlocks: Array.isArray(outgoing) ? outgoing : null,
      date: new Date().toISOString(),
      collapsed: false,
    };
    pendingAttachment = null;
    saveUserTurn(streamAgentId, streamConversationId, userMsg, outgoing);

    await runMessageStream(outgoing, { appendUserBubble: true, userBubble: userMsg });
  }

  function resolveUserGroupForFailure(groupIndex) {
    return userGroupForFailedTurn(
      displayGroups,
      groupIndex,
      cachedUserGroup(agentId, conversationId)
    );
  }

  async function regenerateTurn(failedGroup, userGroup) {
    if (streaming || !agentId || !failedGroup) return;

    const userMsg = userGroup?.messages?.[0];
    const outgoing =
      outgoingFromUserMessage(userMsg) || cachedOutgoing(agentId, conversationId);
    if (!outgoing) return;

    if (outgoingHasImage(outgoing) && !visionCapable) {
      error = "This agent's model can't see images. Switch to a vision-capable agent.";
      return;
    }

    const hasUserInThread =
      userMsg &&
      messages.some(
        (m) =>
          m.id === userMsg.id ||
          (isRealUserMessage(m) &&
            m.content === userMsg.content &&
            Boolean(m.contentBlocks?.length) === Boolean(userMsg.contentBlocks?.length))
      );

    await runMessageStream(outgoing, {
      appendUserBubble: Boolean(userMsg && !hasUserInThread),
      userBubble: userMsg,
    });
  }

  function deleteChatMessage(msg) {
    if (!msg?.id || !agentId || !conversationId) return;
    dismissMessageId(agentId, conversationId, msg.id);
    messages = messages.filter((m) => m.id !== msg.id);
    if (isDismissibleFailureMessage(msg)) {
      error = "";
    }
  }

  function extractText(content) {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((p) => (typeof p === "string" ? p : p?.text || ""))
        .join("");
    }
    return "";
  }

  function onKeydown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  function formatDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }

</script>

<div class="chat-layout">
  <header class="chat-header">
    <select value={agentId} onchange={onAgentChange}>
      {#each agentList as a}
        <option value={a.id}>{a.name}</option>
      {/each}
    </select>
    <button
      type="button"
      class="memory-btn"
      title="Memory blocks and open files"
      onclick={() => (showMemory = !showMemory)}
    >
      memory
    </button>
    <button
      type="button"
      class="memory-btn"
      title="Latest compiled system context (open files, directories, blocks)"
      onclick={openSystemContext}
      disabled={!agentId || !conversationId}
    >
      context
    </button>
    {#if conversationId}
      <button
        type="button"
        class="conv-id-btn"
        title={convIdCopied ? "Copied!" : "Copy conversation ID"}
        onclick={copyConversationId}
      >
        {convIdCopied ? "copied" : conversationId}
      </button>
    {/if}
  </header>

  {#if recoveryNotice}
    <p class="recovery-notice">
      {recoveryNotice}
      <button type="button" class="ghost recover-btn" onclick={() => recoverChat()}>
        Refresh chat
      </button>
      <button type="button" class="ghost dismiss-btn" onclick={() => (recoveryNotice = "")}>
        Dismiss
      </button>
    </p>
  {/if}
  {#if error}
    <p class="error">
      {error}
      <button type="button" class="ghost recover-btn" onclick={() => recoverChat()}>
        Refresh chat
      </button>
    </p>
  {/if}
  {#if streaming}
    <p class="streaming-banner">
      Agent is responding…
      <button type="button" class="ghost cancel-btn" onclick={cancelActiveStream}>
        Cancel
      </button>
    </p>
  {/if}

  <div class="chat-body">
    {#if dropOverlay}<div class="drop-overlay">Drop image to attach</div>{/if}
    <ConversationList agentId={agentId} />
    <div class="messages" bind:this={listEl} onscroll={onMessagesScroll} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop}>
      {#if historyHasMore}
        <button
          type="button"
          class="load-older"
          disabled={loadingOlder}
          onclick={loadOlderHistory}
        >
          {loadingOlder ? "Loading…" : "Load older messages"}
        </button>
      {/if}
      {#each displayGroups as group, groupIndex (group.key)}
        {#if group.type === "user" || group.type === "single"}
          {#each group.messages as msg, i (messageListKey(msg, i))}
            {@const userGroup = group.type === "user" ? group : resolveUserGroupForFailure(groupIndex)}
            {@const canRegenerate = group.type === "single" && isRegeneratableFailure(msg) && userGroup}
            {@render messageArticle(msg, canRegenerate ? { failedGroup: group, userGroup } : null)}
          {/each}
        {:else}
          <div class="turn-group">
            {#each group.visible as msg, i (messageListKey(msg, i))}
              {@const userGroup = resolveUserGroupForFailure(groupIndex)}
              {@const canRegenerate = isFailedTurnGroup(group) && isRegeneratableFailure(msg) && userGroup}
              {@render messageArticle(msg, canRegenerate ? { failedGroup: group, userGroup } : null)}
            {/each}
            {#if group.hiddenCount > 0}
              <button
                type="button"
                class="turn-expand"
                onclick={() => toggleTurnExpand(group.key)}
              >
                {expandedTurns[group.key]
                  ? "Show fewer"
                  : `Show all (${group.total} total)`}
              </button>
              {#if expandedTurns[group.key]}
                {#each group.hidden as msg, i (messageListKey(msg, `h-${i}`))}
                  {@render messageArticle(msg)}
                {/each}
              {/if}
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    {#if showMemory}
      <aside class="memory-panel">
        <h3>Memory</h3>
        <div class="memory-tabs">
          <button type="button" class:active={memoryTab === "blocks"} onclick={() => (memoryTab = "blocks")}>Blocks</button>
          <button type="button" class:active={memoryTab === "open"} onclick={() => (memoryTab = "open")}>Open files</button>
        </div>
        {#if memoryTab === "blocks"}
          {#each memoryBlocks as block}
            <div class="mem-block">
              <strong>{block.label}</strong>
              <pre>{block.value}</pre>
            </div>
          {/each}
        {:else}
          {#each openFiles as f}
            <div class="mem-block">
              <strong>{f.file_name || f.file_id}</strong>
              <pre>{f.summary || f.headline || "(no headline)"}</pre>
              <small>cursor: {f.cursor_char ?? 0}</small>
            </div>
          {:else}
            <p class="muted">No open files</p>
          {/each}
        {/if}
      </aside>
    {/if}
  </div>

  <footer class="input-area">
    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden bind:this={fileInput} onchange={onFilePick} />
    {#if pendingAttachment}
      <AttachmentThumbnail
        src={previewSrcForAttachment(pendingAttachment)}
        onRemove={clearAttachment}
        onView={() => openViewer(previewSrcForAttachment(pendingAttachment))}
      />
    {/if}
    {#if showUrlAttach}
      <div class="url-attach">
        <input type="url" bind:value={urlAttachInput} placeholder="Image URL" />
        <button type="button" onclick={attachFromUrl}>Fetch</button>
        <button type="button" class="ghost" onclick={() => (showUrlAttach = false)}>Cancel</button>
      </div>
    {/if}
    <div class="composer-row">
      <button
        type="button"
        class="attach-btn"
        title={visionCapable ? "Attach image" : "This agent's model can't see images. Switch to a vision-capable agent."}
        disabled={streaming || !visionCapable}
        onclick={() => fileInput?.click()}
      >📎</button>
      <button type="button" class="attach-btn" disabled={streaming || !visionCapable} onclick={() => (showUrlAttach = !showUrlAttach)}>URL</button>
      <textarea
        bind:value={input}
        onkeydown={onKeydown}
        onpaste={onPaste}
        placeholder="Message… (Cmd+Enter to send)"
        rows="2"
        disabled={streaming}
      ></textarea>
      <button onclick={send} disabled={streaming || (!input.trim() && !pendingAttachment)}>
        {streaming ? "Sending…" : "Send"}
      </button>
    </div>
  </footer>
  <ImageViewer src={viewerSrc} bind:open={viewerOpen} />
  <SystemContextModal
    bind:open={showSystemContext}
    content={systemContextContent}
    summary={systemContextSummary}
    loading={systemContextLoading}
    refreshing={systemContextRefreshing}
    refreshError={systemContextRefreshError}
    onRefresh={agentId && conversationId ? refreshSystemContext : null}
  />
</div>

{#snippet messageArticle(msg, regenerate = null)}
  <article class="msg {msg.role}">
    <div class="msg-header">
      <span class="role">{msg.role}</span>
      <span class="time">{formatDate(msg.date)}</span>
    </div>
    {#if msg.reasoning}
      <details class="reasoning">
        <summary>Reasoning</summary>
        <pre class="wrap">{msg.reasoning}</pre>
      </details>
    {/if}
    {#if msg.role === "reasoning"}
      <details class="reasoning">
        <summary>Reasoning</summary>
        {#if msg.content}
          <pre class="wrap">{msg.content}</pre>
        {/if}
      </details>
    {:else if msg.role === "tool_call" || msg.role === "tool_result"}
      {#if msg.role === "tool_result" && msg.toolDisplayImages?.length}
        <div class="tool-result-images-visible" aria-label="Tool result images">
          {#each msg.toolDisplayImages as item (item.key)}
            <button type="button" class="img-btn" onclick={() => openViewer(item.src)}>
              <img
                src={item.src}
                alt="Generated image from tool"
                loading="lazy"
                decoding="async"
                class="inline-img tool-result-img"
              />
            </button>
          {/each}
        </div>
      {/if}
      <details open={msg.role === "tool_result" ? false : !msg.collapsed}>
        <summary>
          {#if msg.toolName}
            {msg.role === "tool_call" ? "Tool call" : "Tool result"} · {msg.toolName}
          {:else}
            {msg.role === "tool_call" ? "Tool call" : "Tool result"}
          {/if}
        </summary>
        {#if msg.contentBlocks?.length}
          <div class="content blocks">
            {#if msg.content}
              <pre class="wrap">{msg.content}</pre>
            {/if}
          </div>
        {:else}
          <pre class="wrap">{msg.content}</pre>
        {/if}
      </details>
    {:else if msg.role === "error"}
      <div class="content error-text">{msg.content}</div>
      {#if msg.errorDetail && msg.errorDetail !== msg.content}
        <details class="injected-context">
          <summary>Upstream error (raw)</summary>
          <pre class="wrap">{msg.errorDetail}</pre>
        </details>
      {/if}
    {:else if msg.role === "agent"}
      <div class="content md">
        {#each splitAgentContent(msg.content) as part, pi (pi)}
          {#if part.type === "literal"}
            <pre class="letta-xml-block">{part.text}</pre>
          {:else if part.text.trim()}
            <div class="md-part">{@html renderAgentMarkdown(part.text)}</div>
          {/if}
        {/each}
      </div>
      {#if msg.injectedContextJson}
        <details class="injected-context">
          <summary>Provider failure record (JSON)</summary>
          <p class="injected-context-hint">
            Structured notice added to agent memory after a failed step — not the upstream SSE parse error.
          </p>
          <pre class="wrap">{msg.injectedContextJson}</pre>
        </details>
      {/if}
    {:else if msg.contentBlocks?.length}
      <div class="content blocks">
        {#if msg.content}
          <pre class="wrap">{msg.content}</pre>
        {/if}
        {#each msg.contentBlocks.filter((b) => b.type === "image") as img, i (i)}
          {@const src = imageSrcFromBlock(img)}
          {#if src}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <button type="button" class="img-btn" onclick={() => openViewer(src)}>
              <img src={src} alt="Message image" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="inline-img" />
            </button>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="content"><pre class="wrap">{msg.content}</pre></div>
    {/if}
    {#if regenerate || isDismissibleFailureMessage(msg)}
      <div class="msg-actions">
        {#if regenerate}
          <button
            type="button"
            class="regenerate-btn"
            title="Regenerate"
            disabled={streaming}
            onclick={() => regenerateTurn(regenerate.failedGroup, regenerate.userGroup)}
          >
            <span class="regenerate-icon" aria-hidden="true">↻</span>
            Regenerate
          </button>
        {/if}
        {#if isDismissibleFailureMessage(msg)}
          <button
            type="button"
            class="delete-btn"
            title="Remove this error from the chat"
            disabled={streaming}
            onclick={() => deleteChatMessage(msg)}
          >
            Delete
          </button>
        {/if}
      </div>
    {/if}
  </article>
{/snippet}

<style>
  .chat-layout {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 52px);
  }
  .chat-header {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #fff;
    border-bottom: 1px solid #ddd;
    align-items: center;
    flex-wrap: wrap;
  }
  .chat-header select {
    flex: 0 1 auto;
    max-width: 320px;
    min-width: 140px;
  }
  .memory-btn {
    font-size: 0.8rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid #ccc;
    background: #f9f9f9;
    border-radius: 4px;
  }
  .conv-id-btn {
    font-size: 0.72rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    padding: 0.35rem 0.5rem;
    border: 1px solid #e5e7eb;
    background: #fff;
    border-radius: 4px;
    color: #374151;
    flex-shrink: 0;
    width: max-content;
    max-width: 100%;
    white-space: nowrap;
    cursor: pointer;
  }
  .conv-id-btn:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }
  .chat-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }
  .messages {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .msg {
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    max-width: 85%;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .msg.user {
    align-self: flex-end;
    background: #eff6ff;
  }
  .msg.error {
    border-left: 3px solid #c62828;
    background: #ffebee;
  }
  .msg.agent:has(.msg-actions),
  .msg.error:has(.msg-actions) {
    border-left: 3px solid #f59e0b;
  }
  .msg-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.65rem;
    padding-top: 0.5rem;
    border-top: 1px solid #e5e7eb;
  }
  .regenerate-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.55rem;
    font-size: 0.8rem;
    color: #374151;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    cursor: pointer;
  }
  .regenerate-btn:hover:not(:disabled) {
    background: #f3f4f6;
    border-color: #9ca3af;
  }
  .regenerate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .delete-btn {
    padding: 0.3rem 0.55rem;
    font-size: 0.8rem;
    color: #991b1b;
    background: #fff;
    border: 1px solid #fca5a5;
    border-radius: 4px;
    cursor: pointer;
  }
  .delete-btn:hover:not(:disabled) {
    background: #fef2f2;
    border-color: #f87171;
  }
  .delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .regenerate-icon {
    font-size: 1rem;
    line-height: 1;
  }
  .error-text {
    color: #b71c1c;
    font-weight: 500;
  }
  .injected-context {
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }
  .injected-context-hint {
    margin: 0.25rem 0 0.5rem;
    color: #666;
    font-size: 0.8rem;
  }
  .injected-context pre {
    max-height: 240px;
    overflow: auto;
    background: #f5f5f5;
    padding: 0.5rem;
    border-radius: 4px;
  }
  .msg.agent {
    align-self: flex-start;
    width: 100%;
    max-width: 85%;
    min-width: 0;
  }
  .msg.tool_call,
  .msg.tool_result {
    align-self: stretch;
    max-width: 100%;
    background: #fafafa;
    border-style: dashed;
  }
  .tool-result-images-visible {
    margin: 0.5rem 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tool-result-img {
    max-height: 420px;
  }
  .turn-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .load-older,
  .turn-expand {
    align-self: flex-start;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 0.35rem 0.65rem;
    font-size: 0.8rem;
    color: #374151;
    cursor: pointer;
  }
  .load-older {
    align-self: center;
    margin: 0.25rem auto 0.75rem;
  }
  .load-older:disabled {
    opacity: 0.65;
    cursor: default;
  }
  .turn-expand:hover,
  .load-older:hover:not(:disabled) {
    background: #e5e7eb;
  }
  .msg-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.35rem;
  }
  .role {
    text-transform: uppercase;
    font-weight: 600;
  }
  .reasoning {
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    color: #6b7280;
    width: 100%;
    min-width: 0;
  }
  .reasoning pre {
    white-space: pre-wrap;
    word-break: normal;
    overflow-wrap: break-word;
    margin: 0.25rem 0 0;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
  .content pre,
  pre.wrap,
  pre.system-body {
    white-space: pre-wrap;
    word-break: normal;
    overflow-wrap: break-word;
    margin: 0;
    font-size: 0.9rem;
  }
  .system-context {
    font-size: 0.85rem;
    color: #6b7280;
  }
  .system-toggle {
    background: none;
    border: none;
    padding: 0;
    color: #6b7280;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
  }
  .system-toggle:hover {
    text-decoration: underline;
  }
  .msg.system {
    max-width: 100%;
    align-self: stretch;
    background: #f9fafb;
    border-style: dotted;
  }
  .content.md {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .content.md :global(p) {
    margin: 0.25rem 0;
  }
  .content.md :global(ul),
  .content.md :global(ol) {
    margin: 0.35rem 0;
    padding-left: 1.25rem;
  }
  .content.md pre.letta-xml-block {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    max-width: 100%;
    background: #f5f5f5;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    margin: 0.5rem 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.85rem;
    border: none;
  }
  .content.md .md-part :global(p:first-child) {
    margin-top: 0;
  }
  .content.md .md-part :global(p:last-child) {
    margin-bottom: 0;
  }
  .content.md :global(pre) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    max-width: 100%;
    overflow-x: auto;
    background: #f5f5f5;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }
  .content.md :global(pre code) {
    white-space: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .content.md :global(:not(pre) > code) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .memory-panel {
    width: 280px;
    border-left: 1px solid #ddd;
    background: #fff;
    padding: 1rem;
    overflow-y: auto;
  }
  .memory-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .memory-tabs button {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid #ccc;
    background: #f9f9f9;
    border-radius: 4px;
    cursor: pointer;
  }
  .memory-tabs button.active {
    background: #e8f0fe;
    border-color: #6b9bd1;
  }
  .mem-block {
    margin-bottom: 1rem;
  }
  .mem-block pre {
    white-space: pre-wrap;
    font-size: 0.8rem;
    background: #f5f5f5;
    padding: 0.5rem;
    border-radius: 4px;
  }
  .drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(59, 130, 246, 0.15);
    border: 2px dashed #3b82f6;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    pointer-events: none;
    font-weight: 600;
  }
  .composer-row { display: flex; gap: 0.5rem; align-items: flex-end; width: 100%; }
  .composer-row textarea { flex: 1; }
  .attach-btn { padding: 0.35rem 0.5rem; border: 1px solid #ccc; background: #f9f9f9; border-radius: 4px; }
  .url-attach { display: flex; gap: 0.5rem; width: 100%; margin-bottom: 0.5rem; }
  .url-attach input { flex: 1; }
  .inline-img { max-width: 480px; max-height: 360px; border-radius: 6px; margin-top: 0.5rem; display: block; }
  .img-btn { padding: 0; border: none; background: none; cursor: zoom-in; }
  .input-area {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #fff;
    border-top: 1px solid #ddd;
  }
  .input-area textarea {
    flex: 1;
    resize: none;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .input-area button {
    padding: 0.5rem 1.25rem;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
  }
  .input-area button:disabled {
    opacity: 0.5;
  }
  .error {
    color: #dc2626;
    margin: 0;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    background: #fef2f2;
    border-bottom: 1px solid #fecaca;
  }
  .recovery-notice {
    color: #92400e;
    margin: 0;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    background: #fffbeb;
    border-bottom: 1px solid #fde68a;
    font-size: 0.9rem;
  }
  .streaming-banner {
    margin: 0;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
    color: #374151;
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .recover-btn,
  .cancel-btn,
  .dismiss-btn {
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid #d1d5db;
    background: #fff;
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
  }
  .ghost {
    background: #fff;
  }
</style>
