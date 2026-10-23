# genieacs-nbi-mcp

[![CI](https://github.com/tempatsimpanku-pixel/genieacs-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/tempatsimpanku-pixel/genieacs-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/genieacs-nbi-mcp.svg)](https://www.npmjs.com/package/genieacs-nbi-mcp)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Let your LLM look at your TR-069 fleet, without letting it touch a single CPE.**

`genieacs-nbi-mcp` is a strictly **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server for the
[GenieACS](https://genieacs.com) northbound interface (NBI). It helps ISP/NOC staff ask an AI assistant questions such as
*which ONTs have not informed for a week, why does this CPE fault on provisioning, what firmware is on file* — using only HTTP `GET`.

> **Status:** v0.1, not yet published to npm. Install from source or a release tarball until then.
> Independent project; not affiliated with GenieACS. Sibling of [netscope-mcp](https://github.com/tempatsimpanku-pixel/netscope-mcp).

## Why read-only

The GenieACS NBI can reboot devices, factory-reset them, rewrite Wi-Fi settings and delete files. A hallucinated task is a
customer outage. This server makes observation the only mode:

- **GET only.** The HTTP verb is a constant in the client; there is no code path that sends anything else.
- **Guard before the network.** `POST/PUT/PATCH/DELETE`, `/devices/{id}/tasks`, tag paths and the `connection_request` flag are refused
  by policy *before* a request is built. Unknown collections, `..`, double slashes and absolute URLs are refused too.
- **Secrets stay home.** Wi-Fi keys, PPP/ACS passwords, SNMP communities and password-like assignments in provision scripts are masked;
  the NBI credentials are scrubbed from every output. Redaction is best-effort and based on parameter names (a heuristic, not a comprehensive guarantee); `redact: false` disables it.
- **Bounded.** Row limits, output size limit, body cap, timeouts, no redirects followed.

The guard is one layer. Also give this server an NBI account/proxy that only allows `GET` (see [SECURITY.md](SECURITY.md)).

## Quickstart

```sh
git clone https://github.com/tempatsimpanku-pixel/genieacs-mcp && cd genieacs-mcp
npm ci && npm run build

export GENIEACS_NBI_URL=http://acs.example.net:7557
# export GENIEACS_NBI_USER=noc GENIEACS_NBI_PASS=...   # only if the NBI needs basic auth
node dist/cli.js --check          # validates config and pings the NBI
```

Once published: `npx genieacs-nbi-mcp --check`.

MCP client entry (stdio):

```json
{
  "mcpServers": {
    "genieacs": {
      "command": "npx",
      "args": ["-y", "genieacs-nbi-mcp"],
      "env": { "GENIEACS_NBI_URL": "http://acs.example.net:7557" }
    }
  }
}
```

HTTP mode (shared server, bearer token ≥ 32 chars, loopback by default):

```sh
GENIEACS_MCP_TOKEN="$(openssl rand -hex 32)" genieacs-nbi-mcp --http 127.0.0.1:8080
```

## Tools

| Tool | NBI call | Purpose |
|---|---|---|
| `acs_devices` | `GET /devices` | List/search devices (`query`, `projection`, `limit`, `skip`, `sort`) |
| `acs_device` | `GET /devices?query={"_id":…}` | One device by exact `_id` |
| `acs_tasks` | `GET /tasks` | Queued operations (optionally per device) |
| `acs_faults` | `GET /faults` | Failed sessions / provisions |
| `acs_files` | `GET /files` | Firmware and config file metadata |
| `acs_presets` | `GET /presets` | Preset definitions |
| `acs_provisions` | `GET /provisions` | Provision scripts (secrets masked) |
| `acs_read` | `GET <path>` | Raw GET on a readable path; any other verb is refused |

Details and examples: [docs/TOOLS.md](docs/TOOLS.md). Configuration: [docs/CONFIG.md](docs/CONFIG.md).

## Compatibility

| Component | Supported |
|---|---|
| Node.js | >= 20 (CI: 22, 24; runtime smoke on 20) |
| GenieACS NBI | 1.2.x REST API (`/devices`, `/tasks`, `/faults`, `/files`, `/presets`, `/provisions`, `/virtualparameters`, `/objects`) — tested against a mock; verify on your version with `--check` |
| MCP transports | stdio, Streamable HTTP (stateless, JSON responses) |
| MCP clients | any client that speaks MCP 2025 revisions (Claude, Codex, Cursor, …) |
| Write operations | none, by design |

## Development

```sh
npm ci && npm run typecheck && npm run lint && npm test && npm run build
```

Tests use a local mock NBI; they never contact a real ACS. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Indonesian version: [README.id.md](README.id.md).
