# Agent Explorer

A browser-based explorer for agent session logs. Open a JSONL file and browse the full session across three linked views: a chronological timeline, a conversation view, and an event detail inspector.

Parsing runs entirely in the browser — nothing is uploaded.

## Features

- **Flexible layout** — resizable timeline, conversation, and detail views
- **Auto-detecting parsers** — automatically select the most sensible parser for the opened file
- **Timeline** — filter by category, search, keyboard navigation (↑/↓), and optional highlighting of events that share the same request
- **Conversation** — virtualized message list with user/assistant bubbles, thinking blocks, and expandable tool call / result cards with pair highlighting
- **Detail panel** — session metadata, event summary, token usage & estimated cost, and raw JSON viewer
- **Theme** — light / dark mode with system preference support

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 23+
- [pnpm](https://pnpm.io/) 10+

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Open the URL printed by Vite (typically `http://localhost:5173`).

### Other scripts

```bash
pnpm build    # production build
pnpm preview  # preview the production build
pnpm test     # run tests
pnpm lint     # run oxlint
```

## Supported file formats

The app inspects the first lines of a JSONL file and picks the best-matching adapter. If no format scores above the detection threshold, loading fails with an error.

| Format | Description |
|--------|-------------|
| Claude Code transcript | Per-line `user` / `assistant` events with `message.content` blocks |
| Codex rollout | Envelope records such as `session_meta`, `turn_context`, `event_msg`, and `response_item` |
| Pi session | Tree-structured Pi agent sessions with messages, tool calls/results, model changes, compactions, branch summaries, and extension entries |

Support of more file formats is on the way.

## License

MIT — see [LICENSE](LICENSE).
