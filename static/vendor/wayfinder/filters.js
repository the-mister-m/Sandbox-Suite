// WAYFINDER — the toggles.
//
// Four switches: code files, non-code files, guesses, duplicate names.
// Nothing here touches graph.json. A toggle only decides what the layout
// recipes are allowed to see, so flipping one re-draws and never re-scans.
//
// Guesses have three positions, not two:
//   on   — a guess is drawn exactly like a certainty
//   flag — drawn, but visibly unsure (the dashed arc)
//   off  — not drawn at all
//
// Two more switches belong to the zoom view only, and answer the same
// complaint two different ways: a level with too much on it.
//   nestFolders — structural. Drill folder -> subfolder -> ... -> file,
//                 instead of cutting the path at the first slash and
//                 dumping everything underneath onto one level.
//   capLevels   — mechanical. No level draws more than a screenful; the
//                 rest go on the next page, and the note says how many.
// They are independent on purpose. Off/off is the behaviour that shipped.
//
// Six more belong to the second switch row — search and reach. They are held
// here for the same reason the first four are: one object every view reads,
// so nothing keeps a private copy of a switch and drifts from it.
//   searchName / searchFacts / searchComments — which text the one search box
//     matches against. Any combination, including none of them.
//   reachMap / reachCard — where a selected node's reach is shown.
//   reachDeep — how far it walks. false = one hop, true = all the way.
//   reachCommon — with more than one pick, show ONLY what every pick reached.
//     One pick has nothing to have in common with, so the switch stands down
//     and the walk is shown whole rather than lighting nothing.
// Nothing in this file reads them; they are state, and the row that owns the
// switches writes them. Search reads the first three, reach reads the last
// three, and neither of those writes any of them.
export const GUESS = { ON: 'on', FLAG: 'flag', OFF: 'off' };
export class Filters {
    codeFiles;
    otherFiles;
    duplicates;
    guesses;
    nestFolders;
    capLevels;
    // ---- the second row ----------------------------------------------------
    searchName;
    searchFacts;
    searchComments;
    reachMap;
    reachCard;
    reachDeep;
    reachCommon;
    // ---- the comment row ---------------------------------------------------
    // Flat, so `data-field` is the field name.
    commentHeader;
    commentLeading;
    commentTrailing;
    commentInterior;
    commentOrphan;
    commentProse;
    commentDead;
    commentTodo;
    commentDirective;
    constructor() {
        this.codeFiles = true;
        this.otherFiles = true;
        this.duplicates = true;
        this.guesses = GUESS.FLAG;
        this.nestFolders = false;
        this.capLevels = false;
        this.searchName = true;
        this.searchFacts = false;
        this.searchComments = false;
        this.reachMap = false;
        this.reachCard = false;
        this.reachDeep = false;
        this.reachCommon = false;
        this.commentHeader = false;
        this.commentLeading = true;
        this.commentTrailing = true;
        this.commentInterior = true;
        this.commentOrphan = false;
        this.commentProse = true;
        this.commentDead = true;
        this.commentTodo = false;
        this.commentDirective = false;
    }
    // Survivors. `total` is the count before filtering.
    comments(all) {
        const where = {
            header: this.commentHeader,
            leading: this.commentLeading,
            trailing: this.commentTrailing,
            interior: this.commentInterior,
            orphan: this.commentOrphan,
        };
        const what = {
            prose: this.commentProse,
            dead: this.commentDead,
            todo: this.commentTodo,
            directive: this.commentDirective,
        };
        return { shown: all.filter((c) => where[c.where] && what[c.what]), total: all.length };
    }
    // Every node id the views are allowed to place. A part stands or falls with
    // the file that holds it — hiding a file hides what is inside it.
    nodes(index) {
        const ok = new Set();
        for (const n of index.nodes) {
            const root = index.byId.get(n.path) || n;
            if (root.kind === 'asset' ? !this.otherFiles : !this.codeFiles)
                continue;
            if (!this.duplicates && index.isCopy(n.id))
                continue;
            ok.add(n.id);
        }
        return ok;
    }
    // An edge survives only if both its ends survived.
    edges(index, ok) {
        const dropGuess = this.guesses === GUESS.OFF;
        return index.edges.filter((e) => ok.has(e.from) && ok.has(e.to) && !(dropGuess && e.resolved === 'guess'));
    }
    // What the arc should LOOK like. Only 'flag' draws the difference.
    stampOf(e) {
        return this.guesses === GUESS.FLAG ? e.resolved : 'exact';
    }
    // For the header: what each switch is currently costing you.
    counts(index) {
        let assets = 0, code = 0, copies = 0, guesses = 0;
        for (const n of index.nodes) {
            if (n.kind === 'asset')
                assets++;
            else if (n.kind === 'file')
                code++;
            if (index.isCopy(n.id))
                copies++;
        }
        for (const e of index.edges)
            if (e.resolved === 'guess')
                guesses++;
        return { assets, code, copies, guesses };
    }
}
