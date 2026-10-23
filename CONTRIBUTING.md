# Contributing

Thanks for helping. genieacs-nbi-mcp is a **read-only** MCP server for the GenieACS NBI; the security model matters more than features.

## Setup

```sh
node -v        # 22 or 24 for development (the shipped code supports Node >= 20)
npm ci
npm run typecheck && npm run lint && npm test && npm run build
```

Tests run against a local mock NBI (`test/helpers/mock-nbi.ts`). **Never point tests at a real ACS.**

## Rules

- **Read-only is a hard requirement.** Changes that add write capability (tasks, tags, parameter writes, `refreshObject`, file upload, delete) are rejected. Guard changes need tests for both allowed and refused forms.
- **No real data.** Fixtures and docs use dummy device IDs, serials, hosts (`acs.example.net`, RFC 5737 addresses) and PPPoE usernames at `isp.example`.
- Keep PRs small and focused; update `CHANGELOG.md` under `Unreleased`.
- Commit messages: imperative mood (`fix: reject encoded dot segments`). Sign off with `git commit -s` (DCO).

## Security issues

Do not open a public issue. See `SECURITY.md`.

## License

By contributing you agree your contribution is licensed under Apache-2.0.
