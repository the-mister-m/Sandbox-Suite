# MAP — Open Design runtimes: daemon-to-CLI drive layer

Recon of `/Users/moth3rship/Downloads/open-design-main` only. Read-only source; nothing in that repo was written. Facts only, code is the law. Cites are `path:line` relative to `apps/daemon/src/`.

## PURPOSE

`runtimes/` defines one `RuntimeAgentDef` per coding-agent CLI (27 shipped defs) and the two stream parsers (`claude-stream.ts`, `json-event-stream.ts`) that turn each CLI's stdout into a common set of UI events. `agent-protocol/` is a separate, smaller layer underneath some of those defs: a shared JSON-line transport (`core/`) plus a JSON-RPC subprocess client (`acp/`) that drives any CLI speaking the Agent Client Protocol.

## FILE MAP

Read in full unless marked otherwise. Sizes are `wc -c` bytes.

### runtimes/defs/ — read whole (28 files, 136,522 B)

| path | bytes | bytes read | role |
|---|---:|---:|---|
| defs/shared.ts | 1,689 | 1,689 | re-exports `detectAcpModels`/`parsePiModels`/`execAgentFile`; `clampCodexReasoning`; `parseLineSeparatedModels` |
| defs/claude.ts | 7,617 | 7,617 | Claude Code def |
| defs/aider.ts | 3,092 | 3,092 | Aider def |
| defs/amp.ts | 2,716 | 2,716 | Amp def (reuses claude-stream-json) |
| defs/amr.ts | 24,770 | 24,770 | AMR (vela CLI / ACP) def + model-catalog + billing helpers |
| defs/antigravity.ts | 11,023 | 11,023 | Antigravity (`agy`) def, settings.json model side-channel |
| defs/atomcode.ts | 3,077 | 3,077 | AtomCode CLI def |
| defs/byok-opencode.ts | 1,504 | 1,504 | BYOK OpenCode def |
| defs/codebuddy.ts | 5,980 | 5,980 | Codebuddy Code def (Claude-Code-compatible CLI) |
| defs/codex.ts | 28,682 | 28,682 | Codex CLI def, `exec`/`app-server` transport switch |
| defs/copilot.ts | 3,893 | 3,893 | GitHub Copilot CLI def |
| defs/cursor-agent.ts | 4,008 | 4,008 | Cursor Agent def |
| defs/deepseek-harness.ts | 4,398 | 4,398 | DeepSeek Harness (`dsh`) def |
| defs/deepseek.ts | 2,813 | 2,813 | DeepSeek TUI def |
| defs/devin.ts | 1,444 | 1,444 | Devin for Terminal def (ACP) |
| defs/grok-build.ts | 4,535 | 4,535 | Grok Build (xAI `grok`) def |
| defs/hermes.ts | 2,013 | 2,013 | Hermes def (ACP) |
| defs/kilo.ts | 629 | 629 | Kilo def (ACP) |
| defs/kimi.ts | 1,307 | 1,307 | Kimi CLI def (ACP) |
| defs/kiro.ts | 674 | 674 | Kiro CLI def (ACP) |
| defs/mimo.ts | 972 | 972 | MiMo Code def |
| defs/opencode.ts | 7,404 | 7,404 | OpenCode def |
| defs/pi.ts | 4,278 | 4,278 | Pi def (RPC protocol) |
| defs/qoder.ts | 2,129 | 2,129 | Qoder CLI def |
| defs/qwen.ts | 1,676 | 1,676 | Qwen Code def |
| defs/reasonix.ts | 2,826 | 2,826 | DeepSeek Reasonix def (ACP) |
| defs/trae-cli.ts | 738 | 738 | Trae CLI def (ACP) |
| defs/vibe.ts | 635 | 635 | Mistral Vibe CLI def (ACP) |

### runtimes/ top level — read per instructions

| path | bytes | bytes read | role |
|---|---:|---:|---|
| registry.ts | 3,176 | 3,176 | `SHIPPED_AGENT_DEFS` array (27 defs) + local-profile merge + `getAgentDef` |
| detection.ts | 34,401 | 34,401 | full detection pipeline: version probe, capability probe, model fetch, auth probe |
| claude-stream.ts | 50,166 | 50,166 | Claude Code / Amp / Codebuddy stream-json parser |
| json-event-stream.ts | 56,749 | 56,749 | dispatcher + parsers for `opencode`, `gemini` (dead — no def uses it), `kimi` (dead — kimi def uses ACP, not this), `cursor-agent`, `codex` |
| runs.ts | 106,423 | ~8,600 | run-state/telemetry record (status machine, diagnostics, replay, cancel). Grepped for spawn/exec/env/cwd/stdin/permission/approve/resume/session/skill/design-system/prompt/systemPrompt/append — no spawn call, no permission/approve/design-system/systemPrompt/append hits. Confirms the actual `child_process` spawn call is NOT in this file. |
| auth.ts | 31,216 | ~4,900 | auth-status classification (`ok`/`missing`/`unknown`) + per-CLI auth guidance strings; grepped, not the tool-permission gate |
| chat-prompt-inputs.ts | 36,611 | ~12,300 | prompt-text assembly point (`composeChatAgentTextPayload`), `resolveChatExtraAllowedDirs`, design-system selection resolvers |
| chat-run-messages.ts | 31,106 | ~1,150 | SQLite (`better-sqlite3`, `../db.js`) persistence of chat-run message/event records; grepped, no skill/design-system/prompt-assembly content |

