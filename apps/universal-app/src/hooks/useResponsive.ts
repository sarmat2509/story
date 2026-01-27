import { useWindowDimensions } from 'react-native';
import { BREAKPOINTS } from '@/config/constants';

export interface ResponsiveValues {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
}

export function useResponsive(): ResponsiveValues {
  const { width, height } = useWindowDimensions();

  return {
    isMobile: width < BREAKPOINTS.tablet,
    isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
    isDesktop: width >= BREAKPOINTS.desktop,
    width,
    height,
  };
}
