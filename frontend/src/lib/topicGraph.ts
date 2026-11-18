import type { Topic } from "@/lib/api";

/**
 * Dispone gli argomenti di un esame come grafo dei prerequisiti.
 *
 * I prerequisiti esistono nei dati da sempre — il piano di studio ci calcola
 * sopra l'ordine in cui affrontare le cose — ma non sono mai stati mostrati.
 * Qui si trasformano in coordinate: niente React, niente disegno, solo numeri,
 * così la disposizione si può ragionare e correggere senza aprire una pagina.
 *
 * Il livello di un argomento è la catena di prerequisiti più lunga che lo
 * precede: un argomento senza prerequisiti sta a sinistra, uno che ne richiede
 * due in fila sta due colonne più in là. Le colonne vengono centrate fra loro,
 * così il grafo non pende da un lato.
 */

export const NODE_W = 190;
export const NODE_H = 76;
export const GAP_X = 76;
export const GAP_Y = 18;

export interface GraphNode {
  id: string;
  title: string;
  status: Topic["status"];
  priority: Topic["priority"];
  masteryScore: number;
  level: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  path: string;
}

export interface TopicGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  /** Prerequisiti che puntano all'indietro: un ciclo nei dati, non disegnabile. */
  skippedEdges: { from: string; to: string }[];
}

function parsePrerequisites(topic: Topic, known: Set<string>): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(topic.prerequisites_json || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id !== topic.id && known.has(id)
  );
}

/**
 * Livello di ogni argomento, con guardia contro i cicli.
 *
 * Un ciclo nei prerequisiti non dovrebbe esistere, ma arriva da un modello e
 * il grafo non può bloccarsi per questo: un arco già in visita vale zero e
 * viene segnalato, invece di mandare la ricorsione all'infinito.
 */
function computeLevels(
  order: Topic[],
  prereqs: Map<string, string[]>
): { levels: Map<string, number>; cyclic: { from: string; to: string }[] } {
  const levels = new Map<string, number>();
  const visiting = new Set<string>();
  const cyclic: { from: string; to: string }[] = [];

  function levelOf(id: string): number {
    const cached = levels.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;

    visiting.add(id);
    let level = 0;
    for (const parent of prereqs.get(id) ?? []) {
      if (visiting.has(parent)) {
        cyclic.push({ from: parent, to: id });
        continue;
      }
      level = Math.max(level, levelOf(parent) + 1);
    }
    visiting.delete(id);
    levels.set(id, level);
    return level;
  }

  for (const topic of order) levelOf(topic.id);
  return { levels, cyclic };
}

export function buildTopicGraph(topics: Topic[]): TopicGraph {
  const visible = topics.filter((t) => !t.excluded);
  if (visible.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0, skippedEdges: [] };
  }

  const known = new Set(visible.map((t) => t.id));
  const prereqs = new Map(visible.map((t) => [t.id, parsePrerequisites(t, known)]));
  const { levels, cyclic } = computeLevels(visible, prereqs);

  const columns = new Map<number, Topic[]>();
  for (const topic of visible) {
    const level = levels.get(topic.id) ?? 0;
    const column = columns.get(level) ?? [];
    column.push(topic);
    columns.set(level, column);
  }

  const maxRows = Math.max(...[...columns.values()].map((c) => c.length));
  const rowHeight = NODE_H + GAP_Y;
  const nodes: GraphNode[] = [];

  for (const [level, column] of columns) {
    // Ogni colonna è centrata rispetto alla più alta: senza questo il grafo
    // pende verso l'alto e le frecce scendono tutte nella stessa direzione.
    const offset = ((maxRows - column.length) * rowHeight) / 2;
    column.forEach((topic, row) => {
      nodes.push({
        id: topic.id,
        title: topic.title,
        status: topic.status,
        priority: topic.priority,
        masteryScore: topic.mastery_score,
        level,
        x: level * (NODE_W + GAP_X),
        y: offset + row * rowHeight,
      });
    });
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = [];
  const skippedEdges = [...cyclic];

  for (const node of nodes) {
    for (const parentId of prereqs.get(node.id) ?? []) {
      const parent = nodeById.get(parentId);
      if (!parent) continue;
      if (parent.level >= node.level) {
        skippedEdges.push({ from: parentId, to: node.id });
        continue;
      }
      const startX = parent.x + NODE_W;
      const startY = parent.y + NODE_H / 2;
      const endX = node.x;
      const endY = node.y + NODE_H / 2;
      const bendX = startX + (endX - startX) / 2;
      edges.push({
        id: `${parentId}->${node.id}`,
        from: parentId,
        to: node.id,
        path: `M${startX} ${startY} H${bendX} V${endY} H${endX}`,
      });
    }
  }

  const maxLevel = Math.max(...nodes.map((n) => n.level));
  return {
    nodes,
    edges,
    width: (maxLevel + 1) * NODE_W + maxLevel * GAP_X,
    height: maxRows * rowHeight - GAP_Y,
    skippedEdges,
  };
}
