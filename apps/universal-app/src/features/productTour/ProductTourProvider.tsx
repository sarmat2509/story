import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUpdateMe } from '@/api/auth';
import { navigationRef } from '@/navigation/navigationRef';
import { useAuthStore } from '@/store/authStore';
import { modernColors, modernShadows } from '@/theme/modernTheme';
import { theme } from '@/theme';
import type { RootStackParamList } from '@/types/navigation';
import { useResponsive } from '@/hooks/useResponsive';

type TourRoute =
  | {
      kind: 'main';
      screen: 'Dashboard' | 'Library' | 'Wizard' | 'Artifacts' | 'MapTiles' | 'Profile';
      mode?: 'instant' | 'artisan';
      wizardStep?: 0 | 1 | 2;
    }
  | { kind: 'onboarding' };

type TourStep = {
  id: string;
  route: TourRoute;
  targetId: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    route: { kind: 'main', screen: 'Dashboard' },
    targetId: 'nav-drawer-Dashboard',
  },
  {
    id: 'library',
    route: { kind: 'main', screen: 'Library' },
    targetId: 'nav-drawer-Library',
  },
  {
    id: 'artisan',
    route: { kind: 'main', screen: 'Wizard', mode: 'artisan', wizardStep: 0 },
    targetId: 'nav-drawer-Wizard',
  },
  {
    id: 'wizard_basics',
    route: { kind: 'main', screen: 'Wizard', mode: 'artisan', wizardStep: 0 },
    targetId: 'wizard-step-0',
  },
  {
    id: 'wizard_details',
    route: { kind: 'main', screen: 'Wizard', mode: 'artisan', wizardStep: 1 },
    targetId: 'wizard-step-1',
  },
  {
    id: 'wizard_characters',
    route: { kind: 'main', screen: 'Wizard', mode: 'artisan', wizardStep: 2 },
    targetId: 'wizard-step-2',
  },
  {
    id: 'artifacts',
    route: { kind: 'main', screen: 'Artifacts' },
    targetId: 'nav-drawer-Artifacts',
  },
  { id: 'map', route: { kind: 'main', screen: 'MapTiles' }, targetId: 'nav-drawer-MapTiles' },
  {
    id: 'profile',
    route: { kind: 'main', screen: 'Profile' },
    targetId: 'nav-drawer-Profile',
  },
  {
    id: 'instant',
    route: { kind: 'main', screen: 'Profile' },
    targetId: 'profile-story-mode-instant',
  },
  { id: 'child', route: { kind: 'onboarding' }, targetId: 'mode-selection-child-name' },
];

// Keep the pace comfortable without imposing a fixed pause: every word gets roughly 300 ms.
const MS_PER_WORD = 300;
const NAVIGATION_SETTLE_MS = 420;
const SCROLL_SETTLE_MS = 600;

type ProductTourContextValue = {
  start: () => void;
  isOpen: boolean;
  keepChildProfileVisible: boolean;
};

const ProductTourContext = createContext<ProductTourContextValue | null>(null);

export function useProductTour(): ProductTourContextValue {
  const context = useContext(ProductTourContext);
  if (!context) {
    throw new Error('useProductTour must be used inside ProductTourProvider');
  }
  return context;
}

function getReadingTimeMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words * MS_PER_WORD;
}

function isOutsideViewport(rect: DOMRect, width: number, height: number): boolean {
  return rect.top < 0 || rect.left < 0 || rect.bottom > height || rect.right > width;
}

