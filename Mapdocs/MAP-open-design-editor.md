# MAP — Open Design HTML Editor Layer

Repo: /Users/moth3rship/Downloads/open-design-main (read only). Recon scope: apps/web + two named spec files.

## PURPOSE

The HTML editor ("Manual Edit mode") lets a user select an element in a rendered HTML artifact and change its text, links, images, attributes, or inline styles directly, with the project's on-disk HTML file as the sole source of truth. It is one of five modes on the same artifact (`Preview`, `Edit`, `Comment AI`, `Tweaks`, `Draw`), each scoped separately: Edit never calls an AI agent, and Draw is a separate annotation/screenshot tool that does not mutate HTML.

## FILE MAP

| path | bytes | bytes read | role |
|---|---|---|---|
| apps/web/src/components/ManualEditPanel.tsx | 54,041 | 54,041 (whole) | Right-side inspector React panel: content/style fields, undo/redo/delete buttons, save/cancel footer. No DOM/iframe access — pure props in, patch/draft callbacks out. |
| apps/web/src/components/ManualEditSelectionOverlay.module.css | 6,291 | 6,291 (whole) | CSS for host-side selection frame, move/resize handles, crop mode, alignment guides — drawn in the host document over the iframe. |
| apps/web/src/components/ManualEditTextToolbar.module.css | 4,394 | 4,394 (whole) | CSS for floating typography toolbar shown above a selected text element. |
| apps/web/src/components/ManualEditColorPicker.module.css | 3,032 | 3,032 (whole) | CSS for the SV/hue/alpha color picker popover used by the toolbar. |
| apps/web/src/components/PreviewModal.tsx | 46,766 | 46,766 (whole) | Read-only full-screen preview modal (share/export/fullscreen). Unrelated to Manual Edit; renders a separate sandboxed iframe via `srcDoc`. |
| apps/web/src/components/PreviewDrawOverlay.tsx | 74,533 | 74,533 (whole, 2 reads) | `Draw` mode: canvas-based freehand/box/text annotation layer over the preview iframe. Outputs a composited PNG sent as a chat annotation; never touches artifact HTML. |
| apps/web/src/artifacts/renderer-registry.ts | 3,622 | 3,622 (whole) | Picks which renderer (html / deck-html / react-component / markdown / svg) handles a given artifact file; not editor logic itself. |
| apps/web/src/components/FileViewer.tsx | 851,479 | ~28,247 (targeted, grep-directed) | Owns the artifact preview iframe(s), all Manual Edit state/history, the save pipeline, and the postMessage bridge listener. Read via grep-located line ranges only (3.3% of file). |
| apps/web/tests/components/FileViewer.manual-edit.test.tsx | 30,354 | 30,354 (whole) | Behavioral spec for edit-mode entry, hover/select, drag, text session, save/cancel, delete-last-root guard. |
| apps/web/tests/components/FileViewer.manual-edit-history.test.tsx | 18,084 | 18,084 (whole) | Behavioral spec for undo/redo persistence, pending-style flush on mode switch, srcDoc retention across exit. |
| apps/web/src/components/html-source-snapshot-cache.ts | 4,437 | 4,437 (whole) | In-memory LRU cache of already-rendered HTML source strings, keyed by project/file/mtime/size. Not part of the edit/write path. |
| apps/web/src/components/file-viewer-render-mode.ts | 16,146 | 16,146 (whole) | Pure decision functions for URL-load vs srcDoc iframe transport (`shouldUrlLoadHtmlPreview`), plus heuristics (`htmlNeedsSandboxShim`, `htmlNeedsFocusGuard`, `htmlNeedsRedirectGuard`, `htmlNeedsPoweredPreview`). |
| apps/web/src/components/SketchEditor.tsx | 40,418 | ~1,900 (first 60 lines) | Separate wireframe tool wrapping `@excalidraw/excalidraw`. Not an HTML editor; confirmed only for role per task scope. |
| apps/web/src/edit-mode/types.ts | 5,890 | 5,890 (whole) | `ManualEditPatch`, `ManualEditTarget`, `ManualEditStyles`, `ManualEditHistoryEntry`, bridge message types. Not in the original file list; read because it is imported directly by ManualEditPanel.tsx and FileViewer.tsx and defines the patch/history contract the questions ask about. |
| apps/web/src/edit-mode/source-patches.ts | 27,815 | 27,815 (whole) | `applyManualEditPatch` — the actual mutation function. Parses the HTML source string into an offline `Document`, mutates that, re-serializes. Read for the same reason as types.ts. |
| apps/web/src/edit-mode/bridge.ts | 58,551 | 58,551 (whole) | `buildManualEditBridge` — the `<script>` string injected into the iframe's srcDoc. Runs inside the sandboxed frame; owns hover/select/drag/text-edit on the live DOM and all `postMessage` traffic to the host. Read for the same reason. |
| apps/web/src/providers/registry.ts | (not measured) | ~35 lines (targeted) | `writeProjectTextFileDetailed` — the client-side fetch that POSTs saved HTML to the daemon. Read only this function; outside the named file list but inside apps/web and directly in the write-back chain. |
| specs/current/manual-edit-mode-requirements.md | 14,146 | 14,146 (whole) | Accepted requirements doc for the migrated feature. |
| docs/plans/manual-edit-mode-implementation.md | 1,988 | 1,988 (whole) | Short implementation plan referencing the requirements doc. |

