# Codex Mission Control

Codex Mission Control is the next orchestration layer above CodexBridge chat
commands. It should turn user intent, schedules, and tracker items into
observable Codex work runs instead of treating every request as an isolated chat
turn.

This design follows the parts of OpenAI Symphony that fit CodexBridge:

- a repository-owned workflow contract
- isolated workspaces for long-running work
- bounded background execution
- a persistent workpad for status and handoff
- explicit validation and retry policy
- chat-visible status instead of silent daemon behavior

Reference copy:

- `reference/symphony`
- Upstream: `https://github.com/openai/symphony`

## Product Goal

Mission Control should let a WeChat user say:

```text
/agent 帮我修复 CodexBridge 微信 preview 卡死问题，完成后给我测试结果
/auto 每天早上 8 点检查助理记录和逾期事项，发到微信
```

and get a managed work item with:

- current status
- execution workspace
- attempt count
- plan and acceptance criteria
- latest result or blocker
- retry / stop / delete controls
- final delivery through the normal CodexBridge SendGate

The user should not need to understand Linear, GitHub, worktrees, app-server
protocols, or artifact manifests to operate the system.

## What Symphony Contributes

Symphony is not copied as runtime code. It is used as an orchestration pattern.

Useful patterns:

- `WORKFLOW.md` front matter plus prompt body is the workflow contract.
- The orchestrator is a scheduler/runner, not the owner of business logic.
- Every work item gets an isolated workspace.
- The agent owns detailed ticket/workpad updates through tools.
- The runner owns concurrency, retries, cancellation, lifecycle hooks, and
  structured logs.
- A run can end at a handoff state, not necessarily final completion.

Patterns not copied directly:

- Linear-only issue polling as the only input source.
- Elixir/OTP implementation details.
- PR landing workflow as the only successful outcome.
- No rich UI. CodexBridge needs a chat-first status surface, and may later add a
  web control plane.

## Current CodexBridge Mapping

Existing pieces already cover part of Mission Control:

- `/agent`: manual background job creation, confirmation, full-access run,
  verification, retry, stop, rename, delete, export, and send.
- `/auto`: scheduled job creation and WeChat delivery-oriented recurring runs.
- `/review`: native Codex review as a focused work run.
- `/threads`, `/open`, `/status`, `/retry`, `/reconnect`: session recovery and
  runtime diagnosis.
- `TurnArtifactDeliveryState`: provider-native and bridge-declared artifact
  handoff.
- `AgentJob`: current persisted unit for background agent work.

Main missing abstraction:

- There is no unified `Mission` model that can represent manual agent jobs,
  scheduled automation runs, tracker issues, and future desktop/browser tasks.

## Target Architecture

### 1. Mission Source Layer

Mission sources normalize incoming work into the same domain model.

Initial sources:

- WeChat slash commands: `/agent`, `/auto`, future `/mission`
- assistant records: todos/reminders promoted to work
- local scheduled automation

Later sources:

- GitHub issues
- Linear issues
- Notion tasks
- Google Drive / Docs task lists

### 2. Workflow Contract Layer

Mission Control should support a project-local workflow file:

```text
.codexbridge/mission/WORKFLOW.md
```

Recommended shape:

```md
---
workspace:
  root: ~/.codexbridge/mission/workspaces
agent:
  max_concurrent: 3
  max_turns: 8
  max_attempts: 2
codex:
  provider_profile: openai-default
  access_preset: full-access
  approval_policy: never
  sandbox_mode: danger-full-access
delivery:
  target: weixin
  final_only: false
---

You are running a CodexBridge Mission.

Mission:
{{ mission.title }}

Goal:
{{ mission.goal }}

Acceptance Criteria:
{{ mission.acceptanceCriteria }}

Rules:
- Keep the mission workpad updated.
- Validate before reporting completion.
- If blocked, explain the blocker and required human action.
- Return final result through CodexBridge only; do not bypass SendGate.
```

If this file is missing, CodexBridge should use a built-in safe default. Invalid
YAML should not break normal bridge startup; it should block only mission runs
that depend on that workflow.

### 3. Mission Model

`AgentJob` can remain the v0 execution record, but the target abstraction should
be:

```ts
type MissionStatus =
  | "draft"
  | "queued"
  | "planning"
  | "running"
  | "verifying"
  | "repairing"
  | "blocked"
  | "completed"
  | "failed"
  | "stopped"
  | "archived";

type MissionSource =
  | "weixin"
  | "automation"
  | "assistant-record"
  | "github"
  | "linear"
  | "manual";

type Mission = {
  id: string;
  source: MissionSource;
  sourceRef?: string;
  platform: string;
  externalScopeId: string;
  title: string;
  goal: string;
  expectedOutput: string;
  acceptanceCriteria: string[];
  plan: string[];
  status: MissionStatus;
  priority: "low" | "normal" | "high";
  riskLevel: "low" | "medium" | "high";
  cwd: string | null;
  workspacePath: string | null;
  workflowPath: string | null;
  providerProfileId: string;
  bridgeSessionId: string | null;
  codexThreadId: string | null;
  attemptCount: number;
  maxAttempts: number;
  maxTurns: number;
  lastRunAt: number | null;
  completedAt: number | null;
  lastResultPreview: string | null;
  resultText: string | null;
  resultArtifacts: unknown[];
  lastError: string | null;
  workpad: MissionWorkpad;
  createdAt: number;
  updatedAt: number;
};
```

