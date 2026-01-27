import { BREAKPOINTS } from '@/config/constants';

interface ResponsiveValueMap<T> {
  mobile: T;
  tablet: T;
  desktop: T;
}

export function getResponsiveValue<T>(
  values: Partial<ResponsiveValueMap<T>>,
  width: number
): T | undefined {
  if (width >= BREAKPOINTS.desktop && values.desktop !== undefined) {
    return values.desktop;
  }
  if (width >= BREAKPOINTS.tablet && values.tablet !== undefined) {
    return values.tablet;
  }
  return values.mobile;
}
