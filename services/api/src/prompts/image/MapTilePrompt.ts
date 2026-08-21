import { optionalNoReferenceLabelsRule } from './ImageTextPolicy';

/**
 * Map tile image prompt rules.
 *
 * This prompt is intentionally separate from DirectorPrompt. Director decides
 * which story details belong on the map; this system prompt fixes the visual
 * grammar of the tile and the strict geometry-control contract.
 */

type MapTilePromptConnector = 'PATH' | 'WATER' | 'PORTAL' | 'SHORE';
type MapTilePromptSide = 'N' | 'E' | 'S' | 'W';
type MapTilePromptRouteEndpoint = MapTilePromptSide | 'PORTAL' | 'POND' | 'SEA';
type MapTilePromptRouteGroup = {
  kind: 'PATH' | 'WATER';
  endpoints: MapTilePromptRouteEndpoint[];
  portalPosition?: string;
  note?: string;
};

const SIDE_ORDER: MapTilePromptSide[] = ['N', 'E', 'S', 'W'];

const SHORT_SIDE_LABELS: Record<MapTilePromptSide, string> = {
  N: 'top edge',
  E: 'right edge',
  S: 'bottom edge',
  W: 'left edge',
};

const SHORT_POSITION_LABELS: Record<string, string> = {
  center: 'center',
  north: 'top area',
  east: 'right area',
  south: 'bottom area',
  west: 'left area',
  northwest: 'upper-left area',
  northeast: 'upper-right area',
  southwest: 'lower-left area',
  southeast: 'lower-right area',
};

function formatShortConnectorList(
  connectors?: Partial<Record<MapTilePromptSide, MapTilePromptConnector>>
): string {
  if (!connectors) return '';
  return SIDE_ORDER.flatMap((side) => {
    const connector = connectors[side];
    return connector ? [`${SHORT_SIDE_LABELS[side]}=${connector}`] : [];
  }).join('; ');
}

function formatClosedEdges(
  connectors?: Partial<Record<MapTilePromptSide, MapTilePromptConnector>>
): string {
  if (!connectors) return '';
  const closedEdges = SIDE_ORDER.filter((side) => !connectors[side]);
  return closedEdges.map((side) => SHORT_SIDE_LABELS[side]).join(', ');
}

function formatRouteEndpointShort(
  endpoint: MapTilePromptRouteEndpoint,
  connectors?: Partial<Record<MapTilePromptSide, MapTilePromptConnector>>,
  portalPosition?: string
): string {
  if (endpoint === 'PORTAL') {
    const position = portalPosition
      ? SHORT_POSITION_LABELS[portalPosition] ?? portalPosition
      : 'portal area';
    return `${position} portal`;
  }
  if (endpoint === 'POND') {
    return 'pond/lake';
  }
  if (endpoint === 'SEA') {
    return 'sea/shore';
  }

  const connector = connectors?.[endpoint];
  const label = SHORT_SIDE_LABELS[endpoint];

  if (connector === 'PORTAL') {
    return `${label} portal`;
  }
  if (connector === 'WATER') {
    return `${label} water`;
  }
  if (connector === 'SHORE') {
    return `${label} shore`;
  }
  return `${label}`;
}

