import {
  MAP_TILE_PATH_GEOMETRY,
  getMapTilePathCenterlineDetails,
  type MapTileConnector,
  type MapTileLayer,
  type MapTilePoint,
  type MapTileSide,
} from '@wondertales/shared';

type WalkerGraphTile = {
  id: string;
  maskId: string;
  boardX: number | null;
  boardY: number | null;
  connectors?: Partial<Record<MapTileSide, MapTileConnector>>;
  features?: string[];
  layers?: MapTileLayer[];
};

type WalkerRoadNode = {
  id: string;
  point: MapTilePoint;
  edges: Map<string, number>;
};

type WalkerRoadSegment = {
  startId: string;
  endId: string;
  start: MapTilePoint;
  end: MapTilePoint;
  length: number;
};

export type WalkerRoadPortal = {
  nodeId: string;
  point: MapTilePoint;
  tileId: string;
};

export type WalkerRoadGraph = {
  nodes: Map<string, WalkerRoadNode>;
  segments: WalkerRoadSegment[];
  portals: WalkerRoadPortal[];
};

export type WalkerRoadSnap = {
  point: MapTilePoint;
  distance: number;
  segmentIndex: number;
  startId: string;
  endId: string;
  segmentT: number;
  nodeId?: string;
};

export type WalkerPatrolTarget = {
  nodeId: string;
  point: MapTilePoint;
  kind: 'portal' | 'terminal' | 'road';
  distance: number;
};

export type WalkerPatrolRoute = {
  route: MapTilePoint[];
  target: WalkerPatrolTarget;
};

const GRAPH_KEY_PRECISION = 1000;
const NODE_CONNECT_DISTANCE_RATIO = 0.05;
const NODE_SNAP_EPSILON = 0.001;

