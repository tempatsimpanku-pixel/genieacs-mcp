# Configuration

Configuration comes from an optional YAML file (`--config genieacs.yaml`) and the environment. The file may be omitted when
`GENIEACS_NBI_URL` is set. Start from [`genieacs.example.yaml`](../genieacs.example.yaml).

## Environment

| Variable | Purpose |
|---|---|
| `GENIEACS_NBI_URL` | NBI base URL; overrides `nbi.base_url` |
| `GENIEACS_NBI_USER`, `GENIEACS_NBI_PASS` | HTTP basic credentials. Both or neither. Names can be changed with `nbi.auth.user_env` / `pass_env` |
| `GENIEACS_MCP_TOKEN` / `GENIEACS_MCP_TOKEN_FILE` | Bearer token for `--http` (>= 32 characters; the file must be mode 0600) |

Passwords are never read from the YAML file: a `password:` key is rejected as an unknown key.

## `nbi` keys

| Key | Default | Meaning |
|---|---|---|
| `base_url` | — | `http(s)://host:7557`, optional path prefix, no credentials/query/fragment, trailing slashes stripped |
| `auth.user_env`, `auth.pass_env` | `GENIEACS_NBI_USER`, `GENIEACS_NBI_PASS` | Names of the environment variables holding the credentials |
| `timeout_ms` | `15000` | Per request, 500–120000 |
| `default_limit` | `50` | Rows when a call gives no `limit` |
| `max_limit` | `500` | Upper bound for any `limit`; must be >= `default_limit` |
| `max_output_bytes` | `200000` | Tool results are trimmed (whole items) to fit |
| `redact` | `true` | Mask secrets in device data. Disable only on a trusted, private setup |

Unknown keys are errors. Error messages name the key, never the value. A warning is printed when basic credentials would
travel over plain `http` to a non-private host.

## CLI

```
genieacs-nbi-mcp [--config file] [--http host:port] [--allow-remote] [--allowed-host h] [--allowed-origin o] [--check]
```

- `--check` validates the configuration, calls `GET /devices?limit=1&projection=_id`, prints the result and exits 0/1.
- `--http` serves Streamable HTTP at `/mcp`. Host header allowlist, Origin refusal (browsers), bearer token (constant time),
  POST only, 60 requests/min, 4 MB body limit. Binding a non-loopback address needs `--allow-remote`; terminate TLS in front.

## TLS

The server uses Node's `fetch`. To trust a private CA use `NODE_EXTRA_CA_CERTS=/path/ca.pem`. Certificate verification
can not be disabled from this configuration on purpose.