Not read (forbidden or out of scope): server-side handler for `POST /api/projects/:id/files` (outside apps/web), `specs/current/manual-edit-direct-manipulation.zh-CN.md` (not one of the two named spec files), `packages/contracts` (workspace package, not read beyond its import path), `skills/`, `design-systems/`, `plugins/`.

## RENDER SURFACE

- The artifact is rendered in an `<iframe>`. Two transports exist, chosen by `apps/web/src/components/file-viewer-render-mode.ts:shouldUrlLoadHtmlPreview` (`FileViewer.tsx` calls this to set `useUrlLoadPreview`):
  - **URL-load**: `<iframe src="/api/projects/:id/raw/:file">`.
  - **srcDoc inline**: `<iframe srcDoc={...}>`, built by `buildSrcdoc` (imported, not read) plus the edit bridge.
- Manual Edit mode always forces the srcDoc path (`file-viewer-render-mode.ts:109` `if (d.editMode) return false;` inside `shouldUrlLoadHtmlPreview`) because only srcDoc carries the injected edit bridge.
- Sandbox attribute for the Manual Edit / default srcDoc iframe: `sandbox="allow-scripts allow-downloads"` (FileViewer.tsx:17521-17528, and the equivalent URL-load default at FileViewer.tsx:11692-11693). **No `allow-same-origin`.**
- One exception: `POWERED_PREVIEW_SANDBOX` (FileViewer.tsx:389-390) = `"allow-scripts allow-same-origin allow-downloads allow-popups allow-forms allow-modals allow-pointer-lock"`, used only for artifacts detected as needing GPU/Worker/WASM/SharedArrayBuffer (`htmlNeedsPoweredPreview`, file-viewer-render-mode.ts:237). Manual Edit does not use this path in the read code.
- PreviewModal.tsx (separate, read-only preview) uses its own iframe: `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`, `srcDoc={srcDoc}` (PreviewModal.tsx:1050-1056). Also no `allow-same-origin`.
- Conclusion: the Manual Edit preview iframe is **opaque-origin / cross-origin to the host**, not same-origin. The host cannot read `contentDocument`; grep of FileViewer.tsx found zero uses of `contentDocument` and no direct cross-frame DOM reads for edit state — confirmed by the postMessage-only bridge design below.

## EDIT MODEL

Two things are mutated, at two different times, for two different purposes:

1. **Live iframe DOM (visual only, ephemeral)** — the injected bridge script (`apps/web/src/edit-mode/bridge.ts`, function `buildManualEditBridge`, lines 171-1294) runs inside the sandboxed iframe and directly manipulates its own live DOM:
   - Drag: `document.addEventListener('pointermove', ...)` (bridge.ts:1158-1219) writes `el.style.transform = composeTransform(...)` live (bridge.ts:1185) while dragging.
   - Inline text edit: `makeEditable()` (bridge.ts:834-862) sets `contenteditable="plaintext-only"` on the live element and lets the browser edit it directly.
   - Live style preview: `applyPreviewStyles()` (bridge.ts:886-905) sets `el.style.setProperty(...)` on the live element in response to a host `od-edit-preview-style` message.
   - None of this live DOM state is ever read back by the host or serialized for saving — it is throwaway visual feedback.