function distance(a: MapTilePoint, b: MapTilePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function keyForPoint(point: MapTilePoint): string {
  return `${Math.round(point.x * GRAPH_KEY_PRECISION)}:${Math.round(point.y * GRAPH_KEY_PRECISION)}`;
}

function addEdge(node: WalkerRoadNode, targetId: string, weight: number) {
  const previous = node.edges.get(targetId);
  if (previous === undefined || weight < previous) {
    node.edges.set(targetId, weight);
  }
}

function getOrCreateNode(nodes: Map<string, WalkerRoadNode>, point: MapTilePoint): WalkerRoadNode {
  const id = keyForPoint(point);
  const existing = nodes.get(id);
  if (existing) return existing;
  const node = { id, point, edges: new Map<string, number>() };
  nodes.set(id, node);
  return node;
}

function connectNearbyNodes(nodes: Map<string, WalkerRoadNode>, maxDistance: number) {
  const nodeList = Array.from(nodes.values());
  for (let outerIndex = 0; outerIndex < nodeList.length; outerIndex += 1) {
    for (let innerIndex = outerIndex + 1; innerIndex < nodeList.length; innerIndex += 1) {
      const a = nodeList[outerIndex];
      const b = nodeList[innerIndex];
      const nodeDistance = distance(a.point, b.point);
      if (nodeDistance <= 0.001 || nodeDistance > maxDistance) continue;
      addEdge(a, b.id, nodeDistance);
      addEdge(b, a.id, nodeDistance);
    }
  }
}

function projectPointToSegment(point: MapTilePoint, start: MapTilePoint, end: MapTilePoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared <= Number.EPSILON
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return {
    t,
    point: {
      x: start.x + dx * t,
      y: start.y + dy * t,
    },
  };
}

export function buildWalkerRoadGraph(tiles: WalkerGraphTile[], cellSize: number): WalkerRoadGraph {
  const nodes = new Map<string, WalkerRoadNode>();
  const segments: WalkerRoadSegment[] = [];
  const portalsByNodeId = new Map<string, WalkerRoadPortal>();
  const tileScale = cellSize / MAP_TILE_PATH_GEOMETRY.tileSize;

  for (const tile of tiles) {
    if (tile.boardX === null || tile.boardY === null) continue;
    const centerlines = getMapTilePathCenterlineDetails({
      id: tile.maskId,
      connectors: tile.connectors,
      features: tile.features ?? [],
      layers: tile.layers ?? [],
    });

    for (const centerline of centerlines) {
      const worldPoints = centerline.points.map((point) => ({
        x: tile.boardX! * cellSize + point.x * tileScale,
        y: tile.boardY! * cellSize + point.y * tileScale,
      }));

      for (let index = 1; index < worldPoints.length; index += 1) {
        const start = worldPoints[index - 1];
        const end = worldPoints[index];
        const segmentLength = distance(start, end);
        if (segmentLength <= 0.001) continue;

        const startNode = getOrCreateNode(nodes, start);
        const endNode = getOrCreateNode(nodes, end);
        addEdge(startNode, endNode.id, segmentLength);
        addEdge(endNode, startNode.id, segmentLength);
        segments.push({
          startId: startNode.id,
          endId: endNode.id,
          start,
          end,
          length: segmentLength,
        });
      }

      for (const portalEndpointIndex of centerline.portalEndpointIndices) {
        const portalPoint = worldPoints[portalEndpointIndex];
        if (!portalPoint) continue;
        const portalNode = getOrCreateNode(nodes, portalPoint);
        portalsByNodeId.set(portalNode.id, {
          nodeId: portalNode.id,
          point: portalNode.point,
          tileId: tile.id,
        });
      }
    }
  }

  connectNearbyNodes(nodes, cellSize * NODE_CONNECT_DISTANCE_RATIO);

  return { nodes, segments, portals: Array.from(portalsByNodeId.values()) };
}

export function findNearestRoadSnap(
  graph: WalkerRoadGraph,
  point: MapTilePoint,
  maxDistance: number
): WalkerRoadSnap | null {
  let bestSnap: WalkerRoadSnap | null = null;

  graph.segments.forEach((segment, segmentIndex) => {
    const projection = projectPointToSegment(point, segment.start, segment.end);
    const projectionDistance = distance(point, projection.point);
    if (projectionDistance > maxDistance) return;
    if (bestSnap && projectionDistance >= bestSnap.distance) return;

    bestSnap = {
      point: projection.point,
      distance: projectionDistance,
      segmentIndex,
      startId: segment.startId,
      endId: segment.endId,
      segmentT: projection.t,
      nodeId:
        projection.t <= NODE_SNAP_EPSILON
          ? segment.startId
          : projection.t >= 1 - NODE_SNAP_EPSILON
            ? segment.endId
            : undefined,
    };
  });

  return bestSnap;
}

function readPointForNode(
  graph: WalkerRoadGraph,
  nodeId: string,
  startSnap: WalkerRoadSnap,
  targetSnap: WalkerRoadSnap
): MapTilePoint | null {
  if (nodeId === 'start') return startSnap.point;
  if (nodeId === 'target') return targetSnap.point;
  return graph.nodes.get(nodeId)?.point ?? null;
}

function virtualNeighbors(
  graph: WalkerRoadGraph,
  nodeId: string,
  startSnap: WalkerRoadSnap,
  targetSnap: WalkerRoadSnap
): Array<{ id: string; weight: number }> {
  const neighbors: Array<{ id: string; weight: number }> = [];
  if (nodeId === 'start') {
    neighbors.push(
      { id: startSnap.startId, weight: distance(startSnap.point, readRequiredSnapEndpoint(graph, startSnap, 'start')) },
      { id: startSnap.endId, weight: distance(startSnap.point, readRequiredSnapEndpoint(graph, startSnap, 'end')) }
    );
    if (startSnap.segmentIndex === targetSnap.segmentIndex) {
      neighbors.push({ id: 'target', weight: distance(startSnap.point, targetSnap.point) });
    }
  }
  if (nodeId === 'target') {
    neighbors.push(
      { id: targetSnap.startId, weight: distance(targetSnap.point, readRequiredSnapEndpoint(graph, targetSnap, 'start')) },
      { id: targetSnap.endId, weight: distance(targetSnap.point, readRequiredSnapEndpoint(graph, targetSnap, 'end')) }
    );
  }
  return neighbors;
}

function readRequiredSnapEndpoint(
  graph: WalkerRoadGraph,
  snap: WalkerRoadSnap,
  endpoint: 'start' | 'end'
): MapTilePoint {
  const segment = graph.segments[snap.segmentIndex];
  if (!segment) return snap.point;
  return endpoint === 'start' ? segment.start : segment.end;
}

function neighborsForNode(
  graph: WalkerRoadGraph,
  nodeId: string,
  startSnap: WalkerRoadSnap,
  targetSnap: WalkerRoadSnap
): Array<{ id: string; weight: number }> {
  if (nodeId === 'start' || nodeId === 'target') {
    return virtualNeighbors(graph, nodeId, startSnap, targetSnap);
  }

  const node = graph.nodes.get(nodeId);
  const neighbors = node
    ? Array.from(node.edges.entries()).map(([id, weight]) => ({ id, weight }))
    : [];

  if (nodeId === startSnap.startId) {
    neighbors.push({ id: 'start', weight: distance(graph.nodes.get(nodeId)!.point, startSnap.point) });
  }
  if (nodeId === startSnap.endId) {
    neighbors.push({ id: 'start', weight: distance(graph.nodes.get(nodeId)!.point, startSnap.point) });
  }
  if (nodeId === targetSnap.startId) {
    neighbors.push({ id: 'target', weight: distance(graph.nodes.get(nodeId)!.point, targetSnap.point) });
  }
  if (nodeId === targetSnap.endId) {
    neighbors.push({ id: 'target', weight: distance(graph.nodes.get(nodeId)!.point, targetSnap.point) });
  }

  return neighbors;
}

export function findWalkerRoute(
  graph: WalkerRoadGraph,
  startSnap: WalkerRoadSnap,
  targetSnap: WalkerRoadSnap
): MapTilePoint[] | null {
  const distances = new Map<string, number>([['start', 0]]);
  const previous = new Map<string, string>();
  const visited = new Set<string>();
  const queue = new Set<string>(['start']);

  while (queue.size > 0) {
    let currentId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    queue.forEach((id) => {
      const candidateDistance = distances.get(id) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < currentDistance) {
        currentId = id;
        currentDistance = candidateDistance;
      }
    });

    if (!currentId) break;
    queue.delete(currentId);
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    if (currentId === 'target') break;

    for (const neighbor of neighborsForNode(graph, currentId, startSnap, targetSnap)) {
      if (visited.has(neighbor.id)) continue;
      const nextDistance = currentDistance + neighbor.weight;
      if (nextDistance < (distances.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.id, nextDistance);
        previous.set(neighbor.id, currentId);
        queue.add(neighbor.id);
      }
    }
  }

  if (!distances.has('target')) {
    return null;
  }

  const routeIds: string[] = [];
  let cursor: string | undefined = 'target';
  while (cursor) {
    routeIds.unshift(cursor);
    cursor = previous.get(cursor);
  }

  const route = routeIds
    .map((nodeId) => readPointForNode(graph, nodeId, startSnap, targetSnap))
    .filter((point): point is MapTilePoint => !!point);

  return route.length >= 2 ? route : null;
}

