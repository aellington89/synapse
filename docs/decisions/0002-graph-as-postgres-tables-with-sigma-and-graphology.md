# 0002. Store the graph as typed node and edge tables in PostgreSQL, and render and analyse it with graphology and Sigma.js

Date: 2026-11-22 · Status: Proposed · Issue: #2

## Context

A personal media graph has roughly 5,000 to 50,000 nodes, music included. Raw plays add tens to
hundreds of thousands of rows in Phase 2, but those stay out of the drawn graph. Synapse needs
traversal for paths, clustering for Atlas, and edges from three origins (manual, metadata, and
import), each with a review state. Rendering benchmarks put that node count in WebGL territory.
SVG stays smooth to about 2,000 elements, and canvas to about 5,000. Kùzu, the leading embedded
graph database, was archived in October 2025. The research on #2 has the evidence.

## Decision

- The graph lives in PostgreSQL as `nodes` and `edges` tables, with recursive CTEs for any
  traversal done on the server.
- Every edge has an `origin` and a `status`, and every node has a `visibility`, from the first
  migration.
- Raw plays go in a separate `listens` table (Phase 2) that rolls up to album and artist nodes.
- The browser loads the graph into graphology for layout (ForceAtlas2), community detection
  (Louvain), and shortest paths, and renders it with Sigma.js 4 using WebGL.

## Consequences

- There's one store to back up and migrate, and the graph sits beside the app's other data.
- Graph queries are SQL rather than Cypher.
- Edges drawn by hand, from metadata, from imports, and any later AI suggestions share one
  table and one review flow.
- Very large graphs would need filtering on the server before rendering.
- Hierarchical layouts are weaker in Sigma than in Cytoscape. Revisit this ADR if Phase 3 needs
  them, or if Phase 1's Atlas performance gate (issue 1.9) fails.

## Alternatives considered

- **Neo4j:** native Cypher, but another stateful service, and app data still wants a relational
  store.
- **Kùzu:** embedded, but archived in October 2025.
- **Cytoscape.js 3.35:** richer layouts, including hierarchical ones, but its canvas renderer is
  slower at this scale. It's the fallback if Sigma fails the performance gate.
- **react-force-graph:** the quickest demo, but it gives little control over clusters and labels,
  and its algorithm support is weak.