### agent-protocol/ — read per instructions

| path | bytes | bytes read | role |
|---|---:|---:|---|
| README.md | 6,081 | 6,081 | module map, import rules, refactor history |
| index.ts | 509 | 0 (listed) | root barrel, not opened (README documents its 10 exports) |
| core/index.ts | 251 | 251 | core barrel |
| core/json-line-stream.ts | 10,008 | 10,008 | shared newline-delimited JSON-RPC reassembler used by acp/ and pi-rpc/ |
| acp/index.ts | 588 | 588 | acp barrel |
| acp/types.ts | 1,073 | 1,073 | shared ACP primitive types |
| acp/session.ts | 65,304 | ~6,200 | `attachAcpSession` — read only the permission-handling range (`replyPermission`, `session/request_permission` dispatch) |
| acp/rpc.ts | 14,638 | ~950 | read only `choosePermissionOutcome` |
| acp/json.ts | 5,441 | 0 (grepped) | JSON-line parsing helpers for ACP stdout |
| acp/emission-provenance.ts | 836 | 0 (grepped) | not read |
| acp/stdio-mcp.ts | 6,722 | 0 (grepped) | stdio MCP server bridging |
| acp/constants.ts | 4,145 | 0 (grepped) | protocol constants (method names, timeouts) |
| acp/tool-execution-lifecycle.ts | 14,734 | 0 (grepped) | not read |
| acp/updates.ts | 31,666 | 0 (grepped) | ACP `session/update` → tool_use/tool_result mapping (imported by session.ts) |
| acp/models.ts | 13,295 | 0 (grepped) | `detectAcpModels`, `normalizeModels` |
| acp/session-params.ts | 4,786 | 0 (grepped) | `buildAcpSessionNewParams` |

Not authorized in the task budget; listed only, not opened, not grepped beyond two incidental lines in codex-app-server/session.ts surfaced by a keyword search:

| path | bytes |
|---|---:|
| agent-protocol/dsh-profile/probe.ts | 3,458 |
| agent-protocol/dsh-profile/frames.ts | 6,096 |
| agent-protocol/dsh-profile/stream.ts | 3,517 |
| agent-protocol/dsh-profile/types.ts | 3,817 |
| agent-protocol/dsh-profile/session.ts | 9,055 |
| agent-protocol/dsh-profile/index.ts | 400 |
| agent-protocol/pi-rpc/session.ts | 16,431 |
| agent-protocol/pi-rpc/events.ts | 6,679 |
| agent-protocol/pi-rpc/index.ts | 392 |
| agent-protocol/pi-rpc/models.ts | 1,928 |
| agent-protocol/pi-rpc/internal.ts | 2,181 |
| agent-protocol/codex-app-server/session.ts | 14,216 |
| agent-protocol/codex-app-server/normalize.ts | 25,841 |

### runtimes/ — everything else, unread (per task instructions)

| path | bytes |
|---|---:|
| acp-handshake-failure.ts | 7,479 |
| acp-handshake-id.ts | 2,150 |
| acp-service-failure.ts | 6,653 |
| amr-model-cache.ts | 3,524 |
| amr-model-probe.ts | 2,086 |
| byok-opencode.ts (top-level helper, not the def) | 8,291 |
| capabilities.ts | 131 |
| chat-run-context.ts | 11,379 |
| chat-run-lifecycle.ts | 12,540 |
| chat-run-records.ts | 10,357 |
| claude-child-evidence.ts | 40,318 |
| codex-child-evidence.ts | 43,398 |
| codex-model-preflight.ts | 15,559 |
| diagnostics.ts | 5,859 |
| env.ts | 16,145 |
| executables.ts | 17,322 |
| invocation.ts | 2,052 |
| launch.ts | 9,102 |
| local-profiles.ts | 6,768 |
| mcp.ts | 684 |
| metadata.ts | 3,790 |
| mmd-routes.ts | 4,530 |
| models.ts | 9,036 |
| od-next-capability-gate.ts | 27,971 |
| od-next-exact-input.ts | 34,684 |
| opencode-child-evidence.ts | 25,513 |
| opencode-log.ts | 7,336 |
| opencode-permissions.ts | 2,100 |
| paths.ts | 656 |
| plain-stream.ts | 13,583 |
| project-amr-trace-env.ts | 5,794 |
| prompt-budget.ts | 12,486 |
| prompt-file.ts | 870 |
| qoder-stream.ts | 6,238 |
| qwen-settings.ts | 4,891 |
| resolution.ts | 584 |
| run-artifacts.ts | 16,035 |
| run-done-key.ts | 212 |
| run-lifecycle-analytics.ts | 15,260 |
| run-produced-files.ts | 12,104 |
| run-restart-recovery.ts | 1,162 |
| run-steering.ts | 5,349 |
| run-terminal-reconciliation.ts | 28,520 |
| terminal-control.ts | 1,739 |
| terminal-launch.ts | 5,444 |
| tool-input-path-scanner.ts | 15,704 |
| tool-timing.ts | 3,718 |
| types.ts | 18,511 |
| vela-child-evidence.ts | 30,857 |

