// WAYFINDER — Step 10, part two: the drawing.
//
// One SVG, one renderer, three recipes. The renderer knows nothing about
// folders, files or parts — it is handed a VIEW MODEL (see layout.js) and
// draws it:
//
//   { mode, planes, placed, pads, nodes, edges, camera, crumbs, drillable }
//
// mode 'tilt' spins and pitches; mode 'flat' is straight down and refuses to
// rotate, because a flat view that can be knocked askew is not legible.
//
// A label is never drawn wider than the box it belongs to. That single rule is
// what stopped the labels piling on top of each other on a real scan.
import { makeProjection, PLANE_THICK } from './layout.js';
// HOVER PREVIEWS ITS OWN REACH, so the walk runs in here now as well as in the
// page. No new wiring was needed for it: this class has been handed the Index
// at construction since it was written and had never once used it.
import { reachFrom } from './reach.js';
const TILE = 96; // world size of a file tile in the tilted view
const DOT_R = 4.3; // screen radius of an inner part
const LABEL_LIFT = 16;
const CHAR_W = 6.15; // mono advance at the label size, near enough
const MIN_CHARS = 4; // narrower than this and the label is dropped
const LABEL_ROOM = 130; // screen strip kept clear for the plane names
// How far the camera may lean. Straight down is allowed in the flat views,
// where it is the only angle; the stacked-shelf view stops just short of it,
// because at dead top-down the shelves land on top of each other and the view
// stops saying anything.
const PITCH_MIN = 0.05;
const PITCH_TILT_MAX = 1.45;
const PITCH_FLAT = Math.PI / 2;
const GLIDE_MS = 340;
export class MapView {
    svg;
    /** Was `unknown` and unused. The hover preview walks it, so it is now typed
     *  as the little of it that reach.ts needs. The Index the page already
     *  passes satisfies this as it stands. */
    index;
    onSelect;
    onDrill;
    look;
    cam;
    hidden;
    /** Every picked file, in the order they were picked. A plain click replaces
     *  this list; a shift-click adds to it, or drops one already in it. */
    selectedIds;
    /** Which of the picks the card and the editor are showing. Always one of
     *  selectedIds, or null when nothing is picked. */
    focusedId;
    hovered;
    pt;
    vm;
    near;
    anim;
    /** REACH — the ids inside the current reach (see reach.ts). Set from outside;
     *  null when Reach:Map is off. Call paintState() after changing it. */
    reachSet = null;
    /** COMMON REACH — when set, the fan is cut down to the strands that LAND on
     *  one of these, and the halo with it. Brandon's ruling: showing only what
     *  the picks have in common means showing only the strands that get there,
     *  not every strand with a few bright ends. Null is the whole fan, which is
     *  what it has always been. Set from outside; paintState() after. */
    fanTo = null;
    mk;
    gPlanes;
    gEdges;
    gNodes;
    gLabels;
    planeEls = [];
    edgeEls = [];
    nodeEls = [];
    hoverLabel;
    constructor(svg, index, opts = {}) {
        this.svg = svg;
        this.index = index;
        this.onSelect = opts.onSelect || (() => { });
        this.onDrill = opts.onDrill || (() => { });
        this.look = opts.look || ((e) => e.resolved);
        this.cam = { yaw: -0.42, pitch: 0.92, scale: 1, ox: 0, oy: 0 };
        this.hidden = new Set();
        this.selectedIds = [];
        this.focusedId = null;
        this.hovered = null;
        this.pt = new Map();
        this.vm = null;
        this.near = new Map();
        this.anim = null;
        this.shell();
        this.bind();
    }
    // ---- the parts of the svg that never change ----------------------------
    shell() {
        const NS = 'http://www.w3.org/2000/svg';
        this.mk = (t, attrs = {}) => {
            const el = document.createElementNS(NS, t);
            for (const [k, v] of Object.entries(attrs))
                el.setAttribute(k, String(v));
            return el;
        };
        const mk = this.mk;
        this.svg.innerHTML = '';
        const defs = mk('defs');
        defs.innerHTML = `
      <radialGradient id="wf-ground" cx="50%" cy="42%" r="72%">
        <stop offset="0%"  stop-color="#1b2436" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#0b0d13" stop-opacity="0"/>
      </radialGradient>
      <filter id="wf-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
        this.svg.appendChild(defs);
        this.svg.appendChild(mk('rect', {
            class: 'wf-ground', x: 0, y: 0, width: '100%', height: '100%', fill: 'url(#wf-ground)',
        }));
        this.gPlanes = mk('g', { class: 'wf-planes' });
        this.gEdges = mk('g', { class: 'wf-edges' });
        this.gNodes = mk('g', { class: 'wf-nodes' });
        this.gLabels = mk('g', { class: 'wf-labels' });
        this.svg.append(this.gPlanes, this.gEdges, this.gNodes, this.gLabels);
    }
    // ---- take a view model and build every element it needs ----------------
    show(vm, opts = {}) {
        const mk = this.mk;
        this.vm = vm;
        // A pick only survives if the new view model still holds it — a toggle can
        // take a picked thing off the map. Each pick is judged on its own, so a
        // filter that drops one of eight leaves the other seven standing.
        this.selectedIds = opts.keepSelection
            ? this.selectedIds.filter((id) => vm.nodes.has(id))
            : [];
        // The focus follows its list. If the focused pick was the one that left,
        // the most recent survivor takes over rather than the card going blank.
        if (!this.focusedId || !this.selectedIds.includes(this.focusedId)) {
            this.focusedId = this.selectedIds[this.selectedIds.length - 1] ?? null;
        }
        this.hovered = null;
        this.near.clear();
        for (const e of vm.edges) {
            if (!this.near.has(e.from))
                this.near.set(e.from, new Set());
            if (!this.near.has(e.to))
                this.near.set(e.to, new Set());
            this.near.get(e.from).add(e.to);
            this.near.get(e.to).add(e.from);
        }
        this.gPlanes.innerHTML = '';
        this.gEdges.innerHTML = '';
        this.gNodes.innerHTML = '';
        this.gLabels.innerHTML = '';
        this.planeEls = vm.planes.map((p) => {
            const g = mk('g', { class: 'wf-plane' });
            const sides = [0, 1, 2, 3].map(() => mk('polygon', { class: 'wf-plane-side' }));
            const face = mk('polygon', { class: 'wf-plane-face' });
            const grid = mk('path', { class: 'wf-plane-grid' });
            const rule = mk('line', { class: 'wf-plane-rule' });
            const label = mk('text', { class: 'wf-plane-label' });
            label.textContent = p.name === '.' ? 'root' : (p.name.endsWith('/') ? p.name : `${p.name}/`);
            const count = mk('text', { class: 'wf-plane-count' });
            count.textContent = `${p.count} ${p.count === 1 ? 'box' : 'boxes'}`;
            g.append(...sides, face, grid, rule, label, count);
            this.gPlanes.appendChild(g);
            return { p, g, sides, face, grid, rule, label, count };
        });
        this.edgeEls = vm.edges
            .filter((e) => vm.placed.has(e.from) && vm.placed.has(e.to))
            .map((e) => {
            const path = mk('path', {
                class: `wf-edge k-${e.kind} r-${this.look(e)}`,
                'data-kind': e.kind,
            });
            if (e.count > 1)
                path.style.strokeWidth = String(Math.min(1 + Math.log2(e.count) * 0.55, 4.2));
            this.gEdges.appendChild(path);
            return { e, path };
        });
        this.nodeEls = [];
        for (const [id, spot] of vm.placed) {
            const n = vm.nodes.get(id);
            if (!n)
                continue;
            const failed = n.parse_status === 'failed';
            const cls = `wf-node kind-${n.kind} lang-${n.lang || 'none'}` +
                `${failed ? ' failed' : ''}${vm.drillable.has(id) ? ' openable' : ''}`;
            const box = vm.mode === 'flat' && spot.pad;
            const shape = spot.isFile
                ? mk('polygon', { class: `${cls} is-file${box ? ' is-box' : ''}` })
                : mk('circle', { class: `${cls} is-part`, r: DOT_R });
            shape.setAttribute('data-id', id);
            this.gNodes.appendChild(shape);
            let label = null;
            let sub = null;
            if (spot.isFile) {
                label = mk('text', { class: 'wf-node-label' });
                this.gLabels.appendChild(label);
                if (box && spot.held) {
                    sub = mk('text', { class: 'wf-node-sub' });
                    sub.textContent = `${spot.held} inside`;
                    this.gLabels.appendChild(sub);
                }
            }
            this.nodeEls.push({ id, n, spot, shape, label, sub, isFile: spot.isFile, box });
        }
        this.hoverLabel = mk('text', { class: 'wf-hover-label' });
        this.gLabels.appendChild(this.hoverLabel);
        if (!opts.keepCamera) {
            this.stop();
            this.cam.yaw = vm.camera.yaw;
            this.cam.pitch = vm.camera.pitch;
        }
        // Say where the camera ended up, so the slider and the cube agree with it.
        this.emitCam();
        this.fit();
    }
    // ---- interaction -------------------------------------------------------
    bind() {
        let drag = null;
        // Left drag orbits, right or middle drag pans. The flat views have nothing
        // to orbit, so every drag there is a pan.
        // SHIFT NO LONGER PANS. It is the add-to-selection key now — Brandon's
        // ruling. Panning kept both of its other routes, so nothing was lost.
        this.svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
        this.svg.addEventListener('pointerdown', (ev) => {
            this.stop();
            this.svg.setPointerCapture(ev.pointerId);
            const flat = this.vm?.mode === 'flat';
            const pan = flat || ev.button === 1 || ev.button === 2;
            // What was under the pointer when it went down. It has to be read HERE:
            // capturing the pointer retargets every later event to the svg itself,
            // so by pointerup ev.target is the canvas and the box is long gone.
            // Shift is read here for the same reason — the key can be let go before
            // the button is, and the click means what it meant when it started.
            drag = {
                x: ev.clientX, y: ev.clientY, pan, moved: false, button: ev.button,
                add: ev.shiftKey,
                hit: ev.target?.getAttribute?.('data-id') || null,
            };
        });
        this.svg.addEventListener('pointermove', (ev) => {
            if (drag) {
                const dx = ev.clientX - drag.x;
                const dy = ev.clientY - drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 3)
                    drag.moved = true;
                if (drag.pan) {
                    this.cam.ox += dx;
                    this.cam.oy += dy;
                }
                else {
                    // Orbit only. Yaw spins, pitch leans, and nothing ever rolls — the
                    // horizon cannot end up crooked no matter how you drag.
                    this.cam.yaw -= dx * 0.006;
                    this.cam.pitch = clamp(this.cam.pitch - dy * 0.005, PITCH_MIN, this.pitchMax());
                    this.emitCam();
                }
                drag.x = ev.clientX;
                drag.y = ev.clientY;
                this.render();
                return;
            }
            const id = ev.target?.getAttribute?.('data-id');
            if (id !== this.hovered) {
                this.hovered = id || null;
                this.paintState();
            }
        });
        const end = () => {
            if (drag && !drag.moved && drag.button === 0) {
                const id = drag.hit;
                this.select(id, { add: drag.add });
                // SHIFT ADDS AND NOTHING ELSE — Brandon's ruling. Drilling replaces the
                // whole view with one level down, which is the opposite of adding to a
                // selection you are building. A plain click on a folder still opens it.
                if (!drag.add && id && this.vm?.drillable.has(id))
                    this.onDrill(id);
            }
            drag = null;
        };
        this.svg.addEventListener('pointerup', end);
        this.svg.addEventListener('pointercancel', () => { drag = null; });
        // Zoom toward the pointer, not toward the middle of the screen. The world
        // point under the cursor stays under the cursor, which is the whole reason
        // zooming in a CAD tool feels like it is going where you meant.
        this.svg.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            this.stop();
            const before = this.cam.scale;
            const after = clamp(before * (ev.deltaY > 0 ? 0.92 : 1.087), 0.12, 6);
            if (after === before)
                return;
            const r = this.svg.getBoundingClientRect();
            const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
            const k = after / before;
            this.cam.scale = after;
            this.cam.ox = cx - (cx - this.cam.ox) * k;
            this.cam.oy = cy - (cy - this.cam.oy) * k;
            this.render();
        }, { passive: false });
        // f       — frame the focused pick, or the whole map when nothing is picked.
        // shift+f — fit EVERY pick into the window at once. Brandon's ruling.
        window.addEventListener('keydown', (ev) => {
            const t = ev.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))
                return;
            // AND ANYWHERE INSIDE THE EDITOR. Monaco takes its keystrokes on a
            // <div class="native-edit-context"> — not an input, not a textarea, and
            // not contentEditable — so the three tests above all say "not typing"
            // while Brandon is typing, and this handler eats the letter f out of the
            // file. Found by driving the page: WAYFINDER came out WAYINDER.
            if (t?.closest?.('#wf-right'))
                return;
            if (ev.key === 'f' || ev.key === 'F') {
                ev.preventDefault();
                if (ev.shiftKey)
                    this.fitTo(this.selectedIds);
                else if (this.focusedId)
                    this.frame(this.focusedId);
                else
                    this.fit();
            }
        });
        window.addEventListener('resize', () => this.render());
        // style.css insets #map's bottom edge to --term-edge now, so the map's
        // own box shrinks when the terminal grows (and only then — left/right
        // stay 0, the drawers open over the map and never resize it). A drag of
        // the terminal's height rewrites a CSS custom property; that fires no
        // window 'resize' event, so the listener above misses it. Watching the
        // svg's own box, not the window, catches every case that actually
        // changes it. This redraws with the SAME camera — it does not move,
        // fit, or reframe anything; same content, whatever box is there now.
        new ResizeObserver(() => this.render()).observe(this.svg);
    }
    pitchMax() { return this.vm?.mode === 'flat' ? PITCH_FLAT : PITCH_TILT_MAX; }
    emitCam() {
        this.svg.dispatchEvent(new CustomEvent('wf-cam', {
            detail: { yaw: this.cam.yaw, pitch: this.cam.pitch }, bubbles: true,
        }));
    }
    // ---- moving the camera on purpose --------------------------------------
    stop() {
        if (this.anim) {
            cancelAnimationFrame(this.anim);
            this.anim = null;
        }
    }
    // Ease from where the camera is to where it was asked to be. Yaw always
    // takes the short way round, so a turn never spins the long way.
    glide(to, ms = GLIDE_MS) {
        this.stop();
        const from = { ...this.cam };
        if (to.yaw != null) {
            let d = (to.yaw - from.yaw) % (Math.PI * 2);
            if (d > Math.PI)
                d -= Math.PI * 2;
            if (d < -Math.PI)
                d += Math.PI * 2;
            to = { ...to, yaw: from.yaw + d };
        }
        const keys = Object.keys(to);
        const t0 = performance.now();
        const step = (now) => {
            const t = Math.min(1, (now - t0) / ms);
            const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            for (const k of keys)
                this.cam[k] = from[k] + (to[k] - from[k]) * e;
            this.emitCam();
            this.render();
            this.anim = t < 1 ? requestAnimationFrame(step) : null;
        };
        this.anim = requestAnimationFrame(step);
    }
    // Turn to look straight at one face of the cube.
    faceOn(face, table) {
        const want = table[face];
        if (!want)
            return;
        const pitch = want.pitch === 'down' ? this.pitchMax() : PITCH_MIN + 0.03;
        this.glide({ yaw: want.yaw == null ? this.cam.yaw : want.yaw, pitch });
    }
    // Zoom to one thing and put it in the middle.
    frame(id) {
        const spot = this.vm?.placed.get(id);
        if (!spot)
            return this.fit();
        const r = this.svg.getBoundingClientRect();
        const free = Math.max(r.width - 430, 320);
        const worldW = spot.pad ? spot.pad.w : 110;
        const scale = clamp((free * 0.42) / worldW, 0.15, 4);
        const q = makeProjection({ ...this.cam, scale, ox: 0, oy: 0 })(spot.x, spot.y, spot.z);
        this.glide({
            scale,
            ox: free / 2 + 24 + LABEL_ROOM / 2 - q.x,
            oy: r.height / 2 + 18 - q.y,
        });
    }
    /** The focused pick, as one id. Every caller that has ever asked "what is
     *  picked" still gets one answer back — the search list, the error pane and
     *  the card's own links all read this and none of them changed. */
    get selected() { return this.focusedId; }
    /** Go to a node. `add` is the shift-click: it puts the node into the
     *  selection beside whatever is already there, or takes it back out if it is
     *  already in. Without it the selection is replaced, which is what every
     *  caller outside this file means and what a plain click has always done. */
    select(id, opts = {}) {
        const known = id && this.vm?.nodes.has(id) ? id : null;
        if (!known) {
            // Shift on empty space keeps the selection. Only a plain click clears.
            if (opts.add)
                return;
            this.selectedIds = [];
            this.focusedId = null;
        }
        else if (opts.add) {
            const at = this.selectedIds.indexOf(known);
            if (at === -1) {
                this.selectedIds.push(known);
                this.focusedId = known;
            }
            else {
                this.selectedIds.splice(at, 1);
                if (this.focusedId === known) {
                    this.focusedId = this.selectedIds[this.selectedIds.length - 1] ?? null;
                }
            }
        }
        else {
            this.selectedIds = [known];
            this.focusedId = known;
        }
        this.paintState();
        this.onSelect(this.focusedId ? (this.vm.nodes.get(this.focusedId) ?? null) : null);
    }
    /** Move the card and the editor to one pick without changing the selection.
     *  This is what a tab click calls; the map keeps every fan it was drawing. */
    focusOn(id) {
        if (!this.selectedIds.includes(id))
            return;
        this.focusedId = id;
        this.paintState();
        this.onSelect(this.vm.nodes.get(id) ?? null);
    }
    setTilt(pitch) {
        this.stop();
        this.cam.pitch = clamp(pitch, PITCH_MIN, this.pitchMax());
        this.render();
    }
    toggleKind(kind, on) {
        if (on)
            this.hidden.delete(kind);
        else
            this.hidden.add(kind);
        this.render();
    }
    fit() {
        if (!this.vm)
            return;
        this.stop();
        const r = this.svg.getBoundingClientRect();
        const p = makeProjection({ ...this.cam, scale: 1, ox: 0, oy: 0 });
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const consider = (x, y, z) => {
            const q = p(x, y, z);
            minX = Math.min(minX, q.x);
            maxX = Math.max(maxX, q.x);
            minY = Math.min(minY, q.y);
            maxY = Math.max(maxY, q.y);
        };
        for (const pl of this.vm.planes)
            for (const c of pl.corners)
                consider(c.x, pl.elevation, c.z);
        for (const spot of this.vm.placed.values())
            consider(spot.x, spot.y, spot.z);
        const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
        // The card panel owns the right edge; the map centres in what is left.
        // LABEL_ROOM is the strip the plane labels hang in, off the left of the
        // content — without it the first shelf's name walks off the screen.
        const free = Math.max(r.width - 430, 320);
        this.cam.scale = clamp(Math.min((free - 150 - LABEL_ROOM) / w, (r.height - 150) / h), 0.12, 3);
        this.cam.ox = free / 2 + 24 + LABEL_ROOM / 2 - ((minX + maxX) / 2) * this.cam.scale;
        this.cam.oy = r.height / 2 + 18 - ((minY + maxY) / 2) * this.cam.scale;
        this.render();
    }
    /** shift+f — put EVERY pick in the window at once. This is fit()'s own
     *  arithmetic over the picked spots instead of the whole scan: measure at
     *  scale 1, then divide the room by the span. The linearity that lets fit()
     *  do that is fit()'s assumption too, not a new one.
     *
     *  Fewer than two picks has an answer already and this does not reinvent it:
     *  one pick is frame(), none is fit(). */
    fitTo(ids) {
        if (!this.vm)
            return;
        const spots = ids
            .map((id) => this.vm.placed.get(id))
            .filter((s) => Boolean(s));
        if (spots.length === 0)
            return this.fit();
        if (spots.length === 1)
            return this.frame(ids[0]);
        this.stop();
        const r = this.svg.getBoundingClientRect();
        const p = makeProjection({ ...this.cam, scale: 1, ox: 0, oy: 0 });
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const consider = (x, y, z) => {
            const q = p(x, y, z);
            minX = Math.min(minX, q.x);
            maxX = Math.max(maxX, q.x);
            minY = Math.min(minY, q.y);
            maxY = Math.max(maxY, q.y);
        };
        for (const s of spots) {
            // A file is a tile, not a point — measure its corners or the frame cuts
            // the edges off the outermost picks. An inner part IS a point.
            if (!s.isFile) {
                consider(s.x, s.y, s.z);
                continue;
            }
            const h = TILE / 2;
            const x0 = s.pad ? s.pad.x0 : s.x - h;
            const z0 = s.pad ? s.pad.z0 : s.z - h;
            const w = s.pad ? s.pad.w : TILE;
            const d = s.pad ? s.pad.d : TILE;
            consider(x0, s.y, z0);
            consider(x0 + w, s.y, z0);
            consider(x0 + w, s.y, z0 + d);
            consider(x0, s.y, z0 + d);
        }
        const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
        // Same room fit() leaves: the card owns the left edge, LABEL_ROOM is the
        // strip the plane names hang in.
        const free = Math.max(r.width - 430, 320);
        const scale = clamp(Math.min((free - 150 - LABEL_ROOM) / w, (r.height - 150) / h), 0.12, 3);
        // Glides rather than jumps, the way frame() does — shift+f is a move you
        // asked for, and watching it travel is how you keep your bearings.
        this.glide({
            scale,
            ox: free / 2 + 24 + LABEL_ROOM / 2 - ((minX + maxX) / 2) * scale,
            oy: r.height / 2 + 18 - ((minY + maxY) / 2) * scale,
        });
    }
    // ---- drawing -----------------------------------------------------------
    render() {
        if (!this.vm)
            return;
        const project = makeProjection(this.cam);
        const flat = this.vm.mode === 'flat';
        this.pt.clear();
        for (const { p, sides, face, grid, rule, label, count } of this.planeEls) {
            const pts = p.corners.map((c) => project(c.x, p.elevation, c.z));
            const low = p.corners.map((c) => project(c.x, p.elevation - PLANE_THICK, c.z));
            for (let i = 0; i < 4; i++) {
                const j = (i + 1) % 4;
                sides[i].setAttribute('points', [pts[i], pts[j], low[j], low[i]].map((q) => `${r2(q.x)},${r2(q.y)}`).join(' '));
            }
            face.setAttribute('points', pts.map((q) => `${r2(q.x)},${r2(q.y)}`).join(' '));
            grid.setAttribute('d', gridPath(p, project));
            // Label rides off the near-left corner with a short leader.
            const left = pts.reduce((a, q) => (q.x < a.x ? q : a), pts[0]);
            const lx = left.x - 14;
            const ly = left.y - 6;
            rule.setAttribute('x1', String(r2(lx + 8)));
            rule.setAttribute('y1', String(r2(ly + 4)));
            rule.setAttribute('x2', String(r2(left.x)));
            rule.setAttribute('y2', String(r2(left.y)));
            label.setAttribute('x', String(r2(lx)));
            label.setAttribute('y', String(r2(ly)));
            count.setAttribute('x', String(r2(lx)));
            count.setAttribute('y', String(r2(ly + 13)));
        }
        for (const item of this.nodeEls) {
            const s = item.spot;
            const c = project(s.x, s.y, s.z);
            this.pt.set(item.id, c);
            if (item.isFile) {
                const pad = s.pad;
                const h = TILE / 2;
                const quad = item.box
                    ? [[pad.x0, pad.z0], [pad.x0 + pad.w, pad.z0],
                        [pad.x0 + pad.w, pad.z0 + pad.d], [pad.x0, pad.z0 + pad.d]]
                    : [[s.x - h, s.z - h], [s.x + h, s.z - h], [s.x + h, s.z + h], [s.x - h, s.z + h]];
                const corners = quad.map(([x, z]) => project(x, s.y, z));
                item.shape.setAttribute('points', corners.map((q) => `${r2(q.x)},${r2(q.y)}`).join(' '));
                // A label never grows past the box under it. The budget is the box's
                // own on-screen width, less a rim on each side.
                const wide = Math.max(...corners.map((q) => q.x)) - Math.min(...corners.map((q) => q.x));
                const budget = (item.box ? wide - 18 : Math.max(wide, pad ? pad.w * this.cam.scale : 0) - 6);
                const text = fitText(item.n.name, budget);
                item.label.textContent = text;
                item.label.style.display = text ? '' : 'none';
                item.label.setAttribute('x', String(r2(c.x)));
                item.label.setAttribute('y', String(r2(item.box ? c.y + 1 : c.y - LABEL_LIFT)));
                if (item.sub) {
                    const on = Boolean(text) && budget > 76;
                    item.sub.style.display = on ? '' : 'none';
                    item.sub.setAttribute('x', String(r2(c.x)));
                    item.sub.setAttribute('y', String(r2(c.y + 15)));
                }
            }
            else {
                item.shape.setAttribute('cx', String(r2(c.x)));
                item.shape.setAttribute('cy', String(r2(c.y)));
            }
            // Flat views look straight down the same way, so nearer is simply the
            // one further toward the front of the ground.
            item.depth = flat ? -s.z : c.depth;
        }
        for (const { e, path } of this.edgeEls) {
            const a = this.pt.get(e.from);
            const b = this.pt.get(e.to);
            if (!a || !b) {
                path.setAttribute('d', '');
                continue;
            }
            path.setAttribute('d', arc(a, b));
            path.style.display = this.hidden.has(e.kind) ? 'none' : '';
        }
        // painter's order: farthest first
        const sorted = this.nodeEls.slice().sort((x, y) => y.depth - x.depth);
        for (const item of sorted)
            this.gNodes.appendChild(item.shape);
        this.paintState();
    }
    paintState() {
        // THE SELECTION HOLDS THE VIEW — Brandon's ruling. Hover used to win over
        // a pick, so drifting the mouse threw away a selection that took clicks to
        // build. It only drives the lighting now when NOTHING is picked, which is
        // exactly how it behaved before there was anything to throw away. The
        // hover LABEL is untouched either way — see the bottom of this method.
        // HOVER PREVIEWS WHAT IT WOULD REACH — Brandon's ruling. The node under the
        // cursor stands BESIDE the picks for this one paint: it lights, its fan
        // draws, and its reach glows, all without being selected and without any of
        // that surviving the cursor moving on. Nothing is stored.
        const hoverExtra = this.hovered && !this.selectedIds.includes(this.hovered)
            ? this.hovered : null;
        const focus = hoverExtra ? [...this.selectedIds, hoverExtra] : this.selectedIds;
        const any = focus.length > 0;
        const focusSet = new Set(focus);
        // Picked is the selection and only the selection: a hover preview lights
        // and un-dims, but it never wears the picked outline. That is the one thing
        // separating what you are looking at from what you have actually got.
        const pickedSet = new Set(this.selectedIds);
        // One neighbourhood built from all of them. Every pick brings its own
        // neighbours in, so eight picks means eight fans standing at once and
        // nothing competing to be the one.
        const lit = new Set();
        for (const id of focus) {
            const preview = id === hoverExtra;
            for (const near of this.near.get(id) || []) {
                // A narrowing cuts the halo as well as the fan. It is the PICKS' answer
                // though — a preview is not one of the things they have in common, so
                // narrowing it would leave the cursor showing nothing at all.
                if (this.fanTo && !preview && !this.fanTo.has(near))
                    continue;
                lit.add(near);
            }
            lit.add(id);
        }
        // The reach preview, walked here off the Index this class already holds.
        // ONE HOP, always: a deep walk fired on every box the cursor crosses would
        // light most of a real scan and cost a full traversal per twitch of the
        // mouse. The picks' own reach still follows the deep switch — that is
        // walked in the page and arrives through reachSet, untouched by this.
        // Only when reach is being SHOWN at all: the switch that decides whether a
        // pick's reach is drawn decides this too.
        let reach = this.reachSet;
        if (reach && hoverExtra) {
            reach = new Set(reach);
            for (const id of reachFrom(this.index, hoverExtra).ids)
                reach.add(id);
        }
        for (const item of this.nodeEls) {
            const on = !any || lit.has(item.id);
            const reached = Boolean(reach) && reach.has(item.id);
            item.shape.classList.toggle('dim', !on);
            item.shape.classList.toggle('lit', focusSet.has(item.id));
            item.shape.classList.toggle('picked', pickedSet.has(item.id));
            item.shape.classList.toggle('reachlit', reached);
            for (const t of [item.label, item.sub]) {
                if (!t)
                    continue;
                t.classList.toggle('dim', !on);
                t.classList.toggle('lit', focusSet.has(item.id));
                t.classList.toggle('reachlit', reached);
            }
        }
        for (const { e, path } of this.edgeEls) {
            // THE FAN. A strand lights if it touches ANY pick, not if it touches the
            // one pick — this is what puts two fans on screen together.
            let on = !any || focusSet.has(e.from) || focusSet.has(e.to);
            // Under a narrowing, only the strands that LAND on something in it.
            // The far end is whichever end is not the pick; a strand between two
            // picks lands on neither, so it goes out with the rest.
            // Same exemption the halo gets: a strand belonging to the hover preview
            // is not narrowed by what the PICKS have in common.
            if (on && any && this.fanTo &&
                !(hoverExtra && (e.from === hoverExtra || e.to === hoverExtra))) {
                const far = focusSet.has(e.from) ? e.to : e.from;
                on = this.fanTo.has(far);
            }
            path.classList.toggle('dim', !on);
            path.classList.toggle('lit', any && on);
        }
        const hv = this.hovered ? this.vm.nodes.get(this.hovered) : null;
        const p = this.hovered ? this.pt.get(this.hovered) : null;
        if (hv && p) {
            const spot = this.vm.placed.get(this.hovered);
            this.hoverLabel.textContent = hv.name +
                (this.vm.drillable.has(this.hovered) ? '  ▸ open' : '') +
                (spot && spot.held && this.vm.mode === 'tilt' ? `  (${spot.held})` : '');
            this.hoverLabel.setAttribute('x', String(r2(p.x)));
            this.hoverLabel.setAttribute('y', String(r2(p.y - 14)));
            this.hoverLabel.style.display = '';
        }
        else {
            this.hoverLabel.style.display = 'none';
        }
    }
}
// ---- small helpers ---------------------------------------------------------
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function r2(v) { return Math.round(v * 100) / 100; }
// Cut a label to what actually fits, or drop it. Never draw text wider than
// the thing it names — that is the whole legibility rule.
function fitText(text, px) {
    const room = Math.floor(px / CHAR_W);
    if (room < MIN_CHARS)
        return '';
    if (text.length <= room)
        return text;
    return `${text.slice(0, Math.max(1, room - 1))}…`;
}
function arc(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(len * 0.16, 46);
    const cx = (a.x + b.x) / 2 - (dy / len) * bow;
    const cy = (a.y + b.y) / 2 + (dx / len) * bow;
    return `M${r2(a.x)},${r2(a.y)} Q${r2(cx)},${r2(cy)} ${r2(b.x)},${r2(b.y)}`;
}
function gridPath(plane, project) {
    const out = [];
    const step = 150;
    const cx = plane.cx || 0, cz = plane.cz || 0;
    const nx = Math.floor(plane.halfX / step);
    const nz = Math.floor(plane.halfZ / step);
    for (let i = -nx; i <= nx; i++) {
        const a = project(cx + i * step, plane.elevation, cz - plane.halfZ);
        const b = project(cx + i * step, plane.elevation, cz + plane.halfZ);
        out.push(`M${r2(a.x)},${r2(a.y)}L${r2(b.x)},${r2(b.y)}`);
    }
    for (let i = -nz; i <= nz; i++) {
        const c = project(cx - plane.halfX, plane.elevation, cz + i * step);
        const d = project(cx + plane.halfX, plane.elevation, cz + i * step);
        out.push(`M${r2(c.x)},${r2(c.y)}L${r2(d.x)},${r2(d.y)}`);
    }
    return out.join('');
}
