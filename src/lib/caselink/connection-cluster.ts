export const CONNECTION_BOARD_THRESHOLD = 60;

export interface ClusterEdgeInput {
  id: string;
  caseAId: string;
  caseBId: string;
  score: number;
}

export interface ConnectionCluster<T extends ClusterEdgeInput> {
  caseIds: string[];
  edges: T[];
}

function pairKey(edge: ClusterEdgeInput): string {
  return [edge.caseAId, edge.caseBId].sort().join("::");
}

export function buildConnectionCluster<T extends ClusterEdgeInput>(
  selectedCaseId: string,
  connections: T[],
  threshold = CONNECTION_BOARD_THRESHOLD,
): ConnectionCluster<T> {
  const uniqueByPair = new Map<string, T>();
  for (const connection of connections) {
    if (connection.score < threshold || connection.caseAId === connection.caseBId) continue;
    const key = pairKey(connection);
    const current = uniqueByPair.get(key);
    if (!current || connection.score > current.score) uniqueByPair.set(key, connection);
  }

  const eligible = [...uniqueByPair.values()];
  const adjacent = new Map<string, T[]>();
  for (const edge of eligible) {
    adjacent.set(edge.caseAId, [...(adjacent.get(edge.caseAId) ?? []), edge]);
    adjacent.set(edge.caseBId, [...(adjacent.get(edge.caseBId) ?? []), edge]);
  }

  const visited = new Set<string>([selectedCaseId]);
  const queue = [selectedCaseId];
  while (queue.length) {
    const caseId = queue.shift();
    if (!caseId) continue;
    for (const edge of adjacent.get(caseId) ?? []) {
      const relatedId = edge.caseAId === caseId ? edge.caseBId : edge.caseAId;
      if (visited.has(relatedId)) continue;
      visited.add(relatedId);
      queue.push(relatedId);
    }
  }

  return {
    caseIds: [...visited],
    edges: eligible.filter((edge) => visited.has(edge.caseAId) && visited.has(edge.caseBId)),
  };
}