## DETECTION

`detectAgent(def, configuredEnv)` → `probe(def, configuredEnv)` (`detection.ts:812`, `:554`).

1. **Path resolution.** `resolveAgentLaunch(def, configuredEnv)` (imported from `launch.ts`, not read) returns `{ selectedPath, launchPath }`. If either is missing, the agent is reported unavailable with `buildExecutableDiagnostic` (`detection.ts:570-573`).
2. **Version probe.** `probeVersionAtPath` runs `execAgentFile(resolved, def.versionArgs, { timeout: def.versionProbeTimeoutMs ?? 3000 })` (`detection.ts:339-357`). First stdout line is trimmed; `def.versionPolicy.parse` may transform it.
3. **Not-invocable vs. spawned-but-unhappy.** `classifyVersionProbeFailure` (`detection.ts:314-336`) distinguishes OS-level rejection (`EACCES`/`ENOENT`/`ENOTDIR`, POSIX 126/127, Windows cmd.exe 9009, or launcher stderr patterns in `LAUNCHER_TARGET_MISSING_PATTERNS`, `detection.ts:268-274`) from "binary ran, `--version` just failed" (kept invocable with `version: null`).
4. **Candidate walk.** If not-invocable, `detection.ts:610-644` re-resolves with `skipPathCandidates` and retries, up to `MAX_EXECUTABLE_ATTEMPTS = 8` (`detection.ts:71`). Every failed path is remembered via `rememberUnusableExecutable` (from `executables.ts`, not read) so later spawns skip it too.
5. **Version-policy gate.** `def.versionPolicy.requireVersion` can fail the agent outright if no version string parsed (`detection.ts:667-672`). A parsed version not matching `supportedVersions`/`supportedVersionPattern` produces a non-fatal `versionDiagnostic` (`detection.ts:699-704`).
6. **Compatibility probe.** Optional `def.compatibilityProbe` (args/timeout/preflight/parse) runs before the agent is marked available; used by `deepseek-harness` (`defs/deepseek-harness.ts:2268-2275`, `dsh --profile open-design --probe`).
7. **Concurrent post-version probes** (`detection.ts:710-717`): help-based capability flags (`probeCapabilities`), hidden capability flags (`probeHiddenCapabilityFlags`), model list/fetch (`fetchModels`), auth status (`probeAgentAuthStatus`, `auth.ts`), and (amr only) the companion OpenCode version.
8. **Capability flags.** `def.helpArgs` + `def.capabilityFlags` (a flag-string → capability-key map): run `--help`, scan both stdout and stderr (OpenCode puts its whole help on stderr — `detection.ts:486-497`), record `agentCapabilities[id][key] = help.includes(flag)`.
9. **Hidden capability flags.** `def.hiddenCapabilityFlags = { probeArgsPrefix, flags }`: probe by deliberately passing a bogus value (`HIDDEN_FLAG_PROBE_VALUE = '__od_capability_probe__'`, `detection.ts:508`) and checking the CLI's own error text names the flag without saying "unknown option" (`detection.ts:524-552`). Used by Claude (`--thinking-display`, `defs/claude.ts:46-51`).
10. **No mock-bin handling found.** Grepped `runtimes/` for `mock` — zero hits. Whatever fixture/mock-binary mechanism the test suite uses (if any) lives outside the files in scope (`invocation.ts`, unread, or a test-only path never reached by production detection code).

## SPAWN

**No `child_process.spawn`/`exec`/`execFile` call exists in any file this recon was authorized to read.** `runs.ts` (the run-lifecycle/state file) was grepped for `spawn(` and `exec` — zero hits. Each `RuntimeAgentDef.buildArgs(...)` only returns an argv array; the actual process launch (binary resolution to `launchPath`, env merge, `cwd`, stdio pipes) happens in `launch.ts` / `chat-run-lifecycle.ts` / `env.ts`, all in the unread "everything else" list per the task budget. What follows is the **argv/env/stdin construction** that feeds that (unread) spawn call.

