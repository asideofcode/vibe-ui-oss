# Vibe UI OSS

**We used Vibe to improve Vibe** — then opened up the pieces so anyone can run them.

This monorepo is what came out of a Mistral Vibe hackathon: dogfooding the agent on its own stack, shipping an open desktop shell, teaching it to drive the Mac, and handing approvals to your phone. Upstream Vibe stays the coding agent. Everything here is the surrounding craft — UI, tools, and a feature that lets the model clean up its own context.

---

## The idea

Coding agents get noisy. Long sessions fill with wrong assumptions, stale plans, and tool chatter that the model keeps re-reading. We wanted two things at once:

1. **A better loop for the agent itself** — edit the conversation in place instead of starting over.
2. **A better surface for humans** — a real desktop client, screen control when you ask for it, and remote approvals when you’re not at the keyboard.

So we built against the same `vibe-app-server` / ACP stack Vibe already speaks, and kept the brand honest: **Vibe UI OSS** can sit next to stock Mistral Vibe without pretending to replace it.

---

## What’s in here

| Path | What it is |
| --- | --- |
| [`desktop/`](./desktop) | **Vibe UI OSS** — Electron + React desktop client for a local `vibe-app-server` |
| [`cli/`](./cli) | Vibe fork with a built-in **computer-use** MCP (screenshot, click, type, scroll on macOS) |
| [`context-denoising/`](./context-denoising) | Patched Vibe with `/context-denoising` — surgically edit saved chat history — plus the concept-video source |
| [`baton/`](./baton) | Drive Vibe from your phone: ACP remote, voice, and mission-control stage view |

`cli/` and `baton/` are git submodules pointing at their upstream forks. `desktop/` and `context-denoising/` live in this repo.

---

## Using Vibe to improve Vibe

The flagship experiment is **context denoising**.

You run a normal session, then tell the agent what’s wrong with the *history* — not the code:

```text
/context-denoising the assistant keeps assuming my event is casual
```

An editor model rewrites earlier turns in place: wrong assumptions get replaced or masked, phrasing you care about stays, tool calls and reasoning stay untouched. Run it again and it reads the *latest* saved conversation, including previous denoisings. History updates where you left it; nothing is reordered or silently deleted.

That’s the dogfood story in one command: Vibe edits Vibe’s own context so the next turn is cleaner.

- App + notes: [`context-denoising/`](./context-denoising) (see `SHARING-NOTES.txt` and `mistral-vibe/HOW_TO_TEST.md`)
- Concept video source: [`context-denoising/video-source/`](./context-denoising/video-source)

```bash
cd context-denoising/mistral-vibe
uv sync
make run
```

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

[`baton/`](./baton) turns permission prompts into something you can answer from a phone: tap, swipe, voice (Voxtral), even nod/shake. Pair it with a projector `?stage` view when you’re demoing. It’s the remote half of a agent you don’t want glued to one desk.

Upstream: [sneldao/baton](https://github.com/sneldao/baton)

---

## Layout

```
vibe-ui-oss/
├── desktop/              # Vibe UI OSS (Electron)
├── cli/                  # vibe + computer-use MCP (submodule)
├── baton/                # phone remote (submodule)
└── context-denoising/    # /context-denoising patch + video source
    ├── mistral-vibe/
    ├── video-source/
    └── SHARING-NOTES.txt
```

---

## Philosophy

- **Dogfood first.** The features we care about were exercised by running Vibe on Vibe.
- **Compose, don’t fork the world.** Desktop and tools speak the protocols Vibe already has.
- **Open where it helps.** UI, computer-use, denoising, and remote approvals are meant to be readable, runnable, and remixable.

If you’re here for one thing: start with `/context-denoising` or `desktop/` `make run`. Everything else is the same bet — make the agent more useful without locking the human out of the loop.
