# RECEIPT — Test Job 0 — Recon on old IDE panes vs D-series widgets

Scope: grep-only recon of Docs/reference/ide-panes/*.js against static/js/widgets/{chat,queue,mini-queue,editor,terminal,browser,viewer,mount}/*.js. No whole-file reads performed except `head -15` header lines (explicitly allowed by the read rule).

## MAPPING

- chat.js → widgets/chat/chat.js — confidence: high (Brandon-confirmed pair; name match + same domain: transcript/turns)
- queue.js → widgets/queue/queue.js — confidence: high (Brandon-confirmed; both are gate/pending-record lists)
- editor.js → widgets/editor/editor.js — confidence: high (Brandon-confirmed; both Monaco-backed)
- terminal.js → widgets/terminal/terminal.js — confidence: high (Brandon-confirmed; both PTY/xterm-style)
- browser.js → widgets/browser/browser.js — confidence: high (Brandon-confirmed; both file-tree navigators)
- preview.js → widgets/viewer/viewer.js — confidence: high (Brandon-confirmed pair)
- ledger.js → no direct D-series widget in the named list (a `ledger/` widget folder exists under static/js/widgets/ but was outside this job's file list — not compared)
- settings.js → no pair in the named list (schema-driven settings overlay; nothing named "settings" in the D-series list given)
- conference.js → no pair in the named list (room/transcript/participants UI; not a pane, mounted by shell.js under `?room=`)
- shell.js → no pair; this is the old ESM entry point/router, not a pane (owns WebSocket, frame router, gate modal, pane registry)
- daemonlog.js → no pair in the named list (daemon-window log tail pane)
- (no old pair) → mini-queue — confirmed by Brandon
- (no old pair) → mount — confirmed by Brandon

## GENERATION

The old panes are the pre-Phase-1 `shells/ade/` generation (matches CLAUDE.md map: "shells/ade/ — pre-Phase-1 ADE code, old, Phase 3 design reference"). Evidence:

- Every old pane declares the same contract in its header comment: `Pane contract: { id, label, mount(el, ctx), show(), hide(), onFrame(msg) }` — e.g. chat.js:2, queue.js:12, editor.js:3, terminal.js:2, browser.js:6, preview.js:4, ledger.js:10, daemonlog.js:7.
- Transport is a single raw WebSocket per page, opened in shell.js: `ws = new WebSocket(\`ws://${location.host}${_isRoom ? _roomWsPath() : _isDaemon ? '/ws/daemon' : '/ws'}\`)` (shell.js:59). Room mode adds `/ws/room` (shell.js:52), daemon mode `/ws/daemon` (shell.js:16, shell.js:45).
- Frame vocabulary sent via `_ctx.send({ type: '...' })`: `queue_action`/`queue_list` (queue.js:58,176), `input` (terminal.js:53,153,154,158), `tree`/`save`/`move`/`open`/`delete`/`mkdir`/`rename`/`rmdir`/`setroot` (browser.js:68,80,203,236,255,291,300,309,316,637), `tree`/`save` (editor.js:176,220), `answer`/`session_save`/`session_new`/`session_load`/`stop` (chat.js:623,662-677,832,864,1057), `user`/`setroot`/`speak_test` (settings.js:244,251,355).
- Old REST routes used alongside the socket: `/api/saves` (chat.js:652,697,870), `/api/voices` (settings.js:265,315,421), `/api/policy` (settings.js:726), `/api/global` (shell.js:1176), `/api/sessions` (shell.js:1201), `/api/rooms` (conference.js:497,552).
- Header comments carry dated notes confirming this is an evolving-but-old codebase, not a placeholder: browser.js:2 "LANE 4 rebuild (2026-07-13)"; browser.js:8 "Brandon, 2026-08-21"; ledger.js:4 "Brandon 2026-07-15"; ledger.js:6 "Ported from mockups/recordface-mock.html".
- DOM convention: old panes hard-code global singleton element ids in template strings (e.g. `id="monaco-editor"`, `id="term-wrap"`, `id="files-tree"`, `id="preview-pane-frame"`) — consistent with one pane instance per page.

The new D-series widgets are a different generation entirely (Phase 2/3 rebuild), evidenced by:
- Header comments describe a multi-instance, region/session-bound model: chat/chat.js:1-9 "one instance is one region's transcript... several chats in one matrix window stream at once"; queue/queue.js:1-8 "every request carries this instance id"; terminal/terminal.js:1-9 "one tab is one PTY, many tabs per instance"; mount/mount.js:1-8 explicitly says "the old chat pane drew these rows... Here they are their own widget" (mini-queue) and describes mount as new with no old pane.
- Frame vocabulary is different: `open`/`file`/`save`/`saved` (editor/editor.js:3-5), `follow`/`unfollow`/`input`/`close_shell`/mirror-kind `term` (terminal/terminal.js:3-6), `gate_action` (chat/chat.js:4-5, mini-queue/mini-queue.js:4), `feed`/`gate_broadcast`/`ask`/`gate_pending` (mini-queue/mini-queue.js:5), `track_list`/`ade_init` (terminal/terminal.js:6), `create_track`/`insert_region`/`track_created` (mount/mount.js header).
- REST routes are under a different namespace: `/api/fs/read`, `/api/fs/raw`, `/api/fs/duplicate`, `/api/fs/reveal`, `/api/fs/stat` (chat/chat.js:296, viewer/viewer.js:86,90, browser/browser.js:107,115,154), `/api/library/providers` (chat/chat.js:24), `/api/session-settings/` (chat/chat.js:418). None of the old `/api/saves`, `/api/voices`, `/api/policy`, `/api/global`, `/api/rooms` routes appear anywhere in the eight new widget files grepped.
- DOM convention: new widgets build every element via `createElement` + `.className = "..."` with an instance-scoped prefix per widget (`cq-*` for chat and queue, `mxed-*` for editor, `mxtm-*` for terminal, `mx-browser-*` for browser, `mx-viewer-*` for viewer, shared `mx-btn`/`mx-dim`/`mx-panel`). No fixed global `id="..."` attributes were found in any of the eight new files — multi-instance by design, matching the header comments.

Conclusion: these are not the files Brandon feared they might be mixed up with — they are cleanly the old `shells/ade/` single-socket, singleton-id generation, distinct in transport, frame names, routes, and DOM convention from the new region/session-scoped D-series widgets.

## DIFF PREVIEW

Per confirmed pair — old ids/classes with no equivalent literal in the new file (new side lists what it uses instead, since it carries no matching global ids at all):

**chat.js → chat/chat.js**
- Old ids: `chat-flag`, `busy-indicator`, `busy-dot`, `busy-word`, `jump-bottom`, `log`, `chat-meters`, `met-ctx`, `met-cache`, `chat-session-controls`
- Old classes: `hidden`, `busy-hidden`, `phase-timer`, `sess-btn`, `sld-row`, `sld-project`, `sld-name`, `sld-preview`, `sld-resume`, `sld-open`, `sld-del`, `sld-empty`, `vad-chk`, `hmm-l`, `hmm-d1/d2/d3`, `drag-over`, `open`, `recording`, `thinking`, `t-active`
- New has none of these — only `cq-*` classes (`cq-turn`, `cq-who`, `cq-body`, `cq-pill`, `cq-drop`, `cq-code`, `cq-plain`, `cq-chat`, `cq-head`, `cq-pick`, `cq-ctx`, `cq-speech`, `cq-script`, `cq-input`, `cq-btn`, `cq-foot`, `cq-empty`)

**queue.js → queue/queue.js**
- Old ids: `q-list`, `q-refresh`, `q-review-toggle`
- Old classes: `daemon-cell-head`, `q-btn`, `q-refresh`, `q-filter`, `q-list`, `q-cond`, `q-driver`, `q-hook`/`q-hook-*`, `q-time`, `q-type`
- New has none of these — only `cq-*` classes (`cq-row`, `cq-pending`, `cq-settled`, `cq-t`, `cq-region`, `cq-edge`, `cq-what`, `cq-detail`, `cq-queue`, `cq-head`, `cq-pill`, `cq-btn`, `cq-list`, `cq-empty`)

**editor.js → editor/editor.js**
- Old ids: `editor-bar`, `editor-new`, `editor-path`, `editor-save`, `editor-save-modal`, `editor-status`, `editor-toctx`, `monaco-editor`, `monaco-wrap`, `esm-box`, `esm-hdr`, `esm-path`, `esm-up`, `esm-list`, `esm-ftr`, `esm-close`, `esm-choose`
- New has none of these — only `mxed-*` classes (`mxed-bar`, `mxed-body`, `mxed-diff`, `mxed-monaco`, `mxed-path`, `mxed-preview`, `mxed-status`, `mxed-tab`, `mxed-tab-x`, `mxed-tabs`, `mxed-wrap`, `mxed-split`) plus shared `mx-btn`

**terminal.js → terminal/terminal.js**
- Old ids: `term`, `term-wrap`, `shell-input-wrap`, `shell-input-divider`, `shell-msg`, `shell-send`
- Old classes: `dragging`, `term-focused`
- New has none of these — only `mxtm-*` classes (`mxtm-bar`, `mxtm-pane`, `mxtm-panes`, `mxtm-region`, `mxtm-status`, `mxtm-tab`, `mxtm-tab-x`, `mxtm-tabs`, `mxtm-wrap`) plus shared `mx-btn`

**browser.js → browser/browser.js**
- Old ids: `files-toolbar`, `files-path`, `files-chdir`, `files-makeroot`, `files-refresh`, `files-hidden-label`, `files-hidden-chk`, `files-msg`, `files-tree-wrap`, `files-tree`, `files-root-modal`, `frm-hdr`, `frm-path`, `frm-up`, `frm-list`, `frm-ftr`, `frm-close`, `frm-choose`
- Old classes: `tree-root`, `drag-over`, `selected`
- New has none of these — only `mx-browser-*` classes (`mx-browser`, `mx-browser-bar`, `mx-browser-chev`, `mx-browser-children`, `mx-browser-name`, `mx-browser-node`, `mx-browser-row`, `mx-browser-size`, `mx-browser-tree`) plus shared `mx-btn`, `mx-dim`, `mx-panel`

**preview.js → viewer/viewer.js**
- Old ids: `preview-pane-bar`, `preview-pane-url`, `preview-pane-go`, `preview-pane-refresh`, `preview-pane-frame`
- New has none of these — only `mx-viewer-*` classes (`mx-viewer`, `mx-viewer-bar`, `mx-viewer-body`, `mx-viewer-csv`, `mx-viewer-html`, `mx-viewer-image`, `mx-viewer-markdown`, `mx-viewer-mermaid`, `mx-viewer-pdf`, `mx-viewer-tab`, `mx-viewer-tab-x`, `mx-viewer-tabs`, `mx-viewer-video`) plus shared `mx-btn`, `mx-dim`

Note: old panes build ids via HTML template-string literals (`id="..."` inside innerHTML); new widgets build classes via JS property assignment (`el.className = "..."`) with zero fixed global ids found. This is a structural convention difference, not a naming coincidence — no old id or class was found reused verbatim in any new widget file grepped.

## READS BEYOND THE LIST

None. Only `head -15` header lines and `grep -n` were used across all eleven old panes and eight new widget files.

## BLOCKERS

- ledger.js, settings.js, conference.js, shell.js, daemonlog.js have no confirmed pairing target in the D-series widget list given for this job. If spec agents need old-pane reference for the new `ledger` widget (which exists under static/js/widgets/ledger/ but was outside this job's scope), that comparison has not been done — flag to whichever job covers ledger/E-series.
- Brandon said he "fears they are not the files he thinks" — recon confirms the old panes ARE the pre-Phase-1 shells/ade generation (dated 2026-07 through 2026-08-21 in header comments), not stale placeholders or a different unrelated build. Confidence: high, based on header-comment dates and the shells/ade pointer already in this project's CLAUDE.md map.
