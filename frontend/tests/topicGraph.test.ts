import assert from "node:assert/strict";
import { test } from "node:test";

import type { Topic } from "../src/lib/api.ts";
import { buildTopicGraph, GAP_X, NODE_W } from "../src/lib/topicGraph.ts";

function topic(id: string, prerequisites: string[] = [], extra: Partial<Topic> = {}): Topic {
  return {
    id,
    exam_id: "esame",
    title: id,
    description: "",
    priority: "IMPORTANT",
    estimated_minutes: 45,
    prerequisites_json: JSON.stringify(prerequisites),
    source_pages_json: "[]",
    notes_markdown: null,
    highlights_json: "[]",
    web_sources_json: "[]",
    status: "READY",
    mastery_score: 0,
    ...extra,
  };
}

function levelOf(graph: ReturnType<typeof buildTopicGraph>, id: string): number {
  const node = graph.nodes.find((n) => n.id === id);
  assert.ok(node, `nodo ${id} assente dal grafo`);
  return node.level;
}

test("senza prerequisiti sta tutto nella prima colonna", () => {
  const graph = buildTopicGraph([topic("a"), topic("b")]);

  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 0);
  assert.equal(levelOf(graph, "a"), 0);
  assert.equal(levelOf(graph, "b"), 0);
  assert.equal(graph.width, NODE_W);
});

test("il livello è la catena di prerequisiti più lunga, non la più corta", () => {
  // c dipende da a (diretto) e da b, che a sua volta dipende da a.
  const graph = buildTopicGraph([topic("a"), topic("b", ["a"]), topic("c", ["a", "b"])]);

  assert.equal(levelOf(graph, "a"), 0);
  assert.equal(levelOf(graph, "b"), 1);
  assert.equal(levelOf(graph, "c"), 2);
  assert.equal(graph.edges.length, 3);
  assert.equal(graph.width, 3 * NODE_W + 2 * GAP_X);
});

test("un ciclo non blocca il grafo e viene segnalato", () => {
  const graph = buildTopicGraph([topic("a", ["b"]), topic("b", ["a"])]);

  assert.equal(graph.nodes.length, 2);
  assert.ok(graph.skippedEdges.length >= 1, "il ciclo doveva essere segnalato");
  // Nessun arco disegnato può andare all'indietro.
  for (const edge of graph.edges) {
    assert.ok(levelOf(graph, edge.from) < levelOf(graph, edge.to));
  }
});

test("prerequisiti verso argomenti esclusi o inesistenti vengono ignorati", () => {
  const graph = buildTopicGraph([
    topic("escluso", [], { excluded: true }),
    topic("a", ["escluso", "mai-esistito"]),
  ]);

  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.edges.length, 0);
  assert.equal(levelOf(graph, "a"), 0);
});

test("un prerequisito di se stesso non crea un arco", () => {
  const graph = buildTopicGraph([topic("a", ["a"])]);

  assert.equal(graph.edges.length, 0);
  assert.equal(levelOf(graph, "a"), 0);
});

test("un elenco di prerequisiti malformato non fa cadere il grafo", () => {
  const rotto = topic("a");
  rotto.prerequisites_json = "{non è json";
  const numerico = topic("b");
  numerico.prerequisites_json = "[1, 2, 3]";

  const graph = buildTopicGraph([rotto, numerico]);

  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 0);
});

test("le colonne sono centrate fra loro", () => {
  // Due argomenti al livello 0, uno solo al livello 1: quello singolo va
  // allineato al centro della colonna più alta, non in cima.
  const graph = buildTopicGraph([topic("a"), topic("b"), topic("c", ["a"])]);

  const a = graph.nodes.find((n) => n.id === "a");
  const b = graph.nodes.find((n) => n.id === "b");
  const c = graph.nodes.find((n) => n.id === "c");
  assert.ok(a && b && c);
  assert.ok(c.y > a.y && c.y < b.y, "la colonna singola non è centrata");
});

test("ogni arco parte dal bordo destro del prerequisito e arriva a sinistra", () => {
  const graph = buildTopicGraph([topic("a"), topic("b", ["a"])]);
  const a = graph.nodes.find((n) => n.id === "a");
  const b = graph.nodes.find((n) => n.id === "b");
  assert.ok(a && b);

  assert.equal(graph.edges.length, 1);
  assert.ok(graph.edges[0].path.startsWith(`M${a.x + NODE_W} `));
  assert.ok(graph.edges[0].path.endsWith(`H${b.x}`));
});

test("nessun argomento, nessun grafo", () => {
  const graph = buildTopicGraph([]);

  assert.deepEqual(graph.nodes, []);
  assert.equal(graph.width, 0);
  assert.equal(graph.height, 0);
});
