# Tools

All tools are annotated `readOnlyHint: true` and only send HTTP `GET`. Every result carries `structuredContent`
`{ ok, data? , error? }`; failures set `isError`. Error kinds: `policy`, `auth`, `not_found`, `timeout`, `network`, `http`, `parse`, `too_large`.

List tools return `{ total?, count, items[] }`. `total` comes from the NBI `X-Total-Count` header. When the JSON would exceed
`max_output_bytes`, whole items are dropped and `truncated: true` is set — page with `skip`/`limit` or use a `projection`.

## Common arguments

| Argument | Meaning |
|---|---|
| `query` | GenieACS query as JSON object or string. Operators `$eq $ne $in $nin $gt $gte $lt $lte $exists $and $or $regex`. `$where`, `$function`, `$expr` … are refused |
| `projection` | Comma separated parameter paths, or an array. **Always set it for devices.** Only `A-Za-z0-9_.,*:-[]{}` |
| `limit`, `skip`, `sort` | Paging and ordering (`sort` is a JSON object such as `{"_lastInform":-1}`) |

## `acs_devices`
`GET /devices`. Examples:
```json
{ "query": { "_lastInform": { "$lt": "2026-10-15T00:00:00Z" } }, "projection": "_id,_lastInform", "limit": 20 }
{ "query": { "VirtualParameters.pppoeUsername": "budi.s@isp.example" }, "projection": "_id,InternetGatewayDevice.DeviceInfo.SerialNumber" }
```

## `acs_device`
`{ "id": "202BC1-BM632w-000001", "projection": "_id,InternetGatewayDevice.DeviceInfo" }` → one device or `not_found`.
Implemented as `GET /devices?query={"_id":…}&limit=1` (the NBI has no `GET /devices/{id}`).

## `acs_tasks`, `acs_faults`
Optional `device_id` adds `{"device": …}` to the query (merged with your own `query`). Faults carry `code`, `message`, `retries`, `timestamp`.

## `acs_files`
Metadata of stored firmware/config files; optional exact `filename`.

## `acs_presets`, `acs_provisions`
Definitions as stored. Password-like assignments in provision scripts are masked.

## `acs_read`
`{ "path": "/virtualparameters" }`. Allowed first segments: `devices tasks faults files presets provisions virtualparameters objects`.

Refused by policy (with a message, no network traffic):

| Attempt | Why |
|---|---|
| `method` other than GET (`POST`, `PUT`, `PATCH`, `DELETE`, …) | read-only |
| `/devices/{id}/tasks`, `/devices/{id}/tags/{tag}`, any deeper device sub-path | task creation / tag writes |
| `?connection_request` | makes the ACS contact the device |
| `//host/…`, `http://…`, `..` (also percent-encoded), backslash, control chars, `#` | SSRF / traversal |
| any other collection (`/ui`, `/admin`, …) | not a readable collection |

## Redaction

Values are masked when the parameter name looks like a secret (`Password`, `KeyPassphrase`, `PreSharedKey`, `…Community`, `…Token`, `Secret`, `ApiKey`),
for `_value` of GenieACS parameter nodes and for plain keys; free text assignments (`password = "…"`) and the NBI credentials are scrubbed too.
Names such as `Username` and `SSID` are kept so you can still identify a subscriber. Set `nbi.redact: false` to disable.
