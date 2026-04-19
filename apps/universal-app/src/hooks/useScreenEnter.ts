import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Returns a number that increments every time the screen gains focus.
 * Pass the returned value to `<AnimatedSection trigger={key} />` so entrance
 * animations replay on every navigation back to the screen (not just first mount).
 *
 * Works with stack, drawer, and tab navigators.
 */
export function useScreenEnter(): number {
  const [key, setKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setKey((k) => k + 1);
    }, [])
  );

  return key;
}

export default useScreenEnter;
