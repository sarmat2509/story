import React from 'react';
import Svg, { Rect } from 'react-native-svg';

interface PauseIconProps {
  size?: number;
  color?: string;
}

/** Flat pause glyph matching the custom play triangle. */
export function PauseIcon({ size = 28, color = '#FFFFFF' }: PauseIconProps) {
  const barWidth = size * 0.23;
  const barHeight = size * 0.72;
  const top = (size - barHeight) / 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityElementsHidden>
      <Rect x={size * 0.2} y={top} width={barWidth} height={barHeight} rx={barWidth / 2} fill={color} />
      <Rect x={size * 0.57} y={top} width={barWidth} height={barHeight} rx={barWidth / 2} fill={color} />
    </Svg>
  );
}
