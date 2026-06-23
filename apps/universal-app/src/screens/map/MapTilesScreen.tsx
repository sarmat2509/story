import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageStyle,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  CollectedMapTileApi,
  MapTileConnector,
  MapTilePlacementInput,
  MapTileSide,
  useCollectedMapTiles,
  useUpdateMapTileLayout,
} from '@/api/mapTiles';
import { toastService } from '@/services/toastService';
import { theme } from '@/theme';
import { modernColors } from '@/theme/modernTheme';
import { formatAssetUrl } from '@/utils/assetUrl';
import type { MainDrawerParamList } from '@/types/navigation';

const CELL_SIZE = 200;
const BOARD_HOVER_MIN_OVERLAP_RATIO = 0.5;
const INVENTORY_GAP = 14;
const INVENTORY_PADDING = 18;
const INVENTORY_HEIGHT = CELL_SIZE + 84;
const INVENTORY_COLLAPSED_HEIGHT = 68;
const INVENTORY_COLLAPSED_VERTICAL_PADDING = 14;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 3;
const SPLIT_DELAY_MS = 2000;
const WHEEL_ZOOM_SENSITIVITY = 0.0012;
const TILE_DRAG_START_THRESHOLD = 8;
const INITIAL_VIEWPORT_PADDING = 48;

type MapTilesRouteProp = RouteProp<MainDrawerParamList, 'MapTiles'>;
type Rect = { x: number; y: number; width: number; height: number };
type BoardCell = { x: number; y: number };
type InteractionMode = 'select' | 'pan';
type DragSource =
  | { kind: 'board'; boardX: number; boardY: number }
  | { kind: 'inventory'; index: number };
type DragState = {
  tile: CollectedMapTileApi;
  source: DragSource;
  left: number;
  top: number;
  offsetX: number;
  offsetY: number;
  displaySize: number;
};
type ReturningDragState = {
  tile: CollectedMapTileApi;
  source: DragSource;
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  displaySize: number;
};
type PendingTileInteraction = {
  tile: CollectedMapTileApi;
  source: DragSource;
  locationX: number;
  locationY: number;
  displaySize: number;
};
type InventoryHover = { index: number; ready: boolean };
type BoardError = { x: number; y: number; nonce: number };
type ResponderPoint = {
  pageX: number;
  pageY: number;
  locationX: number;
  locationY: number;
};

const sideDeltas: Record<MapTileSide, BoardCell> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

const oppositeSide: Record<MapTileSide, MapTileSide> = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
};

function connectorGroup(connector: MapTileConnector | undefined): 'path' | 'water' | null {
  if (!connector) return null;
  if (connector === 'PATH' || connector === 'PORTAL') return 'path';
  if (connector === 'WATER' || connector === 'SHORE') return 'water';
  return null;
}

function tileImageUrl(tile: CollectedMapTileApi): string | null {
  return formatAssetUrl(tile.imageUrl || tile.storagePath) ?? tile.imageUrl ?? null;
}

