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
export const MAP_TILE_FEATURE_TOKENS = [
  'path',
  'river',
  'waterfall',
  'pond',
  'sea',
  'bridge',
  'portal',
] as const;
export type MapTileFeatureToken = (typeof MAP_TILE_FEATURE_TOKENS)[number];

export type MapTileLayer =
  | {
      kind: MapTileRouteKind;
      sides: MapTileSide[];
      curve?: 'straight' | 'soft' | 'wavy' | 'junction' | 'portal' | 'mouth';
      position?: MapTilePosition;
    }
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

export type MapTileMaskVariant = {
  id: string;
  label: string;
  description: string;
  connectors: Partial<Record<MapTileSide, 'PATH' | 'WATER' | 'PORTAL' | 'SHORE'>>;
  topology: string;
  routeGroups: MapTileRouteGroup[];
  features: MapTileFeatureToken[];
  layers: MapTileLayer[];
};

type MapTileMaskVariantDef = Omit<MapTileMaskVariant, 'routeGroups'> & {
  routeGroups?: MapTileRouteGroup[];
};

function featureKey(features: readonly string[]): string {
  const normalized = new Set(features.map((feature) => feature.trim().toLowerCase()).filter(Boolean));
  return MAP_TILE_FEATURE_TOKENS.filter((token) => normalized.has(token)).join('+');
}

function withMandatoryPathFeature(features: readonly MapTileFeatureToken[]): MapTileFeatureToken[] {
  const normalized = new Set<MapTileFeatureToken>(['path', ...features]);
  return MAP_TILE_FEATURE_TOKENS.filter((token) => normalized.has(token));
}

function hasExactFeatures(
  variant: Pick<MapTileMaskVariant, 'features'>,
  features: ReadonlySet<MapTileFeatureToken>
): boolean {
  return (
    variant.features.length === features.size &&
    variant.features.every((feature) => features.has(feature))
  );
}

export const MAP_TILE_MASK_GEOMETRY = {
  tileSize: 1254,
  connectorCenter: 627,
  routeWidth: 150,
  connectorThroatLength: 190,
  bridgeWidth: 170,
  portalLandmarkPosition: 'northwest quadrant',
} as const;

const MASK_SELECTION_ORDER = [
  'path-we',
  'path-ws',
  'path-ne',
  'path-wes-junction',
  'path-wen-junction',
  'path-nse-junction',
  'path-nsw-junction',
  'path-ws-river-ne',
  'path-ws-river-ne-waterfall',
  'path-ws-river-ne-waterfall-portal-n',
  'path-ne-river-ws',
  'path-we-pond',
  'path-ws-river-n-pond-ne',
  'path-ws-river-n-waterfall-pond-c',
  'path-ws-pond-ne',
  'path-ne-pond-sw',
  'path-we-lake-s',
  'shore-e-path-ws',
  'shore-n-path-we',
  'shore-s-path-we',
  'shore-w-path-ne',
  'path-we-bridge',
  'path-we-river-ns-bridge',
  'path-we-pond-bridge',
  'path-ns-pond-bridge',
  'shore-e-path-ws-bridge',
  'path-we-portal-nw',
  'path-ws-portal-nw',
  'path-ws-portal-s',
  'path-w-portal-nw-and-path-ne',
  'path-n-portal-nw-and-path-es',
  'path-e-portal-ne-and-path-ws',
  'path-s-portal-sw-and-path-ne',
  'path-wes-junction-pond-w-bridge',
  'path-wes-junction-pond-e-bridge',
  'path-wes-junction-pond-s-bridge',
  'path-wen-junction-pond-w-bridge',
  'path-wen-junction-pond-e-bridge',
  'path-ws-river-ne-portal-nw',
  'path-ws-river-ne-portal-s',
  'path-ws-portal-nw-pond-ne',
  'path-ws-pond-ne-portal-s',
  'path-ws-river-n-waterfall-portal-c-pond-c',
  'path-ws-river-n-pond-ne-portal-nw',
  'path-ws-river-e-pond-ne-portal-s',
  'shore-e-path-ws-river-n',
  'shore-n-path-wes-junction-pond-w-bridge',
  'shore-n-path-wes-junction-pond-e-bridge',
  'shore-n-path-wes-junction-pond-s-bridge',
  'shore-s-path-wen-junction-pond-w-bridge',
  'shore-s-path-wen-junction-pond-e-bridge',
  'shore-e-path-ws-portal-nw-river-n',
  'shore-e-path-ws-portal-nw',
  'shore-e-path-ws-portal-s',
  'path-we-bridge-portal-nw',
  'path-we-river-ns-bridge-portal-nw',
  'path-we-pond-bridge-portal-nw',
  'shore-e-path-ws-bridge-portal-nw',
] as const;

const MASK_SELECTION_RANK = new Map<string, number>(
  MASK_SELECTION_ORDER.map((id, index) => [id, index])
);

