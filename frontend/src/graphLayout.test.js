import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLayout, LAYOUT } from "./graphLayout.js";

// root --(IS_CONSOLIDATED_BY)--> parent ; child --> root ; root --> person
const nodes = [
  { id: "root", isRoot: true, type: "entity" },
  { id: "parent", type: "entity" },
  { id: "child", type: "entity" },
  { id: "person", type: "person" },
];
const edges = [
  { from: "root", to: "parent" },
  { from: "child", to: "root" },
  { from: "root", to: "person" },
];

test("root is at depth 0, its targets one row below", () => {
  const { depth } = computeLayout(nodes, edges);
  assert.equal(depth.get("root"), 0);
  assert.equal(depth.get("parent"), 1);
  assert.equal(depth.get("person"), 1);
});

test("a node only reachable as an edge source (child->root) is not lost", () => {
  const { depth, unreachable } = computeLayout(nodes, edges);
  // `child` points INTO root, so BFS-from-root doesn't reach it; it lands in the trailing row.
  assert.ok(unreachable.includes("child"));
  assert.ok(depth.has("child")); // still positioned, never dropped
});

test("edges referencing a missing node are dropped (would crash reactflow)", () => {
  const { validEdges } = computeLayout(nodes, [
    ...edges,
    { from: "root", to: "ghost" },
  ]);
  assert.equal(validEdges.length, edges.length);
  assert.ok(!validEdges.some((e) => e.to === "ghost"));
});

test("positions are assigned for every node and centered per row", () => {
  const { positions } = computeLayout(nodes, edges);
  assert.equal(positions.size, nodes.length);
  // a single-node row (root) is centered: its left edge sits at -NODE_W/2
  assert.equal(positions.get("root").x, -LAYOUT.NODE_W / 2);
  assert.equal(positions.get("root").y, 0);
  assert.equal(positions.get("parent").y, LAYOUT.Y_GAP);
});

test("empty graph doesn't throw", () => {
  const { positions, validEdges } = computeLayout([], []);
  assert.equal(positions.size, 0);
  assert.equal(validEdges.length, 0);
});
