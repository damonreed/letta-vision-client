# letta-vision-client stress tests

Scripts to probe Letta and the vision client under load. Use results to document **empirical** limits — not to justify preemptive caps.

## Setup

```bash
cd ..
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt httpx
```

Set `LETTA_BASE_URL` and `LETTA_SERVER_PASSWORD` (or use `.env` in the parent directory).

## Scripts

See individual `.py` files in this directory.
