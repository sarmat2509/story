import assert from 'node:assert/strict';
import { buildMapTilePromptParts, MAP_TILE_STRUCTURE_SYSTEM_PROMPT } from '../image';

function testMapTilePromptKeepsMaskGeometryAndStandardPathEdges() {
  const { prompt, systemInstruction } = buildMapTilePromptParts({
    maskId: 'path-we-portal-nw',
    maskTopology: 'W path connects to E path with a dead-end branch to a NW portal landmark.',
    maskConnectors: { W: 'PATH', E: 'PATH' },
    maskRouteGroups: [
      {
        kind: 'PATH',
        endpoints: ['W', 'E', 'PORTAL'],
        portalPosition: 'northwest',
        note: 'this is one connected route with a dead-end branch to the portal landmark',
      },
    ],
    tileBrief: {
      description: 'Spaceship control room with an airlock and porthole.',
      requiredFeatures: ['path', 'portal'],
    },
  });

  assert.strictEqual(systemInstruction, MAP_TILE_STRUCTURE_SYSTEM_PROMPT);
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Image 1 is the geometry map in final canvas coordinates.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Follow Image 1 for road, water, bridge, connector mouths, edge positions, width, curves, junctions, and route connections.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Use portal markers as entrance placement and route contact points; design each entrance from the story.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Use the route list as the map contract.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('A WATER route that includes a PORTAL places the story entrance on the water route at the portal marker.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('A WATER route with a waterfall marker stays continuous through the waterfall marker and into its endpoint.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Show waterfalls as a top-down water curtain crossing over the portal mouth while preserving the flat route footprint.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('ordinary river on the high side, a short falling-water curtain at the ledge, and ordinary lower river after the curtain'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('For a waterfall plus portal route, use one grotto mouth at the portal marker'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Style every PATH with two continuous light warm-stone edge lines.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Fill the PATH interior according to the tile brief and story reference images.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Style the tile according to the tile brief and story reference images.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Represent waterfall, cave, grotto, ledge, cliff, and valley words from the tile brief as flat plan-view map landmarks locked to Image 1.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Route labels, edge names, arrows, and words in the prompt are instructions only; the tile image uses unlabeled natural scenery.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('Camera: strict orthographic top-down board-game map tile.'));
  assert.ok(MAP_TILE_STRUCTURE_SYSTEM_PROMPT.includes('The route geometry is a flat plan-view footprint in the square canvas.'));
  assert.ok(!prompt.includes('Create one square 1:1 illustrated board-game map tile.'));
  assert.ok(!prompt.includes('Image 1 is the geometry map in final canvas coordinates.'));
  assert.ok(!prompt.includes('Style every PATH with two continuous light warm-stone edge lines.'));
  assert.ok(prompt.includes('Geometry:'));
  assert.ok(prompt.includes('Routes from Image 1:'));
  assert.ok(prompt.includes('PATH 1: left edge <-> right edge; branch to upper-left area portal'));
  assert.ok(prompt.includes('Edge mouths: right edge=PATH; left edge=PATH.'));
  assert.ok(prompt.includes('Closed scenery edges: top edge, bottom edge.'));
  assert.ok(!prompt.includes('Final geometry lock:'));
  assert.ok(!prompt.includes('Do not'));
  assert.ok(!prompt.includes('No road'));
  assert.ok(!prompt.includes('Only draw'));
  assert.ok(!prompt.includes('ground, floor, metal, cloth, stone'));
  assert.ok(!prompt.includes('scenery, materials, objects, landmarks, water/liquid'));
  assert.ok(!prompt.includes('Use abstract decorative marks for writing'));
  assert.ok(!prompt.includes('forest pebble trail, library floor path, cave stone trail'));
}

function testMapTilePromptDescribesIndependentRouteGroups() {
  const { prompt, systemInstruction } = buildMapTilePromptParts({
    maskId: 'path-w-portal-nw-and-path-ne',
    maskTopology: 'W path ends at a NW portal. Separately, N path curves to E path without joining the portal road.',
    maskConnectors: { W: 'PATH', N: 'PATH', E: 'PATH' },
    maskRouteGroups: [
      {
        kind: 'PATH',
        endpoints: ['W', 'PORTAL'],
        portalPosition: 'northwest',
        note: 'this road ends at the portal landmark',
      },
      {
        kind: 'PATH',
        endpoints: ['N', 'E'],
      },
    ],
    tileBrief: {
      description: 'Forest clearing with compass stones and a locked gate.',
      requiredFeatures: ['path', 'portal'],
    },
  });

  assert.strictEqual(systemInstruction, MAP_TILE_STRUCTURE_SYSTEM_PROMPT);
  assert.ok(prompt.includes('PATH 1: left edge -> upper-left area portal'));
  assert.ok(prompt.includes('PATH 2: top edge <-> right edge'));
  assert.ok(prompt.includes('Edge mouths: top edge=PATH; right edge=PATH; left edge=PATH.'));
  assert.ok(prompt.includes('Closed scenery edges: bottom edge.'));
  assert.ok(!prompt.includes('do not add shortcuts'));
  assert.ok(!prompt.includes('No road/corridor'));
}

function testMapTilePromptDescribesWaterRouteThroughPortalSequentially() {
  const { prompt } = buildMapTilePromptParts({
    maskId: 'path-ws-river-ne-waterfall-portal-n',
    maskConnectors: { N: 'WATER', E: 'WATER', W: 'PATH', S: 'PATH' },
    maskRouteGroups: [
      {
        kind: 'WATER',
        endpoints: ['N', 'PORTAL', 'E'],
        portalPosition: 'north',
      },
      {
        kind: 'PATH',
        endpoints: ['W', 'S'],
      },
    ],
    tileBrief: {
      description: 'Forest waterfall with a crystal cave mouth.',
      requiredFeatures: ['path', 'river', 'waterfall', 'portal'],
    },
  });

  assert.ok(prompt.includes('WATER 1: top edge water -> top area portal -> right edge water'));
  assert.ok(prompt.includes('PATH 2: left edge <-> bottom edge'));
  assert.ok(prompt.includes('Edge mouths: top edge=WATER; right edge=WATER; bottom edge=PATH; left edge=PATH.'));
}

testMapTilePromptKeepsMaskGeometryAndStandardPathEdges();
testMapTilePromptDescribesIndependentRouteGroups();
testMapTilePromptDescribesWaterRouteThroughPortalSequentially();
console.log('mapTilePromptRules tests passed');