function distanceBetweenTouches(touches: Array<{ pageX: number; pageY: number }>): number {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function debugMapTiles(event: string, payload: Record<string, unknown> = {}) {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
  try {
    console.log(`[MapTiles:${event}] ${JSON.stringify(payload)}`);
  } catch (_error) {
    console.log(`[MapTiles:${event}]`);
  }
}

function compactRect(rect: Rect | null) {
  if (!rect) return null;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readResponderPoint(
  nativeEvent: Record<string, any>,
  fallback: Partial<ResponderPoint> = {}
): ResponderPoint | null {
  const touch = nativeEvent.touches?.[0] ?? nativeEvent.changedTouches?.[0] ?? null;
  const pageX = firstFinite(nativeEvent.pageX, touch?.pageX, nativeEvent.clientX, fallback.pageX);
  const pageY = firstFinite(nativeEvent.pageY, touch?.pageY, nativeEvent.clientY, fallback.pageY);
  if (pageX === null || pageY === null) {
    return null;
  }
  return {
    pageX,
    pageY,
    locationX: firstFinite(nativeEvent.locationX, fallback.locationX) ?? 0,
    locationY: firstFinite(nativeEvent.locationY, fallback.locationY) ?? 0,
  };
}

function reorderInventory(
  tiles: CollectedMapTileApi[],
  draggedId: string,
  insertIndex: number
): CollectedMapTileApi[] {
  const boardTiles = tiles.filter((tile) => tile.location === 'board' && tile.id !== draggedId);
  const inventoryTiles = tiles
    .filter((tile) => tile.location === 'inventory' && tile.id !== draggedId)
    .sort((a, b) => a.inventoryOrder - b.inventoryOrder || a.acquiredAt.localeCompare(b.acquiredAt));
  const dragged = tiles.find((tile) => tile.id === draggedId);
  if (!dragged) return tiles;

  const nextInventory = [...inventoryTiles];
  nextInventory.splice(clamp(insertIndex, 0, nextInventory.length), 0, {
    ...dragged,
    location: 'inventory',
    boardX: null,
    boardY: null,
  });

  return [
    ...boardTiles,
    ...nextInventory.map((tile, index) => ({
      ...tile,
      inventoryOrder: index,
    })),
  ];
}

function findDuplicateBoardCell(tiles: CollectedMapTileApi[]): BoardCell | null {
  const occupied = new Set<string>();
  for (const tile of tiles) {
    if (tile.location !== 'board') continue;
    const x = tile.boardX ?? 0;
    const y = tile.boardY ?? 0;
    const key = `${x}:${y}`;
    if (occupied.has(key)) {
      return { x, y };
    }
    occupied.add(key);
  }
  return null;
}

function makePlacements(tiles: CollectedMapTileApi[]): MapTilePlacementInput[] {
  return tiles.map((tile) => ({
    id: tile.id,
    location: tile.location,
    boardX: tile.location === 'board' ? tile.boardX ?? 0 : null,
    boardY: tile.location === 'board' ? tile.boardY ?? 0 : null,
    inventoryOrder: tile.location === 'inventory' ? tile.inventoryOrder : 0,
  }));
}

function getInitialBoardViewport(boardTiles: CollectedMapTileApi[], boardRect: Rect) {
  if (boardTiles.length === 0 || boardRect.width <= 0 || boardRect.height <= 0) {
    return { pan: { x: 0, y: 0 }, zoom: 1 };
  }

  const minLeft = Math.min(...boardTiles.map((tile) => (tile.boardX ?? 0) * CELL_SIZE));
  const maxRight = Math.max(...boardTiles.map((tile) => ((tile.boardX ?? 0) + 1) * CELL_SIZE));
  const minTop = Math.min(...boardTiles.map((tile) => (tile.boardY ?? 0) * CELL_SIZE));
  const maxBottom = Math.max(...boardTiles.map((tile) => ((tile.boardY ?? 0) + 1) * CELL_SIZE));
  const contentWidth = Math.max(CELL_SIZE, maxRight - minLeft);
  const contentHeight = Math.max(CELL_SIZE, maxBottom - minTop);
  const availableWidth = Math.max(CELL_SIZE, boardRect.width - INITIAL_VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(CELL_SIZE, boardRect.height - INITIAL_VIEWPORT_PADDING * 2);
  const nextZoom = clamp(
    Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight),
    MIN_ZOOM,
    MAX_ZOOM
  );
  const centerX = minLeft + contentWidth / 2;
  const centerY = minTop + contentHeight / 2;

  return {
    pan: {
      x: -centerX * nextZoom,
      y: -centerY * nextZoom,
    },
    zoom: nextZoom,
  };
}

export default function MapTilesScreen() {
  const route = useRoute<MapTilesRouteProp>();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList, 'MapTiles'>>();
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const boardRef = useRef<View>(null);
  const inventoryRef = useRef<View>(null);
  const inventoryScrollRef = useRef<ScrollView>(null);
  const rewardTargetRef = useRef<View | null>(null);
  const splitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewardSeenRef = useRef<string | null>(null);
  const rewardAnimationStartedRef = useRef<string | null>(null);
  const rewardScrollPreparedRef = useRef<string | null>(null);
  const rewardAnim = useRef(new Animated.Value(0)).current;
  const returnAnim = useRef(new Animated.Value(0)).current;
  const updateLayout = useUpdateMapTileLayout();
  const childProfileId = route.params?.childProfileId;
  const { data: serverTiles, isLoading, error, refetch } = useCollectedMapTiles({
    childProfileId,
  });
  const [tiles, setTiles] = useState<CollectedMapTileApi[]>([]);
  const [tilesHydrated, setTilesHydrated] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const [rootRect, setRootRect] = useState<Rect | null>(null);
  const [boardRect, setBoardRect] = useState<Rect | null>(null);
  const [inventoryRect, setInventoryRect] = useState<Rect | null>(null);
  const [rewardTargetRect, setRewardTargetRect] = useState<Rect | null>(null);
  const [inventoryScrollX, setInventoryScrollX] = useState(0);
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [isMapPanning, setIsMapPanning] = useState(false);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const interactionModeRef = useRef<InteractionMode>('select');
  const panGestureRef = useRef({
    panX: 0,
    panY: 0,
    zoom: 1,
    touchDistance: 0,
  });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [returningDrag, setReturningDrag] = useState<ReturningDragState | null>(null);
  const [hoverCell, setHoverCell] = useState<BoardCell | null>(null);
  const [hoverInventory, setHoverInventory] = useState<InventoryHover | null>(null);
  const [boardError, setBoardError] = useState<BoardError | null>(null);
  const [rewardTile, setRewardTile] = useState<CollectedMapTileApi | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const tilesRef = useRef<CollectedMapTileApi[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const pendingTileInteractionRef = useRef<PendingTileInteraction | null>(null);
  const hoverCellRef = useRef<BoardCell | null>(null);
  const hoverInventoryRef = useRef<InventoryHover | null>(null);
  const boardLookupRef = useRef<Map<string, CollectedMapTileApi>>(new Map());
  const inventoryTilesRef = useRef<CollectedMapTileApi[]>([]);
  const layoutSaveInFlightRef = useRef(false);
  const lastDragDebugAtRef = useRef(0);
  const lastHoverDebugRef = useRef<string | null>(null);
  const handledWheelEventsRef = useRef<WeakSet<object>>(new WeakSet());
  const rewardTileId = rewardTile?.id ?? null;
  const hasBoardLayout = Boolean(boardRect && boardRect.width > 0 && boardRect.height > 0);
  const isMapReady = tilesHydrated && hasBoardLayout && viewportReady;

  useEffect(() => {
    if (serverTiles === undefined) {
      if (!drag && !layoutSaveInFlightRef.current) {
        setTilesHydrated(false);
        setViewportReady(false);
      }
      return;
    }
    if (!drag && !layoutSaveInFlightRef.current) {
      tilesRef.current = serverTiles;
      setTiles(serverTiles);
      setTilesHydrated(true);
    }
  }, [drag, serverTiles]);

  useEffect(() => {
    setViewportReady(false);
  }, [childProfileId]);

  useEffect(() => {
    return () => {
      if (splitTimerRef.current) clearTimeout(splitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    const documentElement = document.documentElement;
    const body = document.body;
    const previousHtmlOverscrollX = documentElement.style.overscrollBehaviorX;
    const previousBodyOverscrollX = body.style.overscrollBehaviorX;

    documentElement.style.overscrollBehaviorX = 'none';
    body.style.overscrollBehaviorX = 'none';

    return () => {
      documentElement.style.overscrollBehaviorX = previousHtmlOverscrollX;
      body.style.overscrollBehaviorX = previousBodyOverscrollX;
    };
  }, []);

  const boardTiles = useMemo(
    () =>
      tiles.filter(
        (tile) =>
          tile.id !== rewardTileId &&
          tile.location === 'board' &&
          tile.boardX !== null &&
          tile.boardY !== null
      ),
    [rewardTileId, tiles]
  );
  const inventoryTiles = useMemo(
    () =>
      tiles
        .filter((tile) => tile.location === 'inventory')
        .sort((a, b) => a.inventoryOrder - b.inventoryOrder || a.acquiredAt.localeCompare(b.acquiredAt)),
    [tiles]
  );
  const visibleInventoryCount = useMemo(
    () => inventoryTiles.filter((tile) => tile.id !== rewardTileId).length,
    [inventoryTiles, rewardTileId]
  );
  const selectedTile = useMemo(
    () => (selectedTileId ? tiles.find((tile) => tile.id === selectedTileId) ?? null : null),
    [selectedTileId, tiles]
  );
  const selectedStoryImageUrl = useMemo(() => {
    if (!selectedTile) return null;
    return (
      formatAssetUrl(selectedTile.story.coverThumbnailUrl || selectedTile.story.coverImageUrl) ??
      null
    );
  }, [selectedTile]);

  const boardLookup = useMemo(() => {
    const lookup = new Map<string, CollectedMapTileApi>();
    for (const tile of boardTiles) {
      lookup.set(`${tile.boardX}:${tile.boardY}`, tile);
    }
    return lookup;
  }, [boardTiles]);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  useEffect(() => {
    boardLookupRef.current = boardLookup;
  }, [boardLookup]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
    if (interactionMode !== 'pan') {
      setIsMapPanning(false);
    } else {
      setSelectedTileId(null);
    }
  }, [interactionMode]);

  useEffect(() => {
    if (selectedTileId && !selectedTile) {
      setSelectedTileId(null);
    }
  }, [selectedTile, selectedTileId]);

  useEffect(() => {
    inventoryTilesRef.current = inventoryTiles;
  }, [inventoryTiles]);

  useEffect(() => {
    if (!tilesHydrated || !boardRect || !hasBoardLayout || viewportReady) return;
    const nextViewport = getInitialBoardViewport(boardTiles, boardRect);
    panRef.current = nextViewport.pan;
    zoomRef.current = nextViewport.zoom;
    setPan(nextViewport.pan);
    setZoom(nextViewport.zoom);
    setViewportReady(true);
  }, [boardRect, boardTiles, hasBoardLayout, tilesHydrated, viewportReady]);

  const boardBounds = useMemo(() => {
    if (boardTiles.length === 0) {
      return { minX: -2, maxX: 2, minY: -2, maxY: 2 };
    }
    const xs = boardTiles.map((tile) => tile.boardX ?? 0);
    const ys = boardTiles.map((tile) => tile.boardY ?? 0);
    return {
      minX: Math.min(...xs) - 2,
      maxX: Math.max(...xs) + 2,
      minY: Math.min(...ys) - 2,
      maxY: Math.max(...ys) + 2,
    };
  }, [boardTiles]);

  const measureRects = useCallback(() => {
    requestAnimationFrame(() => {
      rootRef.current?.measureInWindow((x, y, rectWidth, rectHeight) => {
        setRootRect({ x, y, width: rectWidth, height: rectHeight });
      });
      boardRef.current?.measureInWindow((x, y, rectWidth, rectHeight) => {
        setBoardRect({ x, y, width: rectWidth, height: rectHeight });
      });
      inventoryRef.current?.measureInWindow((x, y, rectWidth, rectHeight) => {
        setInventoryRect({ x, y, width: rectWidth, height: rectHeight });
      });
    });
  }, []);

  const measureRewardTarget = useCallback(() => {
    requestAnimationFrame(() => {
      rewardTargetRef.current?.measureInWindow((x, y, rectWidth, rectHeight) => {
        if (rectWidth > 0 && rectHeight > 0) {
          setRewardTargetRect({ x, y, width: rectWidth, height: rectHeight });
        }
      });
    });
  }, []);

  const handleBoardLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measureRects();
    },
    [measureRects]
  );

  const handleInventoryLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measureRects();
    },
    [measureRects]
  );

  const handleInventoryScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setInventoryScrollX(event.nativeEvent.contentOffset.x);
      if (rewardTile) {
        measureRewardTarget();
      }
    },
    [measureRewardTarget, rewardTile]
  );

  useEffect(() => {
    measureRects();
  }, [height, measureRects, width]);

  useEffect(() => {
    measureRects();
  }, [inventoryCollapsed, measureRects]);

  const showBoardError = useCallback((cell: BoardCell) => {
    setBoardError({ ...cell, nonce: Date.now() });
    setTimeout(() => setBoardError(null), 900);
  }, []);

  const saveTiles = useCallback(
    async (nextTiles: CollectedMapTileApi[]) => {
      const duplicateBoardCell = findDuplicateBoardCell(nextTiles);
      if (duplicateBoardCell) {
        debugMapTiles('save_duplicate_board_cell_blocked', { cell: duplicateBoardCell });
        showBoardError(duplicateBoardCell);
        toastService.error(t('map_tiles.cell_occupied'));
        return;
      }
      debugMapTiles('save_start', {
        placements: nextTiles.map((tile) => ({
          id: tile.id,
          location: tile.location,
          boardX: tile.boardX,
          boardY: tile.boardY,
          inventoryOrder: tile.inventoryOrder,
        })),
      });
      layoutSaveInFlightRef.current = true;
      tilesRef.current = nextTiles;
      setTiles(nextTiles);
      try {
        const savedTiles = await updateLayout.mutateAsync({
          placements: makePlacements(nextTiles),
          childProfileId,
        });
        tilesRef.current = savedTiles;
        setTiles(savedTiles);
        debugMapTiles('save_success', { count: savedTiles.length });
      } catch (saveError) {
        const status =
          saveError && typeof saveError === 'object' && 'response' in saveError
            ? (saveError as any).response?.status
            : undefined;
        debugMapTiles('save_error', {
          message: saveError instanceof Error ? saveError.message : String(saveError),
          status,
        });
        toastService.error(
          status === 409 ? t('map_tiles.cell_occupied') : t('map_tiles.layout_save_error')
        );
        refetch();
      } finally {
        layoutSaveInFlightRef.current = false;
      }
    },
    [childProfileId, refetch, showBoardError, t, updateLayout]
  );

  const isCellInsideBounds = useCallback(
    (cell: BoardCell) =>
      cell.x >= boardBounds.minX &&
      cell.x <= boardBounds.maxX &&
      cell.y >= boardBounds.minY &&
      cell.y <= boardBounds.maxY,
    [boardBounds]
  );

  const isCompatibleAtCell = useCallback(
    (
      tile: CollectedMapTileApi,
      cell: BoardCell,
      lookup: Map<string, CollectedMapTileApi> = boardLookup
    ): boolean => {
      for (const side of Object.keys(sideDeltas) as MapTileSide[]) {
        const delta = sideDeltas[side];
        const neighbor = lookup.get(`${cell.x + delta.x}:${cell.y + delta.y}`);
        if (!neighbor || neighbor.id === tile.id) continue;
        const own = connectorGroup(tile.connectors?.[side]);
        const other = connectorGroup(neighbor.connectors?.[oppositeSide[side]]);
        if (own !== other) {
          return false;
        }
      }
      return true;
    },
    [boardLookup]
  );

  const setHoverCellState = useCallback((cell: BoardCell | null) => {
    hoverCellRef.current = cell;
    setHoverCell(cell);
  }, []);

  const boardTopLeftForCell = useCallback(
    (cell: BoardCell) => {
      if (!boardRect) return { left: 0, top: 0 };
      return {
        left: boardRect.width / 2 + pan.x + cell.x * CELL_SIZE * zoom,
        top: boardRect.height / 2 + pan.y + cell.y * CELL_SIZE * zoom,
      };
    },
    [boardRect, pan.x, pan.y, zoom]
  );

  const getDragReturnTarget = useCallback(
    (state: DragState) => {
      if (state.source.kind === 'board' && boardRect) {
        const pos = boardTopLeftForCell({
          x: state.source.boardX,
          y: state.source.boardY,
        });
        return {
          left: boardRect.x + pos.left,
          top: boardRect.y + pos.top,
        };
      }

      if (state.source.kind === 'inventory' && inventoryRect) {
        return {
          left:
            inventoryRect.x +
            INVENTORY_PADDING +
            state.source.index * (CELL_SIZE + INVENTORY_GAP) -
            inventoryScrollX,
          top: inventoryRect.y + inventoryRect.height - CELL_SIZE - theme.spacing[5],
        };
      }

      return { left: state.left, top: state.top };
    },
    [boardRect, boardTopLeftForCell, inventoryRect, inventoryScrollX]
  );

  const animateDragReturn = useCallback(
    (state: DragState) => {
      const target = getDragReturnTarget(state);
      returnAnim.stopAnimation();
      returnAnim.setValue(0);
      setReturningDrag({
        tile: state.tile,
        source: state.source,
        fromLeft: state.left,
        fromTop: state.top,
        toLeft: target.left,
        toTop: target.top,
        displaySize: state.displaySize,
      });
      setDrag(null);
      debugMapTiles('drop_return_animated', {
        tileId: state.tile.id,
        source: state.source,
        fromLeft: Math.round(state.left),
        fromTop: Math.round(state.top),
        toLeft: Math.round(target.left),
        toTop: Math.round(target.top),
      });
      Animated.timing(returnAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        setReturningDrag(null);
        returnAnim.setValue(0);
      });
    },
    [getDragReturnTarget, returnAnim]
  );

  const screenToBoardPoint = useCallback(
    (pageX: number, pageY: number) => {
      if (!boardRect) return null;
      const localX = pageX - boardRect.x;
      const localY = pageY - boardRect.y;
      return {
        x: (localX - boardRect.width / 2 - pan.x) / zoom,
        y: (localY - boardRect.height / 2 - pan.y) / zoom,
      };
    },
    [boardRect, pan.x, pan.y, zoom]
  );

  const findHoverBoardCell = useCallback(
    (state: DragState): BoardCell | null => {
      const topLeft = screenToBoardPoint(state.left, state.top);
      const bottomRight = screenToBoardPoint(
        state.left + state.displaySize,
        state.top + state.displaySize
      );
      if (!topLeft || !bottomRight) return null;

      const tileLeft = Math.min(topLeft.x, bottomRight.x);
      const tileRight = Math.max(topLeft.x, bottomRight.x);
      const tileTop = Math.min(topLeft.y, bottomRight.y);
      const tileBottom = Math.max(topLeft.y, bottomRight.y);
      const tileArea = Math.max(0, tileRight - tileLeft) * Math.max(0, tileBottom - tileTop);
      if (tileArea <= 0) return null;

      const minCellX = Math.floor(tileLeft / CELL_SIZE);
      const maxCellX = Math.floor((tileRight - 0.001) / CELL_SIZE);
      const minCellY = Math.floor(tileTop / CELL_SIZE);
      const maxCellY = Math.floor((tileBottom - 0.001) / CELL_SIZE);

      let bestCell: BoardCell | null = null;
      let bestOverlapArea = 0;

      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const cell = { x: cellX, y: cellY };
          if (!isCellInsideBounds(cell)) continue;

          const cellLeft = cellX * CELL_SIZE;
          const cellRight = cellLeft + CELL_SIZE;
          const cellTop = cellY * CELL_SIZE;
          const cellBottom = cellTop + CELL_SIZE;
          const overlapWidth = Math.max(
            0,
            Math.min(tileRight, cellRight) - Math.max(tileLeft, cellLeft)
          );
          const overlapHeight = Math.max(
            0,
            Math.min(tileBottom, cellBottom) - Math.max(tileTop, cellTop)
          );
          const overlapArea = overlapWidth * overlapHeight;

          if (overlapArea > bestOverlapArea) {
            bestOverlapArea = overlapArea;
            bestCell = cell;
          }
        }
      }

      return bestOverlapArea >= tileArea * BOARD_HOVER_MIN_OVERLAP_RATIO ? bestCell : null;
    },
    [isCellInsideBounds, screenToBoardPoint]
  );

  const setInventoryHoverWithDelay = useCallback((index: number | null) => {
    if (splitTimerRef.current) {
      clearTimeout(splitTimerRef.current);
      splitTimerRef.current = null;
    }
    if (index === null) {
      hoverInventoryRef.current = null;
      setHoverInventory(null);
      return;
    }
    const pendingHover = { index, ready: false };
    hoverInventoryRef.current = pendingHover;
    setHoverInventory(pendingHover);
    splitTimerRef.current = setTimeout(() => {
      setHoverInventory((current) =>
        current && current.index === index
          ? (() => {
              const readyHover = { index, ready: true };
              hoverInventoryRef.current = readyHover;
              return readyHover;
            })()
          : current
      );
    }, SPLIT_DELAY_MS);
  }, []);

  const findHoverInventoryIndex = useCallback(
    (state: DragState): number | null => {
      if (!inventoryRect || inventoryCollapsed) return null;
      const centerX = state.left + state.displaySize / 2;
      const centerY = state.top + state.displaySize / 2;
      const inside =
        centerX >= inventoryRect.x &&
        centerX <= inventoryRect.x + inventoryRect.width &&
        centerY >= inventoryRect.y &&
        centerY <= inventoryRect.y + inventoryRect.height;
      if (!inside) return null;
      const localX = centerX - inventoryRect.x + inventoryScrollX - INVENTORY_PADDING;
      return clamp(Math.round(localX / (CELL_SIZE + INVENTORY_GAP)), 0, inventoryTiles.length);
    },
    [inventoryCollapsed, inventoryRect, inventoryScrollX, inventoryTiles.length]
  );

  const updateDragHover = useCallback(
    (nextDrag: DragState) => {
      const inventoryIndex = findHoverInventoryIndex(nextDrag);
      if (inventoryIndex !== null) {
        const hoverKey = `inventory:${inventoryIndex}`;
        if (lastHoverDebugRef.current !== hoverKey) {
          lastHoverDebugRef.current = hoverKey;
          debugMapTiles('hover_inventory', { index: inventoryIndex });
        }
        setHoverCellState(null);
        setInventoryHoverWithDelay(inventoryIndex);
        return;
      }
      setInventoryHoverWithDelay(null);
      const boardCell = findHoverBoardCell(nextDrag);
      const hoverKey = boardCell ? `board:${boardCell.x}:${boardCell.y}` : 'none';
      if (lastHoverDebugRef.current !== hoverKey) {
        lastHoverDebugRef.current = hoverKey;
        debugMapTiles(boardCell ? 'hover_board' : 'hover_none', {
          cell: boardCell,
          boardRect: compactRect(boardRect),
          inventoryRect: compactRect(inventoryRect),
          zoom,
          pan,
        });
      }
      setHoverCellState(boardCell);
    },
    [
      boardRect,
      findHoverBoardCell,
      findHoverInventoryIndex,
      inventoryRect,
      pan,
      setHoverCellState,
      setInventoryHoverWithDelay,
      zoom,
    ]
  );

  const handleTilePress = useCallback((tile: CollectedMapTileApi) => {
    setSelectedTileId(tile.id);
  }, []);

  const handleOpenSelectedStory = useCallback(() => {
    if (!selectedTile) return;
    navigation.navigate('Story', { storyId: selectedTile.story.id || selectedTile.storyId });
  }, [navigation, selectedTile]);

  const startDrag = useCallback(
    (
      tile: CollectedMapTileApi,
      source: DragSource,
      pageX: number,
      pageY: number,
      locationX: number,
      locationY: number,
      displaySize: number
    ) => {
      measureRects();
      returnAnim.stopAnimation();
      returnAnim.setValue(0);
      setReturningDrag(null);
      setSelectedTileId(null);
      const offsetX = Number.isFinite(locationX) ? locationX : displaySize / 2;
      const offsetY = Number.isFinite(locationY) ? locationY : displaySize / 2;
      const nextDrag: DragState = {
        tile,
        source,
        left: pageX - offsetX,
        top: pageY - offsetY,
        offsetX,
        offsetY,
        displaySize,
      };
      dragRef.current = nextDrag;
      hoverCellRef.current = null;
      hoverInventoryRef.current = null;
      lastHoverDebugRef.current = null;
      debugMapTiles('drag_start', {
        tileId: tile.id,
        source,
        pageX: Math.round(pageX),
        pageY: Math.round(pageY),
        offsetX: Math.round(offsetX),
        offsetY: Math.round(offsetY),
        displaySize: Math.round(displaySize),
        boardRect: compactRect(boardRect),
        inventoryRect: compactRect(inventoryRect),
      });
      setHoverCell(null);
      setHoverInventory(null);
      setDrag(nextDrag);
      return nextDrag;
    },
    [boardRect, inventoryRect, measureRects, returnAnim]
  );

  const finishDrag = useCallback(async () => {
    const currentDrag = dragRef.current;
    if (!currentDrag) {
      debugMapTiles('drop_without_drag');
      return;
    }
    const currentTiles = tilesRef.current;
    const currentInventoryTiles = inventoryTilesRef.current;
    const currentBoardLookup = boardLookupRef.current;
    const currentHoverInventory = hoverInventoryRef.current;
    const currentHoverCell = findHoverBoardCell(currentDrag) ?? hoverCellRef.current;
    const draggedId = currentDrag.tile.id;

    debugMapTiles('drop_attempt', {
      tileId: draggedId,
      source: currentDrag.source,
      hoverInventory: currentHoverInventory,
      hoverCell: currentHoverCell,
      dragLeft: Math.round(currentDrag.left),
      dragTop: Math.round(currentDrag.top),
      boardRect: compactRect(boardRect),
      inventoryRect: compactRect(inventoryRect),
    });

    dragRef.current = null;
    hoverCellRef.current = null;
    hoverInventoryRef.current = null;
    setHoverCellState(null);
    setInventoryHoverWithDelay(null);

    if (currentHoverInventory?.ready) {
      setDrag(null);
      debugMapTiles('drop_inventory_reorder', {
        tileId: draggedId,
        index: currentHoverInventory.index,
      });
      await saveTiles(reorderInventory(currentTiles, draggedId, currentHoverInventory.index));
      return;
    }

    if (currentHoverCell) {
      const occupied = currentBoardLookup.get(`${currentHoverCell.x}:${currentHoverCell.y}`);
      const occupiedByOther = occupied && occupied.id !== draggedId;
      const compatible = isCompatibleAtCell(currentDrag.tile, currentHoverCell, currentBoardLookup);
      if (!occupiedByOther && compatible) {
        setDrag(null);
        debugMapTiles('drop_board_success', {
          tileId: draggedId,
          cell: currentHoverCell,
        });
        const nextInventory = reorderInventory(currentTiles, draggedId, currentInventoryTiles.length).filter(
          (tile) => tile.id !== draggedId
        );
        const placedTile: CollectedMapTileApi = {
          ...currentDrag.tile,
          location: 'board',
          boardX: currentHoverCell.x,
          boardY: currentHoverCell.y,
          inventoryOrder: 0,
        };
        await saveTiles([...nextInventory, placedTile]);
        return;
      }
      debugMapTiles('drop_board_rejected', {
        tileId: draggedId,
        cell: currentHoverCell,
        occupiedByOther: Boolean(occupiedByOther),
        occupiedTileId: occupied?.id,
        compatible,
        connectors: currentDrag.tile.connectors,
        neighborCount: currentBoardLookup.size,
      });
      animateDragReturn(currentDrag);
      showBoardError(currentHoverCell);
      toastService.error(
        occupiedByOther ? t('map_tiles.cell_occupied') : t('map_tiles.connectors_mismatch')
      );
      return;
    }

    if (currentDrag.source.kind === 'board') {
      debugMapTiles('drop_board_return', {
        tileId: draggedId,
        source: currentDrag.source,
      });
      animateDragReturn(currentDrag);
      showBoardError({ x: currentDrag.source.boardX, y: currentDrag.source.boardY });
      return;
    }

    debugMapTiles('drop_no_target', {
      tileId: draggedId,
      source: currentDrag.source,
    });
    animateDragReturn(currentDrag);
  }, [
    animateDragReturn,
    boardRect,
    findHoverBoardCell,
    inventoryRect,
    isCompatibleAtCell,
    saveTiles,
    setHoverCellState,
    setInventoryHoverWithDelay,
    showBoardError,
    t,
  ]);

  const makeTilePanResponder = useCallback(
    (tile: CollectedMapTileApi, source: DragSource, displaySize: number) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactionModeRef.current === 'select',
        onMoveShouldSetPanResponder: () => interactionModeRef.current === 'select',
        onStartShouldSetPanResponderCapture: () => interactionModeRef.current === 'select',
        onMoveShouldSetPanResponderCapture: () => interactionModeRef.current === 'select',
        onShouldBlockNativeResponder: () => interactionModeRef.current === 'select',
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          if (interactionModeRef.current !== 'select') return;
          const point = readResponderPoint(event.nativeEvent as any, {
            locationX: displaySize / 2,
            locationY: displaySize / 2,
          });
          if (!point) {
            debugMapTiles('responder_grant_missing_point', {
              tileId: tile.id,
              nativeKeys: Object.keys(event.nativeEvent as any),
            });
            return;
          }
          debugMapTiles('responder_grant', {
            tileId: tile.id,
            source,
            pageX: Math.round(point.pageX),
            pageY: Math.round(point.pageY),
          });
          pendingTileInteractionRef.current = {
            tile,
            source,
            locationX: point.locationX,
            locationY: point.locationY,
            displaySize,
          };
        },
        onPanResponderMove: (event, gestureState) => {
          if (interactionModeRef.current !== 'select') return;
          const activeDrag = dragRef.current;
          if (!activeDrag) {
            const pending = pendingTileInteractionRef.current;
            if (!pending || pending.tile.id !== tile.id) return;
            const movement = Math.hypot(gestureState.dx, gestureState.dy);
            if (movement < TILE_DRAG_START_THRESHOLD) return;
            const point = readResponderPoint(event.nativeEvent as any, {
              pageX: gestureState.moveX,
              pageY: gestureState.moveY,
              locationX: pending.locationX,
              locationY: pending.locationY,
            });
            if (!point) {
              debugMapTiles('drag_move_missing_point', {
                tileId: tile.id,
                nativeKeys: Object.keys(event.nativeEvent as any),
              });
              return;
            }
            pendingTileInteractionRef.current = null;
            const startedDrag = startDrag(
              tile,
              source,
              point.pageX,
              point.pageY,
              pending.locationX,
              pending.locationY,
              displaySize
            );
            updateDragHover(startedDrag);
            return;
          }

          setDrag((current) => {
            const currentDrag = current ?? activeDrag;
            if (!currentDrag || currentDrag.tile.id !== tile.id) return current;
            const point = readResponderPoint(event.nativeEvent as any, {
              pageX: gestureState.moveX,
              pageY: gestureState.moveY,
              locationX: currentDrag.offsetX,
              locationY: currentDrag.offsetY,
            });
            if (!point) {
              debugMapTiles('drag_move_missing_point', {
                tileId: tile.id,
                nativeKeys: Object.keys(event.nativeEvent as any),
              });
              return current;
            }
            const next = {
              ...currentDrag,
              left: point.pageX - currentDrag.offsetX,
              top: point.pageY - currentDrag.offsetY,
            };
            dragRef.current = next;
            const now = Date.now();
            if (now - lastDragDebugAtRef.current > 350) {
              lastDragDebugAtRef.current = now;
              debugMapTiles('drag_move', {
                tileId: tile.id,
                left: Math.round(next.left),
                top: Math.round(next.top),
                pageX: Math.round(point.pageX),
                pageY: Math.round(point.pageY),
              });
            }
            updateDragHover(next);
            return next;
          });
        },
        onPanResponderRelease: () => {
          if (interactionModeRef.current !== 'select') return;
          const pending = pendingTileInteractionRef.current;
          pendingTileInteractionRef.current = null;
          if (!dragRef.current && pending?.tile.id === tile.id) {
            handleTilePress(tile);
            return;
          }
          finishDrag();
        },
        onPanResponderTerminate: () => {
          if (interactionModeRef.current !== 'select') return;
          pendingTileInteractionRef.current = null;
          if (!dragRef.current) return;
          finishDrag();
        },
      }),
    [finishDrag, handleTilePress, startDrag, updateDragHover]
  );

  const boardPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactionModeRef.current === 'pan',
        onMoveShouldSetPanResponder: () => interactionModeRef.current === 'pan',
        onPanResponderGrant: (event) => {
          if (interactionModeRef.current !== 'pan') return;
          setSelectedTileId(null);
          setIsMapPanning(true);
          panGestureRef.current = {
            panX: panRef.current.x,
            panY: panRef.current.y,
            zoom: zoomRef.current,
            touchDistance: distanceBetweenTouches(event.nativeEvent.touches as any),
          };
        },
        onPanResponderMove: (event, gestureState) => {
          if (interactionModeRef.current !== 'pan') return;
          const touches = event.nativeEvent.touches as any;
          if (touches.length >= 2) {
            const distance = distanceBetweenTouches(touches);
            const initialDistance = panGestureRef.current.touchDistance || distance;
            if (initialDistance > 0) {
              setZoom(clamp(panGestureRef.current.zoom * (distance / initialDistance), MIN_ZOOM, MAX_ZOOM));
            }
            return;
          }
          setPan({
            x: panGestureRef.current.panX + gestureState.dx,
            y: panGestureRef.current.panY + gestureState.dy,
          });
        },
        onPanResponderRelease: () => {
          setIsMapPanning(false);
        },
        onPanResponderTerminate: () => {
          setIsMapPanning(false);
        },
      }),
    []
  );

  const handleBoardWheel = useCallback(
    (event: any) => {
      if (Platform.OS !== 'web') return;

      const nativeEvent = event.nativeEvent ?? event;
      if (nativeEvent && typeof nativeEvent === 'object') {
        if (handledWheelEventsRef.current.has(nativeEvent)) return;
        handledWheelEventsRef.current.add(nativeEvent);
      }

      event.preventDefault?.();
      event.stopPropagation?.();
      event.nativeEvent?.preventDefault?.();
      event.nativeEvent?.stopPropagation?.();

      const rawDeltaY = firstFinite(nativeEvent.deltaY) ?? 0;
      if (rawDeltaY === 0) return;

      const deltaMode = firstFinite(nativeEvent.deltaMode) ?? 0;
      const normalizedDeltaY = rawDeltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
      const zoomFactor = clamp(
        Math.exp(-normalizedDeltaY * WHEEL_ZOOM_SENSITIVITY),
        0.82,
        1.22
      );
      const currentZoom = zoomRef.current;
      const nextZoom = clamp(currentZoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(nextZoom - currentZoom) < 0.001) return;

      if (!boardRect) {
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        return;
      }

      const pageX =
        firstFinite(nativeEvent.pageX, nativeEvent.clientX) ?? boardRect.x + boardRect.width / 2;
      const pageY =
        firstFinite(nativeEvent.pageY, nativeEvent.clientY) ?? boardRect.y + boardRect.height / 2;
      const localX = pageX - boardRect.x;
      const localY = pageY - boardRect.y;
      const currentPan = panRef.current;
      const worldX = (localX - boardRect.width / 2 - currentPan.x) / currentZoom;
      const worldY = (localY - boardRect.height / 2 - currentPan.y) / currentZoom;
      const nextPan = {
        x: localX - boardRect.width / 2 - worldX * nextZoom,
        y: localY - boardRect.height / 2 - worldY * nextZoom,
      };

      panRef.current = nextPan;
      zoomRef.current = nextZoom;
      setPan(nextPan);
      setZoom(nextZoom);
    },
    [boardRect]
  );

  const boardWheelProps = useMemo(
    () =>
      Platform.OS === 'web'
        ? ({
            onWheel: handleBoardWheel,
            onWheelCapture: handleBoardWheel,
          } as any)
        : {},
    [handleBoardWheel]
  );

  const clearRewardRouteParams = useCallback(() => {
    if (!route.params?.rewardTileId && !route.params?.storyId) return;
    navigation.setParams({
      rewardTileId: undefined,
      storyId: undefined,
    });
  }, [navigation, route.params?.rewardTileId, route.params?.storyId]);

  useEffect(() => {
    const rewardTileId = route.params?.rewardTileId;
    if (!rewardTileId || rewardSeenRef.current === rewardTileId) return;
    const tile = tiles.find((item) => item.id === rewardTileId);
    if (!tile) {
      if (!isLoading) {
        rewardSeenRef.current = rewardTileId;
        clearRewardRouteParams();
      }
      return;
    }

    if (tile.location !== 'inventory') {
      rewardSeenRef.current = rewardTileId;
      setRewardTile(null);
      clearRewardRouteParams();
      return;
    }

    rewardSeenRef.current = rewardTileId;
    rewardAnimationStartedRef.current = null;
    rewardScrollPreparedRef.current = null;
    setRewardTargetRect(null);
    setInventoryCollapsed(false);
    rewardAnim.setValue(0);
    setRewardTile(tile);
  }, [clearRewardRouteParams, isLoading, rewardAnim, route.params?.rewardTileId, tiles]);

  useEffect(() => {
    if (!rewardTile || !inventoryRect) return;
    if (rewardScrollPreparedRef.current === rewardTile.id) return;

    const targetIndex = inventoryTiles.findIndex((tile) => tile.id === rewardTile.id);
    if (targetIndex < 0) {
      setRewardTile(null);
      setRewardTargetRect(null);
      rewardAnimationStartedRef.current = null;
      rewardScrollPreparedRef.current = null;
      rewardAnim.setValue(0);
      clearRewardRouteParams();
      return;
    }

    const targetCenterX =
      INVENTORY_PADDING + targetIndex * (CELL_SIZE + INVENTORY_GAP) + CELL_SIZE / 2;
    const desiredScrollX = Math.max(0, targetCenterX - inventoryRect.width / 2);

    rewardScrollPreparedRef.current = rewardTile.id;
    setRewardTargetRect(null);
    setInventoryScrollX(desiredScrollX);
    inventoryScrollRef.current?.scrollTo({ x: desiredScrollX, animated: false });
    measureRewardTarget();
  }, [clearRewardRouteParams, inventoryRect, inventoryTiles, measureRewardTarget, rewardAnim, rewardTile]);

  useEffect(() => {
    if (!rewardTile || !rewardTargetRect) return;
    if (rewardAnimationStartedRef.current === rewardTile.id) return;

    rewardAnimationStartedRef.current = rewardTile.id;
    rewardAnim.setValue(0);
    Animated.sequence([
      Animated.timing(rewardAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.delay(1350),
      Animated.timing(rewardAnim, {
        toValue: 2,
        duration: 620,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setRewardTile(null);
      setRewardTargetRect(null);
      rewardAnimationStartedRef.current = null;
      rewardScrollPreparedRef.current = null;
      rewardAnim.setValue(0);
      clearRewardRouteParams();
      measureRects();
    });
  }, [clearRewardRouteParams, measureRects, rewardAnim, rewardTargetRect, rewardTile]);

  const rewardFlightLayout = useMemo(() => {
    if (!rewardTile || !rewardTargetRect) return null;
    const origin = rootRect ?? { x: 0, y: 0, width, height };
    const targetLeft = rewardTargetRect.x - origin.x;
    const targetTop = rewardTargetRect.y - origin.y;
    const targetWidth = rewardTargetRect.width || CELL_SIZE;
    const targetHeight = rewardTargetRect.height || CELL_SIZE;
    const startLeft = (origin.width - targetWidth) / 2;
    const startTop = (origin.height - targetHeight) / 2;

    return {
      left: targetLeft,
      top: targetTop,
      width: targetWidth,
      height: targetHeight,
      translateX: startLeft - targetLeft,
      translateY: startTop - targetTop,
    };
  }, [height, rewardTargetRect, rewardTile, rootRect, width]);

  const renderTileImage = (tile: CollectedMapTileApi, size: number) => {
    const imageUrl = tileImageUrl(tile);
    return imageUrl ? (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.tileImage as ImageStyle, { width: size, height: size }]}
        resizeMode="cover"
      />
    ) : (
      <View style={[styles.tileFallback, { width: size, height: size }]}>
        <Ionicons name="map-outline" size={48} color={theme.colors.text.tertiary} />
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.centerText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.status.error} />
        <Text style={styles.centerTitle}>{t('common.error')}</Text>
        <Text style={styles.centerText}>{(error as Error).message}</Text>
      </View>
    );
  }

  const tileDetailsBottom =
    (inventoryCollapsed ? INVENTORY_COLLAPSED_HEIGHT : INVENTORY_HEIGHT) + theme.spacing[3];
  const tileDetailsDynamicStyle =
    width >= 760
      ? {
          right: theme.spacing[4],
          bottom: tileDetailsBottom,
          width: Math.min(380, width - theme.spacing[8]),
        }
      : {
          left: theme.spacing[3],
          right: theme.spacing[3],
          bottom: tileDetailsBottom,
        };

  return (
    <View ref={rootRef} testID="map-tiles-screen" style={styles.root} onLayout={measureRects}>
      <View
        ref={boardRef}
        testID="map-tiles-board"
        pointerEvents={isMapReady ? 'auto' : 'none'}
        style={[
          styles.board,
          !isMapReady && styles.mapSurfaceHidden,
          Platform.OS === 'web'
            ? ({
                cursor: interactionMode === 'pan' ? (isMapPanning ? 'grabbing' : 'grab') : 'default',
                overscrollBehavior: 'none',
                overscrollBehaviorX: 'none',
                overscrollBehaviorY: 'none',
                touchAction: 'none',
              } as any)
            : null,
        ]}
        onLayout={handleBoardLayout}
        {...boardPanResponder.panHandlers}
        {...boardWheelProps}
      >
        {tiles.length === 0 && !rewardTile && (
          <View style={styles.emptyState}>
            <Ionicons name="map-outline" size={44} color={theme.colors.text.tertiary} />
            <Text style={styles.centerTitle}>{t('map_tiles.empty_title')}</Text>
            <Text style={styles.centerText}>{t('map_tiles.empty_subtitle')}</Text>
          </View>
        )}

        {hoverCell && boardRect && (
          <View
            testID="map-hover-cell"
            pointerEvents="none"
            style={[
              styles.snapCell,
              {
                left: boardTopLeftForCell(hoverCell).left,
                top: boardTopLeftForCell(hoverCell).top,
                width: CELL_SIZE * zoom,
                height: CELL_SIZE * zoom,
              },
            ]}
          />
        )}

        {boardError && boardRect && (
          <View
            testID="map-error-cell"
            pointerEvents="none"
            style={[
              styles.errorCell,
              {
                left: boardTopLeftForCell(boardError).left,
                top: boardTopLeftForCell(boardError).top,
                width: CELL_SIZE * zoom,
                height: CELL_SIZE * zoom,
              },
            ]}
          />
        )}

        {boardTiles.map((tile) => {
          const cell = { x: tile.boardX ?? 0, y: tile.boardY ?? 0 };
          const pos = boardTopLeftForCell(cell);
          const displaySize = CELL_SIZE * zoom;
          const responder = makeTilePanResponder(
            tile,
            { kind: 'board', boardX: cell.x, boardY: cell.y },
            displaySize
          );
          const isDragging = drag?.tile.id === tile.id || returningDrag?.tile.id === tile.id;
          const isSelected = selectedTileId === tile.id;
          return (
            <View
              key={tile.id}
              testID={`map-board-tile-${tile.id}`}
              pointerEvents={interactionMode === 'pan' ? 'none' : 'auto'}
              style={[
                styles.boardTile,
                isSelected && styles.selectedTile,
                {
                  left: pos.left,
                  top: pos.top,
                  width: displaySize,
                  height: displaySize,
                  opacity: isDragging ? 0.25 : 1,
                },
              ]}
              {...responder.panHandlers}
            >
              {renderTileImage(tile, displaySize)}
            </View>
          );
        })}
      </View>

      <View
        ref={inventoryRef}
        testID="map-tiles-inventory"
        pointerEvents={isMapReady ? 'auto' : 'none'}
        style={[
          styles.inventory,
          inventoryCollapsed && styles.inventoryCollapsed,
          !isMapReady && styles.mapSurfaceHidden,
        ]}
        onLayout={handleInventoryLayout}
      >
        <View style={[styles.inventoryHeader, inventoryCollapsed && styles.inventoryHeaderCollapsed]}>
          <View style={styles.inventoryHeaderText}>
            <Text style={styles.inventoryTitle}>{t('map_tiles.inventory_title')}</Text>
            <Text style={styles.inventoryHint}>
              {t('map_tiles.inventory_count', {
                count: rewardTile ? visibleInventoryCount : inventoryTiles.length,
              })}
            </Text>
          </View>
          <TouchableOpacity
            testID="map-inventory-toggle"
            accessibilityRole="button"
            accessibilityLabel={t(
              inventoryCollapsed ? 'map_tiles.inventory_expand' : 'map_tiles.inventory_collapse'
            )}
            disabled={Boolean(drag || returningDrag || rewardTile)}
            style={[
              styles.inventoryToggle,
              Boolean(drag || returningDrag || rewardTile) && styles.inventoryToggleDisabled,
            ]}
            onPress={() => setInventoryCollapsed((collapsed) => !collapsed)}
          >
            <Ionicons
              name={inventoryCollapsed ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={22}
              color={theme.colors.text.secondary}
            />
          </TouchableOpacity>
        </View>
        {!inventoryCollapsed && (
          <ScrollView
            horizontal
            ref={inventoryScrollRef}
            testID="map-tiles-inventory-scroll"
            style={styles.inventoryScroll}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!drag && !returningDrag && !rewardTile}
            onScroll={handleInventoryScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.inventoryContent}
          >
            {visibleInventoryCount === 0 && !rewardTile && (
              <View style={styles.inventoryEmpty}>
                <Text style={styles.inventoryEmptyText}>{t('map_tiles.inventory_empty')}</Text>
              </View>
            )}
            {Array.from({ length: inventoryTiles.length + 1 }).map((_, index) => {
              const tile = inventoryTiles[index];
              const isRewardLandingTile = !!tile && tile.id === rewardTileId;
              const shouldRenderInsert = hoverInventory?.index === index && drag;
              const splitIndex = hoverInventory?.ready && drag ? hoverInventory.index : null;
              const splitShift =
                splitIndex === null
                  ? 0
                  : index < splitIndex
                    ? -Math.min(CELL_SIZE * 0.18, 42)
                    : index >= splitIndex
                      ? Math.min(CELL_SIZE * 0.18, 42)
                      : 0;
              return (
                <React.Fragment key={`slot-${index}`}>
                  {shouldRenderInsert && (
                    <View
                      style={[
                        styles.insertSlot,
                        hoverInventory?.ready && styles.insertSlotReady,
                      ]}
                    >
                      <View style={styles.insertIndicator} />
                    </View>
                  )}
                  {tile ? (
                    isRewardLandingTile ? (
                      <View
                        ref={(node) => {
                          rewardTargetRef.current = node;
                          if (node) measureRewardTarget();
                        }}
                        onLayout={measureRewardTarget}
                        style={[
                          styles.inventoryTile,
                          styles.rewardLandingSlot,
                          styles.inventoryTileMotion,
                          splitShift !== 0 && { transform: [{ translateX: splitShift }] },
                        ]}
                      />
                    ) : (
                      <View
                        testID={`map-inventory-tile-${tile.id}`}
                        style={[
                          styles.inventoryTile,
                          selectedTileId === tile.id && styles.selectedTile,
                          styles.inventoryTileMotion,
                          splitShift !== 0 && { transform: [{ translateX: splitShift }] },
                          (drag?.tile.id === tile.id || returningDrag?.tile.id === tile.id) &&
                            styles.inventoryTileDragging,
                        ]}
                        {...makeTilePanResponder(tile, { kind: 'inventory', index }, CELL_SIZE).panHandlers}
                      >
                        {renderTileImage(tile, CELL_SIZE)}
                      </View>
                    )
                  ) : null}
                </React.Fragment>
              );
            })}
          </ScrollView>
        )}
      </View>

      {isMapReady && selectedTile && !drag && !returningDrag && !rewardTile && (
        <View
          testID="map-tile-details"
          style={[styles.tileDetailsPanel, tileDetailsDynamicStyle]}
        >
          <View style={styles.tileDetailsImageFrame}>
            {selectedStoryImageUrl ? (
              <Image
                source={{ uri: selectedStoryImageUrl }}
                style={styles.tileDetailsImage as ImageStyle}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.tileDetailsImageFallback}>
                <Ionicons name="book-outline" size={30} color={theme.colors.text.tertiary} />
              </View>
            )}
          </View>
          <View style={styles.tileDetailsText}>
            <Text style={styles.tileDetailsTitle} numberOfLines={2}>
              {selectedTile.story.title}
            </Text>
            <TouchableOpacity
              testID="map-tile-open-story"
              accessibilityRole="button"
              style={styles.tileDetailsCta}
              onPress={handleOpenSelectedStory}
            >
              <Ionicons name="book-outline" size={17} color={theme.colors.white} />
              <Text style={styles.tileDetailsCtaText}>{t('artifacts.open_story')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            testID="map-tile-details-close"
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={styles.tileDetailsClose}
            onPress={() => setSelectedTileId(null)}
          >
            <Ionicons name="close-outline" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        </View>
      )}

      {isMapReady && drag && (
        <View
          pointerEvents="none"
          testID="map-drag-tile"
          style={[
            styles.dragTile,
            {
              left: drag.left - (rootRect?.x ?? 0),
              top: drag.top - (rootRect?.y ?? 0),
              width: drag.displaySize,
              height: drag.displaySize,
            },
          ]}
        >
          {renderTileImage(drag.tile, drag.displaySize)}
        </View>
      )}

      {isMapReady && returningDrag && (
        <Animated.View
          pointerEvents="none"
          testID="map-returning-tile"
          style={[
            styles.dragTile,
            {
              left: returnAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [
                  returningDrag.fromLeft - (rootRect?.x ?? 0),
                  returningDrag.toLeft - (rootRect?.x ?? 0),
                ],
              }),
              top: returnAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [
                  returningDrag.fromTop - (rootRect?.y ?? 0),
                  returningDrag.toTop - (rootRect?.y ?? 0),
                ],
              }),
              width: returningDrag.displaySize,
              height: returningDrag.displaySize,
            },
          ]}
        >
          {renderTileImage(returningDrag.tile, returningDrag.displaySize)}
        </Animated.View>
      )}

      {isMapReady && rewardTile && rewardFlightLayout && (
        <View pointerEvents="none" style={styles.rewardOverlay}>
          <Animated.View
            style={[
              styles.rewardBackdrop,
              {
                opacity: rewardAnim.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [0, 0.72, 0],
                }),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.rewardFlightTile,
              {
                left: rewardFlightLayout.left,
                top: rewardFlightLayout.top,
                width: rewardFlightLayout.width,
                height: rewardFlightLayout.height,
                opacity: rewardAnim.interpolate({
                  inputRange: [0, 0.15, 1.7, 2],
                  outputRange: [0, 1, 1, 1],
                }),
                transform: [
                  {
                    translateX: rewardAnim.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [rewardFlightLayout.translateX, rewardFlightLayout.translateX, 0],
                    }),
                  },
                  {
                    translateY: rewardAnim.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [rewardFlightLayout.translateY, rewardFlightLayout.translateY, 0],
                    }),
                  },
                  {
                    scale: rewardAnim.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [1.08, 1.08, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {renderTileImage(rewardTile, rewardFlightLayout.width)}
          </Animated.View>
        </View>
      )}

      {isMapReady && (
        <View pointerEvents="box-none" style={styles.mapControls}>
          <View pointerEvents="none" style={styles.zoomBadge}>
            <Ionicons name="search-outline" size={16} color={theme.colors.text.secondary} />
            <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
          </View>
          <View style={styles.modeControls} testID="map-mode-controls">
            <TouchableOpacity
              testID="map-mode-pan"
              accessibilityRole="button"
              accessibilityLabel={t('map_tiles.mode_pan')}
              accessibilityState={{ selected: interactionMode === 'pan' }}
              style={[styles.modeButton, interactionMode === 'pan' && styles.modeButtonActive]}
              onPress={() => setInteractionMode('pan')}
            >
              <Ionicons
                name="move-outline"
                size={19}
                color={interactionMode === 'pan' ? theme.colors.white : theme.colors.text.secondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              testID="map-mode-select"
              accessibilityRole="button"
              accessibilityLabel={t('map_tiles.mode_select')}
              accessibilityState={{ selected: interactionMode === 'select' }}
              style={[styles.modeButton, interactionMode === 'select' && styles.modeButtonActive]}
              onPress={() => setInteractionMode('select')}
            >
              <Ionicons
                name="navigate-outline"
                size={19}
                color={interactionMode === 'select' ? theme.colors.white : theme.colors.text.secondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!isMapReady && (
        <View testID="map-preparing-overlay" pointerEvents="auto" style={styles.mapPreparingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
          <Text style={styles.centerText}>{t('common.loading')}</Text>
        </View>
      )}
    </View>
  );
}

const webSmoothWidth = Platform.select({
  web: {
    transition: 'width 220ms ease' as any,
  },
  default: {},
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F1EA',
    overflow: 'hidden',
  },
  board: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F4F1EA',
  },
  mapSurfaceHidden: {
    opacity: 0,
  },
  mapPreparingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    backgroundColor: '#F4F1EA',
  },
  boardTile: {
    position: 'absolute',
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.secondary,
    shadowColor: theme.colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  selectedTile: {
    zIndex: 2,
    ...Platform.select({
      web: {
        outlineColor: theme.colors.interactive.primary,
        outlineOffset: 2,
        outlineStyle: 'solid',
        outlineWidth: 2,
      } as any,
      default: {
        shadowColor: theme.colors.interactive.primary,
        shadowOpacity: 0.55,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
      },
    }),
  },
  tileImage: {
    borderRadius: 0,
    backgroundColor: theme.colors.background.tertiary,
  },
  tileFallback: {
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
  },
  snapCell: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'rgba(49, 130, 206, 0.72)',
    backgroundColor: 'rgba(49, 130, 206, 0.1)',
  },
  errorCell: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 4,
    borderColor: theme.colors.status.error,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
  },
  inventory: {
    height: INVENTORY_HEIGHT,
    backgroundColor: modernColors.surface,
    borderTopWidth: 1,
    borderTopColor: modernColors.border,
    paddingTop: theme.spacing[3],
    overflow: 'hidden',
    ...Platform.select({
      web: {
        transition: 'height 220ms ease' as any,
      },
      default: {},
    }),
  },
  inventoryCollapsed: {
    height: INVENTORY_COLLAPSED_HEIGHT,
    paddingTop: INVENTORY_COLLAPSED_VERTICAL_PADDING,
    paddingBottom: INVENTORY_COLLAPSED_VERTICAL_PADDING,
  },
  inventoryHeader: {
    minHeight: INVENTORY_COLLAPSED_HEIGHT - theme.spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    paddingHorizontal: INVENTORY_PADDING,
    marginBottom: theme.spacing[2],
  },
  inventoryHeaderCollapsed: {
    minHeight: INVENTORY_COLLAPSED_HEIGHT - INVENTORY_COLLAPSED_VERTICAL_PADDING * 2,
    marginBottom: 0,
  },
  inventoryHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  inventoryToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: modernColors.border,
  },
  inventoryToggleDisabled: {
    opacity: 0.45,
  },
  inventoryScroll: {
    height: CELL_SIZE + theme.spacing[3],
  },
  inventoryTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  inventoryHint: {
    marginTop: 2,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
  },
  inventoryContent: {
    minWidth: '100%',
    alignItems: 'center',
    paddingHorizontal: INVENTORY_PADDING,
    paddingBottom: theme.spacing[3],
  },
  inventoryTile: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginRight: INVENTORY_GAP,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.secondary,
  },
  inventoryTileMotion: Platform.select({
    web: {
      transition: 'transform 220ms ease, opacity 160ms ease' as any,
    },
    default: {},
  }) as any,
  inventoryTileDragging: {
    opacity: 0.25,
  },
  rewardLandingSlot: {
    opacity: 0,
  },
  inventoryEmpty: {
    height: CELL_SIZE,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
  },
  inventoryEmptyText: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.fontSize.base,
  },
  insertSlot: {
    width: 12,
    height: CELL_SIZE,
    marginRight: INVENTORY_GAP,
    alignItems: 'center',
    justifyContent: 'center',
    ...webSmoothWidth,
  },
  insertSlotReady: {
    width: CELL_SIZE + INVENTORY_GAP,
  },
  insertIndicator: {
    width: 5,
    height: CELL_SIZE - 18,
    borderRadius: 3,
    backgroundColor: theme.colors.interactive.primary,
  },
  dragTile: {
    position: 'absolute',
    zIndex: 20,
    borderRadius: 0,
    overflow: 'hidden',
    shadowColor: theme.colors.black,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 12,
  },
  tileDetailsPanel: {
    position: 'absolute',
    zIndex: 23,
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    paddingRight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 116, 84, 0.22)',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    shadowColor: theme.colors.black,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px)' as any,
      },
      default: {},
    }),
  },
  tileDetailsImageFrame: {
    width: 104,
    height: 78,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: theme.colors.background.tertiary,
  },
  tileDetailsImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.background.tertiary,
  },
  tileDetailsImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
  },
  tileDetailsText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[2],
  },
  tileDetailsTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    lineHeight: 20,
  },
  tileDetailsCta: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: theme.spacing[3],
    borderRadius: 999,
    backgroundColor: theme.colors.interactive.primary,
  },
  tileDetailsCtaText: {
    color: theme.colors.white,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  tileDetailsClose: {
    position: 'absolute',
    top: theme.spacing[2],
    right: theme.spacing[2],
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  rewardOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111827',
  },
  rewardFlightTile: {
    position: 'absolute',
    borderRadius: 0,
    overflow: 'hidden',
    shadowColor: theme.colors.black,
    shadowOpacity: 0.26,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  mapControls: {
    position: 'absolute',
    top: theme.spacing[4],
    right: theme.spacing[4],
    zIndex: 24,
    alignItems: 'flex-end',
    gap: theme.spacing[2],
  },
  zoomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  modeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.86)',
    shadowColor: theme.colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  modeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: theme.colors.interactive.primary,
  },
  zoomText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  emptyState: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[6],
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    backgroundColor: '#F4F1EA',
  },
  centerTitle: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.fontSize.xl,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: 'center',
  },
  centerText: {
    marginTop: theme.spacing[2],
    maxWidth: 360,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