### Claude def — full example (`defs/claude.ts`)

- **Binary:** `bin: 'claude'`, `fallbackBins: ['openclaude']` (drop-in CLI-compatible forks tried in PATH order if `claude` is absent) — `claude.ts:20-27`.
- **Base args** (`claude.ts:88`): `['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']`.
- **Conditional args**, gated on probed capabilities (`agentCapabilities.get('claude')`):
  - `--include-partial-messages` if `caps.partialMessages`.
  - `--thinking-display summarized` if `caps.thinkingDisplay` (hidden-flag probe).
  - `--forward-subagent-text` if `runtimeContext.observeNativeChildBehavior === true` (throws `TypeError` if `caps.forwardSubagentText` is false).
  - `--model <id>` if `options.model` is set and not `'default'`.
  - `--agents <json>` if `runtimeContext.nativeBuildPackageBindings` is non-empty (throws if `caps.customAgents` is false, or if handles collide).
  - `--add-dir <dir> <dir> ...` for every string in `extraAllowedDirs` (skills dir + design-system dir + linked dirs — see INJECTION) if `caps.addDir !== false`.
  - `--resume <id>` if `runtimeContext.resumeSessionId` is set, **else** `--session-id <id>` if `runtimeContext.newSessionId` is set.
  - `--permission-mode bypassPermissions` — always appended, unconditionally.
- **Prompt delivery:** `promptViaStdin: true`, `promptInputFormat: 'stream-json'` — the composed prompt (and any later user turns) is written as JSONL to the child's stdin, which the daemon keeps open across turns (`stdinOpen`/`stdinBackpressure` fields tracked in `runs.ts:992-999`).
- **Stream:** `streamFormat: 'claude-stream-json'` → parsed by `claude-stream.ts`.
- **External MCP:** `externalMcpInjection: 'claude-mcp-json'` — comment states Claude Code auto-loads `.mcp.json` from the project cwd at spawn, so the daemon writes the user's configured external MCP servers to that file before launch; the write itself happens in `server.ts` (unread, outside `runtimes/`).
- **Session:** `resumesSessionViaCli: true` — the daemon owns/persists the session id and replays it via `--resume`/`--session-id`; no `capturesSessionIdFromStream` (unlike codex/opencode, Claude does not mint its own id server-side that the daemon must capture).
- **cwd / env:** no `env` field on the def; no cwd logic in the def itself (`extraAllowedDirs` widens the sandbox, `runtimeContext.cwd` presumably supplies the process cwd — set at the unread spawn site).

## DEF SCHEMA

Full field set observed across all 28 files in `runtimes/defs/` (empirical — `types.ts`, which would declare `RuntimeAgentDef` formally, is in the unread "everything else" list per the task budget):

`id`, `name`, `bin`, `fallbackBins`, `versionArgs`, `versionProbeTimeoutMs`, `versionPolicy` (`{ supportedVersions, supportedVersionPattern, requireVersion, parse }`), `authProbe` (`{ args, timeoutMs }`), `helpArgs`, `capabilityFlags`, `hiddenCapabilityFlags` (`{ probeArgsPrefix, flags }`), `fallbackModels`, `fetchModels`, `listModels` (`{ args, parse, timeoutMs }`), `reasoningOptions`, `buildArgs`, `promptViaStdin`, `promptViaFile`, `promptInputFormat`, `maxPromptArgBytes`, `streamFormat`, `eventParser`, `externalMcpInjection`, `mcpDiscovery`, `acpMcpEnvFormat`, `acpStdioMcpRemovedInVersion`, `acpTurnEndCompletesPrompt`, `resumesSessionViaCli`, `resumesSessionViaAcpLoad`, `resumesSessionViaProfileStdio`, `capturesSessionIdFromStream`, `supportsCustomModel`, `supportsImagePaths`, `defaultModelEnvVar`, `compatibilityProbe` (`{ args, timeoutMs, preflight, parse }`), `env`, `inactivityTimeoutMs`, `firstOutputTimeoutMs`, `installUrl`, `docsUrl`.

### Diff table — 26 rows (every shipped def except Claude, which has the full worked example above)

