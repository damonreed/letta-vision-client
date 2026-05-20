# Security Policy

## Scope

`letta-vision-client` is a **local-trust** operator UI for a self-hosted Letta server. It does not implement its own user authentication today; anyone who can reach port 8284 can use the UI, and the app uses your Letta server password to call the API.

Do not expose it to the public internet without additional network controls (VPN, reverse proxy auth, firewall rules).

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Use [GitHub Security Advisories](https://github.com/damonreed/letta-vision-client/security/advisories/new) for this repository, or contact the maintainers privately if you do not have GitHub access.

Include:

- Description of the issue and impact
- Steps to reproduce
- Your environment (Letta version, vision-client version, deployment mode)

We aim to acknowledge reports within 48 hours and provide a fix or mitigation timeline within 7 days when possible.

## Operational guidance

- Never commit `.env` files or Letta passwords to version control.
- Run behind localhost or a trusted network unless you add explicit auth in front of the service (reverse proxy, VPN, firewall).
- Set `VISION_MAX_UPLOAD_BYTES` on any host reachable beyond a single operator machine.
- Agent messages are rendered as HTML (markdown); the UI sanitizes with DOMPurify — keep the dependency updated.
- Keep `letta-client` and other dependencies updated when rebuilding images.
