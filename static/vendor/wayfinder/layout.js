// WAYFINDER — Step 10, part one: the layout recipe.
//
// Layout is never stored in graph.json. It is computed here, fresh, every time
// the view opens. Three verbs only: group, filter, walk.
//
// The recipe is "shelves". Files are grouped by their top-level folder; each
// group becomes a plane, and the planes stack. On a plane, every file gets a
// PAD sized to hold everything inside it — the file node IS that pad, and its
// parts stand on it in a grid. A file with two functions gets a small tray; a
// file with eight hundred elements gets a wide field. Nothing is stacked on
// top of anything else, so nothing can hide anything else.
//
// Part order inside a pad is deterministic and meaningful: the parts that are
// wired to the rest of the map (anything but containment) come first, in the
// front rows nearest the file's label; the inert remainder fills in behind.
import { Index } from './index.js';
// --- world constants. Only their RATIOS matter; fit() scales the whole thing.
export const PART_STEP = 34; // centre-to-centre spacing of parts in a pad
export const PAD_INSET = 22; // pad rim to the outermost part
export const PAD_GAP = 40; // clear space between two pads on a plane
export const PLANE_MARGIN = 76; // outermost pad to the plane rim
export const PLANE_THICK = 15; // slab depth, so a plane reads as a solid
const GRID_ASPECT = 1.9; // pads run wider than deep — the tilt eats depth
const MIN_PAD_W = 132;
const MIN_PAD_D = 88;
const ROW_SPREAD = 2.0; // >1 packs planes wide and shallow
const PLANE_CLEAR = 0.66; // stack spacing as a fraction of full clearance
const PLANE_GAP_MIN = 300;
// The stack has to be sized against SOME viewing angle; these are the ones the
// view opens at. Tilting afterwards re-projects, it never re-packs.
export const HOME_YAW = -0.42;
export const HOME_PITCH = 0.92;
// Part radius in world units, by how wired the part is. Diameter always stays
// under PART_STEP, so two parts can never touch at any zoom.
const R_BASE = 6.2;
const R_STEP = 1.05;
const R_CAP = 8;
export function planeLayout(index, filters) {
    const vis = filters.nodes(index);
    const edges = filters.edges(index, vis);
    // group ------------------------------------------------------------------
    const groups = index.foldersOf(index.roots().filter((f) => vis.has(f.id)));
    const names = [...groups.keys()].sort();
    const ordered = [...names.filter((n) => n === '.'), ...names.filter((n) => n !== '.')];
    // filter: how wired is each node, ignoring containment. Containment is
    // already said by where the part stands, so it does not count as reach.
    const reach = new Map();
    for (const e of edges) {
        if (e.kind === 'contains')
            continue;
        reach.set(e.from, (reach.get(e.from) || 0) + 1);
        reach.set(e.to, (reach.get(e.to) || 0) + 1);
    }
    const placed = new Map();
    const pads = [];
    const drafts = [];
    for (const name of ordered) {
        const files = groups.get(name).slice().sort(byId);
        const built = files.map((f) => buildPad(index, f, reach, vis));
        // shelf packing: deepest tray first, so rows come out even.
        const order = built.slice().sort((a, b) => b.d - a.d || byId(a.file, b.file));
        const area = order.reduce((s, p) => s + p.w * p.d, 0);
        const rowTarget = Math.max(order.reduce((m, p) => Math.max(m, p.w), 0), Math.sqrt(area) * ROW_SPREAD);
        let x = 0, z = 0, rowD = 0, wide = 0;
        for (const p of order) {
            if (x > 0 && x + p.w > rowTarget) {
                z += rowD + PAD_GAP;
                x = 0;
                rowD = 0;
            }
            p.x0 = x;
            p.z0 = z;
            x += p.w + PAD_GAP;
            rowD = Math.max(rowD, p.d);
            wide = Math.max(wide, x - PAD_GAP);
        }
        const deep = z + rowD;
        const offX = -wide / 2, offZ = -deep / 2;
        for (const p of order) {
            p.x0 += offX;
            p.z0 += offZ;
        }
        drafts.push({
            name,
            pads: order,
            halfX: wide / 2 + PLANE_MARGIN,
            halfZ: deep / 2 + PLANE_MARGIN,
        });
    }
    // stack ------------------------------------------------------------------
    // A plane's on-screen depth is how much room it eats vertically once tilted.
    // Each gap is sized against the two planes it separates, so a fat shelf gets
    // more air than a thin one and no shelf ever sits inside its neighbour.
    const sa = Math.abs(Math.sin(HOME_YAW)), ca = Math.abs(Math.cos(HOME_YAW));
    const drop = Math.tan(HOME_PITCH);
    const shadow = drafts.map((d) => sa * d.halfX + ca * d.halfZ);
    const elev = new Array(drafts.length).fill(0);
    for (let i = drafts.length - 2; i >= 0; i--) {
        const need = (shadow[i] + shadow[i + 1]) * drop * PLANE_CLEAR;
        elev[i] = elev[i + 1] + Math.max(PLANE_GAP_MIN, need);
    }
    // walk -------------------------------------------------------------------
    const planes = drafts.map((d, i) => {
        const y = elev[i];
        let nodeCount = 0;
        for (const p of d.pads) {
            const cx = p.x0 + p.w / 2;
            const cz = p.z0 + p.d / 2;
            const rimZ = p.z0 + p.d; // the pad's near edge — where containment lands
            const rec = {
                x: cx, y, z: cz, plane: i, isFile: true,
                pad: { x0: p.x0, z0: p.z0, w: p.w, d: p.d, cx, cz, rimZ, y },
                r: 0,
                reach: reach.get(p.file.id) || 0,
            };
            placed.set(p.file.id, rec);
            pads.push({ id: p.file.id, file: p.file, ...rec.pad, plane: i });
            nodeCount += 1 + p.kids.length;
            const contentW = (p.cols - 1) * PART_STEP;
            const contentD = (p.rows - 1) * PART_STEP;
            const startX = p.x0 + (p.w - contentW) / 2;
            const frontZ = p.z0 + (p.d + contentD) / 2;
            p.kids.forEach((kid, k) => {
                const col = k % p.cols;
                const row = Math.floor(k / p.cols);
                const deg = reach.get(kid) || 0;
                placed.set(kid, {
                    x: startX + col * PART_STEP,
                    y,
                    z: frontZ - row * PART_STEP,
                    plane: i,
                    isFile: false,
                    owner: p.file.id,
                    rimZ,
                    r: R_BASE + Math.min(deg, R_CAP) * R_STEP,
                    reach: deg,
                });
            });
        }
        const ex = d.halfX, ez = d.halfZ;
        return {
            name: d.name,
            index: i,
            elevation: y,
            count: d.pads.length,
            nodes: nodeCount,
            cx: 0,
            cz: 0,
            halfX: ex,
            halfZ: ez,
            corners: [
                { x: -ex, z: -ez },
                { x: ex, z: -ez },
                { x: ex, z: ez },
                { x: -ex, z: ez },
            ],
        };
    });
    // One view model, the shape every recipe hands the renderer.
    return {
        mode: 'tilt',
        planes,
        placed,
        pads,
        nodes: new Map(index.byId),
        edges,
        camera: { yaw: HOME_YAW, pitch: HOME_PITCH },
        crumbs: [],
        drillable: new Set(),
        note: `${placed.size} of ${index.nodes.length} nodes`,
    };
}
function buildPad(index, file, reach, vis) {
    const kinds = { 'css-rule': 0, class: 1, function: 2, element: 3 };
    const kids = index.childrenOf(file.id).filter((id) => vis.has(id)).sort((a, b) => {
        const ra = reach.get(a) || 0, rb = reach.get(b) || 0;
        if (ra !== rb)
            return rb - ra; // wired parts to the front
        const ka = kinds[index.byId.get(a)?.kind] ?? 9;
        const kb = kinds[index.byId.get(b)?.kind] ?? 9;
        if (ka !== kb)
            return ka - kb; // then grouped by kind
        return a < b ? -1 : a > b ? 1 : 0; // then plain id order
    });
    const cols = kids.length ? Math.max(1, Math.round(Math.sqrt(kids.length * GRID_ASPECT))) : 0;
    const rows = cols ? Math.ceil(kids.length / cols) : 0;
    const w = Math.max(MIN_PAD_W, (Math.max(cols, 1) - 1) * PART_STEP + PAD_INSET * 2);
    const d = Math.max(MIN_PAD_D, (Math.max(rows, 1) - 1) * PART_STEP + PAD_INSET * 2);
    return { file, kids, cols, rows, w, d, x0: 0, z0: 0 };
}
function byId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
// Where an edge should meet a file: the rim of its pad, on the line toward the
// other end. Edges land on the tray, never on a point buried under its parts.
export function padExit(pad, tx, tz) {
    const dx = tx - pad.cx, dz = tz - pad.cz;
    if (!dx && !dz)
        return { x: pad.cx, z: pad.cz };
    const hx = pad.w / 2, hz = pad.d / 2;
    const t = Math.min(dx ? hx / Math.abs(dx) : Infinity, dz ? hz / Math.abs(dz) : Infinity);
    if (t >= 1)
        return { x: tx, z: tz };
    return { x: pad.cx + dx * t, z: pad.cz + dz * t };
}
// ---- projection ----------------------------------------------------------
// World is X right, Y up, Z into the page. Orthographic, yaw then pitch.
// pitch → 0 is a flat elevation view; pitch → π/2 is straight down.
// Depth grows away from the eye, so a higher shelf is nearer, not farther.
export function makeProjection({ yaw, pitch, scale, ox, oy }) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const cb = Math.cos(pitch), sb = Math.sin(pitch);
    return (x, y, z) => {
        const x1 = x * ca - z * sa;
        const z1 = x * sa + z * ca;
        return {
            x: ox + x1 * scale,
            y: oy + (z1 * sb - y * cb) * scale,
            // Distance from the eye, so SMALLER is nearer and draws last. The eye
            // stands at (cos·sin yaw, sin pitch, cos·cos yaw) looking back at the
            // origin; depth is how far along that line a point sits, negated.
            // A higher shelf is nearer, and so is one closer to the front.
            depth: -(z1 * cb + y * sb),
        };
    };
}
// Which way the eye is looking from, in world terms. A face of anything is
// turned toward you when its outward normal agrees with this.
export function eyeVector(yaw, pitch) {
    const cb = Math.cos(pitch), sb = Math.sin(pitch);
    return [cb * Math.sin(yaw), sb, cb * Math.cos(yaw)];
}
// ===========================================================================
// The other two recipes. Same three verbs — group, filter, walk — and the same
// view model out. Both are FLAT: seen from straight above, no tilt. The tilt
// is what made the folder view unreadable once a real project went into it.
const CLUSTER_PAD = 46; // cluster rim to the outermost box inside it
const CLUSTER_GAP = 168; // clear space between two clusters — wide enough
// that a cluster's name never lands on its neighbour
const BOX_MIN_W = 152;
const BOX_MIN_D = 86;
const FLAT_CAMERA = { yaw: 0, pitch: Math.PI / 2 };
// Shelf packing, shared. Deepest box first so rows come out even; rows no
// wider than a target; result centred by the caller. Nothing overlaps.
function shelfPack(boxes, gap, spread = 2.0) {
    const order = boxes.slice().sort((a, b) => b.d - a.d || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const area = order.reduce((s, b) => s + b.w * b.d, 0);
    const rowTarget = Math.max(order.reduce((m, b) => Math.max(m, b.w), 0), Math.sqrt(area) * spread);
    let x = 0, z = 0, rowD = 0, wide = 0;
    for (const b of order) {
        if (x > 0 && x + b.w > rowTarget) {
            z += rowD + gap;
            x = 0;
            rowD = 0;
        }
        b.x0 = x;
        b.z0 = z;
        x += b.w + gap;
        rowD = Math.max(rowD, b.d);
        wide = Math.max(wide, x - gap);
    }
    return { boxes: order, w: wide, d: z + rowD };
}
// A box grows with what it holds, so weight stays visible even when the parts
// themselves are not drawn. Square-root growth: ten times the parts is about
// three times the box, not ten.
function boxFor(key, node, held) {
    const g = Math.sqrt(Math.max(held, 0));
    return {
        key, node, held,
        w: Math.round(BOX_MIN_W + Math.min(196, g * 23)),
        d: Math.round(BOX_MIN_D + Math.min(126, g * 14)),
        x0: 0, z0: 0,
    };
}
// Every edge redrawn between the units actually on screen. An edge whose two
// ends land on the same unit says nothing here and is dropped; the rest are
// merged and counted. An exact stamp outranks a guess for the same pair.
function rollUp(edges, unitOf) {
    const out = new Map();
    for (const e of edges) {
        const a = unitOf(e.from), b = unitOf(e.to);
        if (!a || !b || a === b)
            continue;
        const key = `${a} ${b} ${e.kind}`;
        const prev = out.get(key);
        if (!prev) {
            out.set(key, { from: a, to: b, kind: e.kind, resolved: e.resolved, count: 1 });
        }
        else {
            prev.count++;
            if (e.resolved === 'exact')
                prev.resolved = 'exact';
        }
    }
    return [...out.values()];
}
// Lay a set of boxes down as one flat cluster centred on the origin, and hand
// back the plane it stands on plus the placement of every box.
function groundCluster(boxes, label) {
    const packed = shelfPack(boxes, PAD_GAP, 1.7);
    const offX = -packed.w / 2, offZ = -packed.d / 2;
    const placed = new Map();
    const pads = [];
    for (const b of packed.boxes) {
        const x0 = b.x0 + offX, z0 = b.z0 + offZ;
        const cx = x0 + b.w / 2, cz = z0 + b.d / 2;
        placed.set(b.key, {
            x: cx, y: 0, z: cz, plane: 0, isFile: true, held: b.held,
            pad: { x0, z0, w: b.w, d: b.d, cx, cz, rimZ: z0 + b.d, y: 0 },
            r: 0, reach: b.held,
        });
        pads.push({ id: b.key, file: b.node, x0, z0, w: b.w, d: b.d, cx, cz, plane: 0 });
    }
    const ex = packed.w / 2 + CLUSTER_PAD, ez = packed.d / 2 + CLUSTER_PAD;
    const plane = {
        name: label, index: 0, elevation: 0, count: boxes.length, nodes: boxes.length,
        cx: 0, cz: 0, halfX: Math.max(ex, 120), halfZ: Math.max(ez, 80),
        corners: [
            { x: -ex, z: -ez }, { x: ex, z: -ez }, { x: ex, z: ez }, { x: -ex, z: ez },
        ],
    };
    return { placed, pads, plane };
}
// --- recipe two: one box per file -----------------------------------------
// Functions, rules and elements stay inside their file instead of getting a
// box of their own. A thousand-node scan comes down to one box per file, and
// every line on screen is a file reaching for another file.
export function fileLayout(index, filters) {
    const vis = filters.nodes(index);
    const kept = filters.edges(index, vis);
    const roots = index.roots().filter((f) => vis.has(f.id));
    const onScreen = new Set(roots.map((f) => f.id));
    const edges = rollUp(kept, (id) => {
        const n = index.byId.get(id);
        return n && onScreen.has(n.path) ? n.path : null;
    });
    const groups = index.foldersOf(roots);
    const names = [...groups.keys()].sort();
    const ordered = [...names.filter((n) => n === '.'), ...names.filter((n) => n !== '.')];
    // one cluster per top-level folder, then the clusters packed against each
    // other on a single ground plane
    const clusters = ordered.map((name) => {
        const boxes = groups.get(name).map((f) => boxFor(f.id, f, index.childrenOf(f.id).filter((id) => vis.has(id)).length));
        const packed = shelfPack(boxes, PAD_GAP, 1.5);
        return {
            key: name, boxes: packed.boxes, count: boxes.length,
            w: packed.w + CLUSTER_PAD * 2, d: packed.d + CLUSTER_PAD * 2,
            x0: 0, z0: 0,
        };
    });
    const field = shelfPack(clusters, CLUSTER_GAP, 1.7);
    const offX = -field.w / 2, offZ = -field.d / 2;
    const placed = new Map();
    const pads = [];
    const planes = [];
    field.boxes.forEach((cl, i) => {
        const innerX = cl.x0 + offX + CLUSTER_PAD;
        const innerZ = cl.z0 + offZ + CLUSTER_PAD;
        for (const b of cl.boxes) {
            const x0 = innerX + b.x0, z0 = innerZ + b.z0;
            const cx = x0 + b.w / 2, cz = z0 + b.d / 2;
            placed.set(b.key, {
                x: cx, y: 0, z: cz, plane: i, isFile: true, held: b.held,
                pad: { x0, z0, w: b.w, d: b.d, cx, cz, rimZ: z0 + b.d, y: 0 },
                r: 0, reach: b.held,
            });
            pads.push({ id: b.key, file: b.node, x0, z0, w: b.w, d: b.d, cx, cz, plane: i });
        }
        const ex = cl.w / 2, ez = cl.d / 2;
        const ccx = cl.x0 + offX + ex, ccz = cl.z0 + offZ + ez;
        planes.push({
            name: cl.key, index: i, elevation: 0, count: cl.count, nodes: cl.count,
            cx: ccx, cz: ccz, halfX: ex, halfZ: ez,
            corners: [
                { x: ccx - ex, z: ccz - ez }, { x: ccx + ex, z: ccz - ez },
                { x: ccx + ex, z: ccz + ez }, { x: ccx - ex, z: ccz + ez },
            ],
        });
    });
    return {
        mode: 'flat',
        planes, placed, pads,
        nodes: new Map(index.byId),
        edges,
        camera: FLAT_CAMERA,
        crumbs: [],
        drillable: new Set(),
        drillTo: new Map(),
        note: `${placed.size} file${placed.size === 1 ? '' : 's'}, ${edges.length} link${edges.length === 1 ? '' : 's'} between them`,
    };
}
// --- recipe three: zoom levels ---------------------------------------------
// One depth on screen at a time. Folder boxes are not graph nodes; they are
// made here, marked synthetic, and never written anywhere. Edges are rolled
// up to whatever the current depth draws, so a line between two folders means
// "something in here reaches something in there" and carries the count.
//
// How a level is cut, and how big it is allowed to be, are two switches now,
// because they are two different answers to the same complaint.
//
//   nestFolders OFF (what shipped) — the path is cut at the first slash.
//     trail []                 -> the top-level folders
//     trail [folder]           -> EVERY file under that folder, however deep
//     trail [folder, file id]  -> the parts inside that file
//
//   nestFolders ON — one rung per path segment, all the way down.
//     trail []                 -> subfolders and files at the root
//     trail [a]                -> subfolders and files inside a/
//     trail [a, b]             -> subfolders and files inside a/b/
//     trail [a, b, thing.js]   -> the parts inside a/b/thing.js
//     A trail whose segments join into a known file id IS the file level, so
//     the two cases never need telling apart by length.
//
//   capLevels OFF — a level draws everything it holds, however many.
//   capLevels ON  — LEVEL_CAP boxes per page, the rest on the next page, and
//     the note says what is being held back. No silent truncation.
const LEVEL_CAP = 60;
// The box that stands for a folder. Synthetic — it exists for this draw only.
function folderNode(id, name, path, shape, files, parts) {
    return {
        id, kind: 'folder', synthetic: true, lang: null, name, path,
        summary: {
            shape,
            facts: [
                `${files} file${files === 1 ? '' : 's'}`,
                `${parts} part${parts === 1 ? '' : 's'} inside`,
            ],
            weight: { files, parts },
        },
    };
}
function partsLevel(index, vis, file) {
    const kids = index.childrenOf(file.id).filter((id) => vis.has(id));
    const here = new Set(kids);
    return {
        boxes: kids.map((id) => boxFor(id, index.byId.get(id), 0)),
        label: file.name,
        note: `${kids.length} part${kids.length === 1 ? '' : 's'} inside ${file.name}`,
        unitOf: (id) => (here.has(id) ? id : null),
    };
}
// Three rungs, path cut at the first slash. This is the shipped behaviour and
// it is left alone so the switch has something honest to compare against.
function flatLevel(index, nodes, roots, vis, trail, crumbs, drillTo) {
    const groups = index.foldersOf(roots);
    const folderName = trail[0];
    const haveFolder = trail.length >= 1 && groups.has(folderName);
    const fileId = trail[1];
    const haveFile = trail.length >= 2 && index.byId.has(fileId) && vis.has(fileId);
    if (!haveFolder) {
        const names = [...groups.keys()].sort();
        const ordered = [...names.filter((n) => n === '.'), ...names.filter((n) => n !== '.')];
        const boxes = ordered.map((name) => {
            const files = groups.get(name);
            let parts = 0;
            for (const f of files)
                parts += index.childrenOf(f.id).filter((id) => vis.has(id)).length;
            const node = folderNode(`dir:${name}`, name === '.' ? 'root' : `${name}/`, name === '.' ? '.' : `${name}/`, name === '.' ? 'root of the scan' : `${name}/`, files.length, parts);
            nodes.set(node.id, node);
            drillTo.set(node.id, [name]);
            return boxFor(node.id, node, files.length + parts);
        });
        return {
            boxes,
            label: 'everything',
            note: `${boxes.length} folder${boxes.length === 1 ? '' : 's'} — click one to open it`,
            unitOf: (id) => {
                const n = index.byId.get(id);
                if (!n)
                    return null;
                const key = Index.planeOf(n.path);
                return groups.has(key) ? `dir:${key}` : null;
            },
        };
    }
    if (!haveFile) {
        const label = folderName === '.' ? 'root' : `${folderName}/`;
        crumbs.push({ label, trail: [folderName] });
        const mine = groups.get(folderName).slice().sort(byId);
        const here = new Set(mine.map((f) => f.id));
        const boxes = mine.map((f) => {
            const held = index.childrenOf(f.id).filter((id) => vis.has(id)).length;
            if (held)
                drillTo.set(f.id, [folderName, f.id]);
            return boxFor(f.id, f, held);
        });
        return {
            boxes, label,
            note: `${boxes.length} file${boxes.length === 1 ? '' : 's'} in ${label}`,
            unitOf: (id) => {
                const n = index.byId.get(id);
                return n && here.has(n.path) ? n.path : null;
            },
        };
    }
    const file = index.byId.get(fileId);
    crumbs.push({ label: folderName === '.' ? 'root' : `${folderName}/`, trail: [folderName] });
    crumbs.push({ label: file.name, trail: [folderName, fileId] });
    return partsLevel(index, vis, file);
}
// One rung per path segment. A level shows the subfolders it holds and the
// files sitting directly in it — never the whole subtree flattened.
function nestedLevel(index, nodes, roots, vis, trail, crumbs, drillTo) {
    const joined = trail.join('/');
    const asFile = joined ? index.byId.get(joined) : null;
    const inFile = !!(asFile && vis.has(joined) && asFile.kind !== 'folder');
    const at = trail.length ? `${joined}/` : '';
    const under = inFile ? [] : roots.filter((f) => !at || f.path.startsWith(at));
    // A trail carried over from the flat view, or a stale one, points at
    // nothing here. Fall back to the top rather than draw an empty level.
    if (trail.length && !inFile && !under.length) {
        return nestedLevel(index, nodes, roots, vis, [], crumbs, drillTo);
    }
    for (let i = 0; i < trail.length; i++) {
        const last = i === trail.length - 1;
        crumbs.push({
            label: last && inFile ? asFile.name : `${trail[i]}/`,
            trail: trail.slice(0, i + 1),
        });
    }
    if (inFile)
        return partsLevel(index, vis, asFile);
    const here = []; // files sitting directly at this depth
    const subs = new Map(); // next segment -> every file beneath it
    for (const f of under) {
        const rest = f.path.slice(at.length);
        const cut = rest.indexOf('/');
        if (cut === -1) {
            here.push(f);
            continue;
        }
        const seg = rest.slice(0, cut);
        if (!subs.has(seg))
            subs.set(seg, []);
        subs.get(seg).push(f);
    }
    const owner = new Map(); // a file's path -> the box standing for it here
    const boxes = [];
    for (const seg of [...subs.keys()].sort()) {
        const files = subs.get(seg);
        let parts = 0;
        for (const f of files)
            parts += index.childrenOf(f.id).filter((id) => vis.has(id)).length;
        const path = `${at}${seg}/`;
        const node = folderNode(`dir:${at}${seg}`, `${seg}/`, path, path, files.length, parts);
        nodes.set(node.id, node);
        drillTo.set(node.id, [...trail, seg]);
        for (const f of files)
            owner.set(f.path, node.id);
        boxes.push(boxFor(node.id, node, files.length + parts));
    }
    for (const f of here.sort(byId)) {
        const held = index.childrenOf(f.id).filter((id) => vis.has(id)).length;
        if (held)
            drillTo.set(f.id, [...trail, f.path.slice(at.length)]);
        owner.set(f.path, f.id);
        boxes.push(boxFor(f.id, f, held));
    }
    const label = trail.length ? `${trail[trail.length - 1]}/` : 'everything';
    const bits = [];
    if (subs.size)
        bits.push(`${subs.size} folder${subs.size === 1 ? '' : 's'}`);
    if (here.length)
        bits.push(`${here.length} file${here.length === 1 ? '' : 's'}`);
    return {
        boxes, label,
        note: `${bits.join(' and ') || 'nothing'} in ${label}`,
        unitOf: (id) => {
            const n = index.byId.get(id);
            return n ? owner.get(n.path) || null : null;
        },
    };
}
export function zoomLayout(index, filters, trail = [], page = 0) {
    const vis = filters.nodes(index);
    const kept = filters.edges(index, vis);
    const roots = index.roots().filter((f) => vis.has(f.id));
    const nodes = new Map(index.byId);
    const crumbs = [{ label: 'everything', trail: [] }];
    const drillTo = new Map();
    const level = filters.nestFolders
        ? nestedLevel(index, nodes, roots, vis, trail, crumbs, drillTo)
        : flatLevel(index, nodes, roots, vis, trail, crumbs, drillTo);
    // The cap is the only thing that ever takes a box off a level, and it says
    // so out loud in the note. Everything held back is one click away.
    const total = level.boxes.length;
    let boxes = level.boxes;
    let note = level.note;
    let pages = 1, at = 0;
    if (filters.capLevels && total > LEVEL_CAP) {
        pages = Math.ceil(total / LEVEL_CAP);
        at = Math.min(Math.max(page | 0, 0), pages - 1);
        const from = at * LEVEL_CAP;
        boxes = boxes.slice(from, from + LEVEL_CAP);
        note = `${note} — showing ${from + 1}–${from + boxes.length} of ${total}`;
    }
    // A line may only land on a box that is actually on this page.
    const drawn = new Set(boxes.map((b) => b.key));
    const unitOf = (id) => {
        const u = level.unitOf(id);
        return u && drawn.has(u) ? u : null;
    };
    const ground = groundCluster(boxes, level.label);
    return {
        mode: 'flat',
        planes: [ground.plane],
        placed: ground.placed,
        pads: ground.pads,
        nodes,
        edges: rollUp(kept, unitOf),
        camera: FLAT_CAMERA,
        crumbs,
        drillable: new Set(drillTo.keys()),
        drillTo,
        page: { at, pages, total, shown: boxes.length },
        note,
    };
}
