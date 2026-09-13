# SCOPE — Phase 4 — Motion and 3D

Written 2026-09-12. Decisions only, as Brandon set them in the phase 1
design session. No specs until phase 3 is green. Facts from code are in
SCOPE-old-phase4-6-motion-agent-threejs.md, PHASE 4 and PHASE 6
sections; read those there.

Depends on phase 3: the canvas core, the play seam
`render.page(pageId, {play})`, the `canvas.mode` channel, the State
writers `setAnimations`, `setBehaviors`, `setLibraryMotion` that 3A
adds.

## DECIDED

- One phase. Motion first, 3D second, serial. 3D rides motion's
  record.
- Jobs and models: 4A records + Render play + file overrides, opus,
  tight spec written with Brandon. 4B Motion widget, sonnet. 4C 3D
  kit type, opus. Redpen sonnet after each. Headed opus at phase end.
- Motion touches phases 1 to 3 only through the play seam and
  `canvas.mode`. Nothing else built before it changes.
- Data shape stands from the old scope: animation {id, prop, from,
  to, duration, easing, delay, trigger, iterations}; behavior {id,
  event, action, target, args}. Library-level ones named, referenced
  by id. Doc version 3 if the record shape changes; add to migrate.
- Play lives in Render behind the seam: keyframes and rules into the
  style block, listeners in the iframe document, custom js injected.
  Play false emits none of it. Canvas mode holds still; Preview plays.
- Motion widget: option `canvas` like Tools, follows `canvas.select`.
  Per selected widget an animations list and a behaviors list, add,
  edit, remove, reorder. Library tab. Timeline strip per animation.
- File mode motion: a JSON script block plus applier script in the
  HTML, edited through a patch. Same Canvas and Preview rule.
- 3D: a kit type whose html is a canvas element and whose js is the
  scene. three.js is one more script through the play seam. The
  animatable list names scene properties. Same-origin iframe stays.
- Every open item becomes a widget option with a default, per the
  mid-run rule: timeline list or scrubber; custom JS in Preview only
  or also on export; scroll trigger on or off.

## OPEN

- Everything about 3D past the first scene type.
- The 4A spec's contents. Brandon and the session agent write it in
  chat first.

## USER OUTCOME

Select a widget, open Motion, add an animation, switch to Preview,
watch it move. Add a click behavior, follow the link. Save an HTML
file with motion in it and open it plain in a browser, it plays. Drop
a 3D scene type on a page and animate a scene property the same way.
