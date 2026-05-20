# Contributing to letta-vision-client

Thank you for helping improve the project.

## Before you start

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design constraints (no bridge database, empirical limits only, SDK-first API access).
- Search existing issues and pull requests to avoid duplicate work.

## Development setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set LETTA_SERVER_PASSWORD

LETTA_BASE_URL=http://localhost:8283 \
  uvicorn backend.main:app --reload --port 8284

cd frontend && npm install && npm run dev
```

Run `npm install` only inside `frontend/`.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep changes focused; match existing naming and file layout.
3. Update [CHANGELOG.md](CHANGELOG.md) under **Unreleased** for user-visible changes.
4. Verify the Docker build when you touch packaging or frontend build:

   ```bash
   docker build -t letta-vision-client .
   ```

5. Open a PR with a clear description, test steps, and screenshots for UI changes.

## Code guidelines

- Prefer extending existing helpers (`letta_lists.py`, `sse.py`, `api.js`) over parallel implementations.
- Do not add list/history caps without documenting an observed failure mode in `docs/ARCHITECTURE.md` or project notes.
- The PyPI package `letta-client` is the official Letta SDK — keep that dependency name as-is.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0 (see [LICENSE](LICENSE)).