function compareMaskSelectionOrder(a: MapTileMaskVariant, b: MapTileMaskVariant): number {
  return (
    (MASK_SELECTION_RANK.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
    (MASK_SELECTION_RANK.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
}

const MIN_MASK_VARIATIONS_PER_FEATURE_SET = 2;

function endpointKey(endpoint: MapTileRouteGroupEndpoint): string {
  return endpoint;
}

function addEndpoint(
  endpoints: MapTileRouteGroupEndpoint[],
  endpoint: MapTileRouteGroupEndpoint
): void {
  if (!endpoints.includes(endpoint)) {
    endpoints.push(endpoint);
  }
}

function portalPositionFor(variant: Pick<MapTileMaskVariantDef, 'layers'>): MapTilePosition | undefined {
  return variant.layers.find((item) => item.kind === 'portal')?.position;
}

function inferRouteGroups(variant: MapTileMaskVariantDef): MapTileRouteGroup[] {
  const groups: MapTileRouteGroup[] = [];
  const portalPosition = portalPositionFor(variant);
  const hasPond = variant.features.includes('pond');
  const hasSea = variant.features.includes('sea');

  for (const layer of variant.layers) {
    if (layer.kind === 'river') {
      if (layer.sides.length >= 2) {
        groups.push({
          kind: 'WATER',
          endpoints: [...layer.sides],
        });
      } else if (layer.sides.length === 1 && (hasPond || hasSea)) {
        groups.push({
          kind: 'WATER',
          endpoints: [layer.sides[0], hasPond ? 'POND' : 'SEA'],
          note: hasPond
            ? 'this river flows from the edge into the contained pond or lake'
            : 'this river flows from the edge into the sea or large shore water',
        });
      }
      continue;
    }

    if (layer.kind !== 'path') continue;

    if (layer.curve === 'portal' && layer.sides.length === 1) {
      groups.push({
        kind: 'PATH',
        endpoints: [layer.sides[0], 'PORTAL'],
        portalPosition,
        note: 'this road ends at the portal landmark',
      });
      continue;
    }

    if (layer.sides.length >= 2) {
      groups.push({
        kind: 'PATH',
        endpoints: [...layer.sides],
      });
      continue;
    }

    if (layer.curve === 'junction' && layer.sides.length === 1) {
      const lastPathGroup = [...groups].reverse().find((group) => group.kind === 'PATH');
      if (lastPathGroup) {
        addEndpoint(lastPathGroup.endpoints, layer.sides[0]);
        if (portalPosition) {
          addEndpoint(lastPathGroup.endpoints, 'PORTAL');
          lastPathGroup.portalPosition = portalPosition;
          lastPathGroup.note = 'this is one connected route with a dead-end branch to the portal landmark';
        }
      } else {
        groups.push({
          kind: 'PATH',
          endpoints: [...layer.sides],
        });
      }
    }
  }

  return groups.map((group) => ({
    ...group,
    endpoints: group.endpoints.filter(
      (endpoint, index, endpoints) =>
        endpoints.findIndex((item) => endpointKey(item) === endpointKey(endpoint)) === index
    ),
  }));
}

const HANDMADE_MAP_TILE_MASK_VARIANT_DEFS: MapTileMaskVariantDef[] = [
  {
    id: 'path-we',
    label: 'Path west-east',
    description: 'Simple left-to-right pebble road.',
    connectors: { W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path.',
    features: [],
    layers: [{ kind: 'path', sides: ['W', 'E'], curve: 'straight' }],
  },
  {
    id: 'path-ws',
    label: 'Path west-south',
    description: 'Adjacent-side path bend from left edge to bottom edge.',
    connectors: { W: 'PATH', S: 'PATH' },
    topology: 'W path curves to S path.',
    features: [],
    layers: [{ kind: 'path', sides: ['W', 'S'], curve: 'soft' }],
  },
  {
    id: 'path-ne',
    label: 'Path north-east',
    description: 'Adjacent-side path bend from top edge to right edge.',
    connectors: { N: 'PATH', E: 'PATH' },
    topology: 'N path curves to E path.',
    features: [],
    layers: [{ kind: 'path', sides: ['N', 'E'], curve: 'soft' }],
  },
  {
    id: 'path-wes-junction',
    label: 'Path west-east-south junction',
    description: 'T-shaped route for scenes with a fork or portal branch.',
    connectors: { W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch.',
    features: [],
    layers: [
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
    ],
  },
  {
    id: 'path-wen-junction',
    label: 'Path west-east-north junction',
    description: 'T-shaped route with a north branch.',
    connectors: { W: 'PATH', E: 'PATH', N: 'PATH' },
    topology: 'W path connects to E path with a N branch.',
    features: [],
    layers: [
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['N'], curve: 'junction' },
    ],
  },
  {
    id: 'path-nse-junction',
    label: 'Path north-south-east junction',
    description: 'T-shaped route with an east branch.',
    connectors: { N: 'PATH', S: 'PATH', E: 'PATH' },
    topology: 'N path connects to S path with an E branch.',
    features: [],
    layers: [
      { kind: 'path', sides: ['N', 'S'], curve: 'straight' },
      { kind: 'path', sides: ['E'], curve: 'junction' },
    ],
  },
  {
    id: 'path-nsw-junction',
    label: 'Path north-south-west junction',
    description: 'T-shaped route with a west branch.',
    connectors: { N: 'PATH', S: 'PATH', W: 'PATH' },
    topology: 'N path connects to S path with a W branch.',
    features: [],
    layers: [
      { kind: 'path', sides: ['N', 'S'], curve: 'straight' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
    ],
  },
  {
    id: 'path-ws-river-ne',
    label: 'Path west-south with river north-east',
    description: 'Default flowing-water tile: road is always present, river bends from top to right without crossing the road.',
    connectors: { W: 'PATH', S: 'PATH', N: 'WATER', E: 'WATER' },
    topology: 'W path curves to S path; N water curves to E water; no bridge because road and water do not cross.',
    features: ['river'],
    layers: [
      { kind: 'river', sides: ['N', 'E'], curve: 'wavy' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'path-ws-river-ne-waterfall',
    label: 'Path west-south with river north-east and waterfall',
    description: 'A continuous river route includes a waterfall marker while road bends west-south.',
    connectors: { W: 'PATH', S: 'PATH', N: 'WATER', E: 'WATER' },
    topology: 'N water curves to E water through a waterfall marker; W path curves to S path.',
    features: ['river', 'waterfall'],
    layers: [
      { kind: 'river', sides: ['N', 'E'], curve: 'wavy' },
      { kind: 'waterfall', position: 'north' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'path-ws-river-ne-waterfall-portal-n',
    label: 'Path west-south with river north-east and portal under waterfall',
    description: 'A continuous river route includes a portal landmark directly under the waterfall while road bends west-south.',
    connectors: { W: 'PATH', S: 'PATH', N: 'WATER', E: 'WATER' },
    topology: 'N water curves to E water through a waterfall marker with the portal directly under the waterfall on the river route; W path curves to S path.',
    features: ['river', 'waterfall', 'portal'],
    routeGroups: [
      {
        kind: 'WATER',
        endpoints: ['N', 'PORTAL', 'E'],
        portalPosition: 'north',
        note: 'use one centered grotto entrance as the portal: top edge river becomes a falling water curtain over the grotto mouth, crystals sit inside the dark mouth, and the lower river leaves from the curtain base before continuing to the East edge at the right-edge center',
      },
      {
        kind: 'PATH',
        endpoints: ['W', 'S'],
      },
    ],
    layers: [
      { kind: 'river', sides: ['N', 'E'], curve: 'wavy' },
      { kind: 'waterfall', position: 'north' },
      { kind: 'portal', position: 'north' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'path-ne-river-ws',
    label: 'Path north-east with river west-south',
    description: 'Alternate flowing-water tile: road is always present, river bends from left to bottom without crossing the road.',
    connectors: { N: 'PATH', E: 'PATH', W: 'WATER', S: 'WATER' },
    topology: 'N path curves to E path; W water curves to S water; no bridge because road and water do not cross.',
    features: ['river'],
    layers: [
      { kind: 'river', sides: ['W', 'S'], curve: 'wavy' },
      { kind: 'path', sides: ['N', 'E'], curve: 'soft' },
    ],
  },
  {
    id: 'path-we-river-ns-bridge',
    label: 'Path west-east with north-south river bridge',
    description: 'Only canonical road-water crossing: road left-right, river top-bottom, bridge at crossing.',
    connectors: { W: 'PATH', E: 'PATH', N: 'WATER', S: 'WATER' },
    topology: 'W path connects to E path and crosses N-S water through a bridge.',
    features: ['river', 'bridge'],
    layers: [
      { kind: 'river', sides: ['N', 'S'], curve: 'wavy' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'bridge', position: 'center' },
    ],
  },
  {
    id: 'path-we-bridge',
    label: 'Path west-east with bridge',
    description: 'Dry bridge or walkway on the path, without adding water.',
    connectors: { W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path through a bridge or raised walkway.',
    features: ['bridge'],
    layers: [
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'bridge', position: 'center' },
    ],
  },
  {
    id: 'path-we-bridge-portal-nw',
    label: 'Path west-east bridge with northwest portal branch',
    description: 'Dry bridge or walkway plus a branch to a portal landmark, without adding water.',
    connectors: { W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path through a bridge or raised walkway, with a dead-end branch to a NW portal landmark.',
    features: ['bridge', 'portal'],
    layers: [
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'bridge', position: 'center' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-we-portal-nw',
    label: 'Path west-east with northwest portal branch',
    description: 'Road continues edge-to-edge and branches to a portal landmark in the upper-left quadrant.',
    connectors: { W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path with a dead-end branch to a NW portal landmark.',
    features: ['portal'],
    layers: [
      { kind: 'path', sides: ['W', 'E'], curve: 'soft' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-ws-portal-nw',
    label: 'Path west-south with northwest portal branch',
    description: 'Adjacent road bend with a V-like branch to a portal landmark in the upper-left quadrant.',
    connectors: { W: 'PATH', S: 'PATH' },
    topology: 'W path curves to S path with a dead-end branch to a NW portal landmark.',
    features: ['portal'],
    layers: [
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-w-portal-nw-and-path-ne',
    label: 'West road ends at northwest portal, separate north-east road',
    description: 'Two independent roads: one enters from W and ends at a NW portal; another connects N to E.',
    connectors: { W: 'PATH', N: 'PATH', E: 'PATH' },
    topology: 'W path ends at a NW portal. Separately, N path curves to E path without joining the portal road.',
    features: ['portal'],
    layers: [
      { kind: 'path', sides: ['W'], curve: 'portal' },
      { kind: 'path', sides: ['N', 'E'], curve: 'soft' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-n-portal-nw-and-path-es',
    label: 'North road ends at northwest portal, separate east-south road',
    description: 'Two independent roads: one enters from N and ends at a NW portal; another connects E to S.',
    connectors: { N: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'N path ends at a NW portal. Separately, E path curves to S path without joining the portal road.',
    features: ['portal'],
    layers: [
      { kind: 'path', sides: ['N'], curve: 'portal' },
      { kind: 'path', sides: ['E', 'S'], curve: 'soft' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-e-portal-ne-and-path-ws',
    label: 'East road ends at northeast portal, separate west-south road',
    description: 'Two independent roads: one enters from E and ends at a NE portal; another connects W to S.',
    connectors: { E: 'PATH', W: 'PATH', S: 'PATH' },
    topology: 'E path ends at a NE portal. Separately, W path curves to S path without joining the portal road.',
    features: ['portal'],
    layers: [
      { kind: 'path', sides: ['E'], curve: 'portal' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'portal', position: 'northeast' },
    ],
  },
  {
    id: 'path-s-portal-sw-and-path-ne',
    label: 'South road ends at southwest portal, separate north-east road',
    description: 'Two independent roads: one enters from S and ends at a SW portal; another connects N to E.',
    connectors: { S: 'PATH', N: 'PATH', E: 'PATH' },
    topology: 'S path ends at a SW portal. Separately, N path curves to E path without joining the portal road.',
    features: ['portal'],
    layers: [
      { kind: 'path', sides: ['S'], curve: 'portal' },
      { kind: 'path', sides: ['N', 'E'], curve: 'soft' },
      { kind: 'portal', position: 'southwest' },
    ],
  },
  {
    id: 'path-ws-river-ne-portal-nw',
    label: 'Path west-south, river north-east, northwest portal',
    description: 'Complex no-bridge tile: road bend, river bend, and portal landmark without a road-water crossing.',
    connectors: { W: 'PATH', S: 'PATH', N: 'WATER', E: 'WATER' },
    topology: 'W path curves to S path; N water curves to E water; portal landmark sits in NW quadrant.',
    features: ['river', 'portal'],
    layers: [
      { kind: 'river', sides: ['N', 'E'], curve: 'wavy' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-ws-river-ne-portal-s',
    label: 'Path west-south portal with river north-east',
    description: 'Flowing-water tile with a road ending at a south portal, without a bridge.',
    connectors: { W: 'PATH', S: 'PORTAL', N: 'WATER', E: 'WATER' },
    topology: 'W path curves to S portal; N water curves to E water; no bridge because road and water do not cross.',
    features: ['river', 'portal'],
    layers: [
      { kind: 'river', sides: ['N', 'E'], curve: 'wavy' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'portal', position: 'south' },
    ],
  },
  {
    id: 'path-we-river-ns-bridge-portal-nw',
    label: 'Path west-east, river north-south bridge, northwest portal',
    description: 'Most complex tile: canonical bridge crossing plus portal branch in the upper-left quadrant.',
    connectors: { W: 'PATH', E: 'PATH', N: 'WATER', S: 'WATER' },
    topology: 'W path connects to E path through a bridge over N-S water, with a dead-end branch to a NW portal landmark.',
    features: ['river', 'bridge', 'portal'],
    layers: [
      { kind: 'river', sides: ['N', 'S'], curve: 'wavy' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'bridge', position: 'center' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-we-pond',
    label: 'Path west-east with southeast pond',
    description: 'Land route with a contained pond or small lake landmark.',
    connectors: { W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path; pond/lake is a contained southeast landmark away from the road.',
    features: ['pond'],
    layers: [
      { kind: 'pond', position: 'southeast' },
      { kind: 'path', sides: ['W', 'E'], curve: 'soft' },
    ],
  },
  {
    id: 'path-wes-junction-pond-ne',
    label: 'Path west-east-south junction with northeast pond',
    description: 'T-shaped route with a contained pond in the free northeast quadrant.',
    connectors: { W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; pond/lake is a contained NE landmark away from the road.',
    features: ['pond'],
    layers: [
      { kind: 'pond', position: 'northeast' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
    ],
  },
  {
    id: 'path-nsw-junction-pond-se',
    label: 'Path north-south-west junction with southeast pond',
    description: 'T-shaped route with a contained pond in the free southeast quadrant.',
    connectors: { N: 'PATH', S: 'PATH', W: 'PATH' },
    topology: 'N path connects to S path with a W branch; pond/lake is a contained SE landmark away from the road.',
    features: ['pond'],
    layers: [
      { kind: 'pond', position: 'southeast' },
      { kind: 'path', sides: ['N', 'S'], curve: 'straight' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
    ],
  },
  {
    id: 'path-ws-river-n-pond-ne',
    label: 'Path west-south with north river mouth into northeast pond',
    description: 'A river enters from the north edge and flows into a contained pond or lake; road bends west-south.',
    connectors: { W: 'PATH', S: 'PATH', N: 'WATER' },
    topology: 'N water flows into the NE pond/lake; W path curves to S path.',
    features: ['river', 'pond'],
    layers: [
      { kind: 'pond', position: 'northeast' },
      { kind: 'river', sides: ['N'], curve: 'mouth', position: 'northeast' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'path-ws-river-n-waterfall-pond-c',
    label: 'North waterfall river into center pond',
    description: 'A river enters from the north edge as a waterfall and flows into a contained pond or lake; road bends west-south.',
    connectors: { W: 'PATH', S: 'PATH', N: 'WATER' },
    topology: 'N water flows through a center waterfall and into the center pond/lake; W path curves to S path.',
    features: ['river', 'waterfall', 'pond'],
    layers: [
      { kind: 'pond', position: 'center' },
      { kind: 'river', sides: ['N'], curve: 'mouth', position: 'center' },
      { kind: 'waterfall', position: 'center' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'path-ws-river-n-waterfall-portal-c-pond-c',
    label: 'North waterfall river into center pond with grotto portal',
    description: 'River enters from the north edge as a waterfall, passes a center grotto portal, and falls into a contained pond; road bends west-south.',
    connectors: { W: 'PATH', S: 'PATH', N: 'WATER' },
    topology: 'N water flows down through a center waterfall/grotto portal and into the center pond/lake; W path curves to S path.',
    features: ['river', 'waterfall', 'pond', 'portal'],
    routeGroups: [
      {
        kind: 'WATER',
        endpoints: ['N', 'PORTAL', 'POND'],
        portalPosition: 'center',
        note: 'this river enters from the top edge, passes the grotto/waterfall portal, and flows into the pond or lake',
      },
      {
        kind: 'PATH',
        endpoints: ['W', 'S'],
      },
    ],
    layers: [
      { kind: 'pond', position: 'center' },
      { kind: 'portal', position: 'center' },
      { kind: 'river', sides: ['N'], curve: 'mouth', position: 'center' },
      { kind: 'waterfall', position: 'center' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'path-we-pond-bridge',
    label: 'Path west-east with pond bridge',
    description: 'Contained pond or ink pool with a path bridge or walkway crossing it.',
    connectors: { W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path through a bridge or walkway over a contained pond/lake.',
    features: ['pond', 'bridge'],
    layers: [
      { kind: 'pond', position: 'center' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'bridge', position: 'center' },
    ],
  },
  {
    id: 'path-ns-pond-bridge',
    label: 'Path north-south with pond bridge',
    description: 'Contained pond or ink pool with a vertical path bridge or walkway crossing it.',
    connectors: { N: 'PATH', S: 'PATH' },
    topology: 'N path connects to S path through a bridge or walkway over a contained pond/lake.',
    features: ['pond', 'bridge'],
    layers: [
      { kind: 'pond', position: 'center' },
      { kind: 'path', sides: ['N', 'S'], curve: 'straight' },
      { kind: 'bridge', position: 'center' },
    ],
  },
  {
    id: 'path-wes-junction-pond-w-bridge',
    label: 'Path west-east-south junction with west pond bridge',
    description: 'T-shaped path with a contained pond under the west section of the main road and a bridge aligned with that road.',
    connectors: { W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; the W side of the main path crosses a contained pond by bridge.',
    features: ['pond', 'bridge'],
    layers: [
      { kind: 'pond', position: 'west' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
      { kind: 'bridge', position: 'west' },
    ],
  },
  {
    id: 'path-wes-junction-pond-e-bridge',
    label: 'Path west-east-south junction with east pond bridge',
    description: 'T-shaped path with a contained pond under the east section of the main road and a bridge aligned with that road.',
    connectors: { W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; the E side of the main path crosses a contained pond by bridge.',
    features: ['pond', 'bridge'],
    layers: [
      { kind: 'pond', position: 'east' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
      { kind: 'bridge', position: 'east' },
    ],
  },
  {
    id: 'path-wes-junction-pond-s-bridge',
    label: 'Path west-east-south junction with south pond bridge',
    description: 'T-shaped path with a contained pond under the south branch and a bridge aligned with that road.',
    connectors: { W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; the S branch crosses a contained pond by bridge.',
    features: ['pond', 'bridge'],
    layers: [
      { kind: 'pond', position: 'south' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
      { kind: 'bridge', position: 'south' },
    ],
  },
  {
    id: 'path-wen-junction-pond-w-bridge',
    label: 'Path west-east-north junction with west pond bridge',
    description: 'T-shaped path with a contained pond under the west section of the main road and a bridge aligned with that road.',
    connectors: { W: 'PATH', E: 'PATH', N: 'PATH' },
    topology: 'W path connects to E path with a N branch; the W side of the main path crosses a contained pond by bridge.',
    features: ['pond', 'bridge'],
    layers: [
      { kind: 'pond', position: 'west' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['N'], curve: 'junction' },
      { kind: 'bridge', position: 'west' },
    ],
  },
  {
    id: 'path-wen-junction-pond-e-bridge',
    label: 'Path west-east-north junction with east pond bridge',
    description: 'T-shaped path with a contained pond under the east section of the main road and a bridge aligned with that road.',
    connectors: { W: 'PATH', E: 'PATH', N: 'PATH' },
    topology: 'W path connects to E path with a N branch; the E side of the main path crosses a contained pond by bridge.',
    features: ['pond', 'bridge'],
    layers: [
      { kind: 'pond', position: 'east' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['N'], curve: 'junction' },
      { kind: 'bridge', position: 'east' },
    ],
  },
  {
    id: 'path-we-pond-bridge-portal-nw',
    label: 'Path west-east with pond bridge and northwest portal',
    description: 'Contained pond or ink pool, bridge/walkway, and a portal landmark without adding a river.',
    connectors: { W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path through a bridge or walkway over a contained pond/lake, with a branch to a NW portal landmark.',
    features: ['pond', 'bridge', 'portal'],
    layers: [
      { kind: 'pond', position: 'center' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'bridge', position: 'center' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-ws-pond-ne',
    label: 'Path west-south with northeast pond',
    description: 'Adjacent road bend with a contained pond or small lake in the northeast.',
    connectors: { W: 'PATH', S: 'PATH' },
    topology: 'W path curves to S path; pond/lake is a contained NE landmark.',
    features: ['pond'],
    layers: [
      { kind: 'pond', position: 'northeast' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'path-ws-pond-ne-portal-s',
    label: 'Path west-south portal with northeast pond',
    description: 'Contained-water tile with a road ending at a south portal and a pond in the northeast.',
    connectors: { W: 'PATH', S: 'PORTAL' },
    topology: 'W path curves to S portal; pond/lake is a contained NE landmark.',
    features: ['pond', 'portal'],
    layers: [
      { kind: 'pond', position: 'northeast' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'portal', position: 'south' },
    ],
  },
  {
    id: 'path-ne-pond-sw',
    label: 'Path north-east with southwest pond',
    description: 'Adjacent road bend with a contained pond or small lake in the southwest.',
    connectors: { N: 'PATH', E: 'PATH' },
    topology: 'N path curves to E path; pond/lake is a contained SW landmark.',
    features: ['pond'],
    layers: [
      { kind: 'pond', position: 'southwest' },
      { kind: 'path', sides: ['N', 'E'], curve: 'soft' },
    ],
  },
  {
    id: 'path-we-lake-s',
    label: 'Path west-east with south lake',
    description: 'Left-right road with a larger contained lake along the lower half.',
    connectors: { W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path; lake sits south of the road.',
    features: ['pond'],
    layers: [
      { kind: 'pond', position: 'south' },
      { kind: 'path', sides: ['W', 'E'], curve: 'soft' },
    ],
  },
  {
    id: 'path-ws-portal-nw-pond-ne',
    label: 'Path west-south with northwest portal and northeast pond',
    description: 'Portal-and-pond tile: adjacent road bend, NW portal landmark, and NE contained water.',
    connectors: { W: 'PATH', S: 'PATH' },
    topology: 'W path curves to S path with a branch to the NW portal landmark; pond/lake is a contained NE landmark.',
    features: ['pond', 'portal'],
    layers: [
      { kind: 'pond', position: 'northeast' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-ws-river-n-pond-ne-portal-nw',
    label: 'Path west-south with northwest portal and north river mouth into northeast pond',
    description: 'River enters from the north edge and flows into the contained NE pond; road bends west-south with a NW portal branch.',
    connectors: { W: 'PATH', S: 'PATH', N: 'WATER' },
    topology: 'N water flows into the NE pond/lake; W path curves to S path with a branch to the NW portal landmark.',
    features: ['river', 'pond', 'portal'],
    layers: [
      { kind: 'pond', position: 'northeast' },
      { kind: 'river', sides: ['N'], curve: 'mouth', position: 'northeast' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'path-ws-river-e-pond-ne-portal-s',
    label: 'Path west-south portal with east river mouth into northeast pond',
    description: 'River enters from the east edge and flows into the contained NE pond; road ends at a south portal.',
    connectors: { W: 'PATH', S: 'PORTAL', E: 'WATER' },
    topology: 'E water flows into the NE pond/lake; W path curves to S portal.',
    features: ['river', 'pond', 'portal'],
    layers: [
      { kind: 'pond', position: 'northeast' },
      { kind: 'river', sides: ['E'], curve: 'mouth', position: 'northeast' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'portal', position: 'south' },
    ],
  },
  {
    id: 'shore-e-path-ws',
    label: 'East shore with west-south path',
    description: 'Sea or large lake occupies the east side while a path connects west to south.',
    connectors: { E: 'SHORE', W: 'PATH', S: 'PATH' },
    topology: 'W path curves to S path beside an E-edge sea or lake shore.',
    features: ['sea'],
    layers: [
      { kind: 'shore', position: 'east' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'shore-n-path-wes-junction',
    label: 'North shore with west-east-south path junction',
    description: 'Sea or large lake occupies the north side while a T-shaped road uses the other three edges.',
    connectors: { N: 'SHORE', W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; north edge is sea/shore.',
    features: ['sea'],
    layers: [
      { kind: 'shore', position: 'north' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
    ],
  },
  {
    id: 'shore-e-path-nsw-junction',
    label: 'East shore with north-south-west path junction',
    description: 'Sea or large lake occupies the east side while a T-shaped road uses the other three edges.',
    connectors: { E: 'SHORE', N: 'PATH', S: 'PATH', W: 'PATH' },
    topology: 'N path connects to S path with a W branch; east edge is sea/shore.',
    features: ['sea'],
    layers: [
      { kind: 'shore', position: 'east' },
      { kind: 'path', sides: ['N', 'S'], curve: 'straight' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
    ],
  },
  {
    id: 'shore-n-path-wes-junction-pond-se',
    label: 'North shore with west-east-south path junction and southeast pond',
    description: 'Sea or large lake occupies the north side; a contained pond sits in the free southeast area.',
    connectors: { N: 'SHORE', W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; north edge is sea/shore; pond/lake is a contained SE landmark.',
    features: ['pond', 'sea'],
    layers: [
      { kind: 'shore', position: 'north' },
      { kind: 'pond', position: 'southeast' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
    ],
  },
  {
    id: 'shore-w-path-nse-junction-pond-ne',
    label: 'West shore with north-south-east path junction and northeast pond',
    description: 'Sea or large lake occupies the west side; a contained pond sits in the free northeast area.',
    connectors: { W: 'SHORE', N: 'PATH', S: 'PATH', E: 'PATH' },
    topology: 'N path connects to S path with an E branch; west edge is sea/shore; pond/lake is a contained NE landmark.',
    features: ['pond', 'sea'],
    layers: [
      { kind: 'shore', position: 'west' },
      { kind: 'pond', position: 'northeast' },
      { kind: 'path', sides: ['N', 'S'], curve: 'straight' },
      { kind: 'path', sides: ['E'], curve: 'junction' },
    ],
  },
  {
    id: 'shore-n-path-wes-junction-pond-w-bridge',
    label: 'North shore with west-east-south junction and west pond bridge',
    description: 'Sea or large lake occupies the north side; a contained pond sits under the west section of the T-road with a bridge aligned along the road.',
    connectors: { N: 'SHORE', W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; north edge is sea/shore; the W side of the main path crosses a contained pond by bridge.',
    features: ['pond', 'sea', 'bridge'],
    layers: [
      { kind: 'shore', position: 'north' },
      { kind: 'pond', position: 'west' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
      { kind: 'bridge', position: 'west' },
    ],
  },
  {
    id: 'shore-n-path-wes-junction-pond-e-bridge',
    label: 'North shore with west-east-south junction and east pond bridge',
    description: 'Sea or large lake occupies the north side; a contained pond sits under the east section of the T-road with a bridge aligned along the road.',
    connectors: { N: 'SHORE', W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; north edge is sea/shore; the E side of the main path crosses a contained pond by bridge.',
    features: ['pond', 'sea', 'bridge'],
    layers: [
      { kind: 'shore', position: 'north' },
      { kind: 'pond', position: 'east' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
      { kind: 'bridge', position: 'east' },
    ],
  },
  {
    id: 'shore-n-path-wes-junction-pond-s-bridge',
    label: 'North shore with west-east-south junction and south pond bridge',
    description: 'Sea or large lake occupies the north side; a contained pond sits under the south branch of the T-road with a bridge aligned along that road.',
    connectors: { N: 'SHORE', W: 'PATH', E: 'PATH', S: 'PATH' },
    topology: 'W path connects to E path with a S branch; north edge is sea/shore; the S branch crosses a contained pond by bridge.',
    features: ['pond', 'sea', 'bridge'],
    layers: [
      { kind: 'shore', position: 'north' },
      { kind: 'pond', position: 'south' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['S'], curve: 'junction' },
      { kind: 'bridge', position: 'south' },
    ],
  },
  {
    id: 'shore-s-path-wen-junction-pond-w-bridge',
    label: 'South shore with west-east-north junction and west pond bridge',
    description: 'Sea or large lake occupies the south side; a contained pond sits under the west section of the T-road with a bridge aligned along the road.',
    connectors: { S: 'SHORE', W: 'PATH', E: 'PATH', N: 'PATH' },
    topology: 'W path connects to E path with a N branch; south edge is sea/shore; the W side of the main path crosses a contained pond by bridge.',
    features: ['pond', 'sea', 'bridge'],
    layers: [
      { kind: 'shore', position: 'south' },
      { kind: 'pond', position: 'west' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['N'], curve: 'junction' },
      { kind: 'bridge', position: 'west' },
    ],
  },
  {
    id: 'shore-s-path-wen-junction-pond-e-bridge',
    label: 'South shore with west-east-north junction and east pond bridge',
    description: 'Sea or large lake occupies the south side; a contained pond sits under the east section of the T-road with a bridge aligned along the road.',
    connectors: { S: 'SHORE', W: 'PATH', E: 'PATH', N: 'PATH' },
    topology: 'W path connects to E path with a N branch; south edge is sea/shore; the E side of the main path crosses a contained pond by bridge.',
    features: ['pond', 'sea', 'bridge'],
    layers: [
      { kind: 'shore', position: 'south' },
      { kind: 'pond', position: 'east' },
      { kind: 'path', sides: ['W', 'E'], curve: 'straight' },
      { kind: 'path', sides: ['N'], curve: 'junction' },
      { kind: 'bridge', position: 'east' },
    ],
  },
  {
    id: 'shore-e-path-ws-river-n',
    label: 'East shore with north river mouth and west-south path',
    description: 'A river enters from the north edge and flows into the east sea or large lake shore; road bends west-south.',
    connectors: { E: 'SHORE', W: 'PATH', S: 'PATH', N: 'WATER' },
    topology: 'N water flows into the E-edge sea/shore; W path curves to S path.',
    features: ['river', 'sea'],
    layers: [
      { kind: 'shore', position: 'east' },
      { kind: 'river', sides: ['N'], curve: 'mouth', position: 'east' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
    ],
  },
  {
    id: 'shore-e-path-ws-bridge',
    label: 'East shore with bridge and west-south path',
    description: 'Sea or large lake occupies the east side while the local path includes a bridge or pier, without adding a river.',
    connectors: { E: 'SHORE', W: 'PATH', S: 'PATH' },
    topology: 'W path curves to S path beside an E-edge sea or lake shore, with a bridge/pier landmark on the path.',
    features: ['sea', 'bridge'],
    layers: [
      { kind: 'shore', position: 'east' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'bridge', position: 'west' },
    ],
  },
  {
    id: 'shore-e-path-ws-bridge-portal-nw',
    label: 'East shore with bridge, portal, and west-south path',
    description: 'Sea or large lake, bridge/pier, and portal landmark without adding a river.',
    connectors: { E: 'SHORE', W: 'PATH', S: 'PATH' },
    topology: 'W path curves to S path beside an E-edge sea or lake shore, with a bridge/pier landmark and a branch to a NW portal.',
    features: ['sea', 'bridge', 'portal'],
    layers: [
      { kind: 'shore', position: 'east' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'bridge', position: 'west' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'shore-e-path-ws-portal-s',
    label: 'East sea with west-south portal path',
    description: 'Sea on the east side with a road ending at a south portal.',
    connectors: { E: 'SHORE', W: 'PATH', S: 'PORTAL' },
    topology: 'W path curves to S portal beside an E-edge sea or lake shore.',
    features: ['sea', 'portal'],
    layers: [
      { kind: 'shore', position: 'east' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'portal', position: 'south' },
    ],
  },
  {
    id: 'shore-e-path-ws-portal-nw',
    label: 'East sea with northwest portal and west-south path',
    description: 'Sea on the east side, NW portal landmark, and an adjacent road bend.',
    connectors: { E: 'SHORE', W: 'PATH', S: 'PATH' },
    topology: 'W path curves to S path beside an E-edge sea, with a branch to the NW portal landmark.',
    features: ['sea', 'portal'],
    layers: [
      { kind: 'shore', position: 'east' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'shore-e-path-ws-portal-nw-river-n',
    label: 'East shore with northwest portal and north river mouth',
    description: 'A river enters from the north edge and flows into the east sea or large lake shore; road bends west-south with a NW portal branch.',
    connectors: { E: 'SHORE', W: 'PATH', S: 'PATH', N: 'WATER' },
    topology: 'N water flows into the E-edge sea/shore; W path curves to S path with a branch to the NW portal landmark.',
    features: ['river', 'sea', 'portal'],
    layers: [
      { kind: 'shore', position: 'east' },
      { kind: 'river', sides: ['N'], curve: 'mouth', position: 'east' },
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'path', sides: ['W'], curve: 'junction' },
      { kind: 'portal', position: 'northwest' },
    ],
  },
  {
    id: 'shore-n-path-we',
    label: 'North sea with west-east path',
    description: 'Sea or large lake occupies the north side while a road connects west to east below it.',
    connectors: { N: 'SHORE', W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path beside an N-edge sea or lake shore.',
    features: ['sea'],
    layers: [
      { kind: 'shore', position: 'north' },
      { kind: 'path', sides: ['W', 'E'], curve: 'soft' },
    ],
  },
  {
    id: 'shore-s-path-we',
    label: 'South sea with west-east path',
    description: 'Sea or large lake occupies the south side while a road connects west to east above it.',
    connectors: { S: 'SHORE', W: 'PATH', E: 'PATH' },
    topology: 'W path connects to E path beside an S-edge sea or lake shore.',
    features: ['sea'],
    layers: [
      { kind: 'shore', position: 'south' },
      { kind: 'path', sides: ['W', 'E'], curve: 'soft' },
    ],
  },
  {
    id: 'shore-w-path-ne',
    label: 'West sea with north-east path',
    description: 'Sea or large lake occupies the west side while a road connects north to east.',
    connectors: { W: 'SHORE', N: 'PATH', E: 'PATH' },
    topology: 'N path curves to E path beside a W-edge sea or lake shore.',
    features: ['sea'],
    layers: [
      { kind: 'shore', position: 'west' },
      { kind: 'path', sides: ['N', 'E'], curve: 'soft' },
    ],
  },
  {
    id: 'path-ws-portal-s',
    label: 'Path west-south with south portal',
    description: 'Good default for interiors and spaceship scenes: a path/corridor bends to a doorway or airlock.',
    connectors: { W: 'PATH', S: 'PORTAL' },
    topology: 'W path curves to S portal.',
    features: ['portal'],
    layers: [
      { kind: 'path', sides: ['W', 'S'], curve: 'soft' },
      { kind: 'portal', position: 'south' },
    ],
  },
];

const OPTIONAL_MAP_TILE_FEATURE_TOKENS = MAP_TILE_FEATURE_TOKENS.filter(
  (token) => token !== 'path'
) as Exclude<MapTileFeatureToken, 'path'>[];

function canonicalFeatureTokens(features: readonly MapTileFeatureToken[]): MapTileFeatureToken[] {
  const normalized = new Set<MapTileFeatureToken>(['path', ...features]);
  if (normalized.has('waterfall')) {
    normalized.add('river');
  }
  return MAP_TILE_FEATURE_TOKENS.filter((token) => normalized.has(token));
}

function canonicalFeatureKey(features: readonly MapTileFeatureToken[]): string {
  return canonicalFeatureTokens(features).join('+');
}

function featureTokenCombinations(): MapTileFeatureToken[][] {
  const result = new Map<string, MapTileFeatureToken[]>();

  const walk = (index: number, combo: MapTileFeatureToken[]) => {
    if (index === OPTIONAL_MAP_TILE_FEATURE_TOKENS.length) {
      const canonical = canonicalFeatureTokens(combo);
      result.set(canonical.join('+'), canonical);
      return;
    }

    walk(index + 1, combo);
    combo.push(OPTIONAL_MAP_TILE_FEATURE_TOKENS[index]);
    walk(index + 1, combo);
    combo.pop();
  };

  walk(0, []);
  return [...result.values()];
}

function countFeatureSetVariants(defs: readonly MapTileMaskVariantDef[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const def of defs) {
    const key = canonicalFeatureKey(def.features);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function connectorAssign(
  connectors: Partial<Record<MapTileSide, 'PATH' | 'WATER' | 'PORTAL' | 'SHORE'>>,
  side: MapTileSide,
  value: 'PATH' | 'WATER' | 'PORTAL' | 'SHORE'
): void {
  if (!connectors[side]) {
    connectors[side] = value;
  }
}

function makeCoverageMaskVariant(
  canonicalFeatures: readonly MapTileFeatureToken[],
  variationIndex: number
): MapTileMaskVariantDef {
  const features = canonicalFeatures.filter((token) => token !== 'path');
  const key = canonicalFeatures.join('-');
  const isPrimary = variationIndex % 2 === 0;
  const featureSet = new Set(canonicalFeatures);
  const hasRiver = featureSet.has('river');
  const hasWaterfall = featureSet.has('waterfall');
  const hasPond = featureSet.has('pond');
  const hasSea = featureSet.has('sea');
  const hasBridge = featureSet.has('bridge');
  const hasPortal = featureSet.has('portal');
  const connectors: MapTileMaskVariantDef['connectors'] = {};
  const layers: MapTileLayer[] = [];
  const routeGroups: MapTileRouteGroup[] = [];
  let pathSides: MapTileSide[];
  let shorePosition: MapTilePosition | undefined;
  let shoreSide: MapTileSide | undefined;

  if (hasBridge) {
    if (hasSea) {
      pathSides = isPrimary ? ['W', 'E'] : ['N', 'S'];
      shorePosition = isPrimary ? 'south' : 'east';
      shoreSide = isPrimary ? 'S' : 'E';
    } else {
      pathSides = isPrimary ? ['W', 'E'] : ['N', 'S'];
    }
  } else if (hasSea) {
    pathSides = isPrimary ? ['W', 'S'] : ['N', 'E'];
    shorePosition = isPrimary ? 'east' : 'south';
    shoreSide = isPrimary ? 'E' : 'S';
  } else {
    pathSides = isPrimary ? ['W', 'S'] : ['N', 'E'];
  }

  for (const side of pathSides) {
    connectorAssign(connectors, side, 'PATH');
  }

  if (hasSea) {
    layers.push({ kind: 'shore', position: shorePosition });
    connectorAssign(connectors, shoreSide!, 'SHORE');
  }

  let pondPosition: MapTilePosition = isPrimary ? 'northeast' : 'southwest';
  if (hasBridge) {
    pondPosition = 'center';
  } else if (hasSea) {
    pondPosition = shorePosition === 'east' ? 'northwest' : 'northeast';
  }
  if (hasPond) {
    layers.push({ kind: 'pond', position: pondPosition });
  }

  if (hasRiver) {
    if (hasSea) {
      let riverSide: MapTileSide;
      if (hasBridge) {
        riverSide = shorePosition === 'south' ? 'N' : 'W';
      } else {
        riverSide = shorePosition === 'south' ? 'W' : 'N';
      }
      layers.push({ kind: 'river', sides: [riverSide], curve: 'mouth', position: shorePosition });
      if (hasWaterfall) {
        layers.push({ kind: 'waterfall', position: riverSide === 'W' ? 'west' : 'north' });
      }
      connectorAssign(connectors, riverSide, 'WATER');
      routeGroups.push({
        kind: 'WATER',
        endpoints: [riverSide, 'SEA'],
        note: 'this river flows from the edge into the sea or large shore water',
      });
    } else if (hasPond) {
      const riverSide: MapTileSide = hasBridge
        ? (isPrimary ? 'N' : 'W')
        : (isPrimary ? 'N' : 'W');
      layers.push({ kind: 'river', sides: [riverSide], curve: 'mouth', position: pondPosition });
      if (hasWaterfall) {
        layers.push({ kind: 'waterfall', position: riverSide === 'W' ? 'west' : 'north' });
      }
      connectorAssign(connectors, riverSide, 'WATER');
      routeGroups.push({
        kind: 'WATER',
        endpoints: [riverSide, 'POND'],
        note: 'this river flows from the edge into the contained pond or lake',
      });
    } else {
      const riverSides: MapTileSide[] = hasBridge
        ? (isPrimary ? ['N', 'S'] : ['W', 'E'])
        : (isPrimary ? ['N', 'E'] : ['W', 'S']);
      layers.push({ kind: 'river', sides: riverSides, curve: 'wavy' });
      if (hasWaterfall) {
        layers.push({ kind: 'waterfall', position: riverSides.includes('N') ? 'north' : 'west' });
      }
      for (const side of riverSides) {
        connectorAssign(connectors, side, 'WATER');
      }
      routeGroups.push({ kind: 'WATER', endpoints: riverSides });
    }
  }

  layers.push({ kind: 'path', sides: pathSides, curve: 'soft' });
  routeGroups.push({ kind: 'PATH', endpoints: pathSides });

  if (hasPortal) {
    const portalSide = pondPosition === 'northwest' && pathSides.includes('S')
      ? 'S'
      : pathSides[0];
    const portalPositionBySide: Record<MapTileSide, MapTilePosition> = {
      N: 'northwest',
      E: 'northeast',
      S: 'southwest',
      W: 'northwest',
    };
    const portalPosition = portalPositionBySide[portalSide];
    layers.push({ kind: 'path', sides: [portalSide], curve: 'portal' });
    layers.push({ kind: 'portal', position: portalPosition });
    routeGroups.push({
      kind: 'PATH',
      endpoints: [portalSide, 'PORTAL'],
      portalPosition,
      note: 'this road reaches the portal landmark',
    });
  }

  if (hasBridge) {
    layers.push({ kind: 'bridge', position: 'center' });
  }

  const labelFeatureText = canonicalFeatures.join(' + ');
  const spatialText = isPrimary
    ? 'primary west-south road layout'
    : hasSea && !hasBridge
      ? 'alternate north-east road layout'
      : 'alternate west-east road layout';

  return {
    id: `coverage-${key}-${variationIndex + 1}`,
    label: `Coverage ${labelFeatureText} ${variationIndex + 1}`,
    description: `Generated exact-token fallback mask for ${labelFeatureText}; ${spatialText}.`,
    connectors,
    topology: `Exact feature coverage for ${labelFeatureText}; ${spatialText}.`,
    features,
    routeGroups,
    layers,
  };
}

function buildCoverageMaskVariantDefs(
  handmadeDefs: readonly MapTileMaskVariantDef[]
): MapTileMaskVariantDef[] {
  const coverageDefs: MapTileMaskVariantDef[] = [];
  const counts = countFeatureSetVariants(handmadeDefs);

  for (const canonicalFeatures of featureTokenCombinations()) {
    const key = canonicalFeatures.join('+');
    const existingCount = counts.get(key) ?? 0;
    const neededCount = Math.max(0, MIN_MASK_VARIATIONS_PER_FEATURE_SET - existingCount);
    for (let index = 0; index < neededCount; index += 1) {
      coverageDefs.push(makeCoverageMaskVariant(canonicalFeatures, existingCount + index));
    }
  }

  return coverageDefs;
}

const COVERAGE_MAP_TILE_MASK_VARIANT_DEFS = buildCoverageMaskVariantDefs(
  HANDMADE_MAP_TILE_MASK_VARIANT_DEFS
);

const MAP_TILE_MASK_VARIANT_DEFS: MapTileMaskVariantDef[] = [
  ...HANDMADE_MAP_TILE_MASK_VARIANT_DEFS,
  ...COVERAGE_MAP_TILE_MASK_VARIANT_DEFS,
];

export const MAP_TILE_MASK_VARIANTS: MapTileMaskVariant[] = MAP_TILE_MASK_VARIANT_DEFS.map(
  (variant) => ({
    ...variant,
    routeGroups: variant.routeGroups ?? inferRouteGroups(variant),
    features: withMandatoryPathFeature(variant.features),
  })
);

export function normalizeMapTileFeatures(
  features: readonly string[] = []
): Set<MapTileFeatureToken> {
  const text = [...features].join(' ').toLowerCase();
  const normalized = new Set<MapTileFeatureToken>(['path']);

  const addIf = (feature: MapTileFeatureToken, pattern: RegExp) => {
    if (pattern.test(text)) normalized.add(feature);
  };
  const bridgeIsOnlyBackground =
    /\b(?:distant|decorative|symbolic|broken|inaccessible|background|outside|through|visible through|seen through)\b.{0,48}\b(?:bridge|bridges)\b/.test(text) ||
    /\b(?:bridge|bridges)\b.{0,48}\b(?:distant|decorative|symbolic|broken|inaccessible|background|outside|window|porthole|screen|sky|space|memory|dream)\b/.test(text);

  addIf('river', /\b(river|stream|creek|brook|flowing water)\b/);
  addIf('waterfall', /\b(waterfall|falling water|water curtain|cascade)\b/);
  addIf('pond', /\b(pond|lake|lagoon|ink pool|ink puddle|puddle|pool)\b/);
  addIf('sea', /\b(sea|ocean|shore|coast|beach|bay)\b/);
  addIf('portal', /\b(portal|door|doorway|arch|gate|airlock|hatch|entrance|cave|cavern|grotto|tunnel|crystal)\b/);
  if (!bridgeIsOnlyBackground) {
    addIf('bridge', /\b(bridge|bridged|pier|plank|walkway|napkin strip|cloth walkway|raised crossing|crosses (?:the )?(?:river|stream|creek|brook|water|ink|puddle|pool)|crossing (?:the )?(?:river|stream|creek|brook|water|ink|puddle|pool)|over (?:water|ink|puddle|pool)|across (?:water|ink|puddle|pool)|water crossing|ink crossing)\b/);
  }

  for (const raw of features) {
    const key = raw.trim().toLowerCase();
    if ((MAP_TILE_FEATURE_TOKENS as readonly string[]).includes(key)) {
      normalized.add(key as MapTileFeatureToken);
    }
  }

  if (normalized.has('waterfall')) {
    normalized.add('river');
  }

  return normalized;
}

export function canonicalizeMapTileFeatures(
  features: readonly string[] = []
): MapTileFeatureToken[] {
  return MAP_TILE_FEATURE_TOKENS.filter((token) => normalizeMapTileFeatures(features).has(token));
}

export function selectMapTileMask(params: {
  requiredFeatures?: readonly string[];
  description?: string;
  randomizeDirections?: boolean;
  random?: () => number;
}): MapTileMaskVariant {
  const features = normalizeMapTileFeatures(params.requiredFeatures ?? []);
  const description = params.description?.toLowerCase() ?? '';
  if (/\b(waterfall|falling water|water curtain|cascade)\b/.test(description)) {
    features.add('river');
    features.add('waterfall');
  }

  const find = (id: string) => {
    const variant = MAP_TILE_MASK_VARIANTS.find((item) => item.id === id);
    if (!variant) throw new Error(`Missing map tile mask variant: ${id}`);
    return variant;
  };
  const choose = (ids: readonly string[]) => {
    if ((params.randomizeDirections ?? true) === false || ids.length === 1) {
      return find(ids[0]);
    }
    const raw = params.random?.() ?? Math.random();
    const value = Number.isFinite(raw) ? Math.min(0.999999999, Math.max(0, raw)) : 0;
    return find(ids[Math.floor(value * ids.length)]);
  };

  const exactMatches = MAP_TILE_MASK_VARIANTS
    .filter((variant) => hasExactFeatures(variant, features))
    .sort(compareMaskSelectionOrder);

  if (exactMatches.length === 0) {
    const requested = featureKey([...features]) || 'none';
    throw new Error(
      `No exact map tile mask for requiredFeatures: ${requested}. Add a mask with exactly these features; do not reuse a mask that adds extra feature tokens.`
    );
  }

  const needsWaterfallGrotto =
    features.has('river') &&
    features.has('waterfall') &&
    features.has('pond') &&
    features.has('portal') &&
    /\b(waterfall|falling water|water curtain|cascade)\b/.test(description) &&
    /\b(grotto|cave|cavern|portal|entrance|behind the falling water|behind the waterfall)\b/.test(description);

  if (needsWaterfallGrotto) {
    const waterfallMask = exactMatches.find(
      (variant) => variant.id === 'path-ws-river-n-waterfall-portal-c-pond-c'
    );
    if (waterfallMask) return waterfallMask;
  }

  return choose(exactMatches.map((variant) => variant.id));
}
