import { useMemo } from "react";
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import { computeLayout, LAYOUT } from "../graphLayout.js";

// Ownership graph panel. Renders ownership.nodes / ownership.edges with a
// simple top-down layered layout computed from depth (BFS from the root).
// No layout library: x is spread by sibling index, y by depth.
const EMPTY = [];

export default function OwnershipGraph({ ownership }) {
  const nodes = ownership?.nodes ?? EMPTY;
  const edges = ownership?.edges ?? EMPTY;

  // Each poll returns a fresh JSON parse, so `nodes`/`edges` get new array identities even
  // when the graph is unchanged. Memoize on a content signature instead of array identity
  // so we don't rebuild reactflow (and snap dragged nodes back) every ~1.5s while building.
  const sig =
    nodes.map((n) => n.id).join(",") + "|" + edges.map((e) => `${e.from}>${e.to}`).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { rfNodes, rfEdges } = useMemo(() => buildGraph(nodes, edges), [sig]);

  if (nodes.length === 0) {
    return (
      <p className="muted panel-empty">
        No ownership structure available for this entity.
      </p>
    );
  }

  return (
    <div className="graph-wrap" role="group" aria-label={graphSummary(nodes, edges)}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#2a2a32" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <ul className="graph-legend" aria-hidden="true">
        <li>
          <span className="legend-swatch legend-root" /> Root entity
        </li>
        <li>
          <span className="legend-swatch legend-entity" /> Entity
        </li>
        <li>
          <span className="legend-swatch legend-person" /> Beneficial owner
        </li>
        <li>
          <span className="legend-swatch legend-exception" /> Undisclosed
        </li>
      </ul>
    </div>
  );
}

function graphSummary(nodes, edges) {
  const people = nodes.filter((n) => n.type === "person").length;
  const exceptions = nodes.filter((n) => n.type === "exception").length;
  const parts = [`Ownership graph: ${nodes.length} nodes, ${edges.length} relationships`];
  if (people) parts.push(`${people} beneficial owners`);
  if (exceptions) parts.push(`${exceptions} undisclosed`);
  return parts.join(", ");
}

function buildGraph(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const { positions, validEdges } = computeLayout(nodes, edges);

  // Dedup by id (byId keeps the last occurrence) so a node that appears in two chains
  // doesn't produce duplicate reactflow nodes (which it warns about and renders oddly).
  const rfNodes = [...byId.values()].map((n) => ({
    id: n.id,
    position: positions.get(n.id) || { x: 0, y: 0 },
    data: { label: <NodeLabel node={n} /> },
    className: nodeClass(n),
    sourcePosition: "bottom",
    targetPosition: "top",
    draggable: true,
    connectable: false,
    selectable: false,
    style: { width: LAYOUT.NODE_W },
  }));

  const rfEdges = validEdges
    .map((e, i) => ({
      id: `e-${e.from}-${e.to}-${i}`,
      source: e.from,
      target: e.to,
      label: edgeLabel(e),
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: "#1a1a1f", fillOpacity: 0.95 },
      labelStyle: { fill: "#cfcfcf", fontSize: 11 },
      style: { stroke: "#3a3a44" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#3a3a44" },
    }));

  return { rfNodes, rfEdges };
}

function nodeClass(n) {
  const classes = ["graph-node", `graph-node-${n.type || "entity"}`];
  if (n.isRoot) classes.push("graph-node-root");
  return classes.join(" ");
}

function edgeLabel(e) {
  const rel = e.relationship || "";
  const pct =
    e.ownershipPct !== null && e.ownershipPct !== undefined
      ? `${e.ownershipPct}%`
      : "";
  return [rel, pct].filter(Boolean).join(" · ");
}

function NodeLabel({ node }) {
  return (
    <div className="node-inner">
      <div className="node-label">{node.label || "Unnamed"}</div>
      {node.sublabel && <div className="node-sublabel">{node.sublabel}</div>}
      {node.type === "exception" && (
        <div className="node-tag">Undisclosed ownership</div>
      )}
    </div>
  );
}