### 4. Workspace Manager

Long-running missions should not run directly in an arbitrary current working
directory unless the user explicitly wants that.

Default layout:

```text
~/.codexbridge/mission/
  workflows/
  workspaces/
    <missionId>/
  artifacts/
    <missionId>/
  logs/
    <missionId>.jsonl
```

Rules:

- Code-changing missions should use a dedicated workspace.
- Read-only research and writing missions may reuse the bound session cwd.
- Workspace lifecycle hooks should come from `WORKFLOW.md`.
- A mission must never write outside its workspace except approved artifact and
  log directories.

### 5. Workpad

Each mission needs a single persistent workpad. This is the equivalent of
Symphony's issue comment, adapted for WeChat.

The workpad should store:

- environment stamp: host, workspace, git SHA
- current status
- plan checklist
- acceptance criteria
- validation checklist
- latest notes
- blockers
- final result summary

Rendering rules:

- `/agent show <n>` or future `/mission show <n>` shows the compact workpad.
- `/agent result <n>` shows only the final result text.
- `/agent result <n> file` exports full result as `.txt`.
- WeChat auto-delivery should send concise progress and final summaries, not the
  entire workpad unless requested.

### 6. Runner Loop

Symphony's key behavior is not "one prompt, one answer"; it is a bounded loop.

Mission Control runner loop:

1. Load mission and workflow.
2. Ensure workspace.
3. Start or resume Codex app-server thread.
4. Send workflow-rendered prompt.
5. Capture progress, artifacts, approvals, and result.
6. Verify acceptance criteria.
7. If verification fails and attempts remain, repair/retry.
8. If blocked, mark `blocked` with a human-action reason.
9. If completed, deliver result through SendGate.

Hard limits:

- max concurrent missions
- max turns per mission
- max attempts per mission
- timeout per turn
- artifact count and size limits

### 7. Status Surface

Chat-first status is required before any web dashboard.

Minimum commands:

- `/agent` lists current mission-like jobs.
- `/agent show <n>` shows status and workpad summary.
- `/agent stop <n>` stops a running mission.
- `/agent retry <n>` reruns using the same mission context.
- `/agent result <n>` returns final result text.
- `/agent result <n> file` exports a `.txt` result.

Later, a web control plane can read the same persisted records and logs. It
should not own mission state.

## Implementation Plan

### Phase 1: Make `/agent` the Mission v0 surface

- Keep `/agent` as the user-facing command.
- Add Mission terminology to docs and help text without adding a new slash
  command yet.
- Extend `AgentJob` storage only where needed for workpad and validation fields.
- Preserve current WeChat behavior.

### Phase 2: Add workflow loading

- Add `MissionWorkflowLoader` for `.codexbridge/mission/WORKFLOW.md`.
- Parse YAML front matter plus prompt body.
- Use built-in defaults when no workflow exists.
- Show workflow source in `/agent show`.

### Phase 3: Add workspace isolation

- Add `MissionWorkspaceService`.
- Use dedicated workspace for code-changing missions.
- Keep read-only missions in bound cwd when safe.
- Persist `workspacePath`.

### Phase 4: Add bounded runner loop

- Replace one-shot `/agent` execution with a loop:
  - run
  - verify
  - repair if needed
  - deliver
- Persist attempt and validation state after every step.
- Ensure restart recovery can resume queued/running missions safely.

### Phase 5: Add external work sources

- GitHub issues first if GitHub auth is available.
- Linear second, because Symphony already proves the shape.
- Keep WeChat as the notification and control entrypoint.

## Guardrails

- Do not bypass CodexBridge SendGate for delivery.
- Do not let agent runs directly call WeChat APIs.
- Do not let workflow prompt edits silently change runtime permissions.
- Do not treat a scheduled `/auto` job and a manual `/agent` mission as the same
  record until the Mission abstraction exists.
- Do not add a new `/mission` command until `/agent` can serve as Mission v0
  without confusing users.

## Practical Next Step

The immediate useful next step is not copying Symphony's Elixir code. It is:

1. Keep `reference/symphony` as architecture reference.
2. Add workflow loading around `/agent`.
3. Add workpad fields to `AgentJob`.
4. Make `/agent show` present the workpad.
5. Make `/agent retry` reuse the workpad and workspace context.

That gives CodexBridge the core Mission Control behavior while keeping WeChat as
the primary control surface.
