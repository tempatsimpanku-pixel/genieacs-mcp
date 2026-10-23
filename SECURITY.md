# Security Policy

## Supported versions

Only the latest released minor version receives security fixes while the project is `0.x`.

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Use GitHub private vulnerability reporting
(*Security → Report a vulnerability*) on <https://github.com/tempatsimpanku-pixel/genieacs-mcp>. Include the affected
version, a minimal tool call or request that reproduces the problem, the impact you observed, and whether you want credit.
Do not include real credentials, real subscriber data or real ACS addresses.

Expect an acknowledgement within 72 hours and an assessment within 7 days; confirmed issues are normally fixed within 90 days.

## Scope

In scope:

- **Guard bypass**: any input that makes the server send a non-GET request, reach a path outside the readable collections
  (`/devices /tasks /faults /files /presets /provisions /virtualparameters /objects`), reach `/devices/{id}/tasks` or tag paths,
  or set the `connection_request` flag.
- **Redaction bypass**: secrets (Wi-Fi keys, PPP passwords, communities, the NBI credentials) appearing in tool output.
- **HTTP transport**: authentication bypass, Host/Origin check bypass, request smuggling, denial of service beyond the documented limits.
- SSRF through tool arguments (the server only ever contacts the configured `base_url`).

Out of scope: the security of GenieACS itself, a mis-scoped NBI account (see below), and attacks that need control of the host running the server.

## Defence in depth

The guard is one layer, not a sandbox. GenieACS NBI has no per-method permissions of its own, so:

- put the NBI behind a reverse proxy that **only allows GET** for the account this server uses, or bind the NBI to a private network;
- never expose the NBI port (7557) to the internet;
- use TLS in front of the NBI if credentials cross an untrusted network.
