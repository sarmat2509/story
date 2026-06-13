import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from '@/components/AppLinearGradient';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: 'soft' | 'strong';
  /** Override the iridescent rim colors. */
  borderColors?: readonly [string, string, ...string[]];
  /** Border radius of the card. Defaults to theme.borders.radius.xl. */
  radius?: number;
  /** Thickness of the gradient rim. Defaults to 1.5. */
  rim?: number;
}

// Default rim follows the active palette (soft primary tints, not fixed lavender).
const DEFAULT_BORDER_COLORS: readonly [string, string, string, string, string] = (() => {
  const p = theme.colors.primary;
  return [p[100], '#FFFFFF', p[200], '#FFFFFF', p[100]];
})();

/** Iridescent peach ↔ lavender rim — reserved for flagship surfaces. */
export const IRIDESCENT_BORDER_COLORS: readonly [string, string, string, string, string] = [
  '#F8B5A2',
  '#FBDCB4',
  '#F4C3DF',
  '#C7B5F2',
  '#F8B5A2',
];

/**
 * A frosted-glass surface inspired by the reference screenshot:
 *   - Iridescent peach↔lavender gradient rim (real gradient, not a flat border)
 *   - Heavy backdrop blur on web (24px blur + saturation bump)
 *   - Translucent white fill that lets the background scene read through
 *   - Soft top-left inner highlight that catches light
 *   - Layered, tinted shadow below
 */
const GLASS_OUTER_SHADOW = Platform.select({
  ios: {
    shadowColor: theme.colors.primary[900],
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
  },
  android: { elevation: 6 },
  web: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    boxShadow: `0 28px 60px -28px ${hexAlpha(theme.colors.primary[900], 0.32)}` as any,
  },
});

export function GlassCard({
  children,
  style,
  intensity = 'soft',
  borderColors = DEFAULT_BORDER_COLORS,
  radius = theme.borders.radius.xl,
  rim = 1.5,
}: GlassCardProps) {
  const innerRadius = Math.max(radius - rim, 0);

  return (
    <LinearGradient
      colors={borderColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[GLASS_OUTER_SHADOW, { borderRadius: radius, padding: rim }]}
    >
      <View
        style={[
          styles.inner,
          intensity === 'strong' ? styles.innerStrong : styles.innerSoft,
          { borderRadius: innerRadius },
          style,
        ]}
      >
        {/* Top-left inner highlight — soft catch-light along the upper rim. */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.55, y: 0.6 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: innerRadius }]}
        />
        {children}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  inner: {
    overflow: 'hidden',
    ...Platform.select({
      web: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        backdropFilter: 'blur(24px) saturate(160%)' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        WebkitBackdropFilter: 'blur(24px) saturate(160%)' as any,
      },
      default: {},
    }),
  },
  // On web we rely on backdrop-filter, so the fill can be more transparent
  // to actually show the blurred scene through. On native (no real blur)
  // we use a more opaque fill so it still reads as a clean surface.
  innerSoft: {
    backgroundColor: Platform.select({
      web: 'rgba(255, 255, 255, 0.45)',
      default: 'rgba(255, 255, 255, 0.78)',
    }),
  },
  innerStrong: {
    backgroundColor: Platform.select({
      web: 'rgba(255, 255, 255, 0.6)',
      default: 'rgba(255, 255, 255, 0.9)',
    }),
  },
});

export default GlassCard;