function targetKindForNode(graph: WalkerRoadGraph, nodeId: string): WalkerPatrolTarget['kind'] {
  if (graph.portals.some((portal) => portal.nodeId === nodeId)) return 'portal';
  const node = graph.nodes.get(nodeId);
  return node && node.edges.size <= 1 ? 'terminal' : 'road';
}

function randomItem<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function startNeighborsForSnap(
  graph: WalkerRoadGraph,
  startSnap: WalkerRoadSnap
): Array<{ id: string; weight: number }> {
  return [
    { id: startSnap.startId, weight: distance(startSnap.point, readRequiredSnapEndpoint(graph, startSnap, 'start')) },
    { id: startSnap.endId, weight: distance(startSnap.point, readRequiredSnapEndpoint(graph, startSnap, 'end')) },
  ];
}

function dijkstraFromSnap(graph: WalkerRoadGraph, startSnap: WalkerRoadSnap) {
  const distances = new Map<string, number>([['start', 0]]);
  const previous = new Map<string, string>();
  const visited = new Set<string>();
  const queue = new Set<string>(['start']);

  while (queue.size > 0) {
    let currentId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    queue.forEach((id) => {
      const candidateDistance = distances.get(id) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < currentDistance) {
        currentId = id;
        currentDistance = candidateDistance;
      }
    });

    if (!currentId) break;
    queue.delete(currentId);
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const neighbors =
      currentId === 'start'
        ? startNeighborsForSnap(graph, startSnap)
        : Array.from(graph.nodes.get(currentId)?.edges.entries() ?? []).map(([id, weight]) => ({
            id,
            weight,
          }));

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.id)) continue;
      const nextDistance = currentDistance + neighbor.weight;
      if (nextDistance < (distances.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.id, nextDistance);
        previous.set(neighbor.id, currentId);
        queue.add(neighbor.id);
      }
    }
  }

  return { distances, previous };
}

