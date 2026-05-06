# CodexBridge Roadmap TODO

This document tracks the backlog that is still intentionally unfinished.
Completed items are removed from the active checklist instead of being left as
stale TODOs.

## Current Snapshot

Already landed and no longer part of the active backlog:

- `/review` for uncommitted changes and base-branch review
- `/agent` experimental Codex-first hybrid background jobs with draft-confirm, full-access Codex execution, verifier checks, and retry
- `/plan` session-level native planning mode toggle
- `/skills` visibility and on/off management
- `/apps` runtime connector browsing, auth hints, and enable/disable management
- `/plugins` visibility, aliasing, install/uninstall, and explicit plugin targeting
- `/mcp` status, auth, reload, and enable/disable management
- `/automation` draft-confirm flow and WeChat delivery-oriented scheduling
- Assistant records via `/as`, `/log`, `/todo`, `/remind`, and `/note`, including Codex-normalized natural-language record updates, `/up` attachment archival, and reminder claiming
- WeChat thread browsing with `/threads`, `/open`, `/search`, `/peek`, `/rename`
- Thread cleanup and organization flows such as archive/restore and pin/unpin
- Native-ish reconnect, retry, approval, and attachment delivery hardening

Architecture references now available:

- `reference/symphony` tracks OpenAI Symphony as the orchestration reference.
- `docs/architecture/codex-mission-control.md` defines how CodexBridge should
  adapt Symphony-style workflow, workspace, workpad, retry, and status concepts
  without replacing the chat-first WeChat control surface.

Important clarification:

- A separate `/resume` command is **not** a current priority because bridge UX
  already treats `/open <thread>` as the practical “resume this old session”
  path.
- A separate `/cwd` command is **not** a current priority because `/status`
  already exposes the current bound session and working-directory context well
  enough for now.

## Current Priority: Make WeChat a Stable Codex Terminal

The next phase should prioritize day-to-day runtime reliability and native
Codex output quality over adding more bridge-only command surface area.

### P0: WeChat runtime reliability

- [ ] Keep improving native approval, interrupted-turn, reconnect, and retry handling around long-running tasks
- [ ] Stabilize WeChat preview/final delivery around send-budget limits, `ret:-2`, and long-reply recovery
- [ ] Ensure plugin/auth/unavailable-capability failures always surface as clear chat-visible guidance instead of silent stalls
- [ ] Keep parser/helper/internal bridge threads hidden from normal thread browsing and automatically cleaned up
- [ ] Keep `/open`, `/threads`, and `/status` optimized for fast real-world session recovery instead of adding redundant resume-style commands

### P1: Native output and delivery quality

- [ ] Continue expanding provider-native artifact delivery instead of adding more bridge-only glue
- [ ] Support more Codex-native output kinds with consistent attachment metadata and delivery policy
- [ ] Keep refining file delivery defaults so generated artifacts feel like first-class Codex outputs
- [ ] Improve model / usage / thread introspection where Codex already exposes reliable primitives
- [ ] Read project-local `.codex` environment metadata so shared local environment setup can inform bridge runs

### P2: Assistant and desktop follow-through

- [ ] Keep improving assistant-record, reminder, and automation delivery quality on WeChat
- [ ] Add optional sync targets for assistant records, such as Notion, Google Drive, or Calendar, while keeping local records as source of truth
- [ ] Design a browser-preview workflow that approximates Codex app browser comments and browser-use results in chat
- [ ] Design a companion-based computer-use workflow for desktop GUI tasks with explicit approvals and app allowlists
- [ ] Decide whether these desktop-native abilities belong in CodexBridge itself or in a separate local companion service

### P2: Codex Mission Control

- [ ] Treat `/agent` as the Mission Control v0 surface instead of adding a new `/mission` command too early
- [ ] Add `.codexbridge/mission/WORKFLOW.md` loading with YAML front matter plus prompt body, using Symphony's workflow-contract pattern
- [ ] Add a persistent mission workpad to background jobs so `/agent show` can expose plan, acceptance criteria, validation, notes, blockers, and final handoff
- [ ] Add workspace isolation for code-changing long-running jobs under `~/.codexbridge/mission/workspaces/<missionId>/`
- [ ] Add a bounded runner loop for mission jobs: run, verify, repair/retry, block or complete
- [ ] Keep WeChat as the notification and control entrypoint while allowing future GitHub/Linear issue sources
- [ ] Keep Symphony as a reference implementation only; do not vendor its Elixir runtime into CodexBridge

### Guardrail

- [ ] Do not prioritize new bridge-only slash commands ahead of high-value native Codex parity work unless the native layer is unavailable
- [ ] Do not add bridge-only aliases when existing commands already cover the user need well enough, such as `/open` for resume-style continuation or `/status` for cwd/session inspection

## Later Direction: Telegram Runtime

The bridge-side Telegram plugin contract exists, but the real transport stack is
still a later-phase item.

- [ ] Add a real Telegram inbound poller or webhook runtime
- [ ] Add real Telegram outbound transport for text, typing, media, and files
- [ ] Wire Telegram runtime into the same persisted bridge-session flow used by WeChat
- [ ] Verify the same bridge session can be continued across WeChat and Telegram end-to-end

## Later Direction: Additional Codex-Compatible Providers

The generic OpenAI-compatible Responses adapter is now the preferred bridge
path for non-OpenAI providers that expose Chat Completions-shaped APIs. It
covers compact fallback, SSE tool-call repair, CLIProxyAPI-style WebSocket
transcript repair primitives, thinking policy, payload compatibility, error
mapping, SSE framing, usage fallback, multimodal capability flags, and model
capability metadata.

- [x] Add generic OpenAI-compatible Responses adapter primitives
- [x] Add configuration-only OpenAI-compatible provider profile loader
- [x] Move DeepSeek and MiniMax onto the generic `openai-compatible` provider path
- [x] Port CLIProxyAPI-style model capability catalog for Codex, DeepSeek, MiniMax, Qwen, iFlow, Kimi, OpenRouter, Gemini/AI Studio/Vertex, Claude, and Antigravity model families
- [x] Convert model differences into capability/payload/thinking rules instead of dedicated provider plugins
- [x] Add generic translator repairs for MiniMax consecutive tool calls, iFlow boolean thinking flags, and Kimi upstream model alias rewrite
- [x] Add gated live-provider smoke tests for DeepSeek, MiniMax, Qwen, and OpenRouter
- [x] Validate DeepSeek against the real upstream API through the local Responses adapter
- [x] Port CLIProxyAPI WebSocket transcript/tool-call repair into a tested local module
- [ ] Validate MiniMax, Qwen, and OpenRouter against real upstream APIs when credentials are available
- [ ] Validate provider-specific catalogs, defaults, and real usage reporting against live providers
- [ ] Verify provider switching boundaries under real runtime conditions
- [ ] Keep runtime WebSocket disabled until the adapter server has a real upgrade handler; the repair logic is now ready for that future path

## Engineering Hardening

These are quality improvements, not current product blockers.

- [ ] Reduce `any` in edge adapters and test scaffolding
- [ ] Tighten null handling where it adds real signal
- [ ] Remove remaining transitional typing workarounds when feature churn settles
- [ ] Incrementally strengthen compiler settings after behavior remains stable
