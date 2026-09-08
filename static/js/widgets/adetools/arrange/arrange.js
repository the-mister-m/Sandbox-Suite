// arrange widget — job canvas over a doc generator project file
//
// A node is a job. A track is an agent. Regions live inside a job and carry
// the server's reset suffix. branch / merge / group are mini nodes.
//
// The plan is the `plan` block of a doc generator project database file. The
// widget reads the whole file, edits `plan`, writes the whole file back with
// sorted keys. Every other key passes through.
//
// State per instance on frame._ar: file path and document, the plan block,
// selection, undo and redo stacks, pan and zoom, roster rows from track_list,
// feed records, waypoint lines, the settings-rows state object.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const STYLE_ID = "mx-arrange-style";
  const CSS = `
.mx-arrange{ display:flex; flex-direction:column; height:100%; min-height:0;
  position:relative; --ar-msg:#6f9bdd; }
.mx-arrange *{ box-sizing:border-box; }

/* toolbar */
.mx-arrange .ar-top{ flex:0 0 auto; display:flex; align-items:center; gap:6px;
  padding:6px 8px; background:var(--surface-1);
  border-bottom:1px solid var(--gridline); }
.mx-arrange .ar-top .ar-path{ flex:1; min-width:0; background:var(--surface-2);
  border:1px solid var(--border); color:var(--text-2); border-radius:5px;
  padding:3px 6px; font:10.5px var(--mono); }
.mx-arrange .ar-btn{ flex:0 0 auto; background:var(--surface-2);
  border:1px solid var(--border); color:var(--text-2); border-radius:5px;
  padding:3px 9px; font-size:10.5px; cursor:pointer; white-space:nowrap; }
.mx-arrange .ar-btn:hover{ border-color:var(--border-2); color:var(--text-1); }
.mx-arrange .ar-btn:disabled{ opacity:.4; cursor:default; }
.mx-arrange .ar-btn:disabled:hover{ border-color:var(--border); color:var(--text-2); }
.mx-arrange .ar-dirty{ flex:0 0 auto; width:7px; height:7px; border-radius:50%;
  background:var(--text-4); }
.mx-arrange .ar-dirty.on{ background:#fff; }

/* body */
.mx-arrange .ar-main{ flex:1; display:grid;
  grid-template-columns:242px 2px 1fr; min-height:0; }
.mx-arrange .ar-main.drawer-shut{ grid-template-columns:22px 2px 1fr; }
.mx-arrange .ar-split{ background:var(--gridline); }

/* left drawer */
.mx-arrange .ar-drawer{ background:var(--surface-1); overflow-y:auto;
  min-height:0; padding:8px; display:flex; flex-direction:column; gap:8px; }
.mx-arrange .ar-main.drawer-shut .ar-drawer{ padding:6px 2px; overflow:hidden; }
.mx-arrange .ar-strip{ background:none; border:1px solid var(--border);
  border-radius:5px; color:var(--text-4); padding:6px 0; font-size:11px;
  cursor:pointer; writing-mode:vertical-rl; }
.mx-arrange .ph{ background:var(--surface-2); border:1px solid var(--border);
  border-radius:8px; padding:9px 11px; cursor:pointer; user-select:none; }
.mx-arrange .ph.sel{ border-color:var(--border-2); background:var(--surface-3); }
.mx-arrange .ph.live{ box-shadow:0 0 0 1.5px rgba(255,255,255,.85),
  0 0 16px rgba(255,255,255,.28); border-color:#fff; }
.mx-arrange .ph-top{ display:flex; align-items:center; gap:8px; }
.mx-arrange .ph-caret{ flex:0 0 auto; color:var(--text-4); font-size:10px; }
.mx-arrange .ph-name{ flex:1; min-width:0; font-size:11px; font-weight:600;
  letter-spacing:.06em; text-transform:uppercase; color:var(--text-1); }
.mx-arrange .ph-live{ background:none; border:1px solid var(--border);
  border-radius:4px; color:var(--text-4); font-size:8.5px; letter-spacing:.08em;
  padding:2px 6px; font-weight:700; cursor:pointer; }
.mx-arrange .ph.live .ph-live{ color:var(--text-1); border-color:var(--border-2); }
.mx-arrange .ph-count{ flex:0 0 auto; font:9.5px var(--mono); color:var(--text-4); }
.mx-arrange .ph-sec{ font-size:8.5px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--text-4); font-weight:700; margin:9px 0 3px; }
.mx-arrange .ph-files{ display:flex; flex-direction:column; gap:2px;
  font:10.5px/1.5 var(--mono); color:var(--text-3); }
.mx-arrange .pf-row{ display:flex; align-items:center; gap:5px; }
.mx-arrange .pf-n{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; }
.mx-arrange .pf-x{ flex:0 0 auto; background:none; border:none; color:var(--text-4);
  font:12px var(--mono); line-height:1; padding:0 3px; border-radius:3px;
  opacity:0; cursor:pointer; }
.mx-arrange .pf-row:hover .pf-x{ opacity:1; }
.mx-arrange .pf-x:hover{ color:var(--gate-red); background:var(--surface-3); }
.mx-arrange .pf-add{ align-self:flex-start; background:none; border:none;
  color:var(--text-4); font:10.5px var(--mono); padding:1px 0; cursor:pointer; }
.mx-arrange .pf-add:hover{ color:var(--text-2); }
.mx-arrange .ph-loops{ display:flex; flex-direction:column; gap:4px; }
.mx-arrange .lchip{ display:flex; flex-direction:column; gap:4px;
  font:10.5px var(--mono); color:var(--text-2); background:var(--well);
  border:1px solid var(--border); border-radius:5px; padding:5px 7px; }
.mx-arrange .lc-row{ display:flex; align-items:center; gap:6px; }
.mx-arrange .lc-l{ font-size:9px; color:var(--text-4); letter-spacing:.04em;
  white-space:nowrap; }
.mx-arrange .lchip input{ width:44px; background:var(--surface-2);
  border:1px solid var(--border); border-radius:3px; color:var(--text-2);
  font:10px var(--mono); padding:2px 4px; }
.mx-arrange .lchip input:focus{ outline:none; border-color:var(--border-2); }
.mx-arrange .lc-wtm{ width:9px; height:9px; border-radius:2px;
  background:var(--wt-line); flex:0 0 auto; }
.mx-arrange .lc-wtm.none{ background:none; border:1px solid var(--text-4); }
.mx-arrange .lc-wtl{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; color:var(--text-1); font-size:10px; }
.mx-arrange .lc-wtl.none{ color:var(--text-4); font-style:italic; }
.mx-arrange .ph-meta{ margin-top:8px; font:9.5px var(--mono); color:var(--text-4); }
.mx-arrange .ph-none{ font-size:10px; color:var(--text-4); font-style:italic; }
.mx-arrange .ar-addphase{ background:none; border:1px dashed var(--border);
  border-radius:8px; color:var(--text-4); padding:9px; font-size:11px;
  letter-spacing:.06em; cursor:pointer; }
.mx-arrange .ar-addphase:hover{ color:var(--text-2); border-color:var(--border-2); }

/* track pane */
.mx-arrange .ar-tracks{ border-top:1px solid var(--gridline); padding-top:8px;
  display:flex; flex-direction:column; gap:4px; }
.mx-arrange .tk-row{ display:flex; align-items:center; gap:6px;
  background:var(--surface-2); border:1px solid var(--border); border-radius:6px;
  padding:5px 7px; cursor:pointer; }
.mx-arrange .tk-row:hover{ border-color:var(--border-2); }
.mx-arrange .tk-txt{ flex:1; min-width:0; }
.mx-arrange .tk-name{ font-size:11px; color:var(--text-1); overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.mx-arrange .tk-regs{ font:9.5px var(--mono); color:var(--text-3); overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.mx-arrange .tk-model{ font:9px var(--mono); color:var(--text-4); overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.mx-arrange .tk-map{ flex:0 0 auto; background:none; border:none;
  color:var(--text-4); font-size:12px; padding:2px 4px; border-radius:4px;
  cursor:pointer; }
.mx-arrange .tk-map:hover{ color:var(--text-1); background:var(--surface-3); }

/* canvas */
.mx-arrange .ar-cwrap{ position:relative; overflow:hidden; min-width:0;
  min-height:0; background:var(--plane);
  background-image:radial-gradient(rgba(255,255,255,.045) 1px,transparent 1px);
  background-size:26px 26px; cursor:default; }
.mx-arrange .ar-world{ position:absolute; left:0; top:0; width:4000px;
  height:2600px; transform-origin:0 0; }
.mx-arrange .ar-svg{ position:absolute; inset:0; width:100%; height:100%;
  pointer-events:none; }
.mx-arrange .ar-svg .cvis,.mx-arrange .ar-svg .dcvis{ fill:none; stroke-width:1.6px; }
.mx-arrange .ar-svg .chit{ fill:none; stroke:transparent; stroke-width:11px;
  pointer-events:stroke; cursor:pointer; }
.mx-arrange .ar-svg .c-unexec{ stroke:#ffffff; }
.mx-arrange .ar-svg .c-exec{ stroke:#5f5e59; }
.mx-arrange .ar-svg .w-message.c-unexec{ stroke:var(--ar-msg); }
.mx-arrange .ar-svg .w-message.c-exec{ stroke:#3d5a86; }
.mx-arrange .ar-svg .cvis.c-sel{ stroke:var(--text-1); stroke-width:2.4px; }
.mx-arrange .ar-svg .cvis.c-ghost{ stroke:var(--text-2); stroke-dasharray:4 4;
  opacity:.7; }
.mx-arrange .ar-svg .cvis.c-act{ stroke-width:2px; }
.mx-arrange .ar-svg .dcvis{ pointer-events:none; }
.mx-arrange .ar-cabends{ position:absolute; left:0; top:0; width:0; height:0; }
.mx-arrange .cabend{ position:absolute; width:9px; height:9px;
  margin:-4.5px 0 0 -4.5px; border-radius:50%; box-sizing:border-box;
  z-index:13; pointer-events:none; }
.mx-arrange .cabend.c-unexec{ background:#0d0d0d; border:1.5px solid #ffffff; }
.mx-arrange .cabend.c-exec{ background:#5f5e59; }
.mx-arrange .cabend.w-message.c-unexec{ border-color:var(--ar-msg); }
.mx-arrange .cabend.w-message.c-exec{ background:#3d5a86; }

/* cable menu */
.mx-arrange .ar-cbmenu{ position:absolute; z-index:20; display:none; width:216px;
  pointer-events:none; transform:translate(-50%,-50%); background:var(--surface-1);
  border:1px solid var(--border-2); border-radius:8px; padding:8px 9px 9px;
  box-shadow:0 10px 28px rgba(0,0,0,.55); }
.mx-arrange .ar-cbmenu.open{ display:block; }
.mx-arrange .ar-cbmenu button,.mx-arrange .ar-cbmenu input{ pointer-events:auto; }
.mx-arrange .cbm-h{ font-size:9px; letter-spacing:.07em; text-transform:uppercase;
  color:var(--text-4); font-weight:700; margin:0 0 5px; }
.mx-arrange .cbm-h2{ margin-top:8px; }
.mx-arrange .cbm-seeds{ display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
.mx-arrange .cbm-seeds button{ background:var(--surface-2);
  border:1px solid var(--border); color:var(--text-3); border-radius:5px;
  padding:3px 7px; font:9.5px var(--mono); cursor:pointer; }
.mx-arrange .cbm-seeds button:hover{ background:var(--surface-3); color:var(--text-1); }
.mx-arrange .ar-cbmenu input{ width:100%; box-sizing:border-box;
  background:var(--surface-2); border:1px solid var(--border); color:var(--text-1);
  border-radius:5px; padding:4px 6px; font:10.5px var(--mono); }
.mx-arrange .cbm-row{ display:flex; gap:6px; margin-top:7px; }
.mx-arrange .cbm-row button{ flex:1; background:var(--surface-2);
  border:1px solid var(--border); color:var(--text-2); border-radius:5px;
  padding:4px 6px; font-size:10.5px; cursor:pointer; }
.mx-arrange .cbm-row button:hover{ border-color:var(--border-2); color:var(--text-1); }
.mx-arrange .cbm-note{ font-size:9px; color:var(--text-4); line-height:1.45;
  margin-top:7px; border-top:1px solid var(--gridline); padding-top:6px; }

/* right-click menu */
.mx-arrange .ar-ctxmenu{ position:absolute; z-index:120; display:none;
  min-width:158px; background:var(--surface-1); border:1px solid var(--border-2);
  border-radius:8px; padding:5px; box-shadow:0 10px 28px rgba(0,0,0,.55); }
.mx-arrange .ar-ctxmenu.open{ display:block; }
.mx-arrange .ar-ctxmenu button{ display:block; width:100%; text-align:left;
  background:none; border:none; color:var(--text-2); border-radius:5px;
  padding:5px 8px; font:11px var(--mono); cursor:pointer; }
.mx-arrange .ar-ctxmenu button:hover{ background:var(--surface-3); color:var(--text-1); }
.mx-arrange .ctx-sep{ height:1px; background:var(--gridline); margin:4px 2px; }

/* node face */
.mx-arrange .node{ position:absolute; min-width:172px; max-width:280px;
  background:var(--surface-2); border:1px solid var(--border-2); border-radius:8px;
  padding:8px 11px 7px; cursor:grab; user-select:none; z-index:4; }
.mx-arrange .node:hover{ z-index:9; }
.mx-arrange .node.sel{ outline:2px solid var(--text-1); outline-offset:3px;
  box-shadow:0 0 0 5px rgba(255,255,255,.07); }
.mx-arrange .node.sel::after{ content:'SELECTED · del removes it';
  position:absolute; left:0; bottom:-15px; font:8.5px var(--mono);
  letter-spacing:.09em; color:var(--text-4); white-space:nowrap; }
.mx-arrange .n-head{ display:flex; align-items:baseline; gap:7px; }
.mx-arrange .n-name{ font-size:12.5px; font-weight:600; color:var(--text-1);
  min-width:24px; }
.mx-arrange .n-model{ font:10px var(--mono); color:var(--text-3);
  background:var(--surface-3); border:1px solid var(--border); border-radius:4px;
  padding:1px 6px; white-space:nowrap; }
.mx-arrange .n-notes{ font-size:11px; color:var(--text-3); line-height:1.5;
  margin:6px 0 6px; min-height:1em; }
.mx-arrange .n-name:empty::before{ content:'name'; color:var(--text-4);
  font-weight:400; }
.mx-arrange .n-model:empty::before{ content:'model'; color:var(--text-4); }
.mx-arrange .n-notes:empty::before{ content:'notes…'; color:var(--text-4);
  opacity:.75; }
.mx-arrange .n-track{ font:9.5px var(--mono); color:var(--text-3);
  letter-spacing:.04em; margin:3px 0 0; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; }
.mx-arrange .n-track:empty::before{ content:'no track'; color:var(--text-4);
  opacity:.7; }
.mx-arrange .n-regions{ font:9.5px var(--mono); color:var(--text-4);
  margin:2px 0 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mx-arrange .n-regions:empty::before{ content:'no regions'; opacity:.7; }
.mx-arrange .n-wt{ display:inline-flex; align-items:center; gap:5px;
  font:9px var(--mono); color:var(--text-3); background:var(--surface-3);
  border:1px solid var(--border); border-radius:3px; padding:2px 6px;
  margin:0 0 6px; letter-spacing:.04em; }
.mx-arrange .n-wt i{ width:8px; height:8px; border-radius:2px;
  background:var(--wt-line); font-style:normal; }
.mx-arrange .ce-ro{ cursor:default; }
.mx-arrange .ce-ro:empty::before{ content:''; }
.mx-arrange .n-status{ display:flex; align-items:center; gap:6px; min-height:15px; }
.mx-arrange .n-dot{ display:inline-flex; align-items:center; cursor:pointer;
  flex-shrink:0; min-width:10px; }
.mx-arrange .dot{ width:8px; height:8px; border-radius:50%;
  background:var(--text-2); display:inline-block; }
.mx-arrange .n-check{ display:none; color:var(--text-2); font-size:11px;
  font-weight:700; }
.mx-arrange .n-stxt{ flex:1; min-width:0; font:10px var(--mono);
  color:var(--text-4); letter-spacing:.02em; }
.mx-arrange .n-stxt:empty::before{ content:'—'; opacity:.5; }
.mx-arrange .n-ex{ position:absolute; right:5px; top:5px; background:none;
  border:none; color:var(--text-4); font-size:12px; padding:2px 4px;
  border-radius:4px; cursor:pointer; }
.mx-arrange .n-ex:hover{ color:var(--text-1); background:var(--surface-3); }

/* mini node face — glyph and name only */
.mx-arrange .node.mini{ min-width:96px; padding:6px 9px; }
.mx-arrange .node.mini .n-name{ font-size:11px; }
.mx-arrange .n-glyph{ font-size:11px; color:var(--text-3); margin-right:5px; }

/* node state and motion */
.mx-arrange .node.st-blank{ opacity:.55; border-style:dashed; }
.mx-arrange .node.st-complete{ opacity:.55; }
.mx-arrange .node.st-complete .n-check{ display:inline; }
.mx-arrange .node.st-complete .dot,.mx-arrange .node.st-blank .dot{ display:none; }
.mx-arrange .node.st-idle{ opacity:.8;
  animation:ar-idleglow 3s ease-in-out infinite; }
.mx-arrange .node.st-working,.mx-arrange .node.st-thinking{ opacity:1;
  border-color:#fff; }
.mx-arrange .node.st-working{ animation:ar-glow 1.5s ease-in-out infinite; }
.mx-arrange .node.st-thinking{ animation:ar-glow 1.1s ease-in-out infinite; }
.mx-arrange .node.st-working .dot,.mx-arrange .node.st-thinking .dot{
  animation:ar-dot 1.5s ease-in-out infinite; }
.mx-arrange .node.st-thinking .dot{ animation-duration:1.1s; }
.mx-arrange .node.st-working .n-stxt,.mx-arrange .node.st-thinking .n-stxt{
  color:var(--text-2); }
@keyframes ar-glow{
  0%,100%{ box-shadow:0 0 0 1.5px rgba(255,255,255,.85),0 0 10px rgba(255,255,255,.16); }
  50%{ box-shadow:0 0 0 1.5px rgba(255,255,255,.85),0 0 22px rgba(255,255,255,.40); }
}
@keyframes ar-idleglow{
  0%,100%{ box-shadow:0 0 0 1px rgba(255,255,255,.10); }
  50%{ box-shadow:0 0 0 1px rgba(255,255,255,.25); }
}
@keyframes ar-dot{ 0%,100%{ opacity:.55; } 50%{ opacity:1; } }

/* notches — five kinds, five looks */
.mx-arrange .notch{ position:absolute; width:13px; height:13px;
  margin:-7px 0 0 -7px; z-index:12; cursor:crosshair; }
.mx-arrange .notch::after{ content:''; position:absolute; inset:-2px; }
.mx-arrange .notch.k-in{ border:2px solid var(--text-2); background:var(--plane);
  border-radius:50%; }
.mx-arrange .notch.k-out{ background:var(--text-2); border-radius:50%; }
.mx-arrange .notch.k-git-in{ border:2px solid var(--text-1);
  background:var(--plane); border-radius:2px; }
.mx-arrange .notch.k-git-out{ background:var(--text-1); border-radius:2px; }
.mx-arrange .notch.k-message{ background:var(--ar-msg); border-radius:0;
  clip-path:polygon(100% 0,100% 100%,0 50%); }
.mx-arrange .notch.hot{ filter:brightness(1.8); }
.mx-arrange .nlab{ position:absolute; left:17px; top:0; font:9px var(--mono);
  color:var(--text-4); white-space:nowrap; pointer-events:none; }
.mx-arrange .notch[data-e="l"] .nlab{ left:auto; right:17px; }
.mx-arrange .notch[data-e="t"] .nlab{ top:-14px; left:-4px; }
.mx-arrange .notch[data-e="b"] .nlab{ top:15px; left:-4px; }

/* loopbox — static glow, no march */
.mx-arrange .loopbox{ position:absolute; z-index:1; pointer-events:none;
  border:1px solid var(--wt-line); border-radius:12px; background:var(--wt-fill);
  box-shadow:0 0 18px var(--wt-line); }
.mx-arrange .lb-lbl{ position:absolute; left:14px; top:-8px;
  font:9.5px/1 var(--mono); letter-spacing:.07em; color:var(--wt-line);
  background:var(--plane); padding:0 7px; white-space:nowrap; }
.mx-arrange .lb-lbl.none{ color:var(--text-4); }

/* zoom + toast */
.mx-arrange .ar-zoomctl{ position:absolute; right:10px; bottom:10px; z-index:60;
  display:flex; align-items:center; gap:4px; background:var(--surface-1);
  border:1px solid var(--border); border-radius:6px; padding:3px 5px; }
.mx-arrange .ar-zoomctl button{ background:none; border:none; color:var(--text-3);
  font-size:12px; padding:0 5px; cursor:pointer; }
.mx-arrange .ar-zoomlbl{ font:9.5px var(--mono); color:var(--text-3);
  min-width:34px; text-align:center; }
.mx-arrange .ar-toast{ position:absolute; left:50%; bottom:16px; z-index:300;
  transform:translateX(-50%); background:var(--surface-1);
  border:1px solid var(--border-2); border-radius:7px; padding:6px 12px;
  font:10.5px var(--mono); color:var(--text-2); opacity:0; pointer-events:none;
  transition:opacity .18s; max-width:80%; }
.mx-arrange .ar-toast.show{ opacity:1; }

/* node window */
.mx-arrange .ar-win{ position:absolute; inset:0; z-index:200; display:none;
  background:var(--plane); flex-direction:column; }
.mx-arrange .ar-win.open{ display:flex; }
.mx-arrange .win-head{ flex:0 0 auto; display:flex; align-items:center; gap:8px;
  padding:8px 11px; border-bottom:1px solid var(--gridline);
  background:var(--surface-1); }
.mx-arrange .win-title{ flex:1; min-width:0; font-size:12.5px; color:var(--text-1);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mx-arrange .win-body{ flex:1; display:grid; grid-template-columns:1fr 1fr;
  min-height:0; }
.mx-arrange .win-pane{ overflow-y:auto; min-height:0; padding:10px 12px;
  --dv-key:118px; --dv-ctl:150px; --dv-indent:12px; --dv-gap:4px; --dv-sec:11px; }
.mx-arrange .win-pane + .win-pane{ border-left:1px solid var(--gridline); }
.mx-arrange .win-pane.hot{ outline:1px dashed var(--border-2); outline-offset:-4px; }
.mx-arrange .win-sec{ font-size:8.5px; letter-spacing:.08em;
  text-transform:uppercase; color:var(--text-4); font-weight:700;
  margin:12px 0 5px; }
.mx-arrange .win-sec:first-child{ margin-top:0; }
.mx-arrange .cx-row{ display:flex; align-items:center; gap:6px; padding:3px 0;
  font:10.5px var(--mono); color:var(--text-3); }
.mx-arrange .cx-p{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; }
.mx-arrange .cx-pre{ flex:0 0 auto; display:flex; align-items:center; gap:3px;
  font-size:9px; color:var(--text-4); }
.mx-arrange .cx-x{ flex:0 0 auto; background:none; border:none; color:var(--text-4);
  cursor:pointer; padding:0 3px; }
.mx-arrange .cx-x:hover{ color:var(--gate-red); }
.mx-arrange .cx-actions{ display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
.mx-arrange .cx-inj{ width:100%; min-height:150px; background:var(--well);
  border:1px solid var(--border); color:var(--text-2); border-radius:6px;
  padding:7px 9px; font:11px/1.5 var(--mono); resize:vertical; }
.mx-arrange .win-empty{ font-size:10.5px; color:var(--text-4); font-style:italic; }
.mx-arrange .win-preset{ display:flex; align-items:center; gap:6px;
  margin-bottom:10px; }
.mx-arrange .lc-p{ flex:1; min-width:0; font-size:10px; color:var(--text-3);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mx-arrange .win-preset select{ flex:1; min-width:0; background:var(--surface-2);
  border:1px solid var(--border); color:var(--text-2); border-radius:5px;
  padding:3px 6px; font-size:10.5px; }
`;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---- small helpers ----

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  let _uid = 0;
  function uid() { _uid += 1; return "k" + Date.now().toString(36) + _uid.toString(36); }

  const STATUS = ["blank", "idle", "thinking", "working", "complete"];
  const NOTCH_KINDS = ["in", "out", "git-in", "git-out", "message"];
  const MINI_KINDS = ["branch", "merge", "group"];
  const MINI_GLYPH = { branch: "⑂", merge: "⑃", group: "☰" };
  const ACTION_SEEDS = ["initiate", "fork", "resume"];
  const HUMAN_IDENT = "Captain";

  // sorted keys on write; the doc generator's canonicalJson does the same
  function canonicalJson(value) {
    return JSON.stringify(sortKeys(value), null, 2);
  }
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
      return out;
    }
    return v;
  }

  function perimXY(w, h, p) {
    const P = 2 * (w + h), d = (((p % 1) + 1) % 1) * P;
    if (d < w) return { x: d, y: 0, e: "t" };
    if (d < w + h) return { x: w, y: d - w, e: "r" };
    if (d < 2 * w + h) return { x: w - (d - w - h), y: h, e: "b" };
    return { x: 0, y: h - (d - 2 * w - h), e: "l" };
  }
  function xyToP(w, h, x, y) {
    x = Math.max(0, Math.min(w, x)); y = Math.max(0, Math.min(h, y));
    const dT = y, dB = h - y, dL = x, dR = w - x, m = Math.min(dT, dB, dL, dR);
    let d;
    if (m === dT) d = x; else if (m === dR) d = w + y;
    else if (m === dB) d = w + h + (w - x); else d = 2 * w + h + (h - y);
    return d / (2 * (w + h));
  }
  const NORM = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] };

  // ---- plan shape ----

  function blankNode(id, kind, pt) {
    return {
      id: id, kind: kind || "job", jobId: null,
      x: pt ? pt.x : 0, y: pt ? pt.y : 0,
      name: "", model: "", notes: "", status: "blank", stxt: "",
      track: "", regions: [], wt: "", preset: null, agent: "", notches: [],
      docId: null, path: null,
    };
  }

  function blankPhase(name) {
    return { id: uid(), name: name, files: [], active: false,
      nodes: [], cables: [], loops: [] };
  }

  function blankPlan() {
    const ph = blankPhase("PHASE 0");
    return { id: uid(), name: "plan", selPhase: ph.id, phases: [ph] };
  }

  // cable becomes out if a cable starts there, else in; git becomes git-out
  // under the same rule; fork becomes out
  function migratePlan(pl) {
    if (!pl || !Array.isArray(pl.phases)) return pl;
    for (const ph of pl.phases) {
      ph.files = ph.files || [];
      ph.nodes = ph.nodes || [];
      ph.cables = ph.cables || [];
      ph.loops = ph.loops || [];
      const startsAt = new Set();
      for (const c of ph.cables) {
        if (c && c.a) startsAt.add(c.a.t);
        if (c && c.wire === undefined) c.wire = "file";
        if (c && c.path === undefined) c.path = null;
        if (c && c.action === undefined) c.action = "";
        if (c && c.content === undefined) c.content = "";
      }
      for (const n of ph.nodes) {
        if (!n.kind) n.kind = "job";
        if (n.jobId === undefined) n.jobId = null;
        if (n.preset === undefined) n.preset = null;
        if (n.agent === undefined) n.agent = (n.detail && n.detail.agent) || "";
        if (n.track === undefined) n.track = "";
        if (!Array.isArray(n.regions)) n.regions = [];
        if (n.wt === undefined) n.wt = "";
        delete n.detail;
        n.notches = (n.notches || []).map((nc) => {
          const k = nc.kind;
          let kind = k;
          if (k === "cable" || k === "loop") kind = startsAt.has(nc.id) ? "out" : "in";
          else if (k === "git") kind = startsAt.has(nc.id) ? "git-out" : "git-in";
          else if (k === "fork" || k === "spawn") kind = "out";
          if (NOTCH_KINDS.indexOf(kind) < 0) kind = "in";
          return { id: nc.id, kind: kind, p: nc.p,
            path: nc.path === undefined ? null : nc.path };
        });
      }
      if (!pl.phases.some((x) => x.id === pl.selPhase)) pl.selPhase = pl.phases[0].id;
    }
    return pl;
  }

  // ---- loops — Tarjan over the phase's cables ----

  function computeLoops(ph, quiet, toast) {
    const adj = {};
    ph.nodes.forEach((n) => { adj[n.id] = []; });
    ph.cables.forEach((c) => { if (adj[c.a.n]) adj[c.a.n].push(c.b.n); });
    const idx = new Map(), low = new Map(), on = new Map(), stk = [];
    let i = 0; const sccs = [];
    function strong(v) {
      idx.set(v, i); low.set(v, i); i++; stk.push(v); on.set(v, true);
      for (const w of adj[v] || []) {
        if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
        else if (on.get(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
      }
      if (low.get(v) === idx.get(v)) {
        const c = []; let w;
        do { w = stk.pop(); on.set(w, false); c.push(w); } while (w !== v);
        sccs.push(c);
      }
    }
    ph.nodes.forEach((n) => { if (!idx.has(n.id)) strong(n.id); });
    const selfL = new Set(ph.cables.filter((c) => c.a.n === c.b.n).map((c) => c.a.n));
    const found = sccs.filter((c) => c.length > 1 || selfL.has(c[0]));
    const old = new Map((ph.loops || []).map((L) => [L.key, L]));
    const prevKeys = new Set(old.keys());
    ph.loops = found.map((comp) => {
      const key = comp.slice().sort().join("+");
      const prev = old.get(key);
      return { key: key, nodes: comp,
        maxCycles: prev ? prev.maxCycles : "", maxCtx: prev ? prev.maxCtx : "" };
    });
    ph._loopEdges = new Set();
    const inL = new Map();
    ph.loops.forEach((L, ix) => L.nodes.forEach((n) => inL.set(n, ix)));
    ph.cables.forEach((c) => {
      if (inL.has(c.a.n) && inL.get(c.a.n) === inL.get(c.b.n)) ph._loopEdges.add(c.id);
    });
    if (quiet || !toast) return;
    ph.loops.forEach((L, ix) => {
      if (!prevKeys.has(L.key)) {
        toast("loop detected — ⟳ L" + (ix + 1)
          + " · name its worktree + set the ceilings on the phase face");
      }
    });
  }

  function loopWts(L, ph) {
    const seen = [];
    L.nodes.forEach((id) => {
      const n = ph.nodes.find((x) => x.id === id);
      if (n && n.wt && seen.indexOf(n.wt) < 0) seen.push(n.wt);
    });
    return seen;
  }

  // ---- per-instance accessors ----

  function planOf(a) { return a.plan; }
  function phaseOf(a) {
    const pl = a.plan;
    if (!pl || !pl.phases || !pl.phases.length) return null;
    return pl.phases.find((x) => x.id === pl.selPhase) || pl.phases[0];
  }

  // ---- clipboard, shared across instances ----

  let clipNode = null, clipSettings = null, clipContext = null;

  // ================================================================
  // widget
  // ================================================================

  MX.registerWidget("arrange", {
    mount(frame) {
      injectStyle();

      const a = frame._ar = {
        path: "", doc: null, plan: null, dirty: false,
        selNode: null, selCable: null, undo: [], redo: [],
        zoom: 1, panX: 40, panY: 20,
        drawerShut: false, phaseShut: new Set(),
        regionRows: [], trackRows: [], namesMap: {},
        feed: [], wpLines: [], regionRoots: {},
        winNode: null, winPane: "settings", ctxFiles: [], ctxInjection: "",
        ctxLoadedFor: null, menuFor: null,
        // settings-rows state — keys that module documents
        railCatalog: null, gateEdges: null, modelRows: [], presetNames: [],
        presetsLoaded: false, outputStyles: [], changePrompt: null,
        contexts: {}, collapsedBlocks: new Set(), lastOut: "",
      };

      a.settingsRows = MX.settingsRows.create(frame, {
        state: a, rerender: () => renderWindow(frame),
      });

      buildDom(frame);
      wireCanvas(frame);
      wireCableMenu(frame);
      wireKeys(frame);

      frame.subscribe(["ade_init", "track_list", "track_created", "feed", "wp_feed"]);
      frame.send({ type: "roster", inst: frame.id });
      frame.send({ type: "feed", inst: frame.id });
      frame.send({ type: "wp_feed", inst: frame.id });

      fetch("/api/library/models").then((r) => r.json()).then((d) => {
        a.modelRows = (d && d.list) || [];
      }).catch(() => {});
      fetch("/api/claude/output-styles").then((r) => r.json()).then((d) => {
        a.outputStyles = ((d && d.styles) || []).map((s) => s.name).filter(Boolean);
      }).catch(() => {});

      applyView(frame);
      render(frame);
    },

    unmount(frame) {
      const a = frame._ar;
      if (!a) return;
      if (a.onDocDown) document.removeEventListener("pointerdown", a.onDocDown);
      if (a.onKey) document.removeEventListener("keydown", a.onKey);
      frame._ar = null;
    },

    canClose(frame) {
      const a = frame._ar;
      if (!a || !a.dirty) return true;
      return window.confirm("the plan has unsaved edits — close anyway?");
    },

    onFrame(frame, msg) {
      const a = frame._ar;
      if (!a || !msg) return;
      if (msg.type === "ade_init" || msg.type === "track_list") {
        a.regionRows = msg.tracks || [];
        a.trackRows = msg.rows || [];
        a.namesMap = msg.names || {};
        adoptRegions(frame);
        render(frame);
        return;
      }
      if (msg.type === "track_created" && msg.track) {
        const row = msg.track;
        if (row && row.id) {
          const ix = a.regionRows.findIndex((r) => r.id === row.id);
          if (ix < 0) a.regionRows.push(row); else a.regionRows[ix] = row;
          adoptRegions(frame);
          render(frame);
        }
        return;
      }
      if (msg.type === "feed") {
        a.feed = msg.records || [];
        drawCables(frame);
        return;
      }
      if (msg.type === "wp_feed") {
        a.wpLines = msg.lines || [];
        drawCables(frame);
      }
    },
  });

  // ================================================================
  // dom
  // ================================================================

  function buildDom(frame) {
    const a = frame._ar;
    const wrap = el("div", "mx-arrange");
    wrap.innerHTML =
      '<div class="ar-top">' +
        '<button class="ar-btn ar-open">open plan file</button>' +
        '<input class="ar-path" spellcheck="false" placeholder="path to a doc generator project file">' +
        '<span class="ar-dirty" title="unsaved plan edits"></span>' +
        '<button class="ar-btn ar-save">save</button>' +
        '<button class="ar-btn ar-archive">archive</button>' +
        '<button class="ar-btn ar-library">library</button>' +
        '<button class="ar-btn ar-update">update</button>' +
        '<button class="ar-btn ar-pipe">pipe phase</button>' +
        '<button class="ar-btn ar-fit">show all</button>' +
      "</div>" +
      '<div class="ar-main">' +
        '<div class="ar-drawer"></div>' +
        '<div class="ar-split"></div>' +
        '<div class="ar-cwrap">' +
          '<div class="ar-world">' +
            '<svg class="ar-svg" xmlns="http://www.w3.org/2000/svg">' +
              '<g class="ar-cablesG"></g>' +
              '<path class="ar-ghost cvis c-ghost" d="" visibility="hidden"/>' +
            "</svg>" +
            '<div class="ar-cabends"></div>' +
            '<div class="ar-cbmenu">' +
              '<div class="cbm-h">action on this cable</div>' +
              '<div class="cbm-seeds"></div>' +
              '<input class="cbm-action" spellcheck="false" placeholder="anything — this list is open">' +
              '<div class="cbm-h cbm-h2">content this edge carries</div>' +
              '<input class="cbm-content" spellcheck="false" placeholder="anything — this edge carries it">' +
              '<div class="cbm-h cbm-h2">path this edge hands off</div>' +
              '<input class="cbm-path" spellcheck="false" placeholder="a file path — stored on the cable and its out notch">' +
              '<div class="cbm-row">' +
                '<button class="cbm-clr">clear</button>' +
                '<button class="cbm-done">done</button>' +
              "</div>" +
              '<div class="cbm-note">what should happen when the source job finishes. ' +
                "stored on the cable and piped out with the plan.</div>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="ar-win"><div class="win-head">' +
        '<span class="win-title"></span>' +
        '<button class="ar-btn win-settings">settings</button>' +
        '<button class="ar-btn win-context">context</button>' +
        '<button class="ar-btn win-close">close</button>' +
      "</div>" +
      '<div class="win-body">' +
        '<div class="win-pane pane-settings"></div>' +
        '<div class="win-pane pane-context"></div>' +
      "</div></div>" +
      '<div class="ar-zoomctl"><button class="z-out">−</button>' +
        '<span class="ar-zoomlbl">100%</span><button class="z-in">+</button></div>' +
      '<div class="ar-toast"></div>' +
      '<div class="ar-ctxmenu"></div>';

    frame.host.appendChild(wrap);
    const q = (s) => wrap.querySelector(s);
    a.root = wrap;
    a.mainEl = q(".ar-main");
    a.drawer = q(".ar-drawer");
    a.cwrap = q(".ar-cwrap");
    a.world = q(".ar-world");
    a.svg = q(".ar-svg");
    a.cablesG = q(".ar-cablesG");
    a.ghost = q(".ar-ghost");
    a.cabEnds = q(".ar-cabends");
    a.cbmenu = q(".ar-cbmenu");
    a.ctxMenu = q(".ar-ctxmenu");
    a.toastEl = q(".ar-toast");
    a.zoomLbl = q(".ar-zoomlbl");
    a.pathEl = q(".ar-path");
    a.dirtyEl = q(".ar-dirty");
    a.archiveBtn = q(".ar-archive");
    a.updateBtn = q(".ar-update");
    a.winEl = q(".ar-win");
    a.winTitle = q(".win-title");
    a.paneSettings = q(".pane-settings");
    a.paneContext = q(".pane-context");

    q(".ar-open").addEventListener("click", () => {
      fetch("/api/fs/pick?ext=json")
        .then((r) => r.json())
        .then((d) => { if (d && d.path) openFile(frame, d.path); })
        .catch(() => toast(frame, "could not open the chooser"));
    });
    a.pathEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); openFile(frame, a.pathEl.value.trim()); }
    });
    q(".ar-save").addEventListener("click", () => savePlan(frame));
    a.archiveBtn.addEventListener("click", () => archiveMap(frame));
    q(".ar-library").addEventListener("click", (e) => libraryMenu(frame, e));
    a.updateBtn.addEventListener("click", () => updateSource(frame));
    q(".ar-pipe").addEventListener("click", () => pipePlan(frame));
    q(".ar-fit").addEventListener("click", () => fitAll(frame));
    q(".z-in").addEventListener("click", () => {
      const r = a.cwrap.getBoundingClientRect();
      setZoom(frame, a.zoom * 1.2, r.width / 2, r.height / 2);
    });
    q(".z-out").addEventListener("click", () => {
      const r = a.cwrap.getBoundingClientRect();
      setZoom(frame, a.zoom / 1.2, r.width / 2, r.height / 2);
    });
    q(".win-close").addEventListener("click", () => closeWindow(frame));
    q(".win-settings").addEventListener("click", () => {
      a.winPane = "settings"; renderWindow(frame);
      a.paneSettings.scrollIntoView({ block: "nearest" });
    });
    q(".win-context").addEventListener("click", () => {
      a.winPane = "context"; renderWindow(frame);
      a.paneContext.scrollIntoView({ block: "nearest" });
    });

    paintHead(frame);

    a.onDocDown = (e) => {
      if (!a.ctxMenu.classList.contains("open")) return;
      if (!e.target.closest(".ar-ctxmenu")) closeCtxMenu(frame);
    };
    document.addEventListener("pointerdown", a.onDocDown);
  }

  let _tt = null;
  function toast(frame, msg) {
    const a = frame._ar;
    a.toastEl.textContent = msg;
    a.toastEl.classList.add("show");
    clearTimeout(_tt);
    _tt = setTimeout(() => a.toastEl.classList.remove("show"), 2600);
  }

  // ================================================================
  // plan file — read whole, edit plan, write whole
  // ================================================================

  function openFile(frame, path) {
    const a = frame._ar;
    if (!path) return;
    fetch("/api/fs/raw?path=" + encodeURIComponent(path))
      .then((r) => r.text())
      .then((text) => {
        let doc;
        try { doc = JSON.parse(text); }
        catch (e) { toast(frame, "not JSON: " + path); return; }
        a.path = path;
        a.pathEl.value = path;
        a.doc = doc;
        // library copy carries the generator doc under .doc; the plan
        // block lives on whichever object that is
        const lib = doc && doc.doc && typeof doc.doc === "object" &&
          Object.prototype.hasOwnProperty.call(doc, "source");
        a.docInner = lib ? doc.doc : doc;
        a.libSource = lib ? (doc.source || null) : null;
        a.libRoot = lib ? (doc.root || null) : null;
        a.isGen = !lib && !!(doc && doc.docsetRoot) &&
          /(^|\/)database\.json$/.test(path);
        a.plan = a.docInner.plan
          ? migratePlan(a.docInner.plan)
          : planFromDocset(a.docInner, a.libRoot);
        a.undo.length = 0; a.redo.length = 0;
        a.selNode = a.selCable = null;
        a.dirty = false;
        if (a.plan) a.plan.phases.forEach((ph) => computeLoops(ph, true));
        adoptRegions(frame);
        paintHead(frame);
        render(frame);
        toast(frame, a.plan ? "opened " + path : "opened " + path + " — no plan yet");
      })
      .catch(() => toast(frame, "could not read " + path));
  }

  // head buttons — archive on a generator database.json, update on a
  // library copy that names a source
  function paintHead(frame) {
    const a = frame._ar;
    if (a.archiveBtn) a.archiveBtn.disabled = !a.isGen;
    if (a.updateBtn) a.updateBtn.disabled = !a.libSource;
  }

  // docset tree becomes plan nodes — folders group, files job
  function planFromDocset(doc, root) {
    const ds = doc && doc.docsetRoot;
    if (!ds) return null;
    const pl = blankPlan();
    const ph = pl.phases[0];
    ph.name = ds.label || ph.name;
    let row = 0;
    const walk = (node, labels, depth) => {
      (node.children || []).forEach((c) => {
        const chain = labels.concat([c.label || ""]);
        const n = blankNode(uid(), c.kind === "folder" ? "group" : "job",
          { x: depth * 300, y: row * 150 });
        row += 1;
        n.name = c.label || "";
        n.docId = c.id || null;
        n.path = docsetPath(root, chain, c);
        ph.nodes.push(n);
        if (c.kind === "folder") walk(c, chain, depth + 1);
      });
    };
    walk(ds, [], 0);
    return pl;
  }

  // disk path of a docset node — export root plus the labels down to it
  function docsetPath(root, chain, node) {
    if (!root) return null;
    const parts = chain.slice();
    let last = parts.pop() || "";
    const ext = node.kind === "file" ? (node.extension || "") : "";
    if (ext && last.toLowerCase().slice(-(ext.length + 1)) !== "." + ext.toLowerCase()) {
      last += "." + ext;
    }
    parts.push(last);
    return root.replace(/\/+$/, "") + "/" + parts.join("/");
  }

  function archiveMap(frame) {
    const a = frame._ar;
    if (!a.isGen) { toast(frame, "not a doc generator database.json"); return; }
    fetch("/api/library/maps/archive", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: a.path }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d || d.error) { toast(frame, "archive failed: " + ((d && d.error) || "")); return; }
        toast(frame, "archived " + d.name);
        openFile(frame, d.path);
      })
      .catch(() => toast(frame, "archive failed"));
  }

  function libraryMenu(frame, e) {
    fetch("/api/library/maps")
      .then((r) => r.json())
      .then((d) => {
        const rows = (d && d.list) || [];
        if (!rows.length) { toast(frame, "library has no maps"); return; }
        openCtxMenu(frame, e, rows.map((row) => [
          row.name + (row.root ? "" : "  ·  not exported"),
          () => openFile(frame, row.path),
        ]));
      })
      .catch(() => toast(frame, "could not read the library"));
  }

  // push the plan block into the generator database.json this copy names
  function updateSource(frame) {
    const a = frame._ar;
    if (!a.libSource) { toast(frame, "no source to update"); return; }
    const src = a.libSource;
    fetch("/api/fs/raw?path=" + encodeURIComponent(src))
      .then((r) => r.text())
      .then((text) => {
        let doc;
        try { doc = JSON.parse(text); }
        catch (e2) { toast(frame, "source not JSON: " + src); return null; }
        doc.plan = a.plan ? stripLive(a.plan) : null;
        return fetch("/api/fs/put", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: src, text: JSON.stringify(sortKeys(doc)) }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.error) { toast(frame, "update failed: " + d.error); return; }
            toast(frame, "updated " + src);
          });
      })
      .catch(() => toast(frame, "update failed"));
  }

  function savePlan(frame) {
    const a = frame._ar;
    if (!a.path || !a.doc) { toast(frame, "no plan file open"); return; }
    (a.docInner || a.doc).plan = a.plan ? stripLive(a.plan) : null;
    const body = JSON.stringify({ path: a.path, text: canonicalJson(a.doc) });
    fetch("/api/fs/put", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.error) { toast(frame, "save failed: " + d.error); return; }
        a.dirty = false; paintDirty(frame);
        toast(frame, "saved " + a.path);
      })
      .catch(() => toast(frame, "save failed"));
  }

  function stripLive(pl) {
    return JSON.parse(JSON.stringify(pl, (k, v) => (k[0] === "_" ? undefined : v)));
  }

  function paintDirty(frame) {
    const a = frame._ar;
    a.dirtyEl.classList.toggle("on", !!a.dirty);
  }

  function touch(frame) {
    const a = frame._ar;
    a.dirty = true;
    paintDirty(frame);
  }

  // ---- undo / redo, in memory, per open file ----

  function snap(frame, label) {
    const a = frame._ar;
    if (!a.plan) return;
    a.undo.push({ label: label, json: JSON.stringify(stripLive(a.plan)) });
    if (a.undo.length > 40) a.undo.shift();
    a.redo.length = 0;
  }

  function restore(frame, entry) {
    const a = frame._ar;
    a.plan = migratePlan(JSON.parse(entry.json));
    a.plan.phases.forEach((ph) => computeLoops(ph, true));
    a.selNode = a.selCable = null;
    adoptRegions(frame);
    touch(frame);
    render(frame);
  }

  function undo(frame) {
    const a = frame._ar;
    if (!a.undo.length) { toast(frame, "nothing to undo"); return; }
    const u = a.undo.pop();
    if (a.plan) a.redo.push({ label: u.label, json: JSON.stringify(stripLive(a.plan)) });
    restore(frame, u);
    toast(frame, "undone: " + u.label + "   (" + a.undo.length + " left)");
  }

  function redo(frame) {
    const a = frame._ar;
    if (!a.redo.length) { toast(frame, "nothing to redo"); return; }
    const r = a.redo.pop();
    if (a.plan) a.undo.push({ label: r.label, json: JSON.stringify(stripLive(a.plan)) });
    restore(frame, r);
    toast(frame, "redone: " + r.label + "   (" + a.redo.length + " left)");
  }

  function structural(frame, label) {
    const a = frame._ar;
    const ph = phaseOf(a);
    if (ph) computeLoops(ph, false, (m) => toast(frame, m));
    if (label) touch(frame);
    render(frame);
  }

  // ================================================================
  // roster — regions land on the node that carries them
  // ================================================================

  function adoptRegions(frame) {
    const a = frame._ar;
    for (const r of a.regionRows) {
      if (r && r.id && r.root) a.regionRoots[r.id] = r.root;
    }
    if (!a.plan) return;
    for (const ph of a.plan.phases) {
      for (const n of ph.nodes) {
        const mine = a.regionRows.filter((r) => r && r.node_id === n.id);
        n._regions = mine;
        const names = mine.map((r) => r.name || r.id);
        if (names.join(" ") !== (n.regions || []).join(" ")) n.regions = names;
        const tr = mine.length ? trackRowOf(a, mine[0].track) : null;
        n._trackName = tr ? tr.name : n.track;
      }
    }
  }

  function trackRowOf(a, id) {
    return a.trackRows.find((t) => t.id === id) || null;
  }

  function regionsOfTrack(a, trackId) {
    return a.regionRows.filter((r) => r && r.track === trackId);
  }

  function nodeForTrack(a, trackId) {
    for (const ph of (a.plan ? a.plan.phases : [])) {
      for (const n of ph.nodes) {
        if ((n._regions || []).some((r) => r.track === trackId)) return { ph: ph, n: n };
      }
    }
    return null;
  }

  // ================================================================
  // render
  // ================================================================

  function render(frame) {
    renderDrawer(frame);
    renderCanvas(frame);
    paintDirty(frame);
  }

  function renderDrawer(frame) {
    const a = frame._ar;
    a.drawer.innerHTML = "";
    a.mainEl.classList.toggle("drawer-shut", a.drawerShut);

    if (a.drawerShut) {
      const open = el("button", "ar-strip", "drawer");
      open.addEventListener("click", () => { a.drawerShut = false; renderDrawer(frame); });
      a.drawer.appendChild(open);
      return;
    }

    const shut = el("button", "ar-btn", "◀ hide drawer");
    shut.addEventListener("click", () => { a.drawerShut = true; renderDrawer(frame); });
    a.drawer.appendChild(shut);

    const pl = planOf(a);
    if (pl) {
      for (const ph of pl.phases) a.drawer.appendChild(phaseBlock(frame, pl, ph));
    }

    const add = el("button", "ar-addphase", "+ phase");
    add.addEventListener("click", () => {
      if (!a.plan) { a.plan = blankPlan(); touch(frame); render(frame); return; }
      snap(frame, "add phase");
      a.plan.phases.push(blankPhase("PHASE " + a.plan.phases.length));
      touch(frame); renderDrawer(frame);
    });
    a.drawer.appendChild(add);

    a.drawer.appendChild(trackPane(frame));
  }

  function phaseBlock(frame, pl, ph) {
    const a = frame._ar;
    const shut = a.phaseShut.has(ph.id);
    const b = el("div", "ph" + (ph.id === pl.selPhase ? " sel" : "") + (ph.active ? " live" : ""));

    const top = el("div", "ph-top");
    const caret = el("span", "ph-caret", shut ? "▸" : "▾");
    caret.addEventListener("click", (e) => {
      e.stopPropagation();
      if (shut) a.phaseShut.delete(ph.id); else a.phaseShut.add(ph.id);
      renderDrawer(frame);
    });
    const nm = el("span", "ph-name");
    bindCE(frame, nm, () => ph.name, (v) => { ph.name = v; });
    const lv = el("button", "ph-live", "LIVE");
    lv.title = "preview the active-phase light";
    lv.addEventListener("pointerdown", (e) => e.stopPropagation());
    lv.addEventListener("click", (e) => {
      e.stopPropagation(); ph.active = !ph.active; touch(frame); renderDrawer(frame);
    });
    const cnt = el("span", "ph-count", ph.nodes.length + "n");
    top.append(caret, nm, lv, cnt);
    b.append(top);

    if (!shut) {
      b.append(el("div", "ph-sec", "shared files"));
      const pf = el("div", "ph-files");
      ph.files.forEach((f, ix) => {
        const row = el("div", "pf-row");
        const s = el("span", "pf-n"); s.textContent = f; s.title = f;
        const x = el("button", "pf-x", "×");
        x.title = "remove " + f;
        x.addEventListener("pointerdown", (e) => e.stopPropagation());
        x.addEventListener("click", (e) => {
          e.stopPropagation(); snap(frame, "remove " + f);
          ph.files.splice(ix, 1); touch(frame); renderDrawer(frame);
        });
        row.addEventListener("pointerdown", (e) => e.stopPropagation());
        row.append(s, x); pf.append(row);
      });
      const pfa = el("button", "pf-add", "+ file");
      pfa.addEventListener("pointerdown", (e) => e.stopPropagation());
      pfa.addEventListener("click", (e) => {
        e.stopPropagation();
        MX.openRootBrowser("/", (p) => {
          snap(frame, "add file"); ph.files.push(p); touch(frame); renderDrawer(frame);
        }, { ext: "" });
      });
      pf.append(pfa);
      b.append(pf);

      b.append(el("div", "ph-sec", "loops · worktrees"));
      const lw = el("div", "ph-loops");
      if (!(ph.loops || []).length) {
        lw.append(el("span", "ph-none", "none — wire a cycle and it appears"));
      }
      (ph.loops || []).forEach((L, ix) => {
        const c = el("div", "lchip");
        const r1 = el("div", "lc-row");
        r1.append(el("span", null, "⟳ L" + (ix + 1)));
        const wts = loopWts(L, ph);
        r1.append(el("i", "lc-wtm" + (wts.length ? "" : " none")));
        const wl = el("span", "lc-wtl" + (wts.length ? "" : " none"));
        wl.textContent = wts.length ? wts.join(" · ") : "no worktree named";
        wl.title = "mirror only — set a worktree inside a job";
        r1.append(wl);
        const r2 = el("div", "lc-row");
        const i1 = document.createElement("input");
        i1.placeholder = "∞"; i1.value = L.maxCycles || "";
        i1.addEventListener("pointerdown", (e) => e.stopPropagation());
        i1.addEventListener("input", () => { L.maxCycles = i1.value; touch(frame); });
        const i2 = document.createElement("input");
        i2.placeholder = "—"; i2.value = L.maxCtx || "";
        i2.addEventListener("pointerdown", (e) => e.stopPropagation());
        i2.addEventListener("input", () => { L.maxCtx = i2.value; touch(frame); });
        r2.append(el("span", "lc-l", "max cyc"), i1, el("span", "lc-l", "max ctx"), i2);
        c.append(r1, r2);
        lw.append(c);
      });
      b.append(lw);
      b.append(el("div", "ph-meta", ph.nodes.length + " node" + (ph.nodes.length === 1 ? "" : "s")));
    }

    b.addEventListener("click", () => {
      if (pl.selPhase !== ph.id) {
        pl.selPhase = ph.id; a.selNode = a.selCable = null; touch(frame); render(frame);
      }
    });
    b.addEventListener("contextmenu", (e) => openCtxMenu(frame, e, [
      ["✕ delete phase", () => deletePhase(frame, ph)],
    ].concat(undoItems(frame))));
    return b;
  }

  function trackPane(frame) {
    const a = frame._ar;
    const box = el("div", "ar-tracks");
    box.append(el("div", "ph-sec", "tracks"));
    if (!a.trackRows.length) {
      box.append(el("div", "ph-none", "no tracks on the server yet"));
      return box;
    }
    for (const t of a.trackRows) {
      const regs = regionsOfTrack(a, t.id);
      const row = el("div", "tk-row");
      const txt = el("div", "tk-txt");
      const nm = el("div", "tk-name"); nm.textContent = t.name || t.id;
      const rg = el("div", "tk-regs");
      rg.textContent = regs.map((r) => r.name || r.id).join(" · ");
      const md = el("div", "tk-model");
      md.textContent = [...new Set(regs.map((r) => r.model).filter(Boolean))].join(" · ");
      txt.append(nm, rg, md);
      row.append(txt);
      const map = el("button", "tk-map", "🗺");
      map.title = "center the job that carries this track";
      map.addEventListener("click", (e) => { e.stopPropagation(); centerOnTrack(frame, t.id); });
      row.append(map);
      row.addEventListener("click", () => {
        const hit = nodeForTrack(a, t.id);
        if (!hit) { toast(frame, "no job carries " + (t.name || t.id)); return; }
        openWindow(frame, hit.n, "settings");
      });
      box.append(row);
    }
    return box;
  }

  function centerOnTrack(frame, trackId) {
    const a = frame._ar;
    const hit = nodeForTrack(a, trackId);
    if (!hit) { toast(frame, "no job carries that track"); return; }
    if (a.plan.selPhase !== hit.ph.id) { a.plan.selPhase = hit.ph.id; render(frame); }
    const n = hit.n;
    const r = a.cwrap.getBoundingClientRect();
    a.panX = r.width / 2 - (n.x + (n._w || 180) / 2) * a.zoom;
    a.panY = r.height / 2 - (n.y + (n._h || 78) / 2) * a.zoom;
    a.selNode = n.id; a.selCable = null;
    applyView(frame); applySel(frame); drawCables(frame);
  }

  function deletePhase(frame, ph) {
    const a = frame._ar;
    if (!a.plan || a.plan.phases.length <= 1) {
      toast(frame, "only phase left — nothing to delete"); return;
    }
    snap(frame, "delete phase “" + (ph.name || "") + "”");
    a.plan.phases = a.plan.phases.filter((x) => x.id !== ph.id);
    if (a.plan.selPhase === ph.id) a.plan.selPhase = a.plan.phases[0].id;
    a.selNode = a.selCable = null;
    touch(frame); render(frame);
  }

  // ---- contenteditable binding ----

  function bindCE(frame, span, get, set) {
    span.contentEditable = "true";
    span.spellcheck = false;
    span.textContent = get() || "";
    span.addEventListener("input", () => { set(span.textContent); touch(frame); });
    span.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); span.blur(); }
    });
    span.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  // ================================================================
  // canvas
  // ================================================================

  function worldPt(frame, e) {
    const a = frame._ar;
    const r = a.cwrap.getBoundingClientRect();
    return { x: (e.clientX - r.left - a.panX) / a.zoom,
      y: (e.clientY - r.top - a.panY) / a.zoom };
  }

  function applyView(frame) {
    const a = frame._ar;
    a.world.style.transform =
      "translate(" + a.panX + "px," + a.panY + "px) scale(" + a.zoom + ")";
    a.zoomLbl.textContent = Math.round(a.zoom * 100) + "%";
  }

  function setZoom(frame, z, cx, cy) {
    const a = frame._ar;
    z = Math.max(0.35, Math.min(2, z));
    const wx = (cx - a.panX) / a.zoom, wy = (cy - a.panY) / a.zoom;
    a.zoom = z; a.panX = cx - wx * z; a.panY = cy - wy * z;
    applyView(frame);
  }

  function fitAll(frame) {
    const a = frame._ar;
    const ph = phaseOf(a);
    const nodes = ph ? ph.nodes : [];
    if (!nodes.length) { a.zoom = 1; a.panX = 40; a.panY = 20; applyView(frame); return; }
    const r = a.cwrap.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      const w = n._w || 180, h = n._h || 78;
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
    });
    const pad = 60, bw = (maxX - minX) + pad * 2, bh = (maxY - minY) + pad * 2;
    a.zoom = Math.max(0.1, Math.min(2, Math.min(r.width / bw, r.height / bh)));
    a.panX = r.width / 2 - (minX - pad + bw / 2) * a.zoom;
    a.panY = r.height / 2 - (minY - pad + bh / 2) * a.zoom;
    applyView(frame);
  }

  function renderCanvas(frame) {
    const a = frame._ar;
    a.world.querySelectorAll(".node,.loopbox").forEach((x) => x.remove());
    const ph = phaseOf(a);
    if (!ph) { a.cablesG.innerHTML = ""; a.cabEnds.innerHTML = ""; return; }
    ph.nodes.forEach((n) => a.world.append(buildNode(frame, n)));
    requestAnimationFrame(() => {
      if (!frame._ar) return;
      ph.nodes.forEach((n) => {
        const nel = a.world.querySelector('.node[data-id="' + n.id + '"]');
        if (nel) layoutNotches(n, nel);
      });
      drawCables(frame); placeLoopBoxes(frame); applySel(frame);
    });
  }

  function statusApply(nel, n) {
    STATUS.forEach((s) => nel.classList.remove("st-" + s));
    nel.classList.add("st-" + (n.status || "blank"));
  }

  function notchLabel(ph, nc) {
    const here = ph.cables.filter((c) => c.a.t === nc.id || c.b.t === nc.id);
    if (!here.length) return "";
    if (ph._loopEdges && here.some((c) => ph._loopEdges.has(c.id))) return "loop";
    return here.some((c) => c.a.t === nc.id) ? "out" : "in";
  }

  function buildNode(frame, n) {
    const a = frame._ar;
    const ph = phaseOf(a);
    const mini = n.kind !== "job";
    const nel = el("div", "node" + (mini ? " mini" : ""));
    nel.dataset.id = n.id;
    nel.style.left = n.x + "px";
    nel.style.top = n.y + "px";

    const head = el("div", "n-head");
    if (mini) head.append(el("span", "n-glyph", MINI_GLYPH[n.kind] || "•"));
    const nm = el("span", "n-name");
    bindCE(frame, nm, () => n.name, (v) => { n.name = v; });
    head.append(nm);
    if (!mini) {
      const md = el("span", "n-model");
      bindCE(frame, md, () => n.model, (v) => { n.model = v; });
      head.append(md);
    }
    nel.append(head);

    if (!mini) {
      const tr = el("div", "n-track");
      tr.textContent = n._trackName || n.track || "";
      tr.title = "track — the agent this job belongs to";
      nel.append(tr);

      const rg = el("div", "n-regions");
      rg.textContent = (n.regions || []).join(" · ");
      rg.title = "regions inside this job, reset suffix included";
      nel.append(rg);

      const notes = el("div", "n-notes");
      bindCE(frame, notes, () => n.notes, (v) => { n.notes = v; });
      notes.addEventListener("input", () => requestAnimationFrame(() => {
        layoutNotches(n, nel); drawCables(frame); placeLoopBoxes(frame);
      }));
      nel.append(notes);

      if (n.wt) {
        const t = el("div", "n-wt", "<i></i>");
        t.append(document.createTextNode(n.wt));
        t.title = "worktree / branch — set inside the job";
        nel.append(t);
      }

      const st = el("div", "n-status");
      const dotWrap = el("span", "n-dot",
        '<span class="dot"></span><span class="n-check">✓</span>');
      dotWrap.title = "click to cycle status · shift-click to go back";
      dotWrap.addEventListener("pointerdown", (e) => e.stopPropagation());
      dotWrap.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = (e.shiftKey || e.altKey) ? -1 : 1;
        n.status = STATUS[(STATUS.indexOf(n.status) + d + STATUS.length) % STATUS.length];
        statusApply(nel, n); touch(frame);
      });
      const stxt = el("span", "n-stxt");
      bindCE(frame, stxt, () => n.stxt, (v) => { n.stxt = v; });
      st.append(dotWrap, stxt);
      nel.append(st);

      const ex = el("button", "n-ex", "⤢");
      ex.title = "open this job's window";
      ex.addEventListener("pointerdown", (e) => e.stopPropagation());
      ex.addEventListener("click", (e) => { e.stopPropagation(); openWindow(frame, n, "settings"); });
      nel.append(ex);

      head.addEventListener("dblclick", (e) => {
        e.preventDefault(); e.stopPropagation(); openWindow(frame, n, "settings");
      });
    }

    (n.notches || []).forEach((nc) => {
      const lab = notchLabel(ph, nc);
      const ne = el("div", "notch k-" + nc.kind);
      ne.dataset.node = n.id;
      ne.dataset.notch = nc.id;
      ne.title = nc.kind + (nc.path ? " — " + nc.path : "") + " — dbl-click to delete";
      const lb = el("span", "nlab");
      lb.textContent = lab;
      ne.append(lb);
      ne.addEventListener("pointerdown", (e) => notchDown(frame, e, n, nc, ne, nel));
      ne.addEventListener("dblclick", (e) => {
        e.preventDefault(); e.stopPropagation();
        snap(frame, "delete " + nc.kind + " notch");
        n.notches = n.notches.filter((x) => x.id !== nc.id);
        ph.cables = ph.cables.filter((c) => c.a.t !== nc.id && c.b.t !== nc.id);
        structural(frame, "notch");
      });
      nel.append(ne);
    });

    statusApply(nel, n);
    nel.addEventListener("pointerdown", (e) => nodeDown(frame, e, n, nel));
    nel.addEventListener("contextmenu", (e) => nodeCtxMenu(frame, e, n));
    return nel;
  }

  function layoutNotches(n, nel) {
    const w = nel.offsetWidth, h = nel.offsetHeight;
    n._w = w; n._h = h;
    (n.notches || []).forEach((nc) => {
      const xy = perimXY(w, h, nc.p);
      nc._ax = n.x + xy.x; nc._ay = n.y + xy.y; nc._e = xy.e;
      const ne = nel.querySelector('[data-notch="' + nc.id + '"]');
      if (ne) { ne.style.left = xy.x + "px"; ne.style.top = xy.y + "px"; ne.dataset.e = xy.e; }
    });
  }

  function applySel(frame) {
    const a = frame._ar;
    a.world.querySelectorAll(".node").forEach((x) =>
      x.classList.toggle("sel", x.dataset.id === a.selNode));
  }

  function nodeDown(frame, e, n, nel) {
    const a = frame._ar;
    if (e.target.closest("[contenteditable],button,.notch,input")) return;
    e.preventDefault();
    const start = worldPt(frame, e), ox = n.x, oy = n.y;
    let moved = false;
    nel.setPointerCapture(e.pointerId);
    nel.style.cursor = "grabbing";
    function mv(ev) {
      const p = worldPt(frame, ev);
      const dx = p.x - start.x, dy = p.y - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      n.x = Math.max(0, ox + dx); n.y = Math.max(0, oy + dy);
      nel.style.left = n.x + "px"; nel.style.top = n.y + "px";
      layoutNotches(n, nel); drawCables(frame); placeLoopBoxes(frame);
    }
    function up() {
      nel.removeEventListener("pointermove", mv);
      nel.removeEventListener("pointerup", up);
      nel.style.cursor = "grab";
      if (moved) touch(frame);
      else {
        a.selNode = (a.selNode === n.id ? null : n.id);
        a.selCable = null; applySel(frame); drawCables(frame);
      }
    }
    nel.addEventListener("pointermove", mv);
    nel.addEventListener("pointerup", up);
  }

  // ---- notch placement and wiring ----

  function freeP(n, near) {
    const taken = (n.notches || []).map((x) => x.p);
    const gap = 0.045;
    if (near != null) {
      for (const d of [0.022, -0.022, 0.044, -0.044]) {
        const p = (((near + d) % 1) + 1) % 1;
        if (!taken.some((t) => { const g = Math.abs(t - p); return Math.min(g, 1 - g) < 0.014; })) return p;
      }
    }
    for (let i = 0; i < 40; i++) {
      const p = (0.38 + i * gap) % 1;
      if (!taken.some((t) => { const d = Math.abs(t - p); return Math.min(d, 1 - d) < gap * 0.8; })) return p;
    }
    return Math.random();
  }

  // a message jack sits beside the file jacks on the rim
  function placeP(n, kind) {
    if (kind !== "message") return freeP(n);
    const files = (n.notches || []).filter((x) => x.kind !== "message");
    return freeP(n, files.length ? files[files.length - 1].p : null);
  }

  const ACCEPTS = { in: true, "git-in": true };
  const EMITS = { out: true, "git-out": true };

  function pairOk(ak, bk) {
    if (ak === "message" || bk === "message") return ak === "message" && bk === "message";
    if (EMITS[ak] && ACCEPTS[bk]) return true;
    if (EMITS[bk] && ACCEPTS[ak]) return true;
    return false;
  }

  function wireOf(ak) { return ak === "message" ? "message" : "file"; }

  function notchOf(ph, nid, tid) {
    const n = ph.nodes.find((x) => x.id === nid);
    return n && (n.notches || []).find((x) => x.id === tid);
  }

  function notchDown(frame, e, n, nc, ne, nel) {
    const a = frame._ar;
    const ph = phaseOf(a);
    e.preventDefault(); e.stopPropagation();
    ne.setPointerCapture(e.pointerId);
    let mode = "pending";
    function mv(ev) {
      const p = worldPt(frame, ev);
      const lx = p.x - n.x, ly = p.y - n.y;
      const w = n._w || nel.offsetWidth, h = n._h || nel.offsetHeight;
      const inside = Math.max(0, Math.min(w, lx)), insideY = Math.max(0, Math.min(h, ly));
      const dist = Math.hypot(lx - inside, ly - insideY);
      const nearRim = lx > -22 && lx < w + 22 && ly > -22 && ly < h + 22 && dist < 22;
      mode = nearRim ? "slide" : "cable";
      if (mode === "slide") {
        nc.p = xyToP(w, h, lx, ly);
        layoutNotches(n, nel); drawCables(frame);
        a.ghost.setAttribute("visibility", "hidden");
      } else {
        const fake = { _ax: p.x, _ay: p.y,
          _e: nc._e === "l" ? "r" : nc._e === "r" ? "l" : nc._e === "t" ? "b" : "t" };
        a.ghost.setAttribute("d", notchCablePath(nc, fake, 0));
        a.ghost.setAttribute("visibility", "visible");
        a.root.querySelectorAll(".notch.hot").forEach((x) => x.classList.remove("hot"));
        const tgt = document.elementsFromPoint(ev.clientX, ev.clientY)
          .find((x) => x.classList && x.classList.contains("notch") && x !== ne);
        if (tgt) tgt.classList.add("hot");
      }
    }
    function up(ev) {
      ne.removeEventListener("pointermove", mv);
      ne.removeEventListener("pointerup", up);
      a.ghost.setAttribute("visibility", "hidden");
      a.root.querySelectorAll(".notch.hot").forEach((x) => x.classList.remove("hot"));
      if (mode === "slide") { touch(frame); return; }
      if (mode !== "cable") return;
      const tgt = document.elementsFromPoint(ev.clientX, ev.clientY)
        .find((x) => x.classList && x.classList.contains("notch") && x !== ne);
      if (!tgt) return;
      const tn = tgt.dataset.node, tt = tgt.dataset.notch, tk = notchOf(ph, tn, tt);
      if (!tk) return;
      if (!pairOk(nc.kind, tk.kind)) {
        toast(frame, nc.kind + " does not join " + tk.kind); return;
      }
      // the emitting jack is always the a end
      const srcIsA = EMITS[nc.kind] || nc.kind === "message";
      const A = srcIsA ? { n: n.id, t: nc.id } : { n: tn, t: tt };
      const B = srcIsA ? { n: tn, t: tt } : { n: n.id, t: nc.id };
      if (ph.cables.some((c) => c.a.n === A.n && c.a.t === A.t && c.b.n === B.n && c.b.t === B.t)) {
        toast(frame, "already wired."); return;
      }
      snap(frame, "add cable");
      ph.cables.push({ id: uid(), a: A, b: B, wire: wireOf(nc.kind),
        path: null, action: "", content: "" });
      structural(frame, "cable");
    }
    ne.addEventListener("pointermove", mv);
    ne.addEventListener("pointerup", up);
  }

  // ---- cable geometry ----

  function notchCablePath(a, b, off) {
    const k = Math.max(30, Math.min(120, Math.hypot(b._ax - a._ax, b._ay - a._ay) / 2.2));
    const na = NORM[a._e || "r"], nb = NORM[b._e || "l"];
    let dx = 0, dy = 0;
    if (off) {
      const vx = b._ax - a._ax, vy = b._ay - a._ay;
      const len = Math.hypot(vx, vy) || 1;
      dx = (-vy / len) * off; dy = (vx / len) * off;
    }
    return "M" + (a._ax + dx) + "," + (a._ay + dy)
      + " C" + (a._ax + na[0] * k + dx) + "," + (a._ay + na[1] * k + dy)
      + " " + (b._ax + nb[0] * k + dx) + "," + (b._ay + nb[1] * k + dy)
      + " " + (b._ax + dx) + "," + (b._ay + dy);
  }

  function nodeCablePath(a, b) {
    const aw = a._w || 180, ah = a._h || 78, bw = b._w || 180, bh = b._h || 78;
    const acy = a.y + ah / 2, bcy = b.y + bh / 2;
    const right = (b.x + bw / 2) >= (a.x + aw / 2);
    const ax = right ? a.x + aw : a.x, bx = right ? b.x : b.x + bw;
    const s = right ? 1 : -1;
    const k = Math.max(30, Math.min(120, Math.hypot(bx - ax, bcy - acy) / 2.2));
    return "M" + ax + "," + acy + " C" + (ax + s * k) + "," + acy
      + " " + (bx - s * k) + "," + bcy + " " + bx + "," + bcy;
  }

  // ---- derived layer ----

  function nodesByRegion(frame) {
    const a = frame._ar;
    const ph = phaseOf(a);
    const m = new Map();
    if (!ph) return m;
    for (const n of ph.nodes) {
      for (const r of (n._regions || [])) if (!m.has(r.id)) m.set(r.id, n);
    }
    return m;
  }

  function derivedPairs(frame) {
    const a = frame._ar;
    const byRid = nodesByRegion(frame);
    if (!byRid.size) return [];
    let files = [], messages = [];
    try { files = MX.derived.deriveFileHandoffs(a.feed, { roots: a.regionRoots }); }
    catch (e) { files = []; }
    try { messages = MX.derived.deriveMessageHandoffs(a.wpLines); }
    catch (e) { messages = []; }
    const merged = MX.derived.mergeDerived(files, messages);
    const out = [];
    for (const w of merged) {
      const A = byRid.get(w.from), B = byRid.get(w.to);
      if (A && B && A !== B) out.push({ w: w, a: A, b: B });
    }
    return out;
  }

  function pairKey(aId, bId, wire) { return wire + ":" + aId + "→" + bId; }

  function drawCables(frame) {
    const a = frame._ar;
    const ph = phaseOf(a);
    if (!ph) { a.cablesG.innerHTML = ""; a.cabEnds.innerHTML = ""; return; }
    let out = "", ends = "";
    const derived = derivedPairs(frame);
    const authored = new Set(ph.cables.map((c) => pairKey(c.a.n, c.b.n, c.wire || "file")));
    const execPairs = new Set(derived.map((p) => pairKey(p.a.id, p.b.id, p.w.wire)));

    // a derived pair with no authored cable draws on its own, always executed
    derived.forEach((p) => {
      const key = pairKey(p.a.id, p.b.id, p.w.wire);
      if (authored.has(key)) return;
      const d = nodeCablePath(p.a, p.b);
      const n = (p.w.paths || []).length;
      const tip = p.w.wire === "message"
        ? p.w.count + (p.w.count === 1 ? " message" : " messages")
        : n + (n === 1 ? " file" : " files") + ": "
          + (p.w.paths || []).slice(0, 6).join(", ") + (n > 6 ? " …" : "");
      out += '<path class="dcvis c-exec w-' + p.w.wire + '" d="' + d + '">'
        + "<title>" + esc(tip) + "</title></path>";
    });

    // a file cable between the same pair pushes the message cable aside
    const filePairs = new Set(ph.cables
      .filter((c) => (c.wire || "file") === "file")
      .map((c) => c.a.n + "→" + c.b.n));

    ph.cables.forEach((c) => {
      const A = notchOf(ph, c.a.n, c.a.t), B = notchOf(ph, c.b.n, c.b.t);
      if (!A || !B || A._ax === undefined || B._ax === undefined) return;
      const wire = c.wire || "file";
      const off = (wire === "message" && filePairs.has(c.a.n + "→" + c.b.n)) ? 6 : 0;
      const d = notchCablePath(A, B, off);
      const executed = execPairs.has(pairKey(c.a.n, c.b.n, wire));
      let cls = "cvis w-" + wire + " " + (executed ? "c-exec" : "c-unexec");
      if (a.selCable === c.id) cls += " c-sel";
      const act = String(c.action || "").trim();
      if (act) cls += " c-act";
      const tips = [];
      if (act) tips.push("action: " + act);
      if (c.path) tips.push("path: " + c.path);
      out += '<path class="chit" data-c="' + c.id + '" d="' + d + '"></path>'
        + '<path class="' + cls + '" d="' + d + '">'
        + (tips.length ? "<title>" + esc(tips.join("\n")) + "</title>" : "")
        + "</path>";
      ends += '<div class="cabend w-' + wire + " " + (executed ? "c-exec" : "c-unexec")
        + '" style="left:' + B._ax + "px;top:" + B._ay + 'px"></div>';
    });

    a.cablesG.innerHTML = out;
    a.cabEnds.innerHTML = ends;
    a.cablesG.querySelectorAll(".chit").forEach((p) => {
      p.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.shiftKey) { const c = cableById(frame, p.dataset.c); if (c) openCableMenu(frame, c); return; }
        hideCableMenu(frame);
        a.selCable = p.dataset.c; a.selNode = null; drawCables(frame); applySel(frame);
      });
      p.addEventListener("contextmenu", (e) => {
        const c = cableById(frame, p.dataset.c);
        if (c) cableCtxMenu(frame, e, c);
      });
    });
    placeCableMenu(frame);
  }

  function placeLoopBoxes(frame) {
    const a = frame._ar;
    a.world.querySelectorAll(".loopbox").forEach((x) => x.remove());
    const ph = phaseOf(a);
    if (!ph) return;
    const PAD = 30;
    (ph.loops || []).forEach((L, ix) => {
      const mem = L.nodes.map((id) => ph.nodes.find((n) => n.id === id)).filter(Boolean);
      if (!mem.length) return;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      mem.forEach((n) => {
        const w = n._w || 180, h = n._h || 78;
        x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y);
        x2 = Math.max(x2, n.x + w); y2 = Math.max(y2, n.y + h);
      });
      const box = el("div", "loopbox");
      box.style.left = (x1 - PAD) + "px"; box.style.top = (y1 - PAD) + "px";
      box.style.width = (x2 - x1 + PAD * 2) + "px";
      box.style.height = (y2 - y1 + PAD * 2) + "px";
      const wts = loopWts(L, ph);
      const lab = el("div", "lb-lbl" + (wts.length ? "" : " none"));
      lab.textContent = (wts.length ? wts.join(" · ")
        : "no worktree — this loop does not git") + "  ·  ⟳ L" + (ix + 1);
      box.append(lab);
      a.world.append(box);
    });
  }

  // ---- canvas wiring ----

  function wireCanvas(frame) {
    const a = frame._ar;
    const bare = (e) => e.target === a.cwrap || e.target === a.world
      || e.target === a.svg || !!e.target.closest(".ar-svg");

    a.cwrap.addEventListener("pointerdown", (e) => {
      if (!bare(e) || e.target.closest(".chit")) return;
      const sx = e.clientX, sy = e.clientY, ox = a.panX, oy = a.panY;
      let moved = false;
      a.cwrap.setPointerCapture(e.pointerId);
      function mv(ev) {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        a.panX = ox + dx; a.panY = oy + dy; applyView(frame);
      }
      function up() {
        a.cwrap.removeEventListener("pointermove", mv);
        a.cwrap.removeEventListener("pointerup", up);
        if (!moved) {
          a.selNode = null; a.selCable = null; hideCableMenu(frame);
          applySel(frame); drawCables(frame);
        }
      }
      a.cwrap.addEventListener("pointermove", mv);
      a.cwrap.addEventListener("pointerup", up);
    });

    a.cwrap.addEventListener("dblclick", (e) => {
      if (!bare(e) || e.target.closest(".chit")) return;
      addNode(frame, "job", worldPt(frame, e));
    });

    a.cwrap.addEventListener("contextmenu", (e) => {
      if (!bare(e) || e.target.closest(".chit")) return;
      const p = worldPt(frame, e);
      const items = [["+ add node", () => addNode(frame, "job", p)]];
      MINI_KINDS.forEach((k) => items.push(["+ " + k, () => addNode(frame, k, p)]));
      items.push("sep");
      if (clipNode) items.push(["📋 paste", () => pasteNode(frame, p)]);
      items.push(["show all", () => fitAll(frame)]);
      openCtxMenu(frame, e, items.concat(undoItems(frame)));
    });

    a.cwrap.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = a.cwrap.getBoundingClientRect();
      if (e.shiftKey) { a.panX -= e.deltaX; a.panY -= e.deltaY; applyView(frame); return; }
      setZoom(frame, a.zoom * (e.deltaY < 0 ? 1.08 : 0.92),
        e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  function addNode(frame, kind, pt) {
    const a = frame._ar;
    if (!a.plan) { a.plan = blankPlan(); touch(frame); }
    const ph = phaseOf(a);
    if (!ph) return;
    snap(frame, "add " + kind);
    ph.nodes.push(blankNode(uid(), kind,
      { x: Math.max(0, pt.x - 85), y: Math.max(0, pt.y - 30) }));
    structural(frame, "add");
  }

  // ================================================================
  // selection actions
  // ================================================================

  function deleteSelectedCable(frame) {
    const a = frame._ar;
    const ph = phaseOf(a);
    if (!ph || !a.selCable) return;
    snap(frame, "delete cable");
    ph.cables = ph.cables.filter((c) => c.id !== a.selCable);
    a.selCable = null;
    structural(frame, "delete");
  }

  function deleteSelectedNode(frame) {
    const a = frame._ar;
    const ph = phaseOf(a);
    if (!ph || !a.selNode) return;
    const n = ph.nodes.find((x) => x.id === a.selNode);
    snap(frame, "delete node" + (n && n.name ? " “" + n.name + "”" : ""));
    ph.cables = ph.cables.filter((c) => c.a.n !== a.selNode && c.b.n !== a.selNode);
    ph.nodes = ph.nodes.filter((x) => x.id !== a.selNode);
    a.selNode = null;
    structural(frame, "delete");
  }

  function copySelectedNode(frame) {
    const a = frame._ar;
    const ph = phaseOf(a);
    if (!ph || !a.selNode) return;
    const n = ph.nodes.find((x) => x.id === a.selNode);
    if (!n) return;
    clipNode = JSON.parse(JSON.stringify(n, (k, v) => (k[0] === "_" ? undefined : v)));
    toast(frame, "copied “" + (n.name || "node") + "”");
  }

  function cutSelectedNode(frame) { copySelectedNode(frame); deleteSelectedNode(frame); }

  function pasteNode(frame, pt) {
    const a = frame._ar;
    if (!clipNode) { toast(frame, "nothing to paste"); return; }
    const ph = phaseOf(a);
    if (!ph) return;
    snap(frame, "paste node" + (clipNode.name ? " “" + clipNode.name + "”" : ""));
    const n = JSON.parse(JSON.stringify(clipNode));
    n.id = uid(); n.x = pt.x; n.y = pt.y; n.jobId = null; n.regions = [];
    n.notches = (clipNode.notches || []).map((nc) =>
      ({ id: uid(), kind: nc.kind, p: nc.p, path: nc.path || null }));
    ph.nodes.push(n);
    a.selNode = n.id; a.selCable = null;
    structural(frame, "paste");
  }

  // duplicate job settings — preset and settings rows only
  function copyJobSettings(frame, n) {
    const rows = (n._regions || []).map((r) => ({ settings: JSON.parse(JSON.stringify(r.settings || {})) }));
    clipSettings = { preset: n.preset, rows: rows };
    toast(frame, "job settings copied");
  }

  function pasteJobSettings(frame, n) {
    if (!clipSettings) { toast(frame, "no job settings on the clipboard"); return; }
    snap(frame, "paste job settings");
    n.preset = clipSettings.preset;
    if (n.preset) {
      for (const r of (n._regions || [])) {
        frame.send({ type: "load_preset", track: r.id, name: n.preset, inst: frame.id });
      }
    }
    const rows = clipSettings.rows || [];
    (n._regions || []).forEach((r, ix) => {
      const src = rows[ix] || rows[0];
      if (!src || !src.settings) return;
      frame.send({ type: "edit_track", track: r.id, fields: src.settings, inst: frame.id });
    });
    touch(frame); render(frame);
    toast(frame, "job settings applied");
  }

  // duplicate job context — file list, preload flags, injection
  function copyJobContext(frame, n) {
    loadJobContext(frame, n, () => {
      const a = frame._ar;
      clipContext = { files: JSON.parse(JSON.stringify(a.ctxFiles)), injection: a.ctxInjection };
      toast(frame, "job context copied");
    });
  }

  function pasteJobContext(frame, n) {
    const a = frame._ar;
    if (!clipContext) { toast(frame, "no job context on the clipboard"); return; }
    a.winNode = n;
    a.ctxFiles = JSON.parse(JSON.stringify(clipContext.files || []));
    a.ctxInjection = clipContext.injection || "";
    a.ctxLoadedFor = n.id;
    writeJobContext(frame, n);
    toast(frame, "job context applied");
  }

  // ================================================================
  // right-click menus
  // ================================================================

  function closeCtxMenu(frame) { frame._ar.ctxMenu.classList.remove("open"); }

  function openCtxMenu(frame, e, items) {
    const a = frame._ar;
    e.preventDefault(); e.stopPropagation();
    a.ctxMenu.innerHTML = "";
    items.forEach((it) => {
      if (it === "sep") { a.ctxMenu.append(el("div", "ctx-sep")); return; }
      const b = el("button", null, it[0]);
      b.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      b.addEventListener("click", (ev) => { ev.stopPropagation(); closeCtxMenu(frame); it[1](); });
      a.ctxMenu.append(b);
    });
    a.ctxMenu.classList.add("open");
    const r = a.root.getBoundingClientRect();
    a.ctxMenu.style.left = (e.clientX - r.left) + "px";
    a.ctxMenu.style.top = (e.clientY - r.top) + "px";
  }

  function undoItems(frame) {
    return ["sep", ["↺ undo", () => undo(frame)], ["↻ redo", () => redo(frame)]];
  }

  function nodeCtxMenu(frame, e, n) {
    const a = frame._ar;
    a.selNode = n.id; a.selCable = null; applySel(frame); drawCables(frame);
    const items = [];
    const kinds = n.kind === "group" ? ["message"]
      : n.kind === "branch" || n.kind === "merge" ? ["git-in", "git-out"]
      : NOTCH_KINDS;
    kinds.forEach((k) => items.push(["+ " + k + " notch", () => {
      snap(frame, "add " + k + " notch");
      n.notches.push({ id: uid(), kind: k, p: placeP(n, k), path: null });
      touch(frame); render(frame);
    }]));
    items.push("sep");
    items.push(["✂ cut", () => cutSelectedNode(frame)]);
    items.push(["⧉ copy", () => copySelectedNode(frame)]);
    if (clipNode) items.push(["📋 paste", () => pasteNode(frame, worldPt(frame, e))]);
    items.push("sep");
    if (n.kind === "job") {
      items.push(["⚙ open settings", () => openWindow(frame, n, "settings")]);
      items.push(["📄 open context", () => openWindow(frame, n, "context")]);
      items.push(["⧉ duplicate job settings", () => copyJobSettings(frame, n)]);
      items.push(["⧉ duplicate job context", () => copyJobContext(frame, n)]);
      if (clipSettings) items.push(["📋 paste job settings", () => pasteJobSettings(frame, n)]);
      if (clipContext) items.push(["📋 paste job context", () => pasteJobContext(frame, n)]);
    }
    items.push(["✕ delete", () => deleteSelectedNode(frame)]);
    openCtxMenu(frame, e, items.concat(undoItems(frame)));
  }

  function cableCtxMenu(frame, e, c) {
    const a = frame._ar;
    a.selCable = c.id; a.selNode = null; drawCables(frame);
    openCtxMenu(frame, e, [
      ["⚙ cable menu", () => openCableMenu(frame, c)],
      ["✕ delete", () => deleteSelectedCable(frame)],
    ].concat(undoItems(frame)));
  }

  // ================================================================
  // cable menu
  // ================================================================

  function cableById(frame, id) {
    const ph = phaseOf(frame._ar);
    return (ph && ph.cables.find((c) => c.id === id)) || null;
  }

  function hideCableMenu(frame) {
    const a = frame._ar;
    a.menuFor = null;
    a.cbmenu.classList.remove("open");
  }

  function closeCableMenu(frame) {
    if (!frame._ar.menuFor) return;
    hideCableMenu(frame);
    drawCables(frame);
  }

  function openCableMenu(frame, c) {
    const a = frame._ar;
    a.menuFor = c.id;
    a.cbAction.value = c.action || "";
    a.cbContent.value = c.content || "";
    a.cbPath.value = c.path || "";
    a.cbmenu.classList.add("open");
    placeCableMenu(frame);
    a.cbAction.focus(); a.cbAction.select();
  }

  function placeCableMenu(frame) {
    const a = frame._ar;
    if (!a.menuFor) return;
    const p = a.cablesG.querySelector('.chit[data-c="' + a.menuFor + '"]');
    if (!p) { hideCableMenu(frame); return; }
    let mid = null;
    try { mid = p.getPointAtLength(p.getTotalLength() / 2); } catch (e) { mid = null; }
    if (!mid) { hideCableMenu(frame); return; }
    a.cbmenu.style.left = mid.x + "px";
    a.cbmenu.style.top = mid.y + "px";
  }

  // path is stored on the cable and on its out notch
  function setCablePath(frame, v) {
    const a = frame._ar;
    const c = cableById(frame, a.menuFor);
    if (!c) return;
    c.path = v || null;
    const ph = phaseOf(a);
    const src = notchOf(ph, c.a.n, c.a.t);
    if (src) src.path = c.path;
    touch(frame);
  }

  function wireCableMenu(frame) {
    const a = frame._ar;
    const q = (s) => a.cbmenu.querySelector(s);
    a.cbAction = q(".cbm-action");
    a.cbContent = q(".cbm-content");
    a.cbPath = q(".cbm-path");
    const seeds = q(".cbm-seeds");
    ACTION_SEEDS.forEach((act) => {
      const b = el("button", null, act);
      b.title = "set this cable's action to “" + act + "”";
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        a.cbAction.value = act;
        const c = cableById(frame, a.menuFor);
        if (c) { c.action = act; touch(frame); }
        drawCables(frame);
      });
      seeds.append(b);
    });
    a.cbmenu.addEventListener("pointerdown", (e) => e.stopPropagation());
    a.cbmenu.addEventListener("dblclick", (e) => e.stopPropagation());

    const commit = (input, apply) => {
      input.addEventListener("input", () => apply(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); closeCableMenu(frame); return; }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCableMenu(frame); }
      });
    };
    commit(a.cbAction, (v) => { const c = cableById(frame, a.menuFor); if (c) { c.action = v; touch(frame); } });
    commit(a.cbContent, (v) => { const c = cableById(frame, a.menuFor); if (c) { c.content = v; touch(frame); } });
    commit(a.cbPath, (v) => setCablePath(frame, v));

    q(".cbm-clr").addEventListener("click", (e) => {
      e.stopPropagation();
      a.cbAction.value = ""; a.cbContent.value = "";
      const c = cableById(frame, a.menuFor);
      if (c) { c.action = ""; c.content = ""; touch(frame); }
      drawCables(frame); a.cbAction.focus();
    });
    q(".cbm-done").addEventListener("click", (e) => { e.stopPropagation(); closeCableMenu(frame); });
  }

  // ================================================================
  // node window — settings pane and context pane
  // ================================================================

  function openWindow(frame, n, pane) {
    const a = frame._ar;
    a.winNode = n;
    a.winPane = pane || "settings";
    a.winEl.classList.add("open");
    loadJobContext(frame, n, () => renderWindow(frame));
    renderWindow(frame);
  }

  function closeWindow(frame) {
    const a = frame._ar;
    const n = a.winNode;
    if (n) writeJobContext(frame, n);
    a.winNode = null;
    a.winEl.classList.remove("open");
    render(frame);
  }

  function renderWindow(frame) {
    const a = frame._ar;
    const n = a.winNode;
    if (!n) return;
    a.winTitle.textContent = (n.name || "job") + (n.wt ? "  ·  " + n.wt : "");
    renderSettingsPane(frame, n);
    renderContextPane(frame, n);
  }

  function renderSettingsPane(frame, n) {
    const a = frame._ar;
    const host = a.paneSettings;
    host.innerHTML = "";

    // preset picker — the plan stores the name only
    const pk = el("div", "win-preset");
    pk.append(el("span", "lc-l", "preset"));
    const sel = document.createElement("select");
    const names = a.presetNames || [];
    const cur = n.preset || "";
    const list = [""].concat(cur && names.indexOf(cur) < 0 ? [cur] : []).concat(names);
    for (const name of list) {
      const o = document.createElement("option");
      o.value = name; o.textContent = name || "—";
      if (name === cur) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => {
      n.preset = sel.value || null;
      touch(frame);
      if (n.preset) {
        for (const r of (n._regions || [])) {
          frame.send({ type: "load_preset", track: r.id, name: n.preset, inst: frame.id });
        }
      }
    });
    pk.append(sel);
    host.append(pk);

    // track — which agent on the roster this job belongs to
    const tkRow = el("div", "win-preset");
    tkRow.append(el("span", "lc-l", "track"));
    const tkSel = document.createElement("select");
    const curTrack = n.track || "";
    const trackIds = [""].concat(
      curTrack && !a.trackRows.some((t) => t.id === curTrack) ? [curTrack] : []
    ).concat(a.trackRows.map((t) => t.id));
    for (const id of trackIds) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = id ? ((trackRowOf(a, id) || {}).name || id) : "—";
      if (id === curTrack) o.selected = true;
      tkSel.appendChild(o);
    }
    tkSel.addEventListener("change", () => {
      n.track = tkSel.value || "";
      touch(frame);
    });
    tkRow.append(tkSel);
    host.append(tkRow);

    // disk path — export root plus the docset labels, blank when not exported
    if (n.docId) {
      const dp = el("div", "win-preset");
      dp.append(el("span", "lc-l", "disk path"));
      dp.append(el("span", "lc-p", n.path || "not exported"));
      host.append(dp);
    }
    if (!a.presetsLoaded) {
      a.presetsLoaded = true;
      fetch("/api/library/presets").then((r) => r.json()).then((d) => {
        a.presetNames = (d && d.names) || [];
        renderWindow(frame);
      }).catch(() => {});
    }

    const regions = n._regions || [];
    if (!regions.length) {
      host.append(el("div", "win-empty",
        "no regions on this job — nothing on the server to edit yet"));
      return;
    }

    // one block per track this job carries, its regions under it in server order
    const seen = new Set();
    for (const r of regions) {
      const tr = trackRowOf(a, r.track);
      const tkey = r.track || "";
      if (!seen.has(tkey)) {
        seen.add(tkey);
        host.append(el("div", "win-sec", "track · " + ((tr && tr.name) || tkey || "—")));
      }
      host.append(el("div", "win-sec", "region · " + (r.name || r.id)));
      const box = el("div", "mx-dev-tab-body");
      host.append(box);
      a.settingsRows.renderSettings(r, box);
      const gates = el("div", "mx-dev-tab-body");
      host.append(el("div", "win-sec", "gates · " + (r.name || r.id)));
      host.append(gates);
      a.settingsRows.renderGates(r, gates);
    }
  }

  // ---- context pane ----

  function ctxDir(n) { return "injections/region/" + (n.name || n.id); }

  function loadJobContext(frame, n, done) {
    const a = frame._ar;
    if (a.ctxLoadedFor === n.id) { if (done) done(); return; }
    a.ctxLoadedFor = n.id;
    a.ctxFiles = [];
    a.ctxInjection = "";
    let left = 2;
    const finish = () => { left -= 1; if (left === 0 && done) done(); };
    fetch("/api/fs/read?path=" + encodeURIComponent(ctxDir(n) + "/context.json"))
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.text === "string") {
          try {
            const parsed = JSON.parse(d.text);
            a.ctxFiles = Array.isArray(parsed.files) ? parsed.files : [];
          } catch (e) { /* an unreadable file starts empty */ }
        }
        finish();
      }).catch(finish);
    fetch("/api/fs/read?path=" + encodeURIComponent(ctxDir(n) + "/injection.md"))
      .then((r) => r.json())
      .then((d) => { if (d && typeof d.text === "string") a.ctxInjection = d.text; finish(); })
      .catch(finish);
  }

  // the job context is one per job — never in the plan
  function writeJobContext(frame, n) {
    const a = frame._ar;
    const dir = ctxDir(n);
    putFile(dir + "/context.json",
      canonicalJson({ files: a.ctxFiles }));
    putFile(dir + "/injection.md", a.ctxInjection || "");
  }

  function putFile(path, text) {
    return fetch("/api/fs/put", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path, text: text }),
    }).then((r) => r.json());
  }

  function renderContextPane(frame, n) {
    const a = frame._ar;
    const host = a.paneContext;
    host.innerHTML = "";
    host.append(el("div", "win-sec", "context files"));

    if (!a.ctxFiles.length) {
      host.append(el("div", "win-empty", "no files — drop one from the browser, or pick one"));
    }
    a.ctxFiles.forEach((f, ix) => {
      const row = el("div", "cx-row");
      const p = el("span", "cx-p"); p.textContent = f.path; p.title = f.path;
      const pre = el("label", "cx-pre");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = !!f.preload;
      cb.addEventListener("change", () => { f.preload = cb.checked; });
      pre.append(cb, document.createTextNode("preload"));
      const x = el("button", "cx-x", "×");
      x.addEventListener("click", () => { a.ctxFiles.splice(ix, 1); renderContextPane(frame, n); });
      row.append(p, pre, x);
      host.append(row);
    });

    const actions = el("div", "cx-actions");
    const pick = el("button", "ar-btn", "pick file");
    pick.addEventListener("click", () => {
      MX.openRootBrowser("/", (path) => {
        a.ctxFiles.push({ path: path, preload: false });
        renderContextPane(frame, n);
      }, { ext: "" });
    });
    const save = el("button", "ar-btn", "save to library");
    save.addEventListener("click", () => saveToLibrary(frame, n));
    const imp = el("button", "ar-btn", "import from library");
    imp.addEventListener("click", () => importFromLibrary(frame, n));
    actions.append(pick, save, imp);
    host.append(actions);

    host.append(el("div", "win-sec", "injection"));
    const ta = el("textarea", "cx-inj");
    ta.value = a.ctxInjection || "";
    ta.addEventListener("input", () => { a.ctxInjection = ta.value; });
    host.append(ta);

    host.addEventListener("dragover", (e) => { e.preventDefault(); host.classList.add("hot"); });
    host.addEventListener("dragleave", () => host.classList.remove("hot"));
    host.addEventListener("drop", (e) => {
      e.preventDefault();
      host.classList.remove("hot");
      const path = e.dataTransfer.getData("application/x-mx-path")
        || e.dataTransfer.getData("text/plain");
      if (!path) return;
      a.ctxFiles.push({ path: path, preload: false });
      renderContextPane(frame, n);
    });
  }

  function libDir(n) { return "library/docs/" + (n.name || n.id); }

  function saveToLibrary(frame, n) {
    const a = frame._ar;
    const dir = libDir(n);
    putFile(dir + "/injection.md", a.ctxInjection || "")
      .then(() => toast(frame, "saved to " + dir))
      .catch(() => toast(frame, "library save failed"));
    for (const f of a.ctxFiles) {
      const base = String(f.path).split("/").filter(Boolean).pop();
      if (!base) continue;
      fetch("/api/fs/read?path=" + encodeURIComponent(f.path))
        .then((r) => r.json())
        .then((d) => { if (d && typeof d.text === "string") putFile(dir + "/" + base, d.text); })
        .catch(() => {});
    }
  }

  function importFromLibrary(frame, n) {
    const a = frame._ar;
    fetch("/api/fs/browse?path=" + encodeURIComponent("library/docs"))
      .then((r) => r.json())
      .then((d) => {
        if (!d || d.error) { toast(frame, "library/docs is empty"); return; }
        MX.openRootBrowser(d.path, (path) => {
          a.ctxFiles.push({ path: path, preload: false });
          renderContextPane(frame, n);
        }, { ext: "" });
      })
      .catch(() => toast(frame, "library/docs is empty"));
  }

  // ================================================================
  // keys and pipe
  // ================================================================

  function wireKeys(frame) {
    const a = frame._ar;
    a.onKey = (e) => {
      if (!a.root.isConnected) return;
      if (!a.root.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.target.closest && e.target.closest("[contenteditable],input,textarea")) {
        if (e.key === "Escape") onEsc(frame, e);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(frame); else undo(frame);
        return;
      }
      if (e.key === "Escape") { onEsc(frame, e); return; }
      if (e.key !== "Delete") return;
      if (a.selCable) deleteSelectedCable(frame);
      else if (a.selNode) deleteSelectedNode(frame);
    };
    document.addEventListener("keydown", a.onKey);
  }

  function onEsc(frame, e) {
    const a = frame._ar;
    const ae = document.activeElement;
    if (ae && a.root.contains(ae) && ae.closest("[contenteditable],input,textarea")) {
      if (ae.closest(".ar-cbmenu")) { closeCableMenu(frame); return; }
      return;
    }
    if (a.winEl.classList.contains("open")) { e.preventDefault(); closeWindow(frame); return; }
    if (a.ctxMenu.classList.contains("open")) { closeCtxMenu(frame); return; }
    if (a.menuFor) { closeCableMenu(frame); return; }
    if (a.selNode || a.selCable) {
      a.selNode = a.selCable = null; applySel(frame); drawCables(frame);
    }
  }

  function pipePlan(frame) {
    const a = frame._ar;
    if (!a.plan) { toast(frame, "nothing to pipe"); return; }
    const ph = phaseOf(a);
    const nm = (ph && ph.name) || "this phase";
    const jobs = ph ? ph.nodes.filter((n) => n.kind === "job") : [];
    if (!jobs.length) { toast(frame, "no jobs on " + nm + " — nothing to pipe"); return; }
    const ok = window.confirm(
      "Pipe " + nm + " — " + jobs.length + " job" + (jobs.length === 1 ? "" : "s")
      + ".\n\nThis writes the records. It does NOT start anything.\n\n"
      + "Piping again writes a second set — there is no update in place.");
    if (!ok) return;
    frame.send({ type: "ade_plan", plan: stripLive(a.plan), inst: frame.id });
    toast(frame, "piped " + nm + " — nothing started");
  }
})();
