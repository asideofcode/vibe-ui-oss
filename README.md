# Vibe UI OSS

Open pieces around [Mistral Vibe](https://github.com/mistralai/mistral-vibe): a desktop shell, macOS computer-use tools, and phone-side approvals — built by dogfooding the agent on its own stack.

Upstream Vibe stays the coding agent. Everything here is the surrounding craft.

---

## What’s in here

| Path | What it is |
| --- | --- |
| [`desktop/`](./desktop) | **Vibe UI OSS** — Electron + React desktop client for a local `vibe-app-server` |
| [`cli/`](./cli) | Vibe fork with a built-in **computer-use** MCP (screenshot, click, type, scroll on macOS) |
| [`baton/`](./baton) | Drive Vibe from your phone: ACP remote, voice, and mission-control stage view |

`cli/` and `baton/` are git submodules pointing at their upstream forks. `desktop/` lives in this repo.

---

## An open-source desktop UI

Stock Vibe is a terminal agent. **Vibe UI OSS** is a first-class macOS desktop shell for the same local server: chat, permissions, terminal, editor — branded separately so it can ship and evolve without colliding with the official app.

```bash
git clone --recurse-submodules https://github.com/asideofcode/vibe-ui-oss.git
cd vibe-ui-oss/desktop
npm install
make run          # build UI, brand .app, launch (keep the terminal open)
```

Other targets: `make start` · `make stop` · `make helper` · `make doctor`

---

## Eyes and hands on the Mac

The [`cli/`](./cli) submodule tracks a Vibe fork with a **computer-use** MCP: screenshot a display or window, click, type, press shortcuts, scroll, drag — the agent can operate visible apps when you allow it. Native Swift helper + Python MCP server; Accessibility and Screen Recording required.

Docs: [`cli/docs/computer-use-mcp.md`](./cli/docs/computer-use-mcp.md)

```bash
git submodule update --init --recursive
git -C cli fetch origin computer-use-mcp && git -C cli checkout computer-use-mcp
```

---

## Approvals in your pocket

[`baton/`](./baton) turns permission prompts into something you can answer from a phone: tap, swipe, voice (Voxtral), even nod/shake. Pair it with a projector `?stage` view when you’re demoing.

Upstream: [sneldao/baton](https://github.com/sneldao/baton)

---

## Layout

```
vibe-ui-oss/
├── desktop/   # Vibe UI OSS (Electron)
├── cli/       # vibe + computer-use MCP (submodule)
└── baton/     # phone remote (submodule)
```

---

## Philosophy

- **Dogfood first.** Features were exercised by running Vibe while building around Vibe.
- **Compose, don’t fork the world.** Desktop and tools speak the protocols Vibe already has.
- **Open where it helps.** UI, computer-use, and remote approvals are meant to be readable, runnable, and remixable.