2. **An offline parsed `Document` built fresh from the tracked HTML source string (the actual mutation that gets saved)** — `applyManualEditPatch(source, patch)` in `apps/web/src/edit-mode/source-patches.ts:109`:
   - `parseSource(source)` (source-patches.ts:235-245) creates a new `Document` via `DOMParser().parseFromString(source, 'text/html')` — not the iframe's document.
   - The patch (`set-text`, `set-link`, `set-image`, `set-style`, `set-attributes`, `set-outer-html`, `remove-element`, `set-token`, `set-full-source`) is applied to that offline `Document` (source-patches.ts:130-184).
   - `serializeSource(doc, originalSource)` (source-patches.ts:247-250) turns it back into a string: `doc.body.innerHTML` for a body-only source, or `` `<!doctype html>\n${doc.documentElement.outerHTML}` `` for a full-document source.
   - Called from `FileViewer.tsx:13245` inside `applyManualEdit()` (FileViewer.tsx:13221), using `sourceRef.current` as the base — the last-saved/tracked source string, not anything read from the iframe.

So: drags and inline text edits are shown live by mutating the sandboxed iframe's own DOM (function `applyPreviewStyles`, bridge.ts:886; and native `contenteditable`), but the value that gets persisted is recomputed by re-parsing and patching the tracked source **string** through `applyManualEditPatch`. The two can drift only by design tolerance (e.g. browser CSS serialization normalization); the host never reads the live DOM back.

## WRITE-BACK PATH

Full chain, source string in, disk out:

1. Bridge posts a message describing the gesture, e.g. `od-edit-drag-commit` (`{id, transform}`, bridge.ts:1042) or `od-edit-select`/`od-edit-text-commit`.
2. FileViewer's `message` listener routes it — drag: `FileViewer.tsx:12639` (`data.type === 'od-edit-drag-commit'`) calls `handleManualEditStyleChange(id, dragStyles, 'Move element')` (FileViewer.tsx:12719).
3. `handleManualEditStyleChange` (FileViewer.tsx:12719-12735) stores the change in `manualEditPendingStyleRef` and immediately live-previews it in the iframe via `previewStyleToIframe` (defined FileViewer.tsx:12147; posts `od-edit-preview-style`) — **no disk write yet** for style/drag edits.
4. Persisting the pending style happens either on an explicit Save (`onSaveDraft` → `saveManualEditPanelDraft`, FileViewer.tsx:13101) or automatically when leaving the field/mode (`flushManualEditStyleSave`, FileViewer.tsx:12736-12752), which calls `applyManualEdit({id, kind:'set-style', styles}, label)`.
   - Content/link/image/attribute/HTML/full-source/remove-element patches go straight through `onApplyPatch` → `applyManualEdit` without the pending-style debounce (confirmed by test: dropped drag is held pending until Save, FileViewer.manual-edit.test.tsx:566-613; a style/token apply via `onApplyPatch` saves immediately, FileViewer.manual-edit-history.test.tsx:200-262).
5. `applyManualEdit(patch, label)` (FileViewer.tsx:13221-13358):
   - `applyManualEditPatch(baseSource, patch)` (FileViewer.tsx:13245 → source-patches.ts:109) computes `result.source` (new full HTML string).
   - `writeProjectTextFileDetailed(projectId, file.name, result.source, {...})` (FileViewer.tsx:13267) — the actual disk write call.
6. `writeProjectTextFileDetailed` (apps/web/src/providers/registry.ts:3025-3069) does `fetch('/api/projects/${projectId}/files', { method: 'POST', body: JSON.stringify({ name, content, ... }) })`. The server-side handler that turns this into a file write is outside `apps/web` and was not read (out of scope).
7. On success, FileViewer updates `sourceRef.current = result.source`, pushes a `ManualEditHistoryEntry`, and (for non-style patches) calls `syncRetainedManualEditDocument` to reconcile the live srcDoc without a full reload.