function reconstructRouteFromStart(
  graph: WalkerRoadGraph,
  startSnap: WalkerRoadSnap,
  targetNodeId: string,
  previous: Map<string, string>
): MapTilePoint[] | null {
  const routeIds: string[] = [];
  let cursor: string | undefined = targetNodeId;
  while (cursor) {
    routeIds.unshift(cursor);
    cursor = previous.get(cursor);
  }

  if (routeIds[0] !== 'start') return null;

  const route = routeIds
    .map((nodeId) => (nodeId === 'start' ? startSnap.point : graph.nodes.get(nodeId)?.point ?? null))
    .filter((point): point is MapTilePoint => !!point);

  return route.length >= 2 ? route : null;
}

function isPortalNode(graph: WalkerRoadGraph, nodeId: string): boolean {
  return graph.portals.some((portal) => portal.nodeId === nodeId);
}

function chooseCandidate(
  graph: WalkerRoadGraph,
  distances: Map<string, number>,
  candidates: string[],
  strategy: 'nearest' | 'farthest'
): WalkerPatrolTarget | null {
  let bestTarget: WalkerPatrolTarget | null = null;

  for (const nodeId of candidates) {
    const node = graph.nodes.get(nodeId);
    const nodeDistance = distances.get(nodeId);
    if (!node || nodeDistance === undefined || nodeDistance <= 1) continue;
    if (
      bestTarget &&
      (strategy === 'nearest'
        ? nodeDistance >= bestTarget.distance
        : nodeDistance <= bestTarget.distance)
    ) {
      continue;
    }
    bestTarget = {
      nodeId,
      point: node.point,
      kind: targetKindForNode(graph, nodeId),
      distance: nodeDistance,
    };
  }

  return bestTarget;
}

function chooseRandomCandidate(
  graph: WalkerRoadGraph,
  distances: Map<string, number>,
  candidates: string[]
): WalkerPatrolTarget | null {
  const targets: WalkerPatrolTarget[] = [];

  for (const nodeId of candidates) {
    const node = graph.nodes.get(nodeId);
    const nodeDistance = distances.get(nodeId);
    if (!node || nodeDistance === undefined || nodeDistance <= 1) continue;
    targets.push({
      nodeId,
      point: node.point,
      kind: targetKindForNode(graph, nodeId),
      distance: nodeDistance,
    });
  }

  return randomItem(targets);
}

