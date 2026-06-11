"""Recompile conversation system prompts after folder file changes."""

from __future__ import annotations

import logging

from backend.config import get_letta_client
from backend.letta_lists import collect_sync_page

logger = logging.getLogger(__name__)

DEFAULT_CONVERSATION_ID = "default"


def recompile_conversation(client, conversation_id: str, agent_id: str) -> str:
    """Recompile and persist the system message; return compiled text."""
    if conversation_id == DEFAULT_CONVERSATION_ID:
        return client.conversations.recompile(DEFAULT_CONVERSATION_ID, agent_id=agent_id)
    return client.conversations.recompile(conversation_id)


def recompile_agent_conversations(client, agent_id: str) -> int:
    """Recompile default + all named conversations for an agent. Returns success count."""
    count = 0
    try:
        recompile_conversation(client, DEFAULT_CONVERSATION_ID, agent_id)
        count += 1
    except Exception as exc:
        logger.warning(
            "Failed to recompile default conversation for agent %s: %s",
            agent_id,
            exc,
        )
    try:
        conversations = collect_sync_page(client.conversations.list(agent_id=agent_id))
        for conv in conversations:
            conv_id = conv.id if hasattr(conv, "id") else conv["id"]
            try:
                recompile_conversation(client, conv_id, agent_id)
                count += 1
            except Exception as exc:
                logger.warning("Failed to recompile conversation %s: %s", conv_id, exc)
    except Exception as exc:
        logger.warning("Failed to list conversations for agent %s: %s", agent_id, exc)
    return count


def recompile_conversations_for_folder(folder_id: str) -> dict[str, int]:
    """Recompile system context for every agent with this folder attached."""
    client = get_letta_client()
    agent_ids = collect_sync_page(client.folders.agents.list(folder_id))
    recompiled = 0
    for agent_id in agent_ids:
        recompiled += recompile_agent_conversations(client, agent_id)
    return {"agents": len(agent_ids), "recompiled": recompiled}


def recompile_conversations_for_folder_background(folder_id: str) -> None:
    """Best-effort folder context refresh after file mutations (non-blocking)."""
    try:
        stats = recompile_conversations_for_folder(folder_id)
        logger.info("Background context refresh for folder %s: %s", folder_id, stats)
    except Exception as exc:
        logger.warning("Background context refresh failed for folder %s: %s", folder_id, exc)
