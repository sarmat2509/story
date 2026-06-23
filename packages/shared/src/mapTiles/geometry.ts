export type MapTileSide = 'N' | 'E' | 'S' | 'W';
export type MapTileRouteKind = 'path' | 'river';
export type MapTileLandmarkKind = 'bridge' | 'pond' | 'shore' | 'portal' | 'waterfall';
export type MapTilePosition =
  | 'center'
  | 'north'
  | 'east'
  | 'south'
  | 'west'
  | 'northwest'
  | 'northeast'
  | 'southwest'
  | 'southeast';
export type MapTileConnector = 'PATH' | 'WATER' | 'PORTAL' | 'SHORE';

export type MapTileRouteLayer = {
  kind: MapTileRouteKind;
  sides: MapTileSide[];
  curve?: 'straight' | 'soft' | 'wavy' | 'junction' | 'portal' | 'mouth';
  position?: MapTilePosition;
};

export type MapTileLayer =
  | MapTileRouteLayer
  | {
      kind: MapTileLandmarkKind;
      position?: MapTilePosition;
    };

export type MapTileRouteGroupKind = 'PATH' | 'WATER';
export type MapTileRouteGroupEndpoint = MapTileSide | 'PORTAL' | 'POND' | 'SEA';

export type MapTileRouteGroup = {
  kind: MapTileRouteGroupKind;
  endpoints: MapTileRouteGroupEndpoint[];
  portalPosition?: MapTilePosition;
  note?: string;
};

export type MapTilePoint = { x: number; y: number };

export type MapTilePathGeometryVariant = {
  id: string;
  connectors?: Partial<Record<MapTileSide, MapTileConnector>>;
  features?: string[];
  layers?: MapTileLayer[];
  routeGroups?: MapTileRouteGroup[];
};

export type MapTilePathCenterline = {
  points: MapTilePoint[];
  portalEndpointIndices: number[];
};

type LineCommand = { kind: 'L'; point: MapTilePoint };
type MoveCommand = { kind: 'M'; point: MapTilePoint };
type CubicCommand = {
  kind: 'C';
  cp1: MapTilePoint;
  cp2: MapTilePoint;
  point: MapTilePoint;
};
type RouteCommand = MoveCommand | LineCommand | CubicCommand;

export const MAP_TILE_PATH_GEOMETRY = {
  tileSize: 1254,
  connectorCenter: 627,
  routeWidth: 150,
  connectorThroatLength: 190,
} as const;

const TILE = MAP_TILE_PATH_GEOMETRY.tileSize;
const CENTER = MAP_TILE_PATH_GEOMETRY.connectorCenter;
const THROAT = MAP_TILE_PATH_GEOMETRY.connectorThroatLength;
const DEFAULT_CURVE_SAMPLES = 18;

function point(x: number, y: number): MapTilePoint {
  return { x, y };
}

function moveTo(x: number, y: number): MoveCommand {
  return { kind: 'M', point: point(x, y) };
}

function lineTo(x: number, y: number): LineCommand {
  return { kind: 'L', point: point(x, y) };
}

function cubicTo(
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  x: number,
  y: number
): CubicCommand {
  return {
    kind: 'C',
    cp1: point(cp1x, cp1y),
    cp2: point(cp2x, cp2y),
    point: point(x, y),
  };
}

function edgePoint(side: MapTileSide): MapTilePoint {
  switch (side) {
    case 'N':
      return point(CENTER, 0);
    case 'E':
      return point(TILE, CENTER);
    case 'S':
      return point(CENTER, TILE);
    case 'W':
      return point(0, CENTER);
  }
}

function throatPoint(side: MapTileSide): MapTilePoint {
  switch (side) {
    case 'N':
      return point(CENTER, THROAT);
    case 'E':
      return point(TILE - THROAT, CENTER);
    case 'S':
      return point(CENTER, TILE - THROAT);
    case 'W':
      return point(THROAT, CENTER);
  }
}

function pairKey(a: MapTileSide, b: MapTileSide): string {
  return [a, b].join('');
}

function portalPosition(variant: MapTilePathGeometryVariant): MapTilePosition | undefined {
  return variant.layers?.find((item) => item.kind === 'portal')?.position;
}