function formatRouteGroups(
  routeGroups?: MapTilePromptRouteGroup[],
  connectors?: Partial<Record<MapTilePromptSide, MapTilePromptConnector>>
): string {
  if (!routeGroups?.length) return '';

  const lines = routeGroups.map((group, index) => {
    const portalEndpoint = group.endpoints.includes('PORTAL') ? 'PORTAL' : null;
    const sideEndpoints = group.endpoints.filter(
      (endpoint): endpoint is MapTilePromptSide =>
        endpoint !== 'PORTAL' && endpoint !== 'POND' && endpoint !== 'SEA'
    );
    const waterBodyEndpoint = group.endpoints.find(
      (endpoint): endpoint is 'POND' | 'SEA' => endpoint === 'POND' || endpoint === 'SEA'
    );
    const formattedSides = sideEndpoints.map((endpoint) =>
      formatRouteEndpointShort(endpoint, connectors, group.portalPosition)
    );
    const formattedPortal = portalEndpoint
      ? formatRouteEndpointShort(portalEndpoint, connectors, group.portalPosition)
      : '';
    const formattedWaterBody = waterBodyEndpoint
      ? formatRouteEndpointShort(waterBodyEndpoint, connectors, group.portalPosition)
      : '';

    let routeText: string;
    if (group.kind === 'WATER' && formattedPortal && formattedWaterBody && formattedSides.length === 1) {
      routeText = `${formattedSides[0]} -> ${formattedPortal} -> ${formattedWaterBody}`;
    } else if (group.kind === 'WATER' && formattedPortal && formattedSides.length >= 2) {
      routeText = group.endpoints
        .map((endpoint) => formatRouteEndpointShort(endpoint, connectors, group.portalPosition))
        .join(' -> ');
    } else if (formattedPortal && formattedSides.length >= 2) {
      routeText = `${formattedSides[0]} <-> ${formattedSides[1]}; branch to ${formattedPortal}`;
    } else if (formattedPortal && formattedSides.length === 1) {
      routeText = `${formattedSides[0]} -> ${formattedPortal}`;
    } else if (formattedWaterBody && formattedSides.length === 1) {
      routeText = `${formattedSides[0]} -> ${formattedWaterBody}`;
    } else {
      routeText = group.endpoints
        .map((endpoint) => formatRouteEndpointShort(endpoint, connectors, group.portalPosition))
        .join(' <-> ');
    }

    const noteText = group.kind === 'WATER' && group.note ? `; ${group.note}` : '';
    return `- ${group.kind} ${index + 1}: ${routeText}${noteText}`;
  });

  return [
    'Routes from Image 1:',
    ...lines,
  ].join('\n');
}

function buildMaskGeometrySection(params: {
  maskId?: string;
  maskTopology?: string;
  maskConnectors?: Partial<Record<MapTilePromptSide, MapTilePromptConnector>>;
  maskRouteGroups?: MapTilePromptRouteGroup[];
}): string {
  const connectorText = formatShortConnectorList(params.maskConnectors);
  const routeGroupText = formatRouteGroups(params.maskRouteGroups, params.maskConnectors);
  const closedEdgesText = formatClosedEdges(params.maskConnectors);
  const lines = [
    'Geometry:',
    routeGroupText,
    connectorText ? `Edge mouths: ${connectorText}.` : '',
    closedEdgesText ? `Closed scenery edges: ${closedEdgesText}.` : '',
  ].filter(Boolean);

  return lines.length > 1 ? lines.join('\n') : '';
}

const MAP_TILE_PLAN_VIEW_CONVERSION = [
  'Plan-view conversion:',
  '- Treat the tile brief as a materials-and-landmarks inventory, not as camera framing.',
  '- The final tile must stay orthographic top-down even when the brief mentions slopes, cliffs, mountainsides, cave mouths, sky, clouds, mist, steam, or weather.',
  '- Omit sky, horizon, and cloud objects. Show storm/cloud/weather only as subtle gray surface washes, shadow patches, puddles, or mist marks on the map surface.',
  '- Draw mountains, cliffs, slopes, ledges, rifts, and valleys as flat contour bands, rock polygons, cracks, ridge lines, and texture regions seen from above.',
  '- Draw cave, tunnel, grotto, doorway, or portal features as flat dark entrance marks attached to the Image 1 route contact point, never as a front-facing hole in a wall.',
  '- Never copy the portal marker\'s drawn arch/door shape from Image 1. Use only its route contact point.',
  '- Keep Image 1 route geometry and edge connector mouths visible and placeable.',
].join('\n');