function routeToTarget(
  graph: WalkerRoadGraph,
  startSnap: WalkerRoadSnap,
  target: WalkerPatrolTarget,
  previous: Map<string, string>
): WalkerPatrolRoute | null {
  const route = reconstructRouteFromStart(graph, startSnap, target.nodeId, previous);
  return route ? { route, target } : null;
}

export function findNextWalkerPatrolRoute(
  graph: WalkerRoadGraph,
  startSnap: WalkerRoadSnap
): WalkerPatrolRoute | null {
  const { distances, previous } = dijkstraFromSnap(graph, startSnap);
  const portalCandidateIds = graph.portals.map((portal) => portal.nodeId);
  const terminalCandidateIds = Array.from(graph.nodes.values())
    .filter((node) => node.edges.size <= 1 && !isPortalNode(graph, node.id))
    .map((node) => node.id);
  const allCandidateIds = Array.from(graph.nodes.keys());
  const endpointCandidateIds = [...terminalCandidateIds, ...portalCandidateIds];

  const target =
    chooseRandomCandidate(graph, distances, endpointCandidateIds) ??
    chooseCandidate(graph, distances, allCandidateIds, 'farthest');

  return target ? routeToTarget(graph, startSnap, target, previous) : null;
}

export function hasReachableWalkerPatrolTarget(
  graph: WalkerRoadGraph,
  startSnap: WalkerRoadSnap
): boolean {
  const { distances } = dijkstraFromSnap(graph, startSnap);
  const portalCandidateIds = graph.portals.map((portal) => portal.nodeId);
  const terminalCandidateIds = Array.from(graph.nodes.values())
    .filter((node) => node.edges.size <= 1 && !isPortalNode(graph, node.id))
    .map((node) => node.id);
  const endpointCandidateIds = [...terminalCandidateIds, ...portalCandidateIds];

  return (
    chooseCandidate(graph, distances, endpointCandidateIds, 'nearest') !== null ||
    chooseCandidate(graph, distances, Array.from(graph.nodes.keys()), 'farthest') !== null
  );
}

export function snapForRoadNode(
  graph: WalkerRoadGraph,
  nodeId: string
): WalkerRoadSnap | null {
  const node = graph.nodes.get(nodeId);
  if (!node) return null;

  const segmentIndex = graph.segments.findIndex(
    (segment) => segment.startId === nodeId || segment.endId === nodeId
  );
  if (segmentIndex < 0) return null;

  const segment = graph.segments[segmentIndex];
  return {
    point: node.point,
    distance: 0,
    segmentIndex,
    startId: segment.startId,
    endId: segment.endId,
    segmentT: segment.startId === nodeId ? 0 : 1,
    nodeId,
  };
}

export function findRandomPortalExit(
  graph: WalkerRoadGraph,
  currentPortalNodeId: string
): WalkerRoadPortal | null {
  const otherPortals = graph.portals.filter((portal) => portal.nodeId !== currentPortalNodeId);
  return randomItem(otherPortals.length > 0 ? otherPortals : graph.portals);
}

export function polylineLength(points: MapTilePoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

export function pointAlongPolyline(points: MapTilePoint[], travelDistance: number): {
  point: MapTilePoint;
  angle: number;
} | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { point: points[0], angle: 0 };

  let remaining = Math.max(0, travelDistance);
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = distance(start, end);
    if (segmentLength <= 0.001) continue;
    if (remaining <= segmentLength) {
      const t = remaining / segmentLength;
      return {
        point: {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        },
        angle: Math.atan2(end.y - start.y, end.x - start.x),
      };
    }
    remaining -= segmentLength;
  }

  const beforeEnd = points[points.length - 2];
  const end = points[points.length - 1];
  return {
    point: end,
    angle: Math.atan2(end.y - beforeEnd.y, end.x - beforeEnd.x),
  };
}
