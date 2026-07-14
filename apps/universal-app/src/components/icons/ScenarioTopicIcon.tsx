import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

interface ScenarioTopicIconProps {
  scenarioId: string;
  size?: number;
  color?: string;
}

function ScenarioArtwork({ scenarioId }: Pick<ScenarioTopicIconProps, 'scenarioId'>) {
  switch (scenarioId) {
    case 'magic_wizards':
      return (
        <>
          <Path d="m5 19 9-9" />
          <Path d="m12.5 8.5 3 3" />
          <Path d="m18 3 .65 1.85L20.5 5.5l-1.85.65L18 8l-.65-1.85-1.85-.65 1.85-.65L18 3Z" />
          <Path d="m7 4 .45 1.3L8.75 5.75l-1.3.45L7 7.5 6.55 6.2l-1.3-.45 1.3-.45L7 4Z" />
        </>
      );
    case 'fantasy_creatures':
      return (
        <>
          <Path d="M5 19c.2-5.4 1.8-9.2 6-11.5L10 4c3.7.7 6.3 2.6 7.5 5.6L20 9l-1.2 3.7c.1 4.1-2.2 6.3-6.8 6.3H5Z" />
          <Circle cx="14.5" cy="11" r=".75" fill="currentColor" stroke="none" />
          <Path d="M9 15.5c2.1 1 4.4.9 6.7-.4" />
        </>
      );
    case 'mysteries_detectives':
      return (
        <>
          <Circle cx="10.5" cy="10.5" r="5.5" />
          <Line x1="14.5" y1="14.5" x2="20" y2="20" />
          <Path d="M8.5 10.5c.4-1.2 1.2-1.8 2.4-1.8 1.3 0 2.2.8 2.2 1.8 0 1.4-1.8 1.6-1.8 2.7" />
          <Circle cx="11.3" cy="15.4" r=".55" fill="currentColor" stroke="none" />
        </>
      );
    case 'space_odyssey':
      return (
        <>
          <Path d="M14.2 4.2c2.2-1 4.2-1 5.6-.8.2 1.4.2 3.4-.8 5.6l-5.3 6.4-5.1-5.1 5.6-6.1Z" />
          <Circle cx="15.6" cy="7.6" r="1.6" />
          <Path d="m9.3 10.8-3.8.5-2.2 2.2 5.3 1.2" />
          <Path d="m13.3 14.8-.5 3.8-2.2 2.2-1.2-5.3" />
          <Path d="M6.8 17.2 4 20" />
        </>
      );
    case 'medieval_heroes':
      return (
        <>
          <Path d="M4.5 5.5 12 3l7.5 2.5v5.8c0 4.4-2.9 7.7-7.5 9.7-4.6-2-7.5-5.3-7.5-9.7V5.5Z" />
          <Path d="m9 13 6-6" />
          <Path d="m13.8 6.2 2 2" />
          <Path d="m8 12 4 4" />
        </>
      );
    case 'sea_treasures':
      return (
        <>
          <Path d="M5 10.5h14v8H5z" />
          <Path d="M5 13h14" />
          <Path d="M9 10.5V8.8C9 7.8 9.8 7 10.8 7h2.4c1 0 1.8.8 1.8 1.8v1.7" />
          <Rect x="10.5" y="12" width="3" height="3.5" rx=".7" fill="currentColor" stroke="none" />
          <Path d="M3.5 20.5c1.2-.7 2.3-.7 3.5 0s2.3.7 3.5 0 2.3-.7 3.5 0 2.3.7 3.5 0 2.3-.7 3.5 0" />
        </>
      );
    case 'super_powers':
      return (
        <>
          <Path d="M13.2 2.8 5.5 13h5.7l-.5 8.2L18.5 10h-5.7l.4-7.2Z" />
          <Path d="M5 5.5 3.5 4" />
          <Path d="M19 18.5 20.5 20" />
          <Path d="M19 5.5 20.5 4" />
          <Path d="M5 18.5 3.5 20" />
        </>
      );
    case 'enchanted_forest':
      return (
        <>
          <Path d="m12 3-5 7h3l-5 7h14l-5-7h3l-5-7Z" />
          <Path d="M12 17v4" />
          <Path d="m18.5 3 .45 1.3 1.3.45-1.3.45-.45 1.3-.45-1.3-1.3-.45 1.3-.45.45-1.3Z" />
        </>
      );
    case 'inventors':
      return (
        <>
          <Path d="M8.7 15.8c-.2-1.1-.7-1.8-1.3-2.6A6 6 0 1 1 17 13c-.7.9-1.2 1.7-1.4 2.8H8.7Z" />
          <Path d="M9 18h6" />
          <Path d="M10 21h4" />
          <Path d="M12 2V.8" />
          <Path d="m4.9 4.9-.9-.9" />
          <Path d="m19.1 4.9.9-.9" />
        </>
      );
    case 'jungle_adventures':
      return (
        <>
          <Path d="M20 4C12.4 4.1 6.6 7 5.1 12.1c-1 3.4.9 6.3 4 6.8 5.3.8 9.4-4.8 10.9-14.9Z" />
          <Path d="M4 21c2.5-5 6.3-8.7 11.7-11.2" />
          <Path d="M9.5 15.3 9 11" />
          <Path d="m13 11.8 3.5.2" />
        </>
      );
    case 'scary_stories':
      return (
        <>
          <Path d="M5 20V10a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
          <Circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <Circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <Path d="M10 14.5c1.3-.8 2.7-.8 4 0" />
        </>
      );
    case 'expeditions_world_travel':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Ellipse cx="12" cy="12" rx="4" ry="9" />
          <Path d="M3.5 9h17" />
          <Path d="M3.5 15h17" />
        </>
      );
    case 'macro_scifi':
      return (
        <>
          <Rect x="5" y="7" width="14" height="12" rx="3" />
          <Path d="M12 7V3" />
          <Circle cx="12" cy="2.5" r="1" />
          <Circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
          <Circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
          <Path d="M9 16h6" />
          <Path d="M5 11H3" />
          <Path d="M21 11h-2" />
        </>
      );
    case 'sports_competitions':
      return (
        <>
          <Path d="M8 4h8v4.5a4 4 0 0 1-8 0V4Z" />
          <Path d="M8 6H4.5v1.5A4.5 4.5 0 0 0 9 12" />
          <Path d="M16 6h3.5v1.5A4.5 4.5 0 0 1 15 12" />
          <Path d="M12 13v4" />
          <Path d="M8 20h8" />
          <Path d="M9.5 17h5" />
        </>
      );
    case 'science_facts':
      return (
        <>
          <Ellipse cx="12" cy="12" rx="9" ry="3.7" />
          <Ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(60 12 12)" />
          <Ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(120 12 12)" />
          <Circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </>
      );
    default:
      return (
        <>
          <Path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
          <Path d="m18.5 13 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
          <Path d="m5.5 14 .6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" />
        </>
      );
  }
}

/** A platform-consistent SVG topic icon keyed by a scenario card id. */
export function ScenarioTopicIcon({
  scenarioId,
  size = 22,
  color = '#5F4FC6',
}: ScenarioTopicIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" color={color}>
      <G fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <ScenarioArtwork scenarioId={scenarioId} />
      </G>
    </Svg>
  );
}