export const MAP_TILE_STRUCTURE_SYSTEM_PROMPT = `
Create one square 1:1 illustrated board-game map tile.

Image 1 is the geometry map in final canvas coordinates.
Follow Image 1 for road, water, bridge, connector mouths, edge positions, width, curves, junctions, and route connections.
Use portal markers as entrance placement and route contact points; design each entrance from the story.
The portal marker shape in Image 1 is only a placement/contact marker. Do not copy its drawn arch, door shape, color, or front-facing perspective.

Hard camera rule: the final image must look like a printed board-game map viewed directly from above.
Do not draw a landscape illustration, eye-level scene, tilted camera view, horizon line, sky band, skyline, foreground/background depth, vanishing point, or distant background.
If the tile brief or story references mention sky, clouds, weather, mountain slopes, cave mouths, cliffs, ledges, valleys, or waterfalls, convert them into flat plan-view map symbols and surface textures locked to Image 1.
Story illustration references are for materials, colors, landmark motifs, and texture language only. Never copy their camera angle, framing, perspective, horizon, character staging, or scene composition.

Use the route list as the map contract.
A WATER route ending at pond/lake or sea/shore is a river mouth; keep its edge connector and endpoint.
A WATER route that includes a PORTAL places the story entrance on the water route at the portal marker.
A WATER route with a waterfall marker stays continuous through the waterfall marker and into its endpoint.
Show waterfalls as a top-down water curtain crossing over the portal mouth while preserving the flat route footprint.
For a waterfall marker, draw ordinary river on the high side, a short falling-water curtain at the ledge, and ordinary lower river after the curtain.
For a waterfall plus portal route, place the story entrance at the portal marker; the water curtain overlaps that entrance, and the lower river starts at the curtain base before reaching its edge connector center.
Style every PATH with two continuous light warm-stone edge lines.
Fill the PATH interior according to the tile brief and story reference images.
Style the tile according to the tile brief and story reference images.
Represent waterfall, cave, grotto, ledge, cliff, and valley words from the tile brief as flat plan-view map landmarks locked to Image 1.
Represent a cave, tunnel, or portal as a flat dark entrance mark at the route contact point, not as a front-facing hole in a mountainside.
Represent cliffs, slopes, ledges, and mountains as contour bands, rock patches, ridge marks, or shaded surface regions seen from above, not as side-view walls.
${optionalNoReferenceLabelsRule()}

Camera: strict orthographic top-down board-game map tile.
The route geometry is a flat plan-view footprint in the square canvas.
Objects and textures may have small painted height and shadows while the route positions stay top-down.
Fill the square edge to edge with coherent scenery.
`.trim();

export function buildMapTilePrompt(params: {
  tileBrief: {
    description?: string;
    requiredFeatures?: string[];
  };
  storyContext?: string;
  maskId?: string;
  maskTopology?: string;
  maskConnectors?: Partial<Record<MapTilePromptSide, MapTilePromptConnector>>;
  maskRouteGroups?: MapTilePromptRouteGroup[];
}): string {
  const { tileBrief, storyContext } = params;
  const sections = [
    buildMaskGeometrySection(params),
    storyContext ? `Story context:\n${storyContext}` : '',
    'Tile brief:',
    tileBrief.description ? `Description: ${tileBrief.description}` : '',
    tileBrief.requiredFeatures?.length
      ? `Required features: ${tileBrief.requiredFeatures.join(', ')}`
      : '',
    MAP_TILE_PLAN_VIEW_CONVERSION,
  ].filter(Boolean);

  return sections.join('\n\n');
}

export function buildMapTilePromptParts(params: Parameters<typeof buildMapTilePrompt>[0]): {
  systemInstruction: string;
  prompt: string;
} {
  return {
    systemInstruction: MAP_TILE_STRUCTURE_SYSTEM_PROMPT,
    prompt: buildMapTilePrompt(params),
  };
}