| id | bin | prompt delivery | stream / protocol | resume | externalMcpInjection | notable fields |
|---|---|---|---|---|---|---|
| aider | aider | argv (`--message <text>`) | plain | none | — | `maxPromptArgBytes: 30000` |
| amp | amp | stdin | claude-stream-json | none | — | `supportsCustomModel: false`; model picker maps to `--mode` |
| amr | vela | protocol only (`agent run`) | acp-json-rpc | `resumesSessionViaAcpLoad` | — | `fallbackModels: []` (fail closed); `defaultModelEnvVar: VELA_DEFAULT_MODEL`; `inactivityTimeoutMs 30min`; `firstOutputTimeoutMs 2min`; `supportsImagePaths: true` |
| antigravity | agy | argv (`-p <prompt>`) | plain | none (opted out on purpose) | — | model picked via side-channel write to `~/.gemini/antigravity-cli/settings.json` + lock chain; `capabilityFlags: { --dangerously-skip-permissions: skipPermissions }` |
| atomcode | atomcode | file (`promptViaFile`, `--prompt-file`) | plain | none | — | `-y` auto-approve |
| byok-opencode | opencode-cli (fallback `opencode`) | stdin | json-event-stream / `opencode` | none | — | spreads `OPENCODE_PERMISSION_CAPABILITY` |
| codebuddy | codebuddy (fallback `cbc`) | stdin, stream-json | claude-stream-json | `resumesSessionViaCli` | `claude-mcp-json` | `reasoningOptions` 7 levels via `--effort` |
| codex | codex | stdin | json-event-stream / `codex` (or `codex-app-server` transport) | `resumesSessionViaCli` + `capturesSessionIdFromStream` | — | `reasoningOptions` 7; sandbox `danger-full-access`/`workspace-write`; fixed shell-env allowlist |
| copilot | copilot | stdin (no `-p` flag at all) | copilot-stream-json | none | — | `--allow-all-tools` required; `inactivityTimeoutMs 30min` |
| cursor-agent | cursor-agent | stdin | json-event-stream / `cursor-agent` | none | — | `authProbe: ['status']`; `capabilityFlags: { --trust: trust }` |
| deepseek | deepseek (fallback `codewhale`) | argv (positional) | plain | none | — | `maxPromptArgBytes: 30000` |
| deepseek-harness | dsh | stdin | `dsh-profile-jsonl` | `resumesSessionViaProfileStdio` + `capturesSessionIdFromStream` | — | `versionPolicy` prerelease-line pattern; `compatibilityProbe` |
| devin | devin | protocol only (`acp`) | acp-json-rpc | none | `acp-merge` | — |
| grok-build | grok | file (`--prompt-file`) | plain | none | — | `reasoningOptions` 5 (`--effort`); `--always-approve --no-plan` |
| hermes | hermes | protocol only (`acp --accept-hooks`) | acp-json-rpc | none | `acp-merge` | `mcpDiscovery: 'mature-acp'` |
| kilo | kilo | protocol only (`acp`) | acp-json-rpc | none | `acp-merge` | — |
| kimi | kimi | protocol only (`acp`) | acp-json-rpc | none | `acp-merge` | `mcpDiscovery: 'mature-acp'`; `acpStdioMcpRemovedInVersion: '0.37.0'` |
| kiro | kiro-cli | protocol only (`acp`) | acp-json-rpc | none | `acp-merge` | `acpTurnEndCompletesPrompt: true` (unique to kiro) |
| mimo | mimo | stdin | json-event-stream / `opencode` | none | `mimo-env-content` | — |
| opencode | opencode-cli (fallback `opencode`) | stdin | json-event-stream / `opencode` | `resumesSessionViaCli` + `capturesSessionIdFromStream` | `opencode-env-content` | spreads `OPENCODE_PERMISSION_CAPABILITY` |
| pi | pi | stdin (RPC `prompt` command) | pi-rpc | none | — | `supportsImagePaths: true`; `versionProbeTimeoutMs 15000`; `reasoningOptions` 7 (`--thinking`) |
| qoder | qodercli | stdin | qoder-stream-json | none | — | `--yolo`; `--attachment <path>` for images |
| qwen | qwen | stdin | plain | none | — | `--yolo` |
| reasonix | reasonix (fallback `dsnix`) | protocol only (`acp`) | acp-json-rpc | none | `acp-merge` | `mcpDiscovery: 'mature-acp'`; `acpMcpEnvFormat: 'map'`; `env.REASONIX_ACP_SYSTEM_APPEND` (own text-injection path, see INJECTION) |
| trae-cli | traecli | protocol only (`acp serve --yolo`) | acp-json-rpc | none | `acp-merge` | `mcpDiscovery: 'mature-acp'` |
| vibe | vibe-acp | protocol only (no args) | acp-json-rpc | none | `acp-merge` | — |

## STREAM AND EVENTS

Both parsers consume **newline-delimited JSON** (one JSON object per line) fed incrementally via `feed(chunk)` + a trailing `flush()`; an unparseable line becomes `{ type: 'raw', line }`.

### `claude-stream.ts` (Claude, Amp, Codebuddy — `streamFormat: 'claude-stream-json'`)

Parses `--output-format stream-json --verbose` frames (`type: 'system'|'stream_event'|'assistant'|'user'|'result'`). Emitted event types (`grep type: '...'`, `claude-stream.ts`):

