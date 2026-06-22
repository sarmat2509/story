import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  MAP_TILE_FEATURE_TOKENS,
  MAP_TILE_MASK_GEOMETRY,
  MAP_TILE_MASK_VARIANTS,
  selectMapTileMask,
  type MapTileLayer,
  type MapTileMaskVariant,
  type MapTileSide,
} from '../domain/story/mapTileMasks';

const OUT_DIR = path.resolve('assets/map-tile-mask-library');
const TILE = MAP_TILE_MASK_GEOMETRY.tileSize;
const CENTER = MAP_TILE_MASK_GEOMETRY.connectorCenter;
const THROAT = MAP_TILE_MASK_GEOMETRY.connectorThroatLength;
const ROUTE_WIDTH = MAP_TILE_MASK_GEOMETRY.routeWidth;
const BRIDGE_WIDTH = MAP_TILE_MASK_GEOMETRY.bridgeWidth;

type Point = { x: number; y: number };
type LandmarkLayer = Extract<MapTileLayer, { kind: 'bridge' | 'pond' | 'shore' | 'portal' | 'waterfall' }>;
type LandmarkPosition = LandmarkLayer['position'];

function safeSelectMaskId(tokens: readonly string[]): { maskId: string } | { unsupported: true; reason: string } {
  try {
    return {
      maskId: selectMapTileMask({ requiredFeatures: tokens, randomizeDirections: false }).id,
    };
  } catch (error) {
    return {
      unsupported: true,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function edgePoint(side: MapTileSide): Point {
  switch (side) {
    case 'N':
      return { x: CENTER, y: 0 };
    case 'E':
      return { x: TILE, y: CENTER };
    case 'S':
      return { x: CENTER, y: TILE };
    case 'W':
      return { x: 0, y: CENTER };
  }
}

function throatPoint(side: MapTileSide): Point {
  switch (side) {
    case 'N':
      return { x: CENTER, y: THROAT };
    case 'E':
      return { x: TILE - THROAT, y: CENTER };
    case 'S':
      return { x: CENTER, y: TILE - THROAT };
    case 'W':
      return { x: THROAT, y: CENTER };
  }
}

function pairKey(a: MapTileSide, b: MapTileSide): string {
  return [a, b].join('');
}

function portalPosition(variant: MapTileMaskVariant): LandmarkPosition {
  return variant.layers.find((item) => item.kind === 'portal')?.position ?? 'south';
}

function portalRoutePath(side: MapTileSide, position: LandmarkPosition): string {
  if (side === 'W' && position === 'northwest') {
    return [
      `M ${fmt(0)} ${fmt(CENTER)}`,
      `L ${fmt(THROAT)} ${fmt(CENTER)}`,
      `C ${fmt(245)} ${fmt(620)} ${fmt(275)} ${fmt(500)} ${fmt(300)} ${fmt(390)}`,
    ].join(' ');
  }

  if (side === 'N' && position === 'northwest') {
    return [
      `M ${fmt(CENTER)} ${fmt(0)}`,
      `L ${fmt(CENTER)} ${fmt(THROAT)}`,
      `C ${fmt(565)} ${fmt(240)} ${fmt(425)} ${fmt(310)} ${fmt(300)} ${fmt(390)}`,
    ].join(' ');
  }

  if (side === 'E' && position === 'northeast') {
    return [
      `M ${fmt(TILE)} ${fmt(CENTER)}`,
      `L ${fmt(TILE - THROAT)} ${fmt(CENTER)}`,
      `C ${fmt(1008)} ${fmt(620)} ${fmt(980)} ${fmt(500)} ${fmt(954)} ${fmt(390)}`,
    ].join(' ');
  }

  if (side === 'S' && position === 'southwest') {
    return [
      `M ${fmt(CENTER)} ${fmt(TILE)}`,
      `L ${fmt(CENTER)} ${fmt(TILE - THROAT)}`,
      `C ${fmt(560)} ${fmt(1030)} ${fmt(430)} ${fmt(1015)} ${fmt(300)} ${fmt(1015)}`,
    ].join(' ');
  }

  const start = edgePoint(side);
  const throat = throatPoint(side);
  return [
    `M ${fmt(start.x)} ${fmt(start.y)}`,
    `L ${fmt(throat.x)} ${fmt(throat.y)}`,
    `L ${fmt(CENTER)} ${fmt(CENTER)}`,
  ].join(' ');
}

function internalRiverPath(position: LandmarkPosition): string {
  switch (position) {
    case 'north':
      return [
        `M ${fmt(215)} ${fmt(335)}`,
        `C ${fmt(360)} ${fmt(260)} ${fmt(510)} ${fmt(355)} ${fmt(650)} ${fmt(300)}`,
        `C ${fmt(720)} ${fmt(270)} ${fmt(780)} ${fmt(300)} ${fmt(835)} ${fmt(335)}`,
      ].join(' ');
    case 'east':
      return [
        `M ${fmt(910)} ${fmt(810)}`,
        `C ${fmt(1020)} ${fmt(760)} ${fmt(1085)} ${fmt(880)} ${fmt(1005)} ${fmt(940)}`,
        `C ${fmt(930)} ${fmt(1010)} ${fmt(1060)} ${fmt(1065)} ${fmt(1110)} ${fmt(1130)}`,
      ].join(' ');
    case 'west':
      return [
        `M ${fmt(275)} ${fmt(710)}`,
        `C ${fmt(190)} ${fmt(805)} ${fmt(305)} ${fmt(900)} ${fmt(245)} ${fmt(1025)}`,
        `C ${fmt(335)} ${fmt(1100)} ${fmt(450)} ${fmt(1000)} ${fmt(390)} ${fmt(900)}`,
      ].join(' ');
    case 'south':
    default:
      return [
        `M ${fmt(260)} ${fmt(985)}`,
        `C ${fmt(420)} ${fmt(910)} ${fmt(560)} ${fmt(1065)} ${fmt(720)} ${fmt(978)}`,
        `C ${fmt(840)} ${fmt(915)} ${fmt(965)} ${fmt(1000)} ${fmt(1040)} ${fmt(940)}`,
      ].join(' ');
  }
}

function waterMouthTarget(position: LandmarkPosition): Point {
  switch (position) {
    case 'northeast':
      return { x: 820, y: 390 };
    case 'southwest':
      return { x: 430, y: 855 };
    case 'east':
      return { x: 910, y: 500 };
    case 'north':
      return { x: CENTER, y: 335 };
    case 'south':
      return { x: CENTER, y: 925 };
    case 'west':
      return { x: 335, y: CENTER };
    default:
      return { x: CENTER, y: CENTER };
  }
}

function riverMouthPath(side: MapTileSide, position: LandmarkPosition): string {
  const start = edgePoint(side);
  const throat = throatPoint(side);
  const target = waterMouthTarget(position);

  if (side === 'N') {
    return [
      `M ${fmt(start.x)} ${fmt(start.y)}`,
      `L ${fmt(throat.x)} ${fmt(throat.y)}`,
      `C ${fmt(throat.x + 40)} ${fmt(275)} ${fmt(target.x - 95)} ${fmt(target.y - 95)} ${fmt(target.x)} ${fmt(target.y)}`,
    ].join(' ');
  }

  if (side === 'E') {
    return [
      `M ${fmt(start.x)} ${fmt(start.y)}`,
      `L ${fmt(throat.x)} ${fmt(throat.y)}`,
      `C ${fmt(throat.x - 30)} ${fmt(throat.y - 105)} ${fmt(target.x + 135)} ${fmt(target.y + 65)} ${fmt(target.x)} ${fmt(target.y)}`,
    ].join(' ');
  }

  if (side === 'W') {
    return [
      `M ${fmt(start.x)} ${fmt(start.y)}`,
      `L ${fmt(throat.x)} ${fmt(throat.y)}`,
      `C ${fmt(throat.x + 95)} ${fmt(throat.y - 110)} ${fmt(target.x - 125)} ${fmt(target.y + 85)} ${fmt(target.x)} ${fmt(target.y)}`,
    ].join(' ');
  }

  return [
    `M ${fmt(start.x)} ${fmt(start.y)}`,
    `L ${fmt(throat.x)} ${fmt(throat.y)}`,
    `C ${fmt(throat.x - 80)} ${fmt(throat.y - 85)} ${fmt(target.x + 110)} ${fmt(target.y + 110)} ${fmt(target.x)} ${fmt(target.y)}`,
  ].join(' ');
}

function routePath(layer: Extract<MapTileLayer, { kind: 'path' | 'river' }>, variant: MapTileMaskVariant): string {
  const sides = layer.sides;
  const hasNorthwestPortal = variant.layers.some(
    (item) => item.kind === 'portal' && item.position === 'northwest'
  );

  if (layer.curve === 'junction' && sides.length === 1 && sides[0] === 'W' && hasNorthwestPortal) {
    return [
      `M ${fmt(445)} ${fmt(650)}`,
      `C ${fmt(390)} ${fmt(570)} ${fmt(335)} ${fmt(475)} ${fmt(300)} ${fmt(390)}`,
    ].join(' ');
  }

  if (layer.curve === 'junction' && sides.length === 1 && sides[0] === 'S') {
    return junctionRoutePath('S');
  }

  if (layer.curve === 'junction' && sides.length === 1) {
    return junctionRoutePath(sides[0]);
  }

  if (layer.curve === 'portal' && sides.length === 1) {
    return portalRoutePath(sides[0], portalPosition(variant));
  }

  if (layer.kind === 'river' && layer.curve === 'mouth' && sides.length === 1) {
    return riverMouthPath(sides[0], layer.position);
  }

  if (sides.length !== 2) {
    throw new Error(`Unsupported route layer in ${variant.id}: ${JSON.stringify(layer)}`);
  }

  const [a, b] = sides;
  const start = edgePoint(a);
  const startThroat = throatPoint(a);
  const endThroat = throatPoint(b);
  const end = edgePoint(b);
  const key = pairKey(a, b);
  const wavy = layer.kind === 'river' || layer.curve === 'wavy';

  const startChunk = `M ${fmt(start.x)} ${fmt(start.y)} L ${fmt(startThroat.x)} ${fmt(startThroat.y)}`;
  const endChunk = `L ${fmt(end.x)} ${fmt(end.y)}`;

  if (
    variant.id === 'path-ws-river-ne-waterfall-portal-n' &&
    layer.kind === 'river' &&
    key === 'NE'
  ) {
    return [
      `M ${fmt(CENTER)} ${fmt(0)}`,
      `L ${fmt(CENTER)} ${fmt(275)}`,
      `M ${fmt(CENTER)} ${fmt(590)}`,
      `C ${fmt(710)} ${fmt(615)} ${fmt(790)} ${fmt(632)} ${fmt(900)} ${fmt(632)}`,
      `C ${fmt(1010)} ${fmt(632)} ${fmt(1080)} ${fmt(CENTER)} ${fmt(TILE - THROAT)} ${fmt(CENTER)}`,
      `L ${fmt(TILE)} ${fmt(CENTER)}`,
    ].join(' ');
  }

  if (
    variant.id === 'path-ws-river-ne-waterfall-portal-n' &&
    layer.kind === 'path' &&
    (key === 'WS' || key === 'SW')
  ) {
    return [
      `M ${fmt(0)} ${fmt(CENTER)}`,
      `L ${fmt(THROAT)} ${fmt(CENTER)}`,
      `C ${fmt(270)} ${fmt(690)} ${fmt(320)} ${fmt(825)} ${fmt(388)} ${fmt(900)}`,
      `C ${fmt(470)} ${fmt(995)} ${fmt(592)} ${fmt(1035)} ${fmt(CENTER)} ${fmt(TILE - THROAT)}`,
      `L ${fmt(CENTER)} ${fmt(TILE)}`,
    ].join(' ');
  }

  if (
    layer.kind === 'path' &&
    (key === 'WS' || key === 'SW') &&
    variant.features.includes('pond') &&
    !variant.features.includes('bridge') &&
    variant.layers.some((item) => item.kind === 'pond' && item.position === 'center')
  ) {
    return [
      `M ${fmt(0)} ${fmt(CENTER)}`,
      `L ${fmt(THROAT)} ${fmt(CENTER)}`,
      `C ${fmt(235)} ${fmt(730)} ${fmt(292)} ${fmt(900)} ${fmt(420)} ${fmt(1010)}`,
      `C ${fmt(500)} ${fmt(1080)} ${fmt(595)} ${fmt(1088)} ${fmt(CENTER)} ${fmt(TILE - THROAT)}`,
      `L ${fmt(CENTER)} ${fmt(TILE)}`,
    ].join(' ');
  }

  if (key === 'WE' || key === 'EW') {
    const y1 = wavy ? CENTER - 34 : CENTER;
    const y2 = wavy ? CENTER + 42 : CENTER;
    return [
      startChunk,
      `C ${fmt(360)} ${fmt(y1)} ${fmt(520)} ${fmt(y2)} ${fmt(CENTER)} ${fmt(CENTER)}`,
      `C ${fmt(760)} ${fmt(CENTER - (wavy ? 48 : 0))} ${fmt(900)} ${fmt(CENTER + (wavy ? 28 : 0))} ${fmt(endThroat.x)} ${fmt(endThroat.y)}`,
      endChunk,
    ].join(' ');
  }

  if (key === 'NS' || key === 'SN') {
    return [
      startChunk,
      `C ${fmt(CENTER - (wavy ? 58 : 0))} ${fmt(330)} ${fmt(CENTER + (wavy ? 64 : 0))} ${fmt(460)} ${fmt(CENTER)} ${fmt(CENTER)}`,
      `C ${fmt(CENTER - (wavy ? 70 : 0))} ${fmt(790)} ${fmt(CENTER + (wavy ? 48 : 0))} ${fmt(920)} ${fmt(endThroat.x)} ${fmt(endThroat.y)}`,
      endChunk,
    ].join(' ');
  }

  if (key === 'WS' || key === 'SW') {
    return [
      startChunk,
      `C ${fmt(335)} ${fmt(CENTER)} ${fmt(455)} ${fmt(735)} ${fmt(550)} ${fmt(760)}`,
      `C ${fmt(655)} ${fmt(790)} ${fmt(CENTER)} ${fmt(920)} ${fmt(endThroat.x)} ${fmt(endThroat.y)}`,
      endChunk,
    ].join(' ');
  }

  if (key === 'ES') {
    return [
      startChunk,
      `C ${fmt(920)} ${fmt(CENTER)} ${fmt(800)} ${fmt(735)} ${fmt(704)} ${fmt(760)}`,
      `C ${fmt(650)} ${fmt(790)} ${fmt(CENTER)} ${fmt(920)} ${fmt(endThroat.x)} ${fmt(endThroat.y)}`,
      endChunk,
    ].join(' ');
  }

  if (key === 'SE') {
    return [
      startChunk,
      `C ${fmt(CENTER)} ${fmt(920)} ${fmt(650)} ${fmt(790)} ${fmt(704)} ${fmt(760)}`,
      `C ${fmt(800)} ${fmt(735)} ${fmt(920)} ${fmt(CENTER)} ${fmt(endThroat.x)} ${fmt(endThroat.y)}`,
      endChunk,
    ].join(' ');
  }

  if (key === 'NE' || key === 'EN') {
    return [
      startChunk,
      `C ${fmt(CENTER - (wavy ? 52 : 20))} ${fmt(320)} ${fmt(CENTER + 96)} ${fmt(430)} ${fmt(772)} ${fmt(514)}`,
      `C ${fmt(920)} ${fmt(590)} ${fmt(1010)} ${fmt(CENTER)} ${fmt(endThroat.x)} ${fmt(endThroat.y)}`,
      endChunk,
    ].join(' ');
  }

  throw new Error(`Unsupported route pair ${key} in ${variant.id}`);
}

function junctionRoutePath(side: MapTileSide): string {
  switch (side) {
    case 'N':
      return [
        `M ${fmt(CENTER)} ${fmt(CENTER)}`,
        `C ${fmt(CENTER - 35)} ${fmt(500)} ${fmt(CENTER)} ${fmt(340)} ${fmt(CENTER)} ${fmt(THROAT)}`,
        `L ${fmt(CENTER)} ${fmt(0)}`,
      ].join(' ');
    case 'E':
      return [
        `M ${fmt(CENTER)} ${fmt(CENTER)}`,
        `C ${fmt(760)} ${fmt(CENTER - 30)} ${fmt(920)} ${fmt(CENTER)} ${fmt(TILE - THROAT)} ${fmt(CENTER)}`,
        `L ${fmt(TILE)} ${fmt(CENTER)}`,
      ].join(' ');
    case 'S':
      return [
        `M ${fmt(CENTER)} ${fmt(CENTER)}`,
        `C ${fmt(CENTER - 35)} ${fmt(760)} ${fmt(CENTER)} ${fmt(910)} ${fmt(CENTER)} ${fmt(TILE - THROAT)}`,
        `L ${fmt(CENTER)} ${fmt(TILE)}`,
      ].join(' ');
    case 'W':
      return [
        `M ${fmt(CENTER)} ${fmt(CENTER)}`,
        `C ${fmt(500)} ${fmt(CENTER + 30)} ${fmt(335)} ${fmt(CENTER)} ${fmt(THROAT)} ${fmt(CENTER)}`,
        `L ${fmt(0)} ${fmt(CENTER)}`,
      ].join(' ');
  }
}

function routeSvg(layer: Extract<MapTileLayer, { kind: 'path' | 'river' }>, variant: MapTileMaskVariant): string {
  return [routeEdgeSvg(layer, variant), routeFillSvg(layer, variant)].join('\n');
}

function routeEdgeSvg(layer: Extract<MapTileLayer, { kind: 'path' | 'river' }>, variant: MapTileMaskVariant): string {
  const d = routePath(layer, variant);
  const edgeStroke = layer.kind === 'river' ? '#1b7da1' : '#626262';
  const linecap = layer.curve === 'internal-wavy' ? 'round' : 'butt';

  return `<path d="${d}" fill="none" stroke="${edgeStroke}" stroke-width="${ROUTE_WIDTH + 14}" stroke-linecap="${linecap}" stroke-linejoin="round" />`;
}

function routeFillSvg(layer: Extract<MapTileLayer, { kind: 'path' | 'river' }>, variant: MapTileMaskVariant): string {
  const d = routePath(layer, variant);
  const stroke = layer.kind === 'river' ? '#56c7ef' : '#8f8f8f';
  const linecap = layer.curve === 'internal-wavy' ? 'round' : 'butt';

  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${ROUTE_WIDTH}" stroke-linecap="${linecap}" stroke-linejoin="round" />`;
}

function pondSvg(position: LandmarkPosition): string {
  const centers: Record<string, Point & { rx: number; ry: number }> = {
    center: { x: CENTER, y: CENTER, rx: 230, ry: 155 },
    northwest: { x: 320, y: 325, rx: 205, ry: 138 },
    west: { x: 365, y: CENTER, rx: 215, ry: 145 },
    east: { x: TILE - 365, y: CENTER, rx: 215, ry: 145 },
    northeast: { x: 915, y: 360, rx: 215, ry: 145 },
    southwest: { x: 335, y: 895, rx: 220, ry: 150 },
    southeast: { x: 920, y: 895, rx: 215, ry: 145 },
    south: { x: CENTER, y: 920, rx: 290, ry: 155 },
  };
  const item = centers[position ?? 'east'] ?? centers.east;

  return `<ellipse cx="${fmt(item.x)}" cy="${fmt(item.y)}" rx="${fmt(item.rx)}" ry="${fmt(item.ry)}" fill="#56c7ef" stroke="#1b7da1" stroke-width="14" />`;
}

function shoreSvg(position: LandmarkPosition): string {
  switch (position) {
    case 'north':
      return `<path d="M 0 0 H ${fmt(TILE)} V ${fmt(340)} C ${fmt(1010)} ${fmt(285)} ${fmt(815)} ${fmt(410)} ${fmt(640)} ${fmt(330)} C ${fmt(465)} ${fmt(250)} ${fmt(260)} ${fmt(375)} 0 ${fmt(320)} Z" fill="#56c7ef" stroke="#1b7da1" stroke-width="14" />`;
    case 'south':
      return `<path d="M 0 ${fmt(TILE)} H ${fmt(TILE)} V ${fmt(910)} C ${fmt(1005)} ${fmt(960)} ${fmt(810)} ${fmt(835)} ${fmt(635)} ${fmt(920)} C ${fmt(455)} ${fmt(1010)} ${fmt(245)} ${fmt(875)} 0 ${fmt(940)} Z" fill="#56c7ef" stroke="#1b7da1" stroke-width="14" />`;
    case 'west':
      return `<path d="M 0 0 H ${fmt(350)} C ${fmt(290)} ${fmt(250)} ${fmt(420)} ${fmt(445)} ${fmt(330)} ${fmt(625)} C ${fmt(245)} ${fmt(800)} ${fmt(380)} ${fmt(1015)} ${fmt(320)} ${fmt(TILE)} H 0 Z" fill="#56c7ef" stroke="#1b7da1" stroke-width="14" />`;
    case 'east':
    default:
      return `<path d="M ${fmt(TILE)} 0 L ${fmt(TILE)} ${fmt(TILE)} L ${fmt(890)} ${fmt(TILE)} C ${fmt(1035)} ${fmt(905)} ${fmt(1000)} ${fmt(720)} ${fmt(922)} ${fmt(610)} C ${fmt(845)} ${fmt(500)} ${fmt(950)} ${fmt(330)} ${fmt(890)} 0 Z" fill="#56c7ef" stroke="#1b7da1" stroke-width="14" />`;
  }
}

function portalSvg(position: LandmarkPosition): string {
  if (position === 'center') {
    return [
      `<path d="M 460 565 C 452 425 520 330 627 315 C 734 330 802 425 794 565 Z" fill="#4a403a" stroke="#1d1917" stroke-width="16" />`,
      `<path d="M 535 560 C 532 468 575 405 627 396 C 679 405 722 468 719 560 Z" fill="#111111" />`,
    ].join('\n');
  }

  if (position === 'north') {
    return [
      `<path d="M ${fmt(CENTER - 190)} 616 C ${fmt(CENTER - 194)} 485 ${fmt(CENTER - 96)} 390 ${fmt(CENTER)} 382 C ${fmt(CENTER + 96)} 390 ${fmt(CENTER + 194)} 485 ${fmt(CENTER + 190)} 616 Z" fill="#4a403a" stroke="#1d1917" stroke-width="16" />`,
      `<path d="M ${fmt(CENTER - 118)} 610 C ${fmt(CENTER - 116)} 520 ${fmt(CENTER - 60)} 456 ${fmt(CENTER)} 450 C ${fmt(CENTER + 60)} 456 ${fmt(CENTER + 116)} 520 ${fmt(CENTER + 118)} 610 Z" fill="#111111" />`,
    ].join('\n');
  }

  if (position === 'northwest') {
    return [
      `<path d="M 165 435 C 158 306 220 210 305 190 C 415 208 475 305 458 435 Z" fill="#4a403a" stroke="#1d1917" stroke-width="16" />`,
      `<path d="M 232 430 C 228 342 266 279 314 268 C 376 282 408 342 398 430 Z" fill="#111111" />`,
    ].join('\n');
  }

  if (position === 'northeast') {
    return [
      `<path d="M 796 435 C 779 305 839 208 949 190 C 1034 210 1096 306 1089 435 Z" fill="#4a403a" stroke="#1d1917" stroke-width="16" />`,
      `<path d="M 856 430 C 846 342 878 282 940 268 C 988 279 1026 342 1022 430 Z" fill="#111111" />`,
    ].join('\n');
  }

  if (position === 'southwest') {
    return [
      `<path d="M 165 1064 C 158 935 220 839 305 819 C 415 837 475 934 458 1064 Z" fill="#4a403a" stroke="#1d1917" stroke-width="16" />`,
      `<path d="M 232 1059 C 228 971 266 908 314 897 C 376 911 408 971 398 1059 Z" fill="#111111" />`,
    ].join('\n');
  }

  return `<path d="M ${fmt(CENTER - 98)} ${fmt(TILE)} L ${fmt(CENTER - 98)} ${fmt(TILE - 150)} C ${fmt(CENTER - 90)} ${fmt(TILE - 245)} ${fmt(CENTER + 90)} ${fmt(TILE - 245)} ${fmt(CENTER + 98)} ${fmt(TILE - 150)} L ${fmt(CENTER + 98)} ${fmt(TILE)} Z" fill="#4a403a" stroke="#1d1917" stroke-width="14" />`;
}

function waterfallSvg(position: LandmarkPosition): string {
  if (position === 'center') {
    return [
      `<path d="M ${fmt(CENTER - ROUTE_WIDTH / 2)} 0 L ${fmt(CENTER - ROUTE_WIDTH / 2)} 306 C ${fmt(CENTER - 96)} 340 ${fmt(CENTER - 90)} 468 ${fmt(CENTER - 68)} 558 C ${fmt(CENTER - 42)} 598 ${fmt(CENTER + 42)} 598 ${fmt(CENTER + 68)} 558 C ${fmt(CENTER + 90)} 468 ${fmt(CENTER + 96)} 340 ${fmt(CENTER + ROUTE_WIDTH / 2)} 306 L ${fmt(CENTER + ROUTE_WIDTH / 2)} 0 Z" fill="#56c7ef" stroke="#1b7da1" stroke-width="14" />`,
      `<path d="M ${fmt(CENTER - 116)} 300 C ${fmt(CENTER - 74)} 270 ${fmt(CENTER - 38)} 318 ${fmt(CENTER)} 292 C ${fmt(CENTER + 45)} 262 ${fmt(CENTER + 78)} 318 ${fmt(CENTER + 116)} 294" fill="none" stroke="#5f625f" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" />`,
      `<path d="M ${fmt(CENTER - 112)} 300 C ${fmt(CENTER - 70)} 276 ${fmt(CENTER - 38)} 316 ${fmt(CENTER)} 296 C ${fmt(CENTER + 44)} 270 ${fmt(CENTER + 80)} 314 ${fmt(CENTER + 112)} 294" fill="none" stroke="#c9c3b4" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />`,
      `<path d="M ${fmt(CENTER - 46)} 36 C ${fmt(CENTER - 58)} 150 ${fmt(CENTER - 32)} 260 ${fmt(CENTER - 48)} 386 C ${fmt(CENTER - 60)} 466 ${fmt(CENTER - 40)} 514 ${fmt(CENTER - 54)} 558 M ${fmt(CENTER)} 42 C ${fmt(CENTER + 14)} 158 ${fmt(CENTER - 10)} 278 ${fmt(CENTER + 8)} 402 C ${fmt(CENTER + 18)} 472 ${fmt(CENTER - 10)} 530 ${fmt(CENTER + 4)} 574 M ${fmt(CENTER + 48)} 34 C ${fmt(CENTER + 58)} 145 ${fmt(CENTER + 34)} 268 ${fmt(CENTER + 50)} 390 C ${fmt(CENTER + 62)} 470 ${fmt(CENTER + 40)} 518 ${fmt(CENTER + 54)} 560" stroke="#d8f6ff" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.92" />`,
      `<path d="M ${fmt(CENTER - 118)} 568 C ${fmt(CENTER - 84)} 532 ${fmt(CENTER - 48)} 596 ${fmt(CENTER - 18)} 560 C ${fmt(CENTER + 16)} 526 ${fmt(CENTER + 52)} 596 ${fmt(CENTER + 84)} 558 C ${fmt(CENTER + 108)} 532 ${fmt(CENTER + 138)} 575 ${fmt(CENTER + 166)} 548" fill="none" stroke="#d8f6ff" stroke-width="18" stroke-linecap="round" opacity="0.9" />`,
    ].join('\n');
  }

  const northSvg = [
    `<path d="M ${fmt(CENTER - 124)} 306 C ${fmt(CENTER - 78)} 276 ${fmt(CENTER - 34)} 322 ${fmt(CENTER + 4)} 300 C ${fmt(CENTER + 48)} 274 ${fmt(CENTER + 84)} 318 ${fmt(CENTER + 124)} 298" fill="none" stroke="#5f625f" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" />`,
    `<path d="M ${fmt(CENTER - 120)} 306 C ${fmt(CENTER - 76)} 286 ${fmt(CENTER - 34)} 320 ${fmt(CENTER + 4)} 304 C ${fmt(CENTER + 48)} 284 ${fmt(CENTER + 84)} 316 ${fmt(CENTER + 120)} 300" fill="none" stroke="#c9c3b4" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />`,
    `<path d="M ${fmt(CENTER - 78)} 308 C ${fmt(CENTER - 96)} 398 ${fmt(CENTER - 78)} 500 ${fmt(CENTER - 92)} 606 C ${fmt(CENTER - 38)} 636 ${fmt(CENTER + 38)} 636 ${fmt(CENTER + 92)} 606 C ${fmt(CENTER + 78)} 500 ${fmt(CENTER + 96)} 398 ${fmt(CENTER + 78)} 308 Z" fill="#56c7ef" stroke="#1b7da1" stroke-width="12" opacity="0.78" />`,
    `<path d="M ${fmt(CENTER - 48)} 320 C ${fmt(CENTER - 62)} 418 ${fmt(CENTER - 38)} 516 ${fmt(CENTER - 54)} 610 M ${fmt(CENTER)} 318 C ${fmt(CENTER + 14)} 418 ${fmt(CENTER - 10)} 516 ${fmt(CENTER + 4)} 618 M ${fmt(CENTER + 50)} 318 C ${fmt(CENTER + 64)} 416 ${fmt(CENTER + 40)} 516 ${fmt(CENTER + 56)} 610" stroke="#d8f6ff" stroke-width="13" stroke-linecap="round" fill="none" opacity="0.95" />`,
    `<path d="M ${fmt(CENTER - 112)} 610 C ${fmt(CENTER - 74)} 570 ${fmt(CENTER - 34)} 642 ${fmt(CENTER - 4)} 604 C ${fmt(CENTER + 28)} 568 ${fmt(CENTER + 70)} 640 ${fmt(CENTER + 112)} 604" fill="none" stroke="#d8f6ff" stroke-width="18" stroke-linecap="round" opacity="0.9" />`,
  ].join('\n');

  if (position === 'west') {
    return `<g transform="rotate(-90 ${fmt(CENTER)} ${fmt(CENTER)})">${northSvg}</g>`;
  }
  if (position === 'east') {
    return `<g transform="rotate(90 ${fmt(CENTER)} ${fmt(CENTER)})">${northSvg}</g>`;
  }
  if (position === 'south') {
    return `<g transform="rotate(180 ${fmt(CENTER)} ${fmt(CENTER)})">${northSvg}</g>`;
  }

  return northSvg;
}

function grottoOutflowSvg(): string {
  const d = [
    `M ${fmt(CENTER)} ${fmt(610)}`,
    `C ${fmt(710)} ${fmt(625)} ${fmt(790)} ${fmt(632)} ${fmt(900)} ${fmt(632)}`,
    `C ${fmt(1010)} ${fmt(632)} ${fmt(1080)} ${fmt(CENTER)} ${fmt(TILE - THROAT)} ${fmt(CENTER)}`,
    `L ${fmt(TILE)} ${fmt(CENTER)}`,
  ].join(' ');

  return [
    `<path d="${d}" fill="none" stroke="#1b7da1" stroke-width="${fmt(ROUTE_WIDTH + 14)}" stroke-linecap="butt" stroke-linejoin="round" />`,
    `<path d="${d}" fill="none" stroke="#56c7ef" stroke-width="${fmt(ROUTE_WIDTH)}" stroke-linecap="butt" stroke-linejoin="round" />`,
    `<path d="M ${fmt(CENTER - 80)} 612 C ${fmt(CENTER - 20)} 650 ${fmt(CENTER + 42)} 650 ${fmt(CENTER + 102)} 620" fill="none" stroke="#d8f6ff" stroke-width="14" stroke-linecap="round" opacity="0.88" />`,
  ].join('\n');
}

function bridgeSvg(layer: Extract<LandmarkLayer, { kind: 'bridge' }>, variant: MapTileMaskVariant): string {
  const position = layer.position ?? 'center';
  const targetSideByPosition: Partial<Record<NonNullable<LandmarkPosition>, MapTileSide>> = {
    north: 'N',
    east: 'E',
    south: 'S',
    west: 'W',
  };
  const targetSide = targetSideByPosition[position];
  const pathLayers = variant.layers.filter(
    (item): item is Extract<MapTileLayer, { kind: 'path' }> => item.kind === 'path'
  );
  const pathForBridge =
    (targetSide
      ? pathLayers.find((item) => item.sides.length === 1 && item.sides[0] === targetSide) ??
        pathLayers.find((item) => item.sides.includes(targetSide))
      : undefined) ??
    pathLayers.find((item) => item.sides.length >= 2) ??
    pathLayers[0];
  if (!pathForBridge) return '';

  const d = bridgeRoutePath(pathForBridge, position, variant);

  return [
    `<path d="${d}" fill="none" stroke="#5d3924" stroke-width="${fmt(BRIDGE_WIDTH + 18)}" stroke-linecap="round" stroke-linejoin="round" />`,
    `<path d="${d}" fill="none" stroke="#9a6a42" stroke-width="${fmt(BRIDGE_WIDTH)}" stroke-linecap="round" stroke-linejoin="round" />`,
  ].join('\n');
}

function bridgeRoutePath(
  layer: Extract<MapTileLayer, { kind: 'path' }>,
  position: LandmarkPosition,
  variant: MapTileMaskVariant
): string {
  const [a, b] = layer.sides;
  const key = pairKey(a, b);

  if (layer.sides.length === 1) {
    switch (a) {
      case 'N':
        return [
          `M ${fmt(CENTER)} ${fmt(150)}`,
          `C ${fmt(CENTER)} ${fmt(280)} ${fmt(CENTER - 16)} ${fmt(410)} ${fmt(CENTER)} ${fmt(535)}`,
        ].join(' ');
      case 'E':
        return [
          `M ${fmt(TILE - 150)} ${fmt(CENTER)}`,
          `C ${fmt(980)} ${fmt(CENTER)} ${fmt(850)} ${fmt(CENTER + 16)} ${fmt(720)} ${fmt(CENTER)}`,
        ].join(' ');
      case 'S':
        return [
          `M ${fmt(CENTER)} ${fmt(TILE - 150)}`,
          `C ${fmt(CENTER)} ${fmt(980)} ${fmt(CENTER + 16)} ${fmt(850)} ${fmt(CENTER)} ${fmt(720)}`,
        ].join(' ');
      case 'W':
        return [
          `M ${fmt(150)} ${fmt(CENTER)}`,
          `C ${fmt(275)} ${fmt(CENTER)} ${fmt(410)} ${fmt(CENTER + 16)} ${fmt(535)} ${fmt(CENTER)}`,
        ].join(' ');
    }
  }

  if (position === 'west') {
    if (key === 'WS' || key === 'SW') {
      return [
        `M ${fmt(170)} ${fmt(CENTER)}`,
        `L ${fmt(THROAT)} ${fmt(CENTER)}`,
        `C ${fmt(320)} ${fmt(CENTER)} ${fmt(430)} ${fmt(730)} ${fmt(575)} ${fmt(772)}`,
      ].join(' ');
    }

    return [
      `M ${fmt(150)} ${fmt(CENTER)}`,
      `C ${fmt(270)} ${fmt(CENTER)} ${fmt(395)} ${fmt(CENTER)} ${fmt(535)} ${fmt(CENTER)}`,
    ].join(' ');
  }

  if (position === 'east') {
    return [
      `M ${fmt(TILE - 150)} ${fmt(CENTER)}`,
      `C ${fmt(980)} ${fmt(CENTER)} ${fmt(850)} ${fmt(CENTER + 12)} ${fmt(720)} ${fmt(CENTER)}`,
    ].join(' ');
  }

  if (position === 'south') {
    return [
      `M ${fmt(CENTER)} ${fmt(TILE - 150)}`,
      `C ${fmt(CENTER)} ${fmt(980)} ${fmt(CENTER + 12)} ${fmt(850)} ${fmt(CENTER)} ${fmt(720)}`,
    ].join(' ');
  }

  if (key === 'WE' || key === 'EW') {
    return [
      `M ${fmt(CENTER - 340)} ${fmt(CENTER)}`,
      `C ${fmt(CENTER - 165)} ${fmt(CENTER - 10)} ${fmt(CENTER + 165)} ${fmt(CENTER + 10)} ${fmt(CENTER + 340)} ${fmt(CENTER)}`,
    ].join(' ');
  }

  if (key === 'NS' || key === 'SN') {
    return [
      `M ${fmt(CENTER)} ${fmt(CENTER - 340)}`,
      `C ${fmt(CENTER - 18)} ${fmt(CENTER - 165)} ${fmt(CENTER + 18)} ${fmt(CENTER + 165)} ${fmt(CENTER)} ${fmt(CENTER + 340)}`,
    ].join(' ');
  }

  if (key === 'WS' || key === 'SW') {
    return [
      `M ${fmt(335)} ${fmt(CENTER)}`,
      `C ${fmt(455)} ${fmt(735)} ${fmt(550)} ${fmt(760)} ${fmt(610)} ${fmt(805)}`,
      `C ${fmt(655)} ${fmt(840)} ${fmt(CENTER)} ${fmt(925)} ${fmt(CENTER)} ${fmt(1010)}`,
    ].join(' ');
  }

  if (key === 'ES' || key === 'SE') {
    return [
      `M ${fmt(920)} ${fmt(CENTER)}`,
      `C ${fmt(800)} ${fmt(735)} ${fmt(704)} ${fmt(760)} ${fmt(645)} ${fmt(805)}`,
      `C ${fmt(CENTER)} ${fmt(840)} ${fmt(CENTER)} ${fmt(925)} ${fmt(CENTER)} ${fmt(1010)}`,
    ].join(' ');
  }

  if (key === 'NE' || key === 'EN') {
    return [
      `M ${fmt(CENTER)} ${fmt(245)}`,
      `C ${fmt(CENTER + 10)} ${fmt(385)} ${fmt(760)} ${fmt(505)} ${fmt(845)} ${fmt(560)}`,
      `C ${fmt(940)} ${fmt(615)} ${fmt(1015)} ${fmt(CENTER)} ${fmt(1010)} ${fmt(CENTER)}`,
    ].join(' ');
  }

  return routePath(layer, variant);
}

function landmarkSvg(layer: LandmarkLayer, variant: MapTileMaskVariant): string {
  switch (layer.kind) {
    case 'bridge':
      return bridgeSvg(layer, variant);
    case 'pond':
      return pondSvg(layer.position);
    case 'shore':
      return shoreSvg(layer.position);
    case 'portal':
      return portalSvg(layer.position);
    case 'waterfall':
      return waterfallSvg(layer.position);
  }
}

function svgDocument(variant: MapTileMaskVariant): string {
  const waterAndGround = variant.layers
    .filter((layer) => layer.kind === 'shore' || layer.kind === 'pond')
    .map((layer) => landmarkSvg(layer as any, variant))
    .join('\n');
  const rivers = variant.layers
    .filter((layer) => layer.kind === 'river')
    .map((layer) => routeSvg(layer as any, variant))
    .join('\n');
  const pathLayers = variant.layers.filter(
    (layer): layer is Extract<MapTileLayer, { kind: 'path' }> => layer.kind === 'path'
  );
  const paths = [
    ...pathLayers.map((layer) => routeEdgeSvg(layer, variant)),
    ...pathLayers.map((layer) => routeFillSvg(layer, variant)),
  ].join('\n');
  const portals = variant.layers
    .filter((layer) => layer.kind === 'portal')
    .map((layer) => landmarkSvg(layer as any, variant))
    .join('\n');
  const waterfalls = variant.layers
    .filter((layer) => layer.kind === 'waterfall')
    .map((layer) => landmarkSvg(layer as any, variant))
    .join('\n');
  const grottoOutflow = variant.id === 'path-ws-river-ne-waterfall-portal-n'
    ? grottoOutflowSvg()
    : '';
  const bridges = variant.layers
    .filter((layer) => layer.kind === 'bridge')
    .map((layer) => landmarkSvg(layer as any, variant))
    .join('\n');

  const layers = [
    `<rect width="${TILE}" height="${TILE}" fill="#ffffff" />`,
    waterAndGround,
    rivers,
    paths,
    portals,
    grottoOutflow,
    waterfalls,
    bridges,
  ].filter((layer) => layer.trim().length > 0);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">`,
    ...layers.flatMap((layer) => layer.split('\n').map((line) => `  ${line}`)),
    '</svg>',
    '',
  ].join('\n');
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

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const outputs = [];
  for (const variant of MAP_TILE_MASK_VARIANTS) {
    const svg = svgDocument(variant);
    const svgPath = path.join(OUT_DIR, `${variant.id}.svg`);
    const pngPath = path.join(OUT_DIR, `${variant.id}.png`);

    await fs.writeFile(svgPath, svg, 'utf8');
    await sharp(Buffer.from(svg)).png().toFile(pngPath);

    outputs.push({
      ...variant,
      svgPath,
      pngPath,
    });
  }

  const manifestPath = path.join(OUT_DIR, 'index.json');
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        geometry: MAP_TILE_MASK_GEOMETRY,
        featureTokens: MAP_TILE_FEATURE_TOKENS,
        combinationCoverage: combinations(MAP_TILE_FEATURE_TOKENS, 2).map((tokens) => ({
          tokens,
          ...safeSelectMaskId(tokens),
        })),
        outputs,
      },
      null,
      2
    ),
    'utf8'
  );

  await fs.writeFile(
    path.join(OUT_DIR, 'mask-list.md'),
    [
      '# Map Tile Mask List',
      '',
      `Total masks: ${outputs.length}`,
      '',
      ...outputs.map((variant) => {
        const features = variant.features.length > 0 ? variant.features.join('+') : 'path';
        return `- ${variant.id} — ${features}`;
      }),
      '',
    ].join('\n'),
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        outDir: OUT_DIR,
        manifestPath,
        count: outputs.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