function portalRouteCommands(side: MapTileSide, position: MapTilePosition | undefined): RouteCommand[] {
  if (side === 'W' && position === 'northwest') {
    return [
      moveTo(0, CENTER),
      lineTo(THROAT, CENTER),
      cubicTo(245, 620, 275, 500, 300, 390),
    ];
  }

  if (side === 'N' && position === 'northwest') {
    return [
      moveTo(CENTER, 0),
      lineTo(CENTER, THROAT),
      cubicTo(565, 240, 425, 310, 300, 390),
    ];
  }

  if (side === 'E' && position === 'northeast') {
    return [
      moveTo(TILE, CENTER),
      lineTo(TILE - THROAT, CENTER),
      cubicTo(1008, 620, 980, 500, 954, 390),
    ];
  }

  if (side === 'S' && position === 'southwest') {
    return [
      moveTo(CENTER, TILE),
      lineTo(CENTER, TILE - THROAT),
      cubicTo(560, 1030, 430, 1015, 300, 1015),
    ];
  }

  const start = edgePoint(side);
  const throat = throatPoint(side);
  return [moveTo(start.x, start.y), lineTo(throat.x, throat.y), lineTo(CENTER, CENTER)];
}

function junctionRouteCommands(side: MapTileSide): RouteCommand[] {
  switch (side) {
    case 'N':
      return [
        moveTo(CENTER, CENTER),
        cubicTo(CENTER - 35, 500, CENTER, 340, CENTER, THROAT),
        lineTo(CENTER, 0),
      ];
    case 'E':
      return [
        moveTo(CENTER, CENTER),
        cubicTo(760, CENTER - 30, 920, CENTER, TILE - THROAT, CENTER),
        lineTo(TILE, CENTER),
      ];
    case 'S':
      return [
        moveTo(CENTER, CENTER),
        cubicTo(CENTER - 35, 760, CENTER, 910, CENTER, TILE - THROAT),
        lineTo(CENTER, TILE),
      ];
    case 'W':
      return [
        moveTo(CENTER, CENTER),
        cubicTo(500, CENTER + 30, 335, CENTER, THROAT, CENTER),
        lineTo(0, CENTER),
      ];
  }
}

function pathLayerCommands(
  layer: MapTileRouteLayer,
  variant: MapTilePathGeometryVariant
): RouteCommand[] {
  const sides = layer.sides;
  const hasNorthwestPortal = !!variant.layers?.some(
    (item) => item.kind === 'portal' && item.position === 'northwest'
  );

  if (layer.curve === 'junction' && sides.length === 1 && sides[0] === 'W' && hasNorthwestPortal) {
    return [moveTo(445, 650), cubicTo(390, 570, 335, 475, 300, 390)];
  }

  if (layer.curve === 'junction' && sides.length === 1) {
    return junctionRouteCommands(sides[0]);
  }

  if (layer.curve === 'portal' && sides.length === 1) {
    return portalRouteCommands(sides[0], portalPosition(variant));
  }

  if (sides.length !== 2) {
    return [];
  }

  const [a, b] = sides;
  const start = edgePoint(a);
  const startThroat = throatPoint(a);
  const endThroat = throatPoint(b);
  const end = edgePoint(b);
  const key = pairKey(a, b);
  const isWavy = layer.curve === 'wavy';
  const commandsStart = [moveTo(start.x, start.y), lineTo(startThroat.x, startThroat.y)];
  const commandsEnd = [lineTo(end.x, end.y)];

  if (variant.id === 'path-ws-river-ne-waterfall-portal-n' && (key === 'WS' || key === 'SW')) {
    return [
      moveTo(0, CENTER),
      lineTo(THROAT, CENTER),
      cubicTo(270, 690, 320, 825, 388, 900),
      cubicTo(470, 995, 592, 1035, CENTER, TILE - THROAT),
      lineTo(CENTER, TILE),
    ];
  }

  if (
    (key === 'WS' || key === 'SW') &&
    !!variant.features?.includes('pond') &&
    !variant.features.includes('bridge') &&
    !!variant.layers?.some((item) => item.kind === 'pond' && item.position === 'center')
  ) {
    return [
      moveTo(0, CENTER),
      lineTo(THROAT, CENTER),
      cubicTo(235, 730, 292, 900, 420, 1010),
      cubicTo(500, 1080, 595, 1088, CENTER, TILE - THROAT),
      lineTo(CENTER, TILE),
    ];
  }

  if (key === 'WE' || key === 'EW') {
    const y1 = isWavy ? CENTER - 34 : CENTER;
    const y2 = isWavy ? CENTER + 42 : CENTER;
    return [
      ...commandsStart,
      cubicTo(360, y1, 520, y2, CENTER, CENTER),
      cubicTo(760, CENTER - (isWavy ? 48 : 0), 900, CENTER + (isWavy ? 28 : 0), endThroat.x, endThroat.y),
      ...commandsEnd,
    ];
  }

  if (key === 'NS' || key === 'SN') {
    return [
      ...commandsStart,
      cubicTo(CENTER - (isWavy ? 58 : 0), 330, CENTER + (isWavy ? 64 : 0), 460, CENTER, CENTER),
      cubicTo(CENTER - (isWavy ? 70 : 0), 790, CENTER + (isWavy ? 48 : 0), 920, endThroat.x, endThroat.y),
      ...commandsEnd,
    ];
  }

  if (key === 'WS' || key === 'SW') {
    return [
      ...commandsStart,
      cubicTo(335, CENTER, 455, 735, 550, 760),
      cubicTo(655, 790, CENTER, 920, endThroat.x, endThroat.y),
      ...commandsEnd,
    ];
  }

  if (key === 'ES') {
    return [
      ...commandsStart,
      cubicTo(920, CENTER, 800, 735, 704, 760),
      cubicTo(650, 790, CENTER, 920, endThroat.x, endThroat.y),
      ...commandsEnd,
    ];
  }

  if (key === 'SE') {
    return [
      ...commandsStart,
      cubicTo(CENTER, 920, 650, 790, 704, 760),
      cubicTo(800, 735, 920, CENTER, endThroat.x, endThroat.y),
      ...commandsEnd,
    ];
  }

  if (key === 'NE' || key === 'EN') {
    return [
      ...commandsStart,
      cubicTo(CENTER - (isWavy ? 52 : 20), 320, CENTER + 96, 430, 772, 514),
      cubicTo(920, 590, 1010, CENTER, endThroat.x, endThroat.y),
      ...commandsEnd,
    ];
  }

  return [];
}

