# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-23

### Added
- Read-only MCP server for the GenieACS NBI with eight tools: `acs_devices`, `acs_device`, `acs_tasks`, `acs_faults`, `acs_files`, `acs_presets`, `acs_provisions` and the raw `acs_read`.
- Read-only guard: the client can only issue GET; write verbs, `/devices/{id}/tasks`, tag paths and the `connection_request` flag are refused by policy before any request is made.
- Redaction of Wi-Fi keys, PPP/ACS passwords, communities and password-like assignments in provision scripts; the NBI credentials themselves are scrubbed from every output.
- YAML configuration plus `GENIEACS_NBI_URL` / `GENIEACS_NBI_USER` / `GENIEACS_NBI_PASS`; `--check` validates the configuration and pings the NBI.
- stdio and Streamable HTTP transports (bearer token, Host/Origin checks, rate and body limits).
