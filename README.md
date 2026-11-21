# Vibe UI OSS

One place for the open-source Vibe desktop client and the pieces it ships with.

| Path | What it is | Upstream |
| --- | --- | --- |
| [`desktop/`](./desktop) | **Vibe UI OSS** — Electron + React desktop client for local `vibe-app-server` | this repo |
| [`cli/`](./cli) | Mistral Vibe CLI fork with **computer-use** MCP (macOS click / type / screenshot) | [`luke-h-code/mistral-hackathon`](https://github.com/luke-h-code/mistral-hackathon/tree/computer-use-mcp) `@computer-use-mcp` |
| [`baton/`](./baton) | Drive Vibe from your phone (ACP remote + voice) | [`sneldao/baton`](https://github.com/sneldao/baton) |

Stock Mistral **Vibe** and this app can run side by side — the desktop brand is intentionally **Vibe UI OSS**.

## Quick start (desktop)

```bash
git clone --recurse-submodules https://github.com/asideofcode/vibe-ui-oss.git
cd vibe-ui-oss/desktop
npm install
make run          # build UI, brand .app, launch (keep the terminal open)
```

Other desktop targets: `make start` · `make stop` · `make helper` · `make doctor`

## Submodules

```bash
git submodule update --init --recursive
# optional: track latest on the computer-use branch
git -C cli fetch origin computer-use-mcp && git -C cli checkout computer-use-mcp
```

## Layout

```
vibe-ui-oss/
├── desktop/     # Vibe UI OSS (Electron)
├── cli/         # vibe fork + computer-use MCP
└── baton/       # phone remote for Vibe
```