`status`, `text_delta`, `thinking_delta`, `thinking_start`, `thinking_tokens`, `tool_use`, `tool_result`, `tool_input_delta`, `tool_input_progress`, `tool_input_target`, `turn_end`, `usage`, `error`, `raw`.

Notable mechanics: dedupes `tool_use` across two possible emission paths (`content_block_stop` delta-assembly vs. the terminal `assistant` wrapper replay) via `emittedToolUseIds`; a `turn_end` boundary can arrive from three different frame shapes across Claude Code builds, deduped by `emitTurnEndOnce`; a role-marker guard (`createRoleMarkerGuard`) screens `text_delta` only, not `thinking_delta`; an artifact-echo suppressor drops the model quoting back a file it just wrote.

### `json-event-stream.ts` (single dispatcher, `createJsonEventStreamHandler(kind, onEvent)`)

`kind` values wired to a def today: `opencode` (opencode, byok-opencode, mimo), `cursor-agent` (cursor-agent), `codex` (codex). Two more handlers exist in the file but are **not reachable from any current def**: `handleGeminiEvent` (no `gemini` def in `registry.ts`) and `handleKimiEvent` (the `kimi` def uses `acp-json-rpc`, not this parser) — dead code paths, or reachable only through a caller outside this recon's scope.

Emitted event types across all `kind` branches: `status`, `text_delta`, `thinking_delta`, `tool_use`, `tool_result`, `tool_in_flight` (codex only, e.g. `web_search` before it resolves), `usage`, `error`, `raw`.

