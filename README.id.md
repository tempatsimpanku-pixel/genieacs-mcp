# genieacs-nbi-mcp

[![CI](https://github.com/tempatsimpanku-pixel/genieacs-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/tempatsimpanku-pixel/genieacs-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/genieacs-nbi-mcp.svg)](https://www.npmjs.com/package/genieacs-nbi-mcp)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Biarkan LLM melihat armada TR-069 Anda, tanpa memberinya kuasa mengubah satu CPE pun.**

`genieacs-nbi-mcp` adalah server [Model Context Protocol](https://modelcontextprotocol.io) yang **hanya-baca** untuk
northbound interface (NBI) [GenieACS](https://genieacs.com). Membantu NOC/ISP bertanya ke asisten AI: *ONT mana yang
tidak inform seminggu, kenapa CPE ini fault saat provisioning, firmware apa yang tersimpan* — hanya lewat HTTP `GET`.

> **Status:** v0.1, belum dipublikasikan ke npm. Pasang dari sumber atau tarball rilis dulu.
> Proyek independen; tidak berafiliasi dengan GenieACS. Saudara dari [netscope-mcp](https://github.com/tempatsimpanku-pixel/netscope-mcp).

## Kenapa hanya-baca

NBI GenieACS bisa me-reboot perangkat, factory reset, menimpa setelan Wi-Fi, dan menghapus berkas. Satu task halusinasi
berarti pelanggan putus. Server ini menjadikan observasi satu-satunya mode:

- **Hanya GET.** Verba HTTP adalah konstanta di klien; tidak ada jalur kode yang mengirim hal lain.
- **Guard sebelum jaringan.** `POST/PUT/PATCH/DELETE`, `/devices/{id}/tasks`, path tag, dan flag `connection_request` ditolak
  oleh kebijakan *sebelum* request dibuat. Koleksi tak dikenal, `..`, double slash, dan URL absolut juga ditolak.
- **Rahasia tidak keluar.** Kunci Wi-Fi, password PPP/ACS, community SNMP, dan isian mirip password di skrip provision disamarkan;
  kredensial NBI dibersihkan dari semua keluaran.
- **Terbatas.** Batas baris, ukuran keluaran, ukuran body, timeout; redirect tidak diikuti.

Guard hanya satu lapis. Berikan juga akun/proxy NBI yang hanya mengizinkan `GET` (lihat [SECURITY.md](SECURITY.md)).

## Mulai cepat

```sh
git clone https://github.com/tempatsimpanku-pixel/genieacs-mcp && cd genieacs-mcp
npm ci && npm run build

export GENIEACS_NBI_URL=http://acs.example.net:7557
# export GENIEACS_NBI_USER=noc GENIEACS_NBI_PASS=...   # hanya bila NBI memakai basic auth
node dist/cli.js --check          # validasi konfigurasi dan ping NBI
```

Setelah terbit: `npx genieacs-nbi-mcp --check`.

Entri klien MCP (stdio):

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

Mode HTTP (server bersama, bearer token ≥ 32 karakter, bawaan loopback):

```sh
GENIEACS_MCP_TOKEN="$(openssl rand -hex 32)" genieacs-nbi-mcp --http 127.0.0.1:8080
```

## Tools

| Tool | Panggilan NBI | Fungsi |
|---|---|---|
| `acs_devices` | `GET /devices` | Daftar/cari perangkat (`query`, `projection`, `limit`, `skip`, `sort`) |
| `acs_device` | `GET /devices?query={"_id":…}` | Satu perangkat berdasarkan `_id` persis |
| `acs_tasks` | `GET /tasks` | Antrean operasi (opsional per perangkat) |
| `acs_faults` | `GET /faults` | Sesi/provision yang gagal |
| `acs_files` | `GET /files` | Metadata firmware dan berkas konfigurasi |
| `acs_presets` | `GET /presets` | Definisi preset |
| `acs_provisions` | `GET /provisions` | Skrip provision (rahasia disamarkan) |
| `acs_read` | `GET <path>` | GET mentah pada path yang boleh dibaca; verba lain ditolak |

Rincian dan contoh: [docs/TOOLS.md](docs/TOOLS.md). Konfigurasi: [docs/CONFIG.md](docs/CONFIG.md).

## Kompatibilitas

| Komponen | Didukung |
|---|---|
| Node.js | >= 20 (CI: 22, 24; smoke runtime di 20) |
| NBI GenieACS | REST API 1.2.x (`/devices`, `/tasks`, `/faults`, `/files`, `/presets`, `/provisions`, `/virtualparameters`, `/objects`) — diuji dengan mock; verifikasi di versi Anda lewat `--check` |
| Transport MCP | stdio, Streamable HTTP (stateless, respons JSON) |
| Klien MCP | klien MCP apa pun (Claude, Codex, Cursor, …) |
| Operasi tulis | tidak ada, sengaja |

## Pengembangan

```sh
npm ci && npm run typecheck && npm run lint && npm test && npm run build
```

Tes memakai mock NBI lokal; tidak pernah menghubungi ACS sungguhan. Lihat [CONTRIBUTING.md](CONTRIBUTING.md).

## Lisensi

Apache-2.0. Lihat [LICENSE](LICENSE) dan [NOTICE](NOTICE).
