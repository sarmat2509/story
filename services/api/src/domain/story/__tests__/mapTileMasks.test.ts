import assert from 'node:assert/strict';
import {
  canonicalizeMapTileFeatures,
  normalizeMapTileFeatures,
  MAP_TILE_FEATURE_TOKENS,
  MAP_TILE_MASK_GEOMETRY,
  MAP_TILE_MASK_VARIANTS,
  type MapTileLayer,
  type MapTileFeatureToken,
  selectMapTileMask,
} from '../mapTileMasks';

function sortedFeatures(features: readonly string[]): string[] {
  return MAP_TILE_FEATURE_TOKENS.filter((token) => features.includes(token));
}

function assertExactFeatures(actual: readonly string[], expected: readonly MapTileFeatureToken[]) {
  assert.deepEqual(sortedFeatures(actual), sortedFeatures(expected));
}

function testMaskCatalogHasStableGeometry() {
  assert.equal(MAP_TILE_MASK_GEOMETRY.tileSize, 1254);
  assert.equal(MAP_TILE_MASK_GEOMETRY.routeWidth, 150);
  assert.equal(MAP_TILE_MASK_GEOMETRY.bridgeWidth, 170);
  assert.ok(MAP_TILE_MASK_VARIANTS.length >= 12);
  for (const variant of MAP_TILE_MASK_VARIANTS) {
    assert.ok(
      variant.layers.some((layer) => layer.kind === 'path'),
      `Mask ${variant.id} must include a path layer`
    );
    assert.ok(
      variant.routeGroups.some((group) => group.kind === 'PATH'),
      `Mask ${variant.id} must include a PATH route group`
    );
    assert.ok(variant.features.includes('path'), `Mask ${variant.id} must include path feature`);
    assert.deepEqual(
      sortedFeatures(variant.features),
      [...variant.features],
      `Mask ${variant.id} feature order must follow MAP_TILE_FEATURE_TOKENS`
    );
  }
}

function testIndependentRouteGroupsAreExplicit() {
  const variant = MAP_TILE_MASK_VARIANTS.find(
    (item) => item.id === 'path-w-portal-nw-and-path-ne'
  );
  assert.ok(variant);
  assert.deepEqual(
    variant.routeGroups.filter((group) => group.kind === 'PATH').map((group) => group.endpoints),
    [
      ['W', 'PORTAL'],
      ['N', 'E'],
    ]
  );

  const pondBridgePortal = MAP_TILE_MASK_VARIANTS.find(
    (item) => item.id === 'path-we-pond-bridge-portal-nw'
  );
  assert.ok(pondBridgePortal);
  assert.deepEqual(
    pondBridgePortal.routeGroups.filter((group) => group.kind === 'PATH').map((group) => group.endpoints),
    [['W', 'E', 'PORTAL']]
  );
}

function testFeatureNormalization() {
  const features = normalizeMapTileFeatures(['portal', 'flowing water']);

  assert.ok(features.has('path'));
  assert.ok(features.has('river'));
  assert.ok(features.has('portal'));
  assert.ok(!features.has('bridge'));

  const waterfallFeatures = normalizeMapTileFeatures(['waterfall', 'crystal grotto']);
  assert.ok(waterfallFeatures.has('path'));
  assert.ok(waterfallFeatures.has('river'));
  assert.ok(waterfallFeatures.has('waterfall'));
  assert.ok(waterfallFeatures.has('portal'));

  const squareFeatures = normalizeMapTileFeatures(['river', 'cathedral plaza']);
  assert.ok(squareFeatures.has('path'));
  assert.ok(squareFeatures.has('river'));
  assert.ok(!squareFeatures.has('bridge'));

  const inkCrossingFeatures = normalizeMapTileFeatures(['ink pool', 'napkin strip']);
  assert.ok(inkCrossingFeatures.has('pond'));
  assert.ok(inkCrossingFeatures.has('bridge'));
  assert.ok(!inkCrossingFeatures.has('river'));

  const backgroundBridgeFeatures = normalizeMapTileFeatures([
    'distant shimmering bridge outside the spaceship porthole',
    'airlock hatch',
  ]);
  assert.ok(backgroundBridgeFeatures.has('path'));
  assert.ok(backgroundBridgeFeatures.has('portal'));
  assert.ok(!backgroundBridgeFeatures.has('bridge'));
}

