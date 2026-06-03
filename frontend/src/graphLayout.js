// Pure layout math for the ownership graph, extracted from OwnershipGraph so the BFS
// depth assignment, row positioning, and edge validation are testable without React/JSX.

export const LAYOUT = { NODE_W: 200, X_GAP: 60, Y_GAP: 120 };

export function computeLayout(nodes, edges) {
  const { NODE_W, X_GAP, Y_GAP } = LAYOUT;
  const ids = new Set(nodes.map((n) => n.id));

  // Adjacency from the edges' `from` -> `to`.
  const childrenOf = new Map();
  for (const e of edges) {
    if (!childrenOf.has(e.from)) childrenOf.set(e.from, []);
    childrenOf.get(e.from).push(e.to);
  }

  // Depth = BFS distance from the root (node flagged isRoot, else the first node).
  const root = nodes.find((n) => n.isRoot) || nodes[0];
  const depth = new Map();
  if (root) {
    const queue = [[root.id, 0]];
    while (queue.length) {
      const [id, d] = queue.shift();
      if (depth.has(id)) continue;
      depth.set(id, d);
      for (const child of childrenOf.get(id) || []) {
        if (!depth.has(child)) queue.push([child, d + 1]);
      }
    }
  }

  // Anything unreachable from the root gets pushed to a trailing row.
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  const unreachable = nodes.filter((n) => !depth.has(n.id)).map((n) => n.id);
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1);

  // Group by depth, spread horizontally within each row.
  const rows = new Map();
  for (const n of nodes) {
    const d = depth.get(n.id);
    if (!rows.has(d)) rows.set(d, []);
    rows.get(d).push(n);
  }
  const positions = new Map();
  for (const [d, rowNodes] of rows) {
    const total = rowNodes.length;
    const rowWidth = total * NODE_W + (total - 1) * X_GAP;
    rowNodes.forEach((n, i) => {
      positions.set(n.id, { x: i * (NODE_W + X_GAP) - rowWidth / 2, y: d * Y_GAP });
    });
  }

  // Edges that reference a missing node would crash reactflow; drop them.
  const validEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  return { positions, depth, unreachable, validEdges };
}
