import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from '@/components/AppLinearGradient';
import { useTranslation } from 'react-i18next';
import { APP_CONFIG } from '@/config/constants';
import i18n from '@/config/i18n';
import apiClient from '@/api/client';
import { useCreateChild, useEnterChildMode, useUpdateChildModeControls } from '@/api/children';
import { GradientButton } from '@/components/GradientButton';
import { GlassCard } from '@/components/GlassCard';
import { useAuthStore } from '@/store/authStore';
import { getAnalytics } from '@/services/analytics';
import { theme } from '@/theme';
import { DEFAULT_LOCALE, SUPPORTED_LANGUAGES } from '@wondertales/shared';

type OnboardingStep = 'profile' | 'setup' | 'done';
type StoryCreationMode = 'instant' | 'artisan';

type CreatedChild = {
  id: string;
  name: string;
  storyCreationMode?: StoryCreationMode;
};

function toBaseLocale(locale: string | undefined): string {
  const base = (locale || '').split('-')[0]?.toLowerCase() || DEFAULT_LOCALE;
  return APP_CONFIG.supportedLanguages.includes(base as any) ? base : DEFAULT_LOCALE;
}

function getDefaultBirthDate(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 6);
  return date;
}

function ModeOption({
  mode,
  selected,
  onPress,
}: {
  mode: StoryCreationMode;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const isInstant = mode === 'instant';
  return (
    <TouchableOpacity
      style={[styles.modeOption, selected && styles.modeOptionSelected]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[styles.modeIcon, selected && styles.modeIconSelected]}>
        <Ionicons
          name={isInstant ? 'flash' : 'color-palette'}
          size={24}
          color={selected ? theme.colors.text.inverse : theme.colors.interactive.primary}
        />
      </View>
      <View style={styles.modeOptionText}>
        <Text style={[styles.modeOptionTitle, selected && styles.modeOptionTitleSelected]}>
          {isInstant
            ? t('mode_selection.instant_mode', { defaultValue: 'Instant Mode' })
            : t('mode_selection.artisan_mode', { defaultValue: 'Master Mode' })}
        </Text>
        <Text style={[styles.modeOptionBody, selected && styles.modeOptionBodySelected]}>
          {isInstant
            ? t('mode_selection.instant_description', {
                defaultValue: 'Fast story creation with fewer choices.',
              })
            : t('mode_selection.artisan_description', {
                defaultValue: 'More control over characters, tone, language, and details.',
              })}
        </Text>
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function ModeSelectionScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { user, setUser, isAuthenticated } = useAuthStore();
  const createChild = useCreateChild();
  const updateChildModeControls = useUpdateChildModeControls();
  const enterChildMode = useEnterChildMode();

  const [step, setStep] = useState<OnboardingStep>('profile');
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState(getDefaultBirthDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [storyLanguage, setStoryLanguage] = useState(toBaseLocale(i18n.language));
  const [storyCreationMode, setStoryCreationMode] = useState<StoryCreationMode>('instant');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [createdChild, setCreatedChild] = useState<CreatedChild | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const isWide = width >= 820;
  const languageOptions = useMemo(
    () =>
      APP_CONFIG.supportedLanguages.map((code) => ({
        code,
        label: t(`language_names.${code}`, {
          defaultValue: SUPPORTED_LANGUAGES[code]?.nativeName || code.toUpperCase(),
        }),
        flag: SUPPORTED_LANGUAGES[code]?.flag || '',
      })),
    [t]
  );

  const title =
    step === 'profile'
      ? t('onboarding.parent_title', { defaultValue: 'Create your first child profile' })
      : step === 'setup'
        ? t('onboarding.story_setup_title', { defaultValue: 'Set up story creation' })
        : t('onboarding.ready_title', {
            defaultValue: '{{name}} is ready',
            name:
              createdChild?.name ||
              name.trim() ||
              t('children_screen.title', { defaultValue: 'Child' }),
          });

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('Main', { screen: 'Welcome' });
      return;
    }
    if (user?.onboardingCompleted !== false && step === 'profile' && !createdChild) {
      navigation.navigate('Main', { screen: 'Dashboard' });
    }
  }, [createdChild, isAuthenticated, navigation, step, user?.onboardingCompleted]);

  const completeOnboarding = async () => {
    if (user?.onboardingCompleted === true) return user;
    setIsCompleting(true);
    try {
      const response = await apiClient.patch<{ status: string; user: any }>('/api/v1/me', {
        onboardingCompleted: true,
        mode: user?.mode || storyCreationMode,
      });
      if (response.data.user) {
        setUser(response.data.user);
      }
      return response.data.user;
    } finally {
      setIsCompleting(false);
    }
  };

  const submitChildSetup = async () => {
    if (!name.trim() || !consentAccepted || createChild.isPending) return;
    setError(null);

    try {
      const child = await createChild.mutateAsync({
        name: name.trim(),
        birthDate,
        languages: [storyLanguage],
        storyCreationMode,
        childDataConsentAccepted: true,
      });
      setCreatedChild({
        id: child.id,
        name: child.name,
        storyCreationMode: child.storyCreationMode,
      });
      getAnalytics().capture('onboarding_child_profile_created', {
        story_creation_mode: storyCreationMode,
        story_language: storyLanguage,
      });
      setStep('done');
    } catch (err) {
      console.error('Failed to create onboarding child profile:', err);
      setError(
        t('onboarding.create_child_error', {
          defaultValue: 'Could not create the child profile. Please try again.',
        })
      );
    }
  };

  const resetForAnotherChild = () => {
    setName('');
    setBirthDate(getDefaultBirthDate());
    setStoryCreationMode('instant');
    setConsentAccepted(false);
    setError(null);
    setCreatedChild(null);
    setStep('profile');
  };

  const goCreateStory = async () => {
    if (!createdChild) return;
    setError(null);
    try {
      await completeOnboarding();
      navigation.navigate('Main', {
        screen: 'Wizard',
        params: {
          childId: createdChild.id,
          storyCreationMode: createdChild.storyCreationMode || storyCreationMode,
        },
      });
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setError(
        t('onboarding.complete_error', {
          defaultValue: 'Could not finish setup. Please try again.',
        })
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const startChildMode = async () => {
    if (!createdChild) return;
    setError(null);
    try {
      const updatedUser = await completeOnboarding();
      if (!updatedUser?.childModeExitPasscodeConfigured) {
        navigation.navigate('Main', { screen: 'Profile' });
        return;
      }
      await updateChildModeControls.mutateAsync({
        id: createdChild.id,
        data: { childModeEnabled: true },
      });
      await enterChildMode.mutateAsync(createdChild.id);
    } catch (err) {
      console.error('Failed to start Child Mode:', err);
      setError(
        t('onboarding.child_mode_error', {
          defaultValue: 'Could not start Child Mode. Check the passcode settings and try again.',
        })
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const renderProfileStep = () => (
    <>
      <Text style={styles.kicker}>
        {t('onboarding.parent_managed_kicker', { defaultValue: 'Parent-managed family account' })}
      </Text>
      <Text style={styles.lead}>
        {t('onboarding.parent_managed_body', {
          defaultValue:
            'WonderTales is managed by a parent or legal guardian. Start with one child profile; you can add more children later.',
        })}
      </Text>

      <View style={styles.formGrid}>
        <View style={styles.field}>
          <Text style={styles.label}>
            {t('child_form.name_label', { defaultValue: "Child's name" })}
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(value) => {
              setName(value);
              setError(null);
            }}
            placeholder={t('child_form.name_placeholder', { defaultValue: 'Emilia' })}
            placeholderTextColor={theme.colors.text.disabled}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            {t('child_form.birth_date_label', { defaultValue: 'Birth date' })}
          </Text>
          {Platform.OS === 'web' ? (
            <input
              type="date"
              value={birthDate.toISOString().split('T')[0]}
              max={new Date().toISOString().split('T')[0]}
              onChange={(event) => {
                const nextDate = new Date((event.target as HTMLInputElement).value);
                if (!Number.isNaN(nextDate.getTime())) setBirthDate(nextDate);
              }}
              style={styles.webDateInput as React.CSSProperties}
            />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.input, styles.dateInput]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateText}>{birthDate.toLocaleDateString()}</Text>
                <Ionicons name="calendar-outline" size={20} color={theme.colors.text.secondary} />
              </TouchableOpacity>
              {showDatePicker ? (
                <DateTimePicker
                  value={birthDate}
                  mode="date"
                  maximumDate={new Date()}
                  onChange={(_event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) setBirthDate(selectedDate);
                  }}
                />
              ) : null}
            </>
          )}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          {t('onboarding.default_language', { defaultValue: 'Default story language' })}
        </Text>
        <View style={styles.languageGrid}>
          {languageOptions.map((language) => {
            const selected = storyLanguage === language.code;
            return (
              <TouchableOpacity
                key={language.code}
                style={[styles.languageChip, selected && styles.languageChipSelected]}
                activeOpacity={0.75}
                onPress={() => setStoryLanguage(language.code)}
              >
                <Text style={styles.languageFlag}>{language.flag}</Text>
                <Text style={[styles.languageText, selected && styles.languageTextSelected]}>
                  {language.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={styles.consentRow}
        activeOpacity={0.75}
        onPress={() => setConsentAccepted((value) => !value)}
      >
        <View style={[styles.checkbox, consentAccepted && styles.checkboxChecked]}>
          {consentAccepted ? (
            <Ionicons name="checkmark" size={16} color={theme.colors.text.inverse} />
          ) : null}
        </View>
        <Text style={styles.consentText}>
          {t('child_form.child_data_consent', {
            defaultValue:
              "I am the parent or legal guardian and consent to storing and processing this child's profile for WonderTales features.",
          })}
        </Text>
      </TouchableOpacity>

      <GradientButton
        label={t('common.continue', { defaultValue: 'Continue' })}
        onPress={() => setStep('setup')}
        disabled={!name.trim() || !consentAccepted}
        style={styles.primaryButton}
      />
    </>
  );

  const renderSetupStep = () => (
    <>
      <Text style={styles.kicker}>
        {t('onboarding.setup_for_child', {
          defaultValue: 'For {{name}}',
          name: name.trim(),
        })}
      </Text>
      <Text style={styles.lead}>
        {t('onboarding.setup_body', {
          defaultValue:
            'Choose the default story creation flow for this child. Parents can still switch modes for a single story.',
        })}
      </Text>

      <View style={[styles.modeGrid, isWide && styles.modeGridWide]}>
        <ModeOption
          mode="instant"
          selected={storyCreationMode === 'instant'}
          onPress={() => setStoryCreationMode('instant')}
        />
        <ModeOption
          mode="artisan"
          selected={storyCreationMode === 'artisan'}
          onPress={() => setStoryCreationMode('artisan')}
        />
      </View>

      <View style={styles.footerRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.8}
          onPress={() => setStep('profile')}
        >
          <Text style={styles.secondaryButtonText}>
            {t('common.back', { defaultValue: 'Back' })}
          </Text>
        </TouchableOpacity>
        <GradientButton
          label={
            createChild.isPending
              ? t('common.saving', { defaultValue: 'Saving...' })
              : t('onboarding.finish_setup', { defaultValue: 'Finish setup' })
          }
          onPress={submitChildSetup}
          disabled={createChild.isPending}
          loading={createChild.isPending}
          style={styles.footerPrimaryButton}
        />
      </View>
    </>
  );

  const renderDoneStep = () => (
    <>
      <View style={styles.readyIcon}>
        <Ionicons name="sparkles" size={32} color={theme.colors.text.inverse} />
      </View>
      <Text style={styles.lead}>
        {t('onboarding.ready_body', {
          defaultValue:
            'You can create a story as the parent, start Child Mode for this child, or add another child profile.',
        })}
      </Text>

      <View style={styles.doneActions}>
        <GradientButton
          label={t('onboarding.create_story', { defaultValue: 'Create a story' })}
          onPress={goCreateStory}
          disabled={isCompleting}
          loading={isCompleting}
          style={styles.donePrimaryButton}
        />
        <TouchableOpacity
          style={styles.doneSecondaryButton}
          activeOpacity={0.8}
          disabled={isCompleting || enterChildMode.isPending || updateChildModeControls.isPending}
          onPress={startChildMode}
        >
          {enterChildMode.isPending || updateChildModeControls.isPending ? (
            <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
          ) : (
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={theme.colors.interactive.primary}
            />
          )}
          <Text style={styles.doneSecondaryButtonText}>
            {user?.childModeExitPasscodeConfigured
              ? t('onboarding.start_child_mode', { defaultValue: 'Start Child Mode' })
              : t('onboarding.set_passcode_for_child_mode', {
                  defaultValue: 'Set passcode for Child Mode',
                })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.textButton}
          activeOpacity={0.75}
          onPress={resetForAnotherChild}
        >
          <Ionicons name="add-circle-outline" size={20} color={theme.colors.text.secondary} />
          <Text style={styles.textButtonText}>
            {t('onboarding.add_another_child', { defaultValue: 'Add another child' })}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <LinearGradient
      colors={['#F7EAF1', '#F4EEFB', '#FDF5E6']}
      locations={[0, 0.58, 1]}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard intensity="strong" style={styles.card}>
          <View style={styles.progressRow}>
            {(['profile', 'setup', 'done'] as OnboardingStep[]).map((item, index) => {
              const currentIndex = ['profile', 'setup', 'done'].indexOf(step);
              const active = index <= currentIndex;
              return (
                <View key={item} style={[styles.progressDot, active && styles.progressDotActive]} />
              );
            })}
          </View>

          <Text style={styles.title}>{title}</Text>

          {step === 'profile'
            ? renderProfileStep()
            : step === 'setup'
              ? renderSetupStep()
              : renderDoneStep()}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </GlassCard>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 920,
    padding: theme.spacing[6],
    overflow: 'hidden',
  },
  progressRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[5],
  },
  progressDot: {
    width: 34,
    height: 5,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.border.light,
  },
  progressDotActive: {
    backgroundColor: theme.colors.interactive.primary,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing[3],
  },
  kicker: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: theme.spacing[2],
  },
  lead: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.base,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 680,
    alignSelf: 'center',
    marginBottom: theme.spacing[6],
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[4],
  },
  field: {
    flex: 1,
    minWidth: 240,
    marginBottom: theme.spacing[5],
  },
  label: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: theme.spacing[2],
  },
  input: {
    minHeight: 54,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.base,
    paddingHorizontal: theme.spacing[4],
  },
  webDateInput: {
    minHeight: 54,
    width: '100%',
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.base,
    paddingLeft: theme.spacing[4],
    paddingRight: theme.spacing[4],
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.base,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  languageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    minHeight: 42,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  languageChipSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  languageFlag: {
    fontSize: 16,
  },
  languageText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  languageTextSelected: {
    color: theme.colors.interactive.primary,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    marginBottom: theme.spacing[5],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.borders.radius.sm,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  consentText: {
    flex: 1,
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
  },
  primaryButton: {
    alignSelf: 'center',
    minWidth: 240,
  },
  modeGrid: {
    gap: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  modeGridWide: {
    flexDirection: 'row',
  },
  modeOption: {
    flex: 1,
    minHeight: 140,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[4],
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
  },
  modeOptionSelected: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borders.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  modeIconSelected: {
    backgroundColor: theme.colors.interactive.primary,
  },
  modeOptionText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  modeOptionTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
  },
  modeOptionTitleSelected: {
    color: theme.colors.interactive.primary,
  },
  modeOptionBody: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.base,
    lineHeight: 23,
  },
  modeOptionBodySelected: {
    color: theme.colors.text.primary,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: theme.borders.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.primary,
  },
  radioOuterSelected: {
    borderColor: theme.colors.interactive.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: theme.borders.radius.full,
    backgroundColor: theme.colors.interactive.primary,
  },
  footerRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  secondaryButton: {
    minHeight: 50,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.background.secondary,
    paddingHorizontal: theme.spacing[5],
  },
  secondaryButtonText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  footerPrimaryButton: {
    minWidth: 220,
  },
  readyIcon: {
    width: 72,
    height: 72,
    borderRadius: theme.borders.radius.full,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.interactive.primary,
    marginBottom: theme.spacing[4],
  },
  doneActions: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: theme.spacing[3],
  },
  donePrimaryButton: {
    width: '100%',
  },
  doneSecondaryButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.background.secondary,
  },
  doneSecondaryButtonText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
  textButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  textButtonText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  errorText: {
    color: theme.colors.status.error,
    fontSize: theme.typography.fontSize.sm,
    textAlign: 'center',
    marginTop: theme.spacing[4],
  },
});