Is the file on disk the same HTML that is rendered? **No, it is a transform of it.** The rendered srcDoc includes host-injected material (the edit bridge `<script data-od-edit-bridge>`, bridge style `<style data-od-edit-bridge-style>`, guides layer, possibly a sandbox/focus/redirect shim) that is never part of `sourceRef.current`/what gets saved. The saved content is `sourceRef.current` re-parsed and re-serialized by the browser's `DOMParser`/`outerHTML`, which is the tracked application-source string, not a scrape of the live rendered document. Undo/redo (below) also each independently trigger this same POST.

## IFRAME BOUNDARY

Boundary crossing is exclusively `postMessage` in both directions, plus one host→iframe injected `<script>` that the host writes into the srcDoc string ahead of time. No `contentDocument`/`contentWindow.document` access for edit state was found (`contentDocument`: 0 hits in FileViewer.tsx; `contentWindow` hits are all `postMessage`/ref bookkeeping, not DOM reads).

Iframe → host (bridge.ts, all via `window.parent.postMessage(..., '*')`):
- `od-edit-targets` (bridge.ts:497) — full list of discovered elements, on mode enable/DOM mutation/resize.
- `od-edit-hover` / `od-edit-inspect-hover` (bridge.ts:729-730).
- `od-edit-select` / `od-edit-inspect-select` (bridge.ts:1069-1070).
- `od-edit-background` (bridge.ts:1059) — click on empty canvas.
- `od-edit-drag-commit` (`{id, transform, display?}`, bridge.ts:1042).
- `od-edit-text-session` (`{id, active, changed?, committed?}`, bridge.ts:803-831).
- `od-edit-text-commit` (`{id, value}`, bridge.ts:823-827).
- `od-edit-preview-style-applied` (ack for a preview style push, bridge.ts:889/901/903).
- `od-edit-guides-restore:result`, `od-edit-screenshot-hotkey`, `od:preview-open-file` — auxiliary.

Host → iframe (FileViewer.tsx, `iframe.contentWindow.postMessage`):
- `od-edit-mode` (`{enabled}`) — toggles edit mode in the bridge (bridge.ts:908-926).
- `od-edit-selected-target` (`{id}`) — sets/clears selection chrome.
- `od-edit-preview-style` (`{id, styles, version}`) — live style push, handled by `applyPreviewStyles` (bridge.ts:886).
- `od-edit-preview-text` (`{id, value}`) — live text push (bridge.ts:991-1005).
- `od-edit-text-finish` (`{commit}`) — force-end an inline text session.
- `od-edit-guides-mode`, `od-edit-capture-chrome`, `od-edit-hover-reset`, `od-edit-guides-restore` — overlay/guide bookkeeping.
- `od:preview-runtime-state-capture` / `od:preview-runtime-state-restore` — see Freeze/Play.
- `od:preview-scroll-restore`, `od:preview-scroll-by` — scroll bridge (unrelated iframe-scroll helper also used by `PreviewDrawOverlay.tsx:371-397`).

The host-injected `<script data-od-edit-bridge>` (bridge.ts:172-1294) and `<style data-od-edit-bridge-style>` (bridge.ts:1297-1368) are concatenated into the srcDoc HTML string by FileViewer before assigning `iframe.srcDoc` (build site not read; identified by the `data-od-edit-bridge` marker asserted in FileViewer.manual-edit-history.test.tsx:185, 196).

## UNDO AND HISTORY

- History lives in React state in FileViewer: `manualEditHistory` / `manualEditUndone`, both `ManualEditHistoryEntry[]` (declared FileViewer.tsx:8910-8911).
- Entry shape (`apps/web/src/edit-mode/types.ts:121-128`):
  ```
  { id: string; label: string; patch: ManualEditPatch; beforeSource: string; afterSource: string; createdAt: number }
  ```
  — each entry carries the **full HTML source string** before and after the patch, not a diff.
