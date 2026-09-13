// WAYFINDER — Step 9: Loader / indexer.
// Read graph.json once, build the lookups every view recipe stands on.
// The frontend never re-reads the books. It only rearranges the cards.
export const EXPECTED_SCHEMA_VERSION = 1;
export class Index {
    graph;
    nodes;
    edges;
    byId;
    byKind;
    byFolder;
    out; // id -> edges leaving it
    in; // id -> edges arriving at it
    children; // file id -> child ids
    parent; // child id -> file id
    comments; // owner id -> comments, source order
    constructor(graph) {
        this.graph = graph;
        this.nodes = graph.nodes;
        this.edges = graph.edges;
        this.byId = new Map();
        this.byKind = new Map();
        this.byFolder = new Map();
        this.out = new Map();
        this.in = new Map();
        this.children = new Map();
        this.parent = new Map();
        this.comments = new Map();
        for (const n of this.nodes) {
            this.byId.set(n.id, n);
            push(this.byKind, n.kind, n);
            const cut = n.id.indexOf('::');
            const path = cut === -1 ? n.id : n.id.slice(0, cut);
            const name = cut === -1 ? n.id : n.id.slice(cut + 2);
            const slash = path.lastIndexOf('/');
            n.path = path;
            n.name = cut === -1 ? path.slice(slash + 1) : name;
            n.folder = slash === -1 ? '.' : path.slice(0, slash);
            if (cut === -1)
                push(this.byFolder, n.folder, n);
            this.out.set(n.id, []);
            this.in.set(n.id, []);
        }
        for (const c of graph.comments || [])
            push(this.comments, c.owner, c);
        for (const e of this.edges) {
            this.out.get(e.from)?.push(e);
            this.in.get(e.to)?.push(e);
            if (e.kind === 'contains') {
                push(this.children, e.from, e.to);
                this.parent.set(e.to, e.from);
            }
        }
    }
    // Empty for a pre-sweep graph.
    commentsOn(id) { return this.comments.get(id) || []; }
    files() { return this.byKind.get('file') || []; }
    assets() { return this.byKind.get('asset') || []; }
    roots() { return [...this.files(), ...this.assets()]; }
    childrenOf(id) { return this.children.get(id) || []; }
    outOf(id) { return this.out.get(id) || []; }
    inOf(id) { return this.in.get(id) || []; }
    // Every node the given one is wired to, in either direction.
    neighbours(id) {
        const s = new Set();
        for (const e of this.outOf(id))
            s.add(e.to);
        for (const e of this.inOf(id))
            s.add(e.from);
        return s;
    }
    // A numbered copy of a name already used in the same file: `wire[2]` next to
    // an existing `wire`. The unnamed-thing numbering (`fn[2]`, `div[3]`) never
    // has a plain-named twin, so it is not caught here. See docs/SCHEMA.md.
    isCopy(id) {
        const cut = id.indexOf('::');
        if (cut === -1)
            return false;
        const m = /^(.+)\[(\d+)\]$/.exec(id.slice(cut + 2));
        if (!m || Number(m[2]) < 2)
            return false;
        return this.byId.has(`${id.slice(0, cut)}::${m[1]}`);
    }
    // Every top-level folder holding at least one of the given roots.
    foldersOf(roots) {
        const out = new Map();
        for (const f of roots) {
            const key = Index.planeOf(f.path);
            if (!out.has(key))
                out.set(key, []);
            out.get(key).push(f);
        }
        return out;
    }
    // Top-level folder for a path — the grouping the plane view stacks on.
    static planeOf(path) {
        const i = path.indexOf('/');
        return i === -1 ? '.' : path.slice(0, i);
    }
}
function push(map, key, val) {
    if (!map.has(key))
        map.set(key, []);
    map.get(key).push(val);
}
export async function loadGraph(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok)
        throw new Error(`${url} → HTTP ${res.status}`);
    const graph = (await res.json());
    if (graph.schema_version !== EXPECTED_SCHEMA_VERSION) {
        throw new Error(`schema_version mismatch — this viewer reads ${EXPECTED_SCHEMA_VERSION}, ` +
            `graph.json says ${graph.schema_version}. Refusing to draw it.`);
    }
    return graph;
}