function isPortalBranchLayer(layer: MapTileRouteLayer, variant: MapTilePathGeometryVariant): boolean {
  if (layer.curve === 'portal') return true;
  return layer.curve === 'junction' && layer.sides.length === 1 && !!portalPosition(variant);
}

function portalEndpointIndicesForRoute(
  layer: MapTileRouteLayer,
  variant: MapTilePathGeometryVariant,
  points: MapTilePoint[]
): number[] {
  const portalEndpointIndices = new Set<number>();
  if (points.length === 0) return [];

  if (isPortalBranchLayer(layer, variant)) {
    portalEndpointIndices.add(points.length - 1);
  }

  if (layer.sides.length >= 1) {
    const firstSide = layer.sides[0];
    if (variant.connectors?.[firstSide] === 'PORTAL') {
      portalEndpointIndices.add(0);
    }
  }

  if (layer.sides.length >= 2) {
    const lastSide = layer.sides[layer.sides.length - 1];
    if (variant.connectors?.[lastSide] === 'PORTAL') {
      portalEndpointIndices.add(points.length - 1);
    }
  }

  return Array.from(portalEndpointIndices).sort((a, b) => a - b);
}

function cubicPoint(
  start: MapTilePoint,
  cp1: MapTilePoint,
  cp2: MapTilePoint,
  end: MapTilePoint,
  t: number
): MapTilePoint {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * start.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t2 * t * end.x,
    y: mt2 * mt * start.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t2 * t * end.y,
  };
}

function commandsToPoints(commands: RouteCommand[], curveSamples: number): MapTilePoint[] {
  const points: MapTilePoint[] = [];
  let current: MapTilePoint | null = null;

  for (const command of commands) {
    if (command.kind === 'M') {
      current = command.point;
      points.push(command.point);
      continue;
    }

    if (!current) {
      current = command.point;
      points.push(command.point);
      continue;
    }

    if (command.kind === 'L') {
      current = command.point;
      points.push(command.point);
      continue;
    }

    for (let index = 1; index <= curveSamples; index += 1) {
      points.push(cubicPoint(current, command.cp1, command.cp2, command.point, index / curveSamples));
    }
    current = command.point;
  }

  return points;
}

export function getMapTilePathCenterlines(
  variant: MapTilePathGeometryVariant,
  options: { curveSamples?: number } = {}
): MapTilePoint[][] {
  return getMapTilePathCenterlineDetails(variant, options).map((route) => route.points);
}

export function getMapTilePathCenterlineDetails(
  variant: MapTilePathGeometryVariant,
  options: { curveSamples?: number } = {}
): MapTilePathCenterline[] {
  const curveSamples = Math.max(4, Math.round(options.curveSamples ?? DEFAULT_CURVE_SAMPLES));
  return (variant.layers ?? [])
    .filter((layer): layer is MapTileRouteLayer => layer.kind === 'path')
    .map((layer) => {
      const points = commandsToPoints(pathLayerCommands(layer, variant), curveSamples);
      return {
        points,
        portalEndpointIndices: portalEndpointIndicesForRoute(layer, variant, points),
      };
    })
    .filter((route) => route.points.length >= 2);
}
