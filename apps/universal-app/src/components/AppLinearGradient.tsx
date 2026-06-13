import React from 'react';
import { Platform, UIManager, View, type ViewProps } from 'react-native';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

type LinearGradientProps = React.ComponentProps<typeof ExpoLinearGradient>;

const NATIVE_GRADIENT_MANAGER_NAMES = [
  'ExpoLinearGradient',
  'ViewManagerAdapter_ExpoLinearGradient',
] as const;

function hasNativeLinearGradientSupport(): boolean {
  if (Platform.OS === 'web') {
    return true;
  }

  return NATIVE_GRADIENT_MANAGER_NAMES.some((name) =>
    Boolean(UIManager.getViewManagerConfig?.(name))
  );
}

const nativeLinearGradientSupported = hasNativeLinearGradientSupport();

type SvgStopColor = {
  stopColor: string;
  stopOpacity?: number;
};

function buildLocations(colors: readonly string[] | undefined, locations?: readonly number[]) {
  if (!colors || colors.length === 0) {
    return [];
  }

  if (locations && locations.length === colors.length) {
    return locations;
  }

  if (colors.length === 1) {
    return [1];
  }

  return colors.map((_, index) => index / (colors.length - 1));
}

function getGradientAxisValue(
  point: LinearGradientProps['start'] | LinearGradientProps['end'],
  axis: 'x' | 'y',
  fallback: number
) {
  if (!point) {
    return fallback;
  }

  if (Array.isArray(point)) {
    return point[axis === 'x' ? 0 : 1] ?? fallback;
  }

  return point[axis] ?? fallback;
}

function parseHexChannel(value: string): number {
  return Number.parseInt(value, 16);
}

function normalizeSvgStopColor(color: string): SvgStopColor {
  const rgbaMatch = color.match(
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|0?\.\d+|1(?:\.0+)?)\s*\)$/i
  );
  if (rgbaMatch) {
    return {
      stopColor: `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`,
      stopOpacity: Number.parseFloat(rgbaMatch[4]),
    };
  }

  const rgbMatch = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    return {
      stopColor: `rgb(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]})`,
      stopOpacity: 1,
    };
  }

  const longHexAlphaMatch = color.match(/^#([0-9a-f]{8})$/i);
  if (longHexAlphaMatch) {
    const hex = longHexAlphaMatch[1];
    return {
      stopColor: `#${hex.slice(0, 6)}`,
      stopOpacity: parseHexChannel(hex.slice(6, 8)) / 255,
    };
  }

  const shortHexAlphaMatch = color.match(/^#([0-9a-f]{4})$/i);
  if (shortHexAlphaMatch) {
    const hex = shortHexAlphaMatch[1];
    return {
      stopColor: `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`,
      stopOpacity: parseHexChannel(`${hex[3]}${hex[3]}`) / 255,
    };
  }

  return {
    stopColor: color,
    stopOpacity: 1,
  };
}

function FallbackLinearGradient({
  colors,
  children,
  style,
  start,
  end,
  locations,
  ...viewProps
}: LinearGradientProps & ViewProps) {
  const gradientId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientStops = buildLocations(colors, locations ?? undefined);

  return (
    <View {...viewProps} style={style}>
      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <Defs>
          <SvgLinearGradient
            id={gradientId}
            x1={`${getGradientAxisValue(start, 'x', 0.5) * 100}%`}
            y1={`${getGradientAxisValue(start, 'y', 0) * 100}%`}
            x2={`${getGradientAxisValue(end, 'x', 0.5) * 100}%`}
            y2={`${getGradientAxisValue(end, 'y', 1) * 100}%`}
          >
            {(colors ?? []).map((color, index) => {
              const stop = normalizeSvgStopColor(color);
              return (
                <Stop
                  key={`${gradientId}-${index}`}
                  offset={`${(gradientStops[index] ?? 0) * 100}%`}
                  stopColor={stop.stopColor}
                  stopOpacity={stop.stopOpacity}
                />
              );
            })}
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      {children}
    </View>
  );
}

export function LinearGradient({ colors, children, style, ...rest }: LinearGradientProps) {
  if (nativeLinearGradientSupported) {
    return (
      <ExpoLinearGradient colors={colors} style={style} {...rest}>
        {children}
      </ExpoLinearGradient>
    );
  }

  const {
    colors: _colors,
    start: _start,
    end: _end,
    locations: _locations,
    dither: _dither,
    ...viewProps
  } = rest as LinearGradientProps &
    ViewProps & {
      dither?: boolean;
    };
  void _colors;
  void _start;
  void _end;
  void _locations;
  void _dither;

  return (
    <FallbackLinearGradient
      colors={colors}
      start={rest.start}
      end={rest.end}
      locations={rest.locations}
      {...viewProps}
      style={style}
    >
      {children}
    </FallbackLinearGradient>
  );
}

export default LinearGradient;