function testMaskSelection() {
  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'portal'],
      randomizeDirections: false,
    }).id,
    'path-ws-river-ne-portal-nw'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river'],
      randomizeDirections: false,
    }).id,
    'path-ws-river-ne'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'bridge'],
      randomizeDirections: false,
    }).id,
    'path-we-river-ns-bridge'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['portal'],
      randomizeDirections: false,
    }).id,
    'path-we-portal-nw'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['sea'],
      randomizeDirections: false,
    }).id,
    'shore-e-path-ws'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['pond'],
      randomizeDirections: false,
    }).id,
    'path-we-pond'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'pond'],
      randomizeDirections: false,
    }).id,
    'path-ws-river-n-pond-ne'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['waterfall'],
      randomizeDirections: false,
    }).id,
    'path-ws-river-ne-waterfall'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'waterfall', 'pond'],
      randomizeDirections: false,
    }).id,
    'path-ws-river-n-waterfall-pond-c'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'waterfall', 'portal'],
      randomizeDirections: false,
    }).id,
    'path-ws-river-ne-waterfall-portal-n'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'pond', 'portal'],
      randomizeDirections: false,
    }).id,
    'path-ws-river-n-pond-ne-portal-nw'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'waterfall', 'pond', 'portal'],
      randomizeDirections: false,
    }).id,
    'path-ws-river-n-waterfall-portal-c-pond-c'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'pond', 'portal'],
      description: 'A water curtain waterfall falls in front of a grotto entrance and into a pond.',
      randomizeDirections: false,
    }).id,
    'path-ws-river-n-waterfall-portal-c-pond-c'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'sea'],
      randomizeDirections: false,
    }).id,
    'shore-e-path-ws-river-n'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'sea', 'portal'],
      randomizeDirections: false,
    }).id,
    'shore-e-path-ws-portal-nw-river-n'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['bridge'],
      randomizeDirections: false,
    }).id,
    'path-we-bridge'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['bridge', 'portal'],
      randomizeDirections: false,
    }).id,
    'path-we-bridge-portal-nw'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['pond', 'bridge'],
      randomizeDirections: false,
    }).id,
    'path-we-pond-bridge'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['pond', 'bridge', 'portal'],
      randomizeDirections: false,
    }).id,
    'path-we-pond-bridge-portal-nw'
  );
}

function testRandomDirectionSelection() {
  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['portal'],
      random: () => 0,
    }).id,
    'path-we-portal-nw'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['portal'],
      random: () => 0.55,
    }).id,
    'path-w-portal-nw-and-path-ne'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['portal'],
      random: () => 0.99,
    }).id,
    'path-s-portal-sw-and-path-ne'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'portal'],
      random: () => 0.1,
    }).id,
    'path-ws-river-ne-portal-nw'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river', 'portal'],
      random: () => 0.9,
    }).id,
    'path-ws-river-ne-portal-s'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['river'],
      random: () => 0.8,
    }).id,
    'path-ne-river-ws'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: ['sea'],
      random: () => 0.55,
    }).id,
    'shore-w-path-ne'
  );

  assert.equal(
    selectMapTileMask({
      requiredFeatures: [],
      random: () => 0.9,
    }).id,
    'path-nsw-junction'
  );
}

function testPathJunctionMasksCoverAllTOrientations() {
  const expected = new Map([
    ['path-wes-junction', ['W', 'E', 'S']],
    ['path-wen-junction', ['W', 'E', 'N']],
    ['path-nse-junction', ['N', 'S', 'E']],
    ['path-nsw-junction', ['N', 'S', 'W']],
  ]);

  for (const [id, endpoints] of expected.entries()) {
    const variant = MAP_TILE_MASK_VARIANTS.find((item) => item.id === id);
    assert.ok(variant, `Missing T-junction mask ${id}`);
    assert.deepEqual(variant.connectors, Object.fromEntries(endpoints.map((side) => [side, 'PATH'])));
    assert.deepEqual(
      variant.routeGroups.filter((group) => group.kind === 'PATH').map((group) => group.endpoints),
      [endpoints]
    );
  }
}