Codex-specific translation, all in `handleCodexEvent` (`json-event-stream.ts:1049`): `item.started`/`item.updated`/`item.completed` frames of type `reasoning` → `thinking_delta`; `command_execution` → `tool_use` name `Bash` + matching `tool_result`; `file_change` → one `tool_use` per changed file (name `Write`/`Edit` by `kind`, `od_diff_stat` line counts parsed from the unified diff) — codex never names the tool it wrote a file with, this is inferred; `mcp_tool_call` → `tool_use`/`tool_result` named `mcp__<server>__<tool>`; `web_search` → `tool_in_flight` then settled `tool_use`/`tool_result` with the query (only on `item.completed`, since the started frame's query is empty); `turn.completed.usage` → `usage`.

### Other stream formats (defs only, parser code out of scope)

`copilot-stream-json` (copilot), `qoder-stream-json` (qoder, file `qoder-stream.ts`, unread), `dsh-profile-jsonl` (deepseek-harness, `agent-protocol/dsh-profile/`, unread), `pi-rpc` (pi, `agent-protocol/pi-rpc/`, unread), `acp-json-rpc` (all ACP defs, see PROTOCOL LAYER), `plain` (aider, antigravity, deepseek, grok-build, qwen, atomcode — single-turn text reply, no tool-call streaming), `codex-app-server` (codex, alternate transport — `defs/codex.ts:1763`, translated back into the same `handleCodexEvent` shape per the comment at `json-event-stream.ts:1350-1360`, bridge code itself in unread `agent-protocol/codex-app-server/`).

## PERMISSIONS

Three distinct mechanisms, no def leaves a tool call waiting on a human via this daemon:

1. **CLI auto-approve flags/config**, set unconditionally in `buildArgs`, e.g.: Claude/Codebuddy `--permission-mode bypassPermissions` (`defs/claude.ts`, `defs/codebuddy.ts`); Copilot `--allow-all-tools` (`defs/copilot.ts`); Antigravity `--dangerously-skip-permissions` (gated on a capability probe, `defs/antigravity.ts`); Qoder/Qwen/Trae-CLI `--yolo`; Grok Build `--always-approve --no-plan`; AtomCode `-y`; Codex sandbox `workspace-write`/`danger-full-access` plus (per `agent-protocol/codex-app-server/session.ts:90,236`, grepped) `approvalPolicy: APPROVAL_POLICY_NEVER` — "the `exec` path forces `--ask-for-approval never` implicitly"; OpenCode/BYOK-OpenCode/MiMo via `appendOpenCodePermissionBypass` (in unread `opencode-permissions.ts`, referenced from `defs/opencode.ts`, `defs/byok-opencode.ts`).
2. **ACP auto-approval of `session/request_permission`.** Every ACP def (amr, devin, hermes, kilo, kimi, kiro, reasonix, trae-cli, vibe) is driven through `attachAcpSession` (`agent-protocol/acp/session.ts`). When the child sends `session/request_permission`, `replyPermission` (`acp/session.ts:958-980`) calls `choosePermissionOutcome(params?.options)` (`acp/rpc.ts:318-327`), which picks, in order: an option literally named `approve_for_session`, else the first option with `kind: 'allow_always'`, else the first with `kind: 'allow_once'`; the daemon replies `{ outcome: { outcome: 'selected', optionId } }` over the same JSON-RPC stdin. A permission request that offers none of those three kinds fails the run (`fail('unhandled ACP permission request...')`).
3. **Observability only, not a gate.** Both auto-approve paths still surface a diagnostic: ACP emits `{ type: 'diagnostic', name: 'acp_approval_request', ... }` (`acp/session.ts:965-973`) so `run_finished.approval_requested` can attribute a stall to an approval hang even though the daemon always says yes; `runs.ts:997` documents the same field as derived from run events by (unread) `summarizeRunDiagnosticsForAnalytics`.

No per-def difference in outcome — every def either can't be asked (plain/argv CLIs with no interactive channel) or is auto-approved — but the auto-approve *mechanism* differs (CLI flag vs. ACP RPC reply vs. sandbox policy), as tabled above.

## SESSION AND RESUME

Two patterns, both surfaced as `RuntimeAgentDef` boolean flags, both handled per-turn in `buildArgs` (no shared resume module in scope):

- **Daemon-assigned id, replayed by the daemon** (`resumesSessionViaCli: true` without `capturesSessionIdFromStream`): Claude / Codebuddy. `runtimeContext.resumeSessionId` → `--resume <id>`; else `runtimeContext.newSessionId` → `--session-id <id>` (daemon mints the id itself).
- **CLI-minted id, captured off the stream** (`resumesSessionViaCli` + `capturesSessionIdFromStream`): Codex (`thread.started.thread_id` → `exec resume <thread_id>`, positional arg, no `-C`/`--add-dir` allowed on resume); OpenCode/BYOK-OpenCode (`sessionID` on `step_start` → `-s <id>`, MiMo shares the OpenCode event shape but its def does not set these resume flags).
- **ACP session/load** (`resumesSessionViaAcpLoad: true`): AMR/vela only — `session/load` instead of `session/new`, per the ACP method-name list in `acp/session.ts`.
- **Profile-stdio capture** (`resumesSessionViaProfileStdio` + `capturesSessionIdFromStream`): DeepSeek Harness.
- **No resume support declared:** aider, amp, antigravity (opted out on purpose — see comment in `defs/antigravity.ts` on why `-c` breaks OD's system-prompt override), atomcode, copilot, cursor-agent, deepseek, devin, grok-build, hermes, kilo, kimi, kiro, mimo, pi, qoder, qwen, reasonix, trae-cli, vibe.

**Disk persistence:** `chat-run-messages.ts` persists chat-run messages/events through `better-sqlite3` via `../db.js` (`appendMessageAgentEvents`, `upsertMessage`, etc.) — a SQLite database, exact file path not established (`db.js` is outside `runtimes/`, not in scope). Comments in `defs/codex.ts`/`defs/opencode.ts` reference a logical `agent_sessions` table the daemon persists resume ids to; no schema or file path for it was found in the files read.

## INJECTION

Two independent channels reach the CLI; which ones apply depends on the def's transport.

1. **Composed prompt text.** `composeChatAgentTextPayload` (`chat-prompt-inputs.ts:115`) assembles one prompt string from many named contributors, including `user_selected_skills`/`frozen_skill_package` (skills), `stable_context_prompt`, `run_context_prompt`, `connected_external_mcp_reference`, `daemon_system_prompt`, `client_system_prompt`, `request_text`, `prior_transcript` (a second "OD Next bundle" shape, `serializeOdNextPromptBundleV2`, exists alongside a legacy flat-contributor shape — `chat-prompt-inputs.ts:166-183` vs. `:205-227`). This single composed string is what each def then delivers per its `promptViaStdin`/`promptViaFile`/argv setting — i.e. skills and design-system text ride inside the prompt body itself for every def, regardless of transport.
2. **Extra filesystem access for skills/design-system files.** `resolveChatExtraAllowedDirs({ agentId, skillsDir, designSystemsDir, linkedDirs })` (`chat-prompt-inputs.ts:326-356`) filters to existing directories and returns them as `extraAllowedDirs`, which `buildArgs` turns into: `--add-dir <dir>` for Claude/Codebuddy/Copilot; `--add-dir <dir>` (repeatable, create-turn only) for Codex — **except Codex is explicitly excluded**: `resolveChatExtraAllowedDirs` zeroes `candidates` when `agentId === 'codex'` (`chat-prompt-inputs.ts:339-347`), so Codex never receives `skillsDir`/`designSystemsDir` as extra directories; `--attachment <path>` is separate (Qoder, images only); Pi instead hints at the directories via repeated `--append-system-prompt <dir>` since it has no `--add-dir` sandbox flag (`defs/pi.ts`).
3. **External MCP servers**, a separate field from 1/2: `externalMcpInjection` per def — `claude-mcp-json` (Claude, Codebuddy: daemon writes `.mcp.json` into the project cwd before spawn, code in unread `server.ts`), `opencode-env-content` (OpenCode/BYOK-OpenCode: `OPENCODE_CONFIG_CONTENT` env var), `mimo-env-content` (MiMo: `MIMOCODE_CONFIG_CONTENT` env var, same JSON shape under a different env namespace), `acp-merge` (every ACP def: MCP servers passed as an `attachAcpSession` parameter, merged into `session/new`).
4. **Per-def hardcoded env injection**, unique to Reasonix: `env: { REASONIX_ACP_SYSTEM_APPEND: DESIGN_INSTRUCTIONS, REASONIX_HOME: reasonixHome() }` (`defs/reasonix.ts`). `DESIGN_INSTRUCTIONS` is a literal multi-line string ("You are running inside OpenDesign...") telling the model to wrap HTML in `<artifact>` tags, apply the design system, and follow the skill's steps — Reasonix's own ACP system prompt reads this env var, so this is a second, CLI-specific instruction-injection path that bypasses the composed-prompt text entirely.
5. **Antigravity model side-channel** (not skills/design-system, but the same "write to a file the CLI reads at spawn" pattern): `writeAntigravityModelSelection` writes the chosen model label into `~/.gemini/antigravity-cli/settings.json` before spawn (`defs/antigravity.ts`).

## PROTOCOL LAYER

- **`agent-protocol/core/`** (16.3KB total, read whole): one file, `json-line-stream.ts`, exporting `createJsonLineStream(onMessage)`. Buffers stdout chunks, splits on `\n`, `JSON.parse`s each line; if a line is `{`/`[`-prefixed but incomplete, accumulates up to 256 lines / 128KB as a bet that it's pretty-printed multiline JSON, replaying the absorbed lines individually if the bet fails. Also exports `classifyJsonCandidate` (a hand-rolled single-pass JSON-completeness scanner: `'complete' | 'incomplete' | 'invalid'`). Used by both `acp/` and `pi-rpc/`; per the README, `pi-rpc/` and `acp/` do not import each other — `core/` is the only shared edge, enforced as a documented (not yet lint-guarded) star topology.
- **`agent-protocol/acp/`** adds the full ACP JSON-RPC session lifecycle: `attachAcpSession` (`session.ts`) sends `initialize` → `session/new` or `session/load` → optional `session/set_model` → `session/prompt`, streams `session/update` notifications (mapped to `thinking_start`/`thinking_delta`/`text_delta`/`tool_use`/`tool_result`/status), auto-replies to `session/request_permission` (see PERMISSIONS), and on completion flushes buffers, emits usage, closes stdin. Other observed JSON-RPC method names in this dir: `session/cancel`, `session/set_config_option`. MCP servers are merged into the `session/new` params (`acp-merge`).
- **Defs using `acp-json-rpc`:** amr, devin, hermes, kilo, kimi, kiro, reasonix, trae-cli, vibe (9 of 27).
- **Defs using core-adjacent `pi-rpc` directly (not `acp/`):** pi (uses the shared `core/json-line-stream.ts` transport but its own `pi-rpc/` protocol, not ACP).
- **Everything else** (claude-stream-json, json-event-stream kinds, copilot-stream-json, qoder-stream-json, dsh-profile-jsonl, plain, codex-app-server) is plain line-delimited JSON over the child's own stdout, parsed by the runtime-level files (`claude-stream.ts`, `json-event-stream.ts`) rather than by `agent-protocol/`.

## UNKNOWNS

- Exact `child_process.spawn`/`execFile` call site (binary path, final env merge, `cwd`, stdio config): not present in any file this recon was authorized to open; lives in `launch.ts`, `chat-run-lifecycle.ts`, and/or `env.ts` (all unread, in the "everything else" bucket).
- "Mock bin handling" named in the task: no occurrence of the word `mock` anywhere under `runtimes/`. Not found in the files read.
- Exact on-disk path/schema for persisted chat-run messages and resumed session ids (`agent_sessions`, referenced only in comments): `db.js` (outside `runtimes/`) was not opened.
- `.mcp.json` write-to-cwd code for `claude-mcp-json` externalMcpInjection: stated in a comment to live in `server.ts`, not opened (outside `apps/daemon/src/runtimes` and `agent-protocol`, and outside this task's file list).
- `appendOpenCodePermissionBypass`/`appendOpenCodeWorkspaceDir` (`opencode-permissions.ts`) and `OPENCODE_PERMISSION_CAPABILITY` exact flag values: file listed only, not opened.
- Whether `agent-protocol/acp/updates.ts` (31.7KB, the file that actually turns `tool_call`/`tool_call_update` into `tool_use`/`tool_result`) contains any per-tool special-casing beyond what `session.ts`'s docblock describes: not opened, grep-only.
- `codex-app-server/`, `dsh-profile/`, `pi-rpc/` internals: sized and named only; not itemized in the task's read budget, so left unopened beyond two lines surfaced by a keyword grep.