- A new entry is pushed on every successful `applyManualEdit` (FileViewer.tsx:13283-13297).
- `undoManualEdit()` (FileViewer.tsx:13387-13445): pops the latest history entry, calls `writeProjectTextFileDetailed(projectId, file.name, latest.beforeSource, {versionLabel: 'Undo ' + latest.label, ...})` — **undo is itself a new disk write**, not a client-only state revert. On success it moves the entry to `manualEditUndone`.
- `redoManualEdit()` (FileViewer.tsx:13451+, same file) is the mirror: pops from `manualEditUndone`, writes `latest.afterSource` back, pushes the entry back onto `manualEditHistory`.
- Confirmed by test: two sequential edits + one undo produce three separate saved sources, the second matching the pre-edit source exactly (FileViewer.manual-edit-history.test.tsx:200-262).
- `cancelManualEditPendingStyleSnapshot` (ManualEditPanel.tsx-adjacent export, FileViewer.tsx:1518) removes only the invalidated style keys from an in-flight pending-style save rather than dropping the whole pending patch.

## FREEZE AND PLAY

- **Preview freeze (source-level, not animation-level):** `manualEditFrozenSource` is set once at edit-mode entry (`FileViewer.tsx:9930-9933`, effect keyed on `manualEditMode`) from the live preview source, then held fixed. Comment says: "Freeze the iframe input on the snapshot taken at Edit-mode entry. Any source rewrite during edit (1.5s debounced set-style patches) stays invisible to the iframe — live updates flow through `od-edit-preview-style` postMessage instead, so the canvas never has to reload" (FileViewer.tsx:9926-9929). This prevents background source changes (e.g. an agent run streaming edits elsewhere) from yanking the canvas out from under the user while editing; it is not a script/animation pause.
- **Runtime-state capture/restore (survives forced reloads):** `capturePreviewRuntimeState(target)` (FileViewer.tsx:8458-8494) posts `od:preview-runtime-state-capture` to the iframe and awaits `od:preview-runtime-state-captured` (500ms timeout, 50ms retry interval) carrying a `PreviewRuntimeState` (type from workspace package `@open-design/contracts/runtime/preview-runtime-state`, not read). `postAndConsumePreviewRuntimeState(target)` (FileViewer.tsx:9954-9979) later posts `od:preview-runtime-state-restore` with that captured state to a replacement srcDoc frame. The bridge side of this capture/restore protocol lives outside `bridge.ts`/`source-patches.ts` (not located in the read files) — this is the only found mechanism resembling a state "freeze" across a reload, and no explicit CSS-animation-pause or `element.pause()` call was found scoped to Manual Edit mode.
- A separate, unrelated `freezeMotion: true` flag (FileViewer.tsx:11021) "settles deck animations at their final frame" for the export/PDF path — not Manual Edit.

## COUPLING

