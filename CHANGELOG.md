# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- DOMPurify sanitization for agent markdown in chat.
- Optional `VISION_MAX_UPLOAD_BYTES` upload cap; security response headers.
- Bounded chunked upload reads; basename-only upload filenames.

### Fixed

- Conversation list now paginates through all Letta conversations.
- `duplicate_handling` query param restricted to SDK-allowed values.

### Changed

- Renamed project from `letta-bridge` to `letta-vision-client`.
- Replaced editable Python package install with `requirements.txt`.
- Consolidated versioned specs into `docs/ARCHITECTURE.md`.

## [0.1.0] - 2026-05-20

### Added

- FastAPI backend proxying the Letta Python SDK (`letta-client`).
- Svelte 5 frontend: agents, multi-conversation chat (SSE), memory blocks, tools, models, folders/files.
- Docker image and standalone `docker-compose.yml`.
- Stress-test scripts for empirical limit discovery.

[Unreleased]: https://github.com/damonreed/letta-vision-client/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/damonreed/letta-vision-client/releases/tag/v0.1.0
