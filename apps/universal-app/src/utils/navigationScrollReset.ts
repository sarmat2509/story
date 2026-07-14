import { Platform } from 'react-native';

const SCROLLABLE_OVERFLOW_VALUES = new Set(['auto', 'scroll', 'overlay']);

function resetVisibleScrollContainers(): void {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

  const scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    scrollingElement.scrollTop = 0;
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  document.querySelectorAll<HTMLElement>('div, main, section, article').forEach((element) => {
    if (element.scrollTop <= 0 || element.getClientRects().length === 0) {
      return;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      !SCROLLABLE_OVERFLOW_VALUES.has(style.overflowY)
    ) {
      return;
    }

    element.scrollTop = 0;
  });
}

/**
 * React Navigation keeps tab and drawer screens mounted, so their web
 * ScrollViews retain scrollTop. Reset once immediately and once after the next
 * paint, when the newly focused screen is guaranteed to be visible.
 */
export function resetWebNavigationScroll(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  resetVisibleScrollContainers();
  window.requestAnimationFrame(resetVisibleScrollContainers);
}