function testPathJunctionMasksCoverStaticWaterLandmarks() {
  const expected = new Map<
    string,
    { features: MapTileFeatureToken[]; pathEndpoints: string[]; landmarkKinds: string[] }
  >([
    [
      'path-wes-junction-pond-ne',
      { features: ['path', 'pond'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['pond'] },
    ],
    [
      'path-nsw-junction-pond-se',
      { features: ['path', 'pond'], pathEndpoints: ['N', 'S', 'W'], landmarkKinds: ['pond'] },
    ],
    [
      'path-wes-junction-pond-w-bridge',
      { features: ['path', 'pond', 'bridge'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['pond', 'bridge'] },
    ],
    [
      'path-wes-junction-pond-e-bridge',
      { features: ['path', 'pond', 'bridge'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['pond', 'bridge'] },
    ],
    [
      'path-wes-junction-pond-s-bridge',
      { features: ['path', 'pond', 'bridge'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['pond', 'bridge'] },
    ],
    [
      'path-ns-pond-bridge',
      { features: ['path', 'pond', 'bridge'], pathEndpoints: ['N', 'S'], landmarkKinds: ['pond', 'bridge'] },
    ],
    [
      'path-wen-junction-pond-w-bridge',
      { features: ['path', 'pond', 'bridge'], pathEndpoints: ['W', 'E', 'N'], landmarkKinds: ['pond', 'bridge'] },
    ],
    [
      'path-wen-junction-pond-e-bridge',
      { features: ['path', 'pond', 'bridge'], pathEndpoints: ['W', 'E', 'N'], landmarkKinds: ['pond', 'bridge'] },
    ],
    [
      'shore-n-path-wes-junction',
      { features: ['path', 'sea'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['shore'] },
    ],
    [
      'shore-e-path-nsw-junction',
      { features: ['path', 'sea'], pathEndpoints: ['N', 'S', 'W'], landmarkKinds: ['shore'] },
    ],
    [
      'shore-n-path-wes-junction-pond-se',
      { features: ['path', 'pond', 'sea'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['shore', 'pond'] },
    ],
    [
      'shore-w-path-nse-junction-pond-ne',
      { features: ['path', 'pond', 'sea'], pathEndpoints: ['N', 'S', 'E'], landmarkKinds: ['shore', 'pond'] },
    ],
    [
      'shore-n-path-wes-junction-pond-w-bridge',
      { features: ['path', 'pond', 'sea', 'bridge'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['shore', 'pond', 'bridge'] },
    ],
    [
      'shore-n-path-wes-junction-pond-e-bridge',
      { features: ['path', 'pond', 'sea', 'bridge'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['shore', 'pond', 'bridge'] },
    ],
    [
      'shore-n-path-wes-junction-pond-s-bridge',
      { features: ['path', 'pond', 'sea', 'bridge'], pathEndpoints: ['W', 'E', 'S'], landmarkKinds: ['shore', 'pond', 'bridge'] },
    ],
    [
      'shore-s-path-wen-junction-pond-w-bridge',
      { features: ['path', 'pond', 'sea', 'bridge'], pathEndpoints: ['W', 'E', 'N'], landmarkKinds: ['shore', 'pond', 'bridge'] },
    ],
    [
      'shore-s-path-wen-junction-pond-e-bridge',
      { features: ['path', 'pond', 'sea', 'bridge'], pathEndpoints: ['W', 'E', 'N'], landmarkKinds: ['shore', 'pond', 'bridge'] },
    ],
  ]);

  for (const [id, expectation] of expected.entries()) {
    const variant = MAP_TILE_MASK_VARIANTS.find((item) => item.id === id);
    assert.ok(variant, `Missing static-water T-junction mask ${id}`);
    assertExactFeatures(variant.features, expectation.features);
    assert.deepEqual(
      variant.routeGroups.filter((group) => group.kind === 'PATH').map((group) => group.endpoints),
      [expectation.pathEndpoints]
    );
    for (const kind of expectation.landmarkKinds) {
      assert.ok(
        variant.layers.some((layer) => layer.kind === kind),
        `Expected ${id} to include ${kind}`
      );
    }
  }
}

function testPondBridgeCatalogKeepsStraightAndTJunctionRoads() {
  const pondBridgeVariants = MAP_TILE_MASK_VARIANTS.filter((variant) =>
    variant.features.join('+') === 'path+pond+bridge'
  );
  const pondSeaBridgeVariants = MAP_TILE_MASK_VARIANTS.filter((variant) =>
    variant.features.join('+') === 'path+pond+sea+bridge'
  );

  assert.ok(
    pondBridgeVariants.some((variant) => variant.id === 'path-we-pond-bridge'),
    'Expected path+pond+bridge to keep the ordinary straight road mask'
  );
  assert.ok(
    pondBridgeVariants.some((variant) => variant.id === 'path-ns-pond-bridge'),
    'Expected path+pond+bridge to include a second ordinary straight road orientation'
  );
  assert.ok(
    pondBridgeVariants.some(
      (variant) =>
        Object.values(variant.connectors).filter((connector) => connector === 'PATH').length >= 3
    ),
    'Expected path+pond+bridge to include T-junction masks as alternatives'
  );
  assert.ok(
    pondSeaBridgeVariants.some(
      (variant) =>
        Object.values(variant.connectors).filter((connector) => connector === 'PATH').length >= 3 &&
        Object.values(variant.connectors).includes('SHORE')
    ),
    'Expected path+pond+sea+bridge to include T-junction masks with a shore connector'
  );
}

function combinations<T>(items: readonly T[], minSize: number): T[][] {
  const result: T[][] = [];
  const walk = (start: number, combo: T[]) => {
    if (combo.length >= minSize) result.push([...combo]);
    for (let i = start; i < items.length; i += 1) {
      combo.push(items[i]);
      walk(i + 1, combo);
      combo.pop();
    }
  };
  walk(0, []);
  return result;
}

function allCanonicalFeatureCombos(): MapTileFeatureToken[][] {
  const optionalTokens = MAP_TILE_FEATURE_TOKENS.filter(
    (token) => token !== 'path'
  ) as MapTileFeatureToken[];
  const combosByKey = new Map<string, MapTileFeatureToken[]>();

  const walk = (index: number, combo: MapTileFeatureToken[]) => {
    if (index === optionalTokens.length) {
      const canonical = canonicalizeMapTileFeatures(combo);
      combosByKey.set(canonical.join('+'), canonical);
      return;
    }

    walk(index + 1, combo);
    combo.push(optionalTokens[index]);
    walk(index + 1, combo);
    combo.pop();
  };

  walk(0, []);
  return [...combosByKey.values()];
}

function testAllCanonicalCombinationsHaveTwoRoadMasks() {
  const variantsByFeatureKey = new Map<string, typeof MAP_TILE_MASK_VARIANTS>();
  for (const variant of MAP_TILE_MASK_VARIANTS) {
    const key = variant.features.join('+');
    variantsByFeatureKey.set(key, [...(variantsByFeatureKey.get(key) ?? []), variant]);
  }

  for (const combo of allCanonicalFeatureCombos()) {
    const key = combo.join('+');
    const variants = variantsByFeatureKey.get(key) ?? [];

    assert.ok(variants.length >= 2, `Expected at least 2 mask variations for ${key}`);

    for (const variant of variants) {
      assertExactFeatures(variant.features, combo);
      assert.ok(
        variant.layers.some((layer) => layer.kind === 'path'),
        `Combo ${key} resolved to ${variant.id}, which must include a road`
      );
    }

    const selected = selectMapTileMask({ requiredFeatures: combo, randomizeDirections: false });
    assertExactFeatures(selected.features, combo);
  }
}

function testNoMaskSelectionAddsExtraFeatures() {
  const requestedCombos: MapTileFeatureToken[][] = [
    [],
    ['river'],
    ['waterfall'],
    ['river', 'waterfall'],
    ['river', 'pond'],
    ['river', 'waterfall', 'pond'],
    ['river', 'sea'],
    ['pond'],
    ['sea'],
    ['bridge'],
    ['portal'],
    ['river', 'bridge'],
    ['river', 'portal'],
    ['river', 'waterfall', 'portal'],
    ['river', 'pond', 'portal'],
    ['river', 'waterfall', 'pond', 'portal'],
    ['river', 'sea', 'portal'],
    ['river', 'bridge', 'portal'],
    ['pond', 'bridge'],
    ['pond', 'portal'],
    ['pond', 'bridge', 'portal'],
    ['pond', 'sea', 'bridge'],
    ['sea', 'bridge'],
    ['sea', 'portal'],
    ['sea', 'bridge', 'portal'],
  ];

  for (const combo of requestedCombos) {
    const variant = selectMapTileMask({ requiredFeatures: combo, randomizeDirections: false });
    assertExactFeatures(variant.features, canonicalizeMapTileFeatures(combo));
  }
}

function testRiverMasksHaveEdgeWaterConnectors() {
  for (const variant of MAP_TILE_MASK_VARIANTS) {
    if (!variant.features.includes('river')) continue;

    assert.ok(
      Object.values(variant.connectors).some((connector) => connector === 'WATER'),
      `River mask ${variant.id} must expose at least one WATER edge connector`
    );

    for (const layer of variant.layers) {
      if (layer.kind !== 'river') continue;
      assert.ok(layer.sides.length >= 1, `River layer in ${variant.id} must reach an edge`);
    }
  }
}

function routeAxisForSides(sides: readonly string[]): 'horizontal' | 'vertical' | undefined {
  const sideSet = new Set(sides);
  if (sideSet.has('W') && sideSet.has('E')) return 'horizontal';
  if (sideSet.has('N') && sideSet.has('S')) return 'vertical';
  return undefined;
}

function mouthAxisForRiver(layer: Extract<MapTileLayer, { kind: 'river' }>): 'horizontal' | 'vertical' | undefined {
  if (layer.curve !== 'mouth' || layer.sides.length !== 1) return routeAxisForSides(layer.sides);

  const side = layer.sides[0];
  if ((side === 'N' && layer.position === 'south') || (side === 'S' && layer.position === 'north')) {
    return 'vertical';
  }
  if ((side === 'W' && layer.position === 'east') || (side === 'E' && layer.position === 'west')) {
    return 'horizontal';
  }
  return undefined;
}

function testNonBridgeMasksDoNotHaveCanonicalRoadWaterCrossings() {
  for (const variant of MAP_TILE_MASK_VARIANTS) {
    if (!variant.features.includes('river') || variant.features.includes('bridge')) continue;

    const pathAxes = variant.layers
      .filter((layer): layer is Extract<MapTileLayer, { kind: 'path' }> => layer.kind === 'path')
      .map((layer) => routeAxisForSides(layer.sides))
      .filter(Boolean);
    const riverAxes = variant.layers
      .filter((layer): layer is Extract<MapTileLayer, { kind: 'river' }> => layer.kind === 'river')
      .map((layer) => mouthAxisForRiver(layer))
      .filter(Boolean);

    for (const pathAxis of pathAxes) {
      for (const riverAxis of riverAxes) {
        assert.notEqual(
          `${pathAxis}:${riverAxis}`,
          'horizontal:vertical',
          `Road crosses water without bridge in ${variant.id}`
        );
        assert.notEqual(
          `${pathAxis}:${riverAxis}`,
          'vertical:horizontal',
          `Road crosses water without bridge in ${variant.id}`
        );
      }
    }
  }
}

testMaskCatalogHasStableGeometry();
testIndependentRouteGroupsAreExplicit();
testFeatureNormalization();
testMaskSelection();
testRandomDirectionSelection();
testPathJunctionMasksCoverAllTOrientations();
testPathJunctionMasksCoverStaticWaterLandmarks();
testPondBridgeCatalogKeepsStraightAndTJunctionRoads();
testAllCanonicalCombinationsHaveTwoRoadMasks();
testNoMaskSelectionAddsExtraFeatures();
testRiverMasksHaveEdgeWaterConnectors();
testNonBridgeMasksDoNotHaveCanonicalRoadWaterCrossings();
console.log('mapTileMasks tests passed');
