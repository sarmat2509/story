import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { theme } from '@/theme';

interface Props {
  allStoriesLabel: string;
  audioOnlyLabel: string;
  initialValue?: boolean; // Only used for initial useState, NOT reactive
  onToggle: (newValue: boolean) => void;
}

export interface AudioFilterToggleRef {
  setValue: (value: boolean) => void;
}

const AudioFilterToggleComponent = forwardRef<AudioFilterToggleRef, Props>(({ 
  allStoriesLabel, 
  audioOnlyLabel,
  initialValue = false,
  onToggle 
}, ref) => {
  // LOCAL state - initialized ONLY on first render (lazy initialization)
  const [isActive, setIsActive] = useState(() => {
    console.log('[AudioFilterToggle] useState initializer - using initialValue:', initialValue);
    return initialValue;
  });
  
  console.log('[AudioFilterToggle] RENDER', { initialValue, currentIsActive: isActive });
  
  // Expose imperative method to parent (no re-render)
  useImperativeHandle(ref, () => ({
    setValue: (value: boolean) => {
      console.log('[AudioFilterToggle] setValue called:', value);
      setIsActive(value);
    }
  }));
  
  // Handle click - update local state and notify parent
  const handleToggle = () => {
    console.log('[AudioFilterToggle] handleToggle - START, current isActive:', isActive);
    const newValue = !isActive;
    console.log('[AudioFilterToggle] handleToggle - new value:', newValue);
    
    setIsActive(newValue);
    console.log('[AudioFilterToggle] handleToggle - calling onToggle callback');
    onToggle(newValue);
    console.log('[AudioFilterToggle] handleToggle - DONE (CSS transition will animate)');
  };
  
  return (
    <View style={styles.segmentedControl}>
      <TouchableOpacity 
        style={styles.segment}
        onPress={() => isActive && handleToggle()}
        accessibilityLabel={allStoriesLabel}
      >
        <Text style={[
          styles.segmentText, 
          !isActive && styles.segmentTextActive
        ]}>
          {allStoriesLabel}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.toggleContainer}
        onPress={handleToggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: isActive }}
      >
        <View style={[
          styles.toggleTrack,
          {
            backgroundColor: isActive ? theme.colors.interactive.primary : theme.colors.neutral[300],
          },
        ]}>
          <View style={[
            styles.toggleThumb,
            {
              transform: [{ translateX: isActive ? 20 : 0 }],
            },
          ]} />
        </View>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.segment}
        onPress={() => !isActive && handleToggle()}
        accessibilityLabel={audioOnlyLabel}
      >
        <Text style={[
          styles.segmentText, 
          isActive && styles.segmentTextActive
        ]}>
          {audioOnlyLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

// Memoize to prevent re-renders when parent re-renders (e.g., totalPages change)
// Only re-render when labels or onToggle change
export const AudioFilterToggle = React.memo(AudioFilterToggleComponent, (prevProps, nextProps) => {
  console.log('[AudioFilterToggle] memo check', {
    labelsChanged: prevProps.allStoriesLabel !== nextProps.allStoriesLabel || 
                   prevProps.audioOnlyLabel !== nextProps.audioOnlyLabel,
    onToggleChanged: prevProps.onToggle !== nextProps.onToggle,
    initialValueChanged: prevProps.initialValue !== nextProps.initialValue,
  });
  
  return (
    prevProps.allStoriesLabel === nextProps.allStoriesLabel &&
    prevProps.audioOnlyLabel === nextProps.audioOnlyLabel &&
    prevProps.onToggle === nextProps.onToggle
    // Intentionally skip initialValue - it's only for initial useState
  );
});

AudioFilterToggle.displayName = 'AudioFilterToggle';

const styles = StyleSheet.create({
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3]
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.tertiary,
  },
  segmentTextActive: {
    color: theme.colors.interactive.primary,
  },
  toggleContainer: {
    padding: theme.spacing[1],
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    padding: 2,
    ...Platform.select({
      web: {
        // @ts-ignore - CSS property for web
        transition: 'background-color 200ms ease-in-out',
      },
    }),
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.background.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    ...Platform.select({
      web: {
        // @ts-ignore - CSS property for web
        transition: 'transform 200ms ease-in-out',
      },
    }),
  },
});