| file | repo imports | npm imports | React-bound functions | DOM-only functions |
|---|---|---|---|---|
| ManualEditPanel.tsx | `../providers/registry` (types), `../i18n`, `../edit-mode/types`, `./Icon` | react | `ManualEditPanel`, `ContentInspector`, `StyleInspector`, `PageInspector`, all `*Row` components (use `useState`/`useEffect`) | `normalizeManualEditStyles`, `normalizeHexColor`, `normalizeLengthValue`, `stripPxUnit`, `clamp` — pure value normalizers, no DOM |
| edit-mode/source-patches.ts | `./types` | none (uses global `DOMParser`/`document`) | none | `applyManualEditPatch`, `parseSource`, `serializeSource`, `findEditableElement`, `setInlineStyles`, `replaceOuterHtml` — all operate on an offline `Document`, never React state |
| edit-mode/bridge.ts | `` (none — string-template only) | none | none (emits a plain JS string, no React) | Entire file is DOM-only: it is a **source-code generator** (`buildManualEditBridge`, `buildManualEditBridgeStyle`, `buildManualEditKeyboardGuard`) whose *output string* runs inside the iframe against `document`/`window` directly |
| edit-mode/types.ts | none | none | none | Pure types + `emptyManualEditStyles()` (no DOM, no React) |
| FileViewer.tsx (targeted regions read) | `./ManualEditPanel`, `../edit-mode/source-patches`, `../edit-mode/types`, `./SketchPreview`, `./IframeKeepAlivePool`, `../providers/registry`, `@open-design/contracts/runtime/preview-runtime-state` (workspace package) | react | `applyManualEdit`, `undoManualEdit`, `redoManualEdit`, `handleManualEditStyleChange`, `saveManualEditPanelDraft` — all read/write React state (`setManualEditHistory`, `setSource`, refs) | `previewStyleToIframe`, `postSelectedManualEditTargetToIframe` — pure `iframe.contentWindow.postMessage` calls, no state reads beyond a ref |
| providers/registry.ts (`writeProjectTextFileDetailed`) | none (uses global `fetch`) | none | none | Pure network I/O function, no DOM, no React |
| PreviewDrawOverlay.tsx | `./Icon`, `./RemixIcon`, `../i18n`, `../runtime/exports`, `../utils/imeComposing` | react, react-dom (`createPortal`, `flushSync`) | The whole component (uses `useState`/`useRef`/`useCallback`/`useLayoutEffect` throughout) | `redraw`, `drawNormalizedBox`, `drawTextMarks`, `compositeWithBackground` — canvas-only, read refs but don't touch React state |
| PreviewModal.tsx | `../i18n`, `../lib/copy-to-clipboard`, `../runtime/exports`, `../runtime/srcdoc`, `./Icon` | react | The whole component | `buildSocialShareUrl`, `openShareDestination` — pure/DOM helpers, no state |
| renderer-registry.ts | `./manifest`, `./markdown`, `./types`, `../types` | none | none | `resolveManifest`, `RendererRegistry.resolve`, each renderer's `canRender` — pure, no DOM |
| file-viewer-render-mode.ts | none | none | none | All exports are pure string-scan predicates (`shouldUrlLoadHtmlPreview`, `htmlNeedsSandboxShim`, etc.); no DOM, no React |
| html-source-snapshot-cache.ts | none | none | none | Plain in-memory `Map`-backed LRU class; no DOM, no React |
| SketchEditor.tsx (60 lines read) | `../i18n`, `./Icon`, `./Toast`, `./sketch-colors`, `./sketch-model` | `@excalidraw/excalidraw` (+ its `/types`, `/element/types`) | (not determined from 60 lines) | (not determined from 60 lines) |

## DRAW OVERLAY

- `PreviewDrawOverlay.tsx` wraps the preview iframe's host container and renders an absolutely-positioned `<canvas>` (`PreviewDrawOverlay.tsx:1282-1301`) plus a text-label layer (`preview-draw-text-layer`, lines 1303-1418) on top of `children` (the iframe), inside the same host DOM — it draws on its own `<canvas>` element, never on the iframe or the artifact DOM.
- Tools: box-select (`selectionBoxesRef`), freehand pen (`strokesRef`), and dropped text labels (`textMarks` React state) — all tracked in refs/state in the host, not sent into the iframe.
- Undo/redo here (`undoStroke`/`redoStroke`, lines 661-701) are host-local stacks (`strokesRef`/`undoneStrokesRef`) — a separate, unrelated undo system from Manual Edit's `manualEditHistory`.
- Output: `compositeWithBackground(snap)` (lines 926-969) draws a captured preview snapshot (`requestPreviewSnapshot`/`captureSnapshot`, from `../runtime/exports`, not read) onto an offscreen `<canvas>`, then paints the target-box, strokes, and text marks on top, and resolves `canvas.toBlob('image/png')` — a single composited PNG.
- That PNG is wrapped in a `File` and dispatched as `window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, { detail }))` (lines 1019-1030) with `{file, note, action, filePath, markKind, bounds, target}` — sent toward chat/annotation handling, not the file-save pipeline. Confirms the spec's statement that Draw mode "does not mutate HTML/CSS directly."

## SPEC VS CODE

Both named spec files were read in full (`specs/current/manual-edit-mode-requirements.md`, `docs/plans/manual-edit-mode-implementation.md`).

