# letta-vision-client

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Web UI for self-hosted [Letta](https://github.com/letta-ai/letta): agents, conversations, chat (SSE), memory blocks, tools, models, and file sources.

Designed for operators running their own Letta server — a lightweight alternative to cloud ADE workflows, with Letta’s distinctive features visible rather than hidden behind a generic chat shell.

## Features

- Agent list, create, edit, delete
- Multi-conversation chat with streaming (SSE)
- Per-agent and global memory blocks (attach, detach, read-only)
- Tools and model / embedding selection
- Folder and file sources

## Quick start (Docker)

### Standalone (Letta already running)

```bash
cp .env.example .env   # set LETTA_SERVER_PASSWORD
docker compose up -d --build
```

Open http://localhost:8284

### With [letta-vision-deploy](https://github.com/damonreed/letta-vision-deploy)

With this repo cloned as sibling `../letta-vision-client`:

```bash
cd ../letta-vision-deploy
docker compose up -d --build
```

## Local development

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
LETTA_BASE_URL=http://localhost:8283 uvicorn backend.main:app --reload --port 8284

cd frontend && npm install && npm run dev
```

The Vite dev server proxies `/api` to port 8284.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design, API surface, Docker, limits policy |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development and PR guidelines |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LETTA_BASE_URL` | `http://letta:8283` | Letta server URL |
| `LETTA_SERVER_PASSWORD` | *(required)* | Letta API password |
| `VISION_MAX_UPLOAD_BYTES` | `0` | Upload size cap (`0` = unlimited) |

## License

Apache License 2.0 — see [LICENSE](LICENSE).
