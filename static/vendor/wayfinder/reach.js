// WAYFINDER — REACH.
//
// One selected node, and everything wired to it. OUTWARD FROM ONE NODE — this
// is not "pick two files and show the path between them", so there is no
// shortest path here, no target, no A*. There is a start and there is how far
// out you asked to look.
//
// Three rules, all Brandon's:
//   EXACT EDGES ONLY. A guess is never walked, whatever the guesses switch is
//   set to. The guesses switch decides what the map DRAWS; it has no vote on
//   what reach WALKS.
//   BOTH DIRECTIONS. What this node points at, and what points at it. A one-way
//   walk hides who calls you, which is half the question.
//   DEPTH IS A SWITCH. false = one hop. true = all the way.
//
// A cycle stops at the node it revisits: a node is claimed once, by the first
// chain that gets there, and that chain is the one that gets printed. Since the
// front widens a whole level at a time, the chain a node keeps is also the
// shortest one to it.
// How many names a printed chain shows before it gives up and says "...".
// A deep walk on a real scan otherwise prints a wall.
export const CHAIN_CAP = 6;
/** Nothing selected → empty reach. No lighting, no chains, no message. */
export function emptyReach() {
    return { from: null, ids: new Set(), chains: [] };
}
export function reachFrom(index, from, deep = false) {
    if (!from)
        return emptyReach();
    const ids = new Set();
    const chains = [];
    // Claimed. The start claims itself, so a walk can never loop back onto it.
    const seen = new Set([from]);
    let front = [[from]];
    while (front.length) {
        const next = [];
        for (const chain of front) {
            for (const id of stepsFrom(index, chain[chain.length - 1])) {
                if (seen.has(id))
                    continue;
                seen.add(id);
                ids.add(id);
                const grown = [...chain, id];
                chains.push(grown);
                next.push(grown);
            }
        }
        if (!deep)
            break; // one hop: the first level is the whole answer
        front = next;
    }
    return { from, ids, chains };
}
// Every node one exact edge away, either direction. Duplicates are fine — the
// caller's `seen` set is the thing that decides.
function stepsFrom(index, id) {
    const out = [];
    for (const e of index.outOf(id))
        if (e.resolved === 'exact')
            out.push(e.to);
    for (const e of index.inOf(id))
        if (e.resolved === 'exact')
            out.push(e.from);
    return out;
}
/** `card.ts ~> index.ts ~> viewer.html`. Pass `label` to print names instead
 *  of raw ids. Capped at CHAIN_CAP names, then "...". */
export function chainText(chain, label) {
    const name = label || ((id) => id);
    const shown = chain.slice(0, CHAIN_CAP).map(name).join(' ~> ');
    return chain.length > CHAIN_CAP ? `${shown} ~> ...` : shown;
}
