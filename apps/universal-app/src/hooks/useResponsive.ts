import { useWindowDimensions } from 'react-native';
import { BREAKPOINTS } from '@/config/constants';

export interface ResponsiveValues {
  isMobile: boolean;
  isTablet: boolean;
  isTabletPortrait: boolean;
  isTabletLandscape: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
  isPortrait: boolean;
  isLandscape: boolean;
}

export function useResponsive(): ResponsiveValues {
  const { width, height } = useWindowDimensions();

  const isPortrait = height > width;
  const isLandscape = width >= height;
  const isMobile = width < BREAKPOINTS.tablet;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;

  return {
    isMobile,
    isTablet,
    isTabletPortrait: isTablet && isPortrait,
    isTabletLandscape: isTablet && isLandscape,
    isDesktop,
    width,
    height,
    isPortrait,
    isLandscape,
  };
}
