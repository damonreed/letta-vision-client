from typing import Any, List, Literal, Union

from pydantic import BaseModel, Field


class AgentSummary(BaseModel):
    id: str
    name: str
    model: str | None = None
    created_at: str | None = None


class CreateAgentRequest(BaseModel):
    name: str
    model: str
    embedding: str
    persona: str = ""
    human: str = ""
    tools: list[str] = Field(default_factory=list)
    context_window_limit: int | None = None
    per_file_view_window_char_limit: int | None = None


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    model: str | None = None
    embedding: str | None = None
    context_window_limit: int | None = None
    per_file_view_window_char_limit: int | None = None


class ImageSourceBlock(BaseModel):
    type: Literal["base64"] = "base64"
    media_type: str
    data: str


class TextContentBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str


class ImageContentBlock(BaseModel):
    type: Literal["image"] = "image"
    source: ImageSourceBlock


ContentBlock = Union[TextContentBlock, ImageContentBlock]


class SendMessageRequest(BaseModel):
    content: Union[str, List[ContentBlock]]


class UpdateBlockRequest(BaseModel):
    value: str


class CreateBlockRequest(BaseModel):
    label: str
    value: str
    # Letta memory-block character budget (platform field), not a bridge list cap.
    limit: int = 100000
    description: str | None = None
    read_only: bool = False


class GlobalCreateBlockRequest(BaseModel):
    label: str
    value: str
    description: str | None = None
    # Letta memory-block character budget (platform field), not a bridge list cap.
    limit: int = 100000
    read_only: bool = False


class GlobalUpdateBlockRequest(BaseModel):
    value: str | None = None
    description: str | None = None
    limit: int | None = None
    read_only: bool | None = None


class AttachToolRequest(BaseModel):
    tool_id: str


class CreateConversationRequest(BaseModel):
    name: str | None = None


class UpdateConversationRequest(BaseModel):
    name: str


class ConversationSummary(BaseModel):
    id: str
    agent_id: str
    name: str | None = None
    is_default: bool = False
    last_message_at: str | None = None
    last_message_preview: str | None = None
    created_at: str | None = None


class CreateFolderRequest(BaseModel):
    name: str
    description: str = ""
    embedding: str


class McpStdioConfig(BaseModel):
    mcp_server_type: Literal["stdio"] = "stdio"
    command: str
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] | None = None


class McpSseConfig(BaseModel):
    mcp_server_type: Literal["sse"] = "sse"
    server_url: str
    auth_header: str | None = None
    auth_token: str | None = None
    custom_headers: dict[str, str] | None = None


class McpStreamableHttpConfig(BaseModel):
    mcp_server_type: Literal["streamable_http"] = "streamable_http"
    server_url: str
    auth_header: str | None = None
    auth_token: str | None = None
    custom_headers: dict[str, str] | None = None


McpServerConfig = Union[McpStdioConfig, McpSseConfig, McpStreamableHttpConfig]


class CreateMcpServerRequest(BaseModel):
    server_name: str
    config: McpServerConfig


class UpdateMcpServerRequest(BaseModel):
    server_name: str | None = None
    config: McpServerConfig | None = None


class McpRefreshRequest(BaseModel):
    agent_id: str | None = None


class FetchImageUrlRequest(BaseModel):
    url: str


class FetchImageUrlResponse(BaseModel):
    media_type: str
    data: str


class ErrorResponse(BaseModel):
    error: str


def serialize(obj: Any) -> Any:
    """Convert SDK models to JSON-serializable dicts."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if hasattr(obj, "dict"):
        return obj.dict()
    return obj