function ProductTourPrompt({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const { t } = useTranslation();

  return (
    <View testID="product-tour-prompt" style={styles.overlay} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => undefined}>
        <View style={styles.dim} />
      </Pressable>
      <View style={styles.promptCard}>
        <View style={styles.promptIcon}>
          <Ionicons name="compass-outline" size={27} color={theme.colors.interactive.primary} />
        </View>
        <Text style={styles.promptTitle}>{t('product_tour.prompt_title')}</Text>
        <Text style={styles.promptBody}>{t('product_tour.prompt_body')}</Text>
        <View style={styles.promptActions}>
          <Pressable
            testID="product-tour-prompt-decline"
            onPress={onDecline}
            accessibilityRole="button"
            style={[styles.navButton, styles.promptSecondaryButton]}
          >
            <Text style={styles.promptSecondaryText}>{t('product_tour.prompt_decline')}</Text>
          </Pressable>
          <Pressable
            testID="product-tour-prompt-accept"
            onPress={onAccept}
            accessibilityRole="button"
            style={[styles.navButton, styles.nextButton]}
          >
            <Text style={styles.nextButtonText}>{t('product_tour.prompt_accept')}</Text>
            <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ProductTourOverlay({
  stepIndex,
  onPrevious,
  onNext,
  onClose,
}: {
  stepIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const step = TOUR_STEPS[stepIndex];
  const title = t(`product_tour.steps.${step.id}.title`);
  const body = t(`product_tour.steps.${step.id}.body`);
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
    let hasScrolledToTarget = false;
    setTargetRect(null);
    const readTarget = () => {
      const target =
        typeof document === 'undefined'
          ? null
          : document.getElementById(step.targetId) ??
            document.querySelector<HTMLElement>(`[data-testid="${step.targetId}"]`);
      if (target) {
        const rect = target.getBoundingClientRect();
        if (!hasScrolledToTarget && isOutsideViewport(rect, width, height)) {
          hasScrolledToTarget = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          scrollTimeout = setTimeout(() => {
            frame = requestAnimationFrame(readTarget);
          }, SCROLL_SETTLE_MS);
          return;
        }
        setTargetRect(target.getBoundingClientRect());
        return;
      }
      attempts += 1;
      if (attempts < 120) frame = requestAnimationFrame(readTarget);
    };
    const timeout = setTimeout(() => {
      frame = requestAnimationFrame(readTarget);
    }, NAVIGATION_SETTLE_MS);
    return () => {
      clearTimeout(timeout);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [step.targetId, stepIndex, width, height]);

  useEffect(() => {
    if (!targetRect) return;
    const timeout = setTimeout(onNext, getReadingTimeMs(`${title} ${body}`));
    return () => clearTimeout(timeout);
  }, [body, onNext, stepIndex, targetRect, title]);

  const target = targetRect;
  const tooltipWidth = Math.min(420, Math.max(330, width - 48));
  const tooltipEstimatedHeight = 270;
  const placeRight =
    target != null && target.x + target.width + tooltipWidth + 42 <= width;
  const hasRoomBelow =
    target != null && target.y + target.height + tooltipEstimatedHeight + 24 <= height;
  const placeAbove =
    target != null && !placeRight && !hasRoomBelow && target.y >= tooltipEstimatedHeight + 24;
  const tooltipLeft = Math.min(
    placeRight
      ? (target?.x ?? 0) + (target?.width ?? 0) + 18
      : Math.max(24, (target?.x ?? width / 2) + (target?.width ?? 0) / 2 - tooltipWidth / 2),
    Math.max(24, width - tooltipWidth - 24)
  );
  const tooltipTop = target
    ? placeRight
      ? Math.min(
          Math.max(24, target.y + target.height / 2 - tooltipEstimatedHeight / 2),
          height - tooltipEstimatedHeight - 24
        )
      : placeAbove
        ? Math.max(24, target.y - tooltipEstimatedHeight - 18)
        : Math.min(height - tooltipEstimatedHeight - 24, target.y + target.height + 18)
    : Math.max(74, height / 2 - tooltipEstimatedHeight / 2);
  const arrowOffset = placeRight
    ? Math.min(
        Math.max(24, (target?.y ?? height / 2) + (target?.height ?? 0) / 2 - tooltipTop - 8),
        tooltipEstimatedHeight - 40
      )
    : Math.min(
        Math.max(24, (target?.x ?? width / 2) + (target?.width ?? 0) / 2 - tooltipLeft - 8),
        tooltipWidth - 40
      );

  return (
    <View testID="product-tour-overlay" style={styles.overlay} accessibilityViewIsModal>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => undefined}
        accessibilityLabel={t('product_tour.background_label')}
      >
        <View style={styles.dim} />
      </Pressable>

      <Pressable
        testID="product-tour-skip"
        style={styles.skip}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Ionicons name="close" size={19} color="#FFFFFF" />
        <Text style={styles.skipText}>{t('product_tour.skip')}</Text>
      </Pressable>

      {target ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.targetHighlight,
              {
                left: target.x - 6,
                top: target.y - 6,
                width: target.width + 12,
                height: target.height + 12,
              },
            ]}
          />
          <View
            testID="product-tour-tooltip"
            style={[styles.tooltip, { width: tooltipWidth, left: tooltipLeft, top: tooltipTop }]}
          >
            <View
              style={[
                styles.arrow,
                placeRight ? { top: arrowOffset } : { left: arrowOffset },
                placeRight ? styles.arrowLeft : placeAbove ? styles.arrowBottom : styles.arrowTop,
              ]}
            />
            <Text style={styles.progress}>
              {t('product_tour.progress', { current: stepIndex + 1, total: TOUR_STEPS.length })}
            </Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
            <View style={styles.controls}>
              <Pressable
                testID="product-tour-previous"
                onPress={onPrevious}
                disabled={stepIndex === 0}
                accessibilityRole="button"
                accessibilityLabel={t('product_tour.previous')}
                style={[styles.navButton, stepIndex === 0 && styles.navButtonDisabled]}
              >
                <Ionicons name="arrow-back" size={18} color={theme.colors.text.primary} />
              </Pressable>
              <Pressable
                testID="product-tour-next"
                onPress={onNext}
                accessibilityRole="button"
                accessibilityLabel={isLastStep ? t('product_tour.finish') : t('product_tour.next')}
                style={[styles.navButton, styles.nextButton]}
              >
                <Text style={styles.nextButtonText}>
                  {isLastStep ? t('product_tour.finish') : t('product_tour.next')}
                </Text>
                <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

export function ProductTourProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, sessionMode } = useAuthStore();
  const { isDesktop } = useResponsive();
  const updateMe = useUpdateMe();
  const [isOpen, setIsOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [keepChildProfileVisible, setKeepChildProfileVisible] = useState(false);
  const promptedUserId = useRef<string | null>(null);

  const navigateToStep = useCallback((index: number) => {
    const step = TOUR_STEPS[index];
    if (step.route.kind === 'onboarding') {
      navigationRef.navigate('ModeSelection');
      return;
    }
    const mainRoute: RootStackParamList['Main'] =
      step.route.screen === 'Wizard'
        ? {
            screen: 'Wizard',
            params: {
              storyCreationMode: step.route.mode,
              tourStep: step.route.wizardStep,
            },
          }
        : { screen: step.route.screen };
    navigationRef.navigate('Main', mainRoute);
  }, []);

  const start = useCallback(() => {
    if (Platform.OS !== 'web' || !isDesktop || !isAuthenticated || sessionMode === 'child') return;
    setIsPromptOpen(false);
    setKeepChildProfileVisible(false);
    setStepIndex(0);
    setIsOpen(true);
    navigateToStep(0);
  }, [isAuthenticated, isDesktop, navigateToStep, sessionMode]);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      !isDesktop ||
      !isAuthenticated ||
      sessionMode === 'child' ||
      user?.productTourCompleted !== false ||
      promptedUserId.current === user.id
    ) {
      return;
    }
    promptedUserId.current = user.id;
    const timeout = setTimeout(() => setIsPromptOpen(true), NAVIGATION_SETTLE_MS);
    return () => clearTimeout(timeout);
  }, [isAuthenticated, isDesktop, sessionMode, user?.id, user?.productTourCompleted]);

  const declinePrompt = useCallback(async () => {
    setIsPromptOpen(false);
    try {
      await updateMe.mutateAsync({ productTourCompleted: true });
    } catch {
      // If saving fails, the choice is retried on the next sign-in.
    }
  }, [updateMe]);

  const close = useCallback(async () => {
    if (TOUR_STEPS[stepIndex]?.id === 'child') {
      setKeepChildProfileVisible(true);
    }
    setIsOpen(false);
    if (user?.productTourCompleted === true) return;
    try {
      await updateMe.mutateAsync({ productTourCompleted: true });
    } catch {
      // The tour will appear again after the next sign-in if the completion state was not saved.
    }
  }, [stepIndex, updateMe, user?.productTourCompleted]);

  const goToStep = useCallback(
    (nextIndex: number) => {
      setStepIndex(nextIndex);
      navigateToStep(nextIndex);
    },
    [navigateToStep]
  );

  const onPrevious = useCallback(() => {
    if (stepIndex > 0) goToStep(stepIndex - 1);
  }, [goToStep, stepIndex]);

  const onNext = useCallback(() => {
    if (stepIndex === TOUR_STEPS.length - 1) {
      void close();
      return;
    }
    goToStep(stepIndex + 1);
  }, [close, goToStep, stepIndex]);

  const value = useMemo(
    () => ({ start, isOpen, keepChildProfileVisible }),
    [isOpen, keepChildProfileVisible, start]
  );

  return (
    <ProductTourContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {isPromptOpen ? <ProductTourPrompt onAccept={start} onDecline={() => void declinePrompt()} /> : null}
        {isOpen ? (
          <ProductTourOverlay
            stepIndex={stepIndex}
            onPrevious={onPrevious}
            onNext={onNext}
            onClose={() => void close()}
          />
        ) : null}
      </View>
    </ProductTourContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
  dim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.24)' },
  targetHighlight: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  skip: {
    position: 'absolute',
    top: 20,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 16, 30, 0.78)',
  },
  skipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  promptCard: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    width: 440,
    maxWidth: 'calc(100% - 48px)' as unknown as number,
    padding: 28,
    borderRadius: 24,
    backgroundColor: modernColors.surfaceRaised,
    transform: [{ translateY: -150 }],
    ...modernShadows.raised,
  },
  promptIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: modernColors.accentWash,
  },
  promptTitle: {
    marginTop: 18,
    color: theme.colors.text.primary,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 30,
  },
  promptBody: { marginTop: 10, color: theme.colors.text.secondary, fontSize: 15, lineHeight: 22 },
  promptActions: { marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  promptSecondaryButton: { paddingHorizontal: 16 },
  promptSecondaryText: { color: theme.colors.text.secondary, fontSize: 14, fontWeight: '800' },
  tooltip: {
    position: 'absolute',
    padding: 22,
    borderRadius: 20,
    backgroundColor: modernColors.surfaceRaised,
    ...modernShadows.raised,
  },
  arrow: {
    position: 'absolute',
    width: 16,
    height: 16,
    backgroundColor: modernColors.surfaceRaised,
    transform: [{ rotate: '45deg' }],
  },
  arrowTop: { top: -8 },
  arrowBottom: { bottom: -8 },
  arrowLeft: { left: -8 },
  progress: {
    marginBottom: 7,
    color: theme.colors.interactive.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: { color: theme.colors.text.primary, fontSize: 21, fontWeight: '800', lineHeight: 27 },
  body: { marginTop: 9, color: theme.colors.text.secondary, fontSize: 15, lineHeight: 22 },
  controls: { marginTop: 18, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  navButton: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: modernColors.border,
  },
  navButtonDisabled: { opacity: 0.35 },
  nextButton: {
    flexDirection: 'row',
    gap: 7,
    marginLeft: 'auto',
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  nextButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