- **Patch types**: spec's `EditPatch` union (requirements.md, Patch Model section) matches `ManualEditPatch` in `edit-mode/types.ts:110-119` exactly, kind-for-kind (`set-text`, `set-link`, `set-image`, `set-token`, `set-style`, `set-attributes`, `set-outer-html`, `set-full-source`).
- **History entry**: spec's `EditHistoryEntry` (requirements.md, Patch Model) matches `ManualEditHistoryEntry` in `edit-mode/types.ts:121-128` exactly, including the "full-source snapshot" undo/redo approach the spec explicitly allows ("Undo/redo can initially use full-source snapshots. Later it can be optimized to patch inversion.") — code still uses full-source snapshots, not patch inversion.
- **Source patching flow**: spec's 9-step "Patch flow" (requirements.md, Source Patching Rules) matches the code path traced above (`applyManualEditPatch` → `writeProjectTextFileDetailed` → refresh) step for step, including "Host reads the current source document" (→ `sourceRef.current`) and "Preview iframe reloads from updated srcDoc" (though code adds a live-postMessage fast path for style/text edits that the spec's v1 flow does not describe).
- **UI layout mismatch**: the spec's "Right Edit Modal" calls for tabs — `Content`, `Style`, `Attributes`, `Html`, `Source` (requirements.md, Right Edit Modal). The current `ManualEditPanel.tsx` has no tab UI at all: `ContentInspector` and `StyleInspector` (ManualEditPanel.tsx:385, 783) render in one scroll list; no Attributes/Html/Source tab or JSON editor was found in this file. Attribute/outer-HTML/full-source edits remain reachable only through the underlying patch types (`set-attributes`, `set-outer-html`, `set-full-source` still exist in types.ts and are handled in source-patches.ts), not through any UI control visible in the files read.
- **Left Layers rail**: spec requires a left-side layer list (requirements.md, Left Rail). No layer-list component was found among the files read (not in ManualEditPanel.tsx; a dedicated layers panel, if any, was not in the required file list and was not located).
- **Non-goal reversal confirmed in code**: the spec's "Non-Goals for v1" list originally excluded drag-based layout editing, but an inline amendment ("v2 update") says free-move drag with alignment guides, edge resize, duplication, image replace/crop, and a floating typography toolbar shipped as a "direct-manipulation upgrade." The code confirms this: `od-edit-drag-commit` free-drag (bridge.ts:1010-1219), the alignment/measurement guide system (bridge.ts:339-421), and `ManualEditTextToolbar.module.css`/`ManualEditColorPicker.module.css` (floating typography toolbar + color picker) are all present and implemented.
- **Migration paths differ**: spec's "Likely production destinations" lists `apps/web/src/edit-mode/sourcePatches.ts` (camelCase) and a monolithic `EditModePanel.tsx`; actual code uses `source-patches.ts` (kebab-case) and split `ManualEditPanel.tsx` / `ManualEditSelectionOverlay.module.css` / `ManualEditTextToolbar.module.css` / `ManualEditColorPicker.module.css` instead of one panel file plus a separate `EditLayersPanel.tsx` (not found).

## UNKNOWNS

- Server-side handler behind `POST /api/projects/:id/files` (writes to disk) — lives outside `apps/web`, not read.
- Exact place FileViewer.tsx concatenates `buildManualEditBridge`/`buildManualEditBridgeStyle` output into the srcDoc HTML string (the srcDoc assembly / `buildSrcdoc` function itself) — not located within the grep budget for FileViewer.tsx, and `buildSrcdoc` (imported by PreviewModal.tsx from `../runtime/srcdoc`) was not read.
- `PreviewRuntimeState` shape and what fields it captures (animations, video/audio playback, form values, scroll, timers) — defined in workspace package `packages/contracts` (`@open-design/contracts/runtime/preview-runtime-state`), outside `apps/web`, not read.
- Whether a left-side "Layers" panel exists anywhere in the current codebase (spec requires one; not found in the files read; a dedicated file was not in the given file list).
- Full behavior of `SketchEditor.tsx` beyond its first 60 lines (role confirmed as Excalidraw-based wireframe tool per task scope; its React/DOM coupling split not determined).
- Whether `manualEditKindForElement`/`isMeaningfulManualEditElement` exports in `edit-mode/bridge.ts` (top-level, outside the injected-script string) are consumed anywhere in FileViewer.tsx or elsewhere — not checked.
