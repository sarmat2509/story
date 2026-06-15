import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Image,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from '@/components/AppLinearGradient';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useEmailLogin } from '@/api/auth';
import { theme } from '@/theme';
import { GradientButton } from '@/components/GradientButton';
import { GlassCard, IRIDESCENT_BORDER_COLORS } from '@/components/GlassCard';
import { AnimatedSection } from '@/components/AnimatedSection';
import { InteractiveSurface } from '@/components/InteractiveSurface';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { useAuthStore } from '@/store/authStore';
import { resetToMainRoute } from '@/navigation/navigationRef';
import { resolveBillingEntryTarget } from '@/utils/billingEntry';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { assignWebLocation, getWebPathname } from '@/utils/webRuntime';
import { LEGAL_URLS } from '@/config/constants';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { t, i18n } = useTranslation();
  const { signInWithGoogle, signInWithApple, isLoading: oauthLoading } = useAuth();
  const emailLoginMutation = useEmailLogin();
  const enterKey = useScreenEnter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionMode = useAuthStore((state) => state.sessionMode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSkipOption, setShowSkipOption] = useState(false);
  const [oauthTermsAccepted, setOauthTermsAccepted] = useState(false);
  const [oauthPrivacyAccepted, setOauthPrivacyAccepted] = useState(false);
  const [oauthAdultGuardian, setOauthAdultGuardian] = useState(false);

  const isLoading = oauthLoading || emailLoginMutation.isPending;
  const emailValid = EMAIL_REGEX.test(email);
  const canSubmitEmail = emailValid && password.length >= 8;
  const canUseOAuth = oauthTermsAccepted && oauthPrivacyAccepted && oauthAdultGuardian;
  const showAppleSignIn = Platform.OS === 'ios';

  const handleError = (message: string) => {
    setError(message);
    setShowSkipOption(true);
  };

  const handleEmailLogin = async () => {
    if (!canSubmitEmail) return;
    try {
      setError(null);
      setShowSkipOption(false);
      await emailLoginMutation.mutateAsync({ email, password });
      if (!resetToMainRoute({ name: 'Dashboard' })) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Dashboard' }],
        });
      }
    } catch (err: unknown) {
      handleError(getLocalizedApiError(t, err, 'auth.invalid_credentials'));
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      setShowSkipOption(false);
      if (!canUseOAuth) {
        handleError(t('auth.oauth_consent_required'));
        return;
      }
      await signInWithGoogle({
        termsAccepted: oauthTermsAccepted,
        privacyAccepted: oauthPrivacyAccepted,
        isAdultGuardian: oauthAdultGuardian,
      });
    } catch (err: unknown) {
      const message = (err as Error)?.message?.includes('expo-dev-client')
        ? t('auth.native_oauth_dev_client_required')
        : t('auth.google_failed');
      handleError(message);
    }
  };

  const handleAppleLogin = async () => {
    try {
      setError(null);
      setShowSkipOption(false);
      if (!canUseOAuth) {
        handleError(t('auth.oauth_consent_required'));
        return;
      }
      await signInWithApple({
        termsAccepted: oauthTermsAccepted,
        privacyAccepted: oauthPrivacyAccepted,
        isAdultGuardian: oauthAdultGuardian,
      });
    } catch (err: unknown) {
      const message = (err as Error)?.message?.includes('expo-dev-client')
        ? t('auth.native_oauth_dev_client_required')
        : t('auth.apple_failed');
      handleError(message);
    }
  };

  const handleViewPlans = () => {
    const pathname = getWebPathname();
    const target = resolveBillingEntryTarget({
      isAuthenticated,
      sessionMode,
      platformOs: Platform.OS,
      pathname,
      locale: i18n.language,
      preferPublicPricingForGuests: true,
    });

    if (target.kind === 'public-web-pricing' && assignWebLocation(target.href)) {
      return;
    }

    if (target.kind === 'parent-gate') {
      navigation.navigate('Dashboard' as never);
      return;
    }

    navigation.navigate('Plans');
  };

  const renderOAuthConsent = (
    checked: boolean,
    onToggle: () => void,
    label: string,
    linkLabel?: string,
    linkUrl?: string
  ) => (
    <TouchableOpacity
      style={styles.oauthConsentRow}
      onPress={onToggle}
      disabled={isLoading}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      activeOpacity={0.75}
    >
      <View style={[styles.oauthCheckbox, checked && styles.oauthCheckboxChecked]}>
        {checked ? (
          <Ionicons name="checkmark" size={14} color={theme.colors.text.inverse} />
        ) : null}
      </View>
      <Text style={styles.oauthConsentText}>
        {label}
        {linkLabel && linkUrl ? (
          <Text
            style={styles.oauthConsentLink}
            onPress={(event) => {
              event.stopPropagation();
              Linking.openURL(linkUrl);
            }}
          >
            {` ${linkLabel}`}
          </Text>
        ) : null}
      </Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <LinearGradient
        colors={['#E9DFFA', '#F4EEFB', '#FDEDEA', '#FDF5E6']}
        locations={[0, 0.35, 0.7, 1]}
        style={styles.gradient}
      >
        <View pointerEvents="none" style={styles.bokehOne} />
        <View pointerEvents="none" style={styles.bokehTwo} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <AnimatedSection delay={0} trigger={enterKey}>
              <View style={styles.hero}>
                <View style={styles.heroFrame}>
                  <Image
                    source={require('../../../assets/hero/welcome-dreamscape.png')}
                    style={styles.heroImage}
                    resizeMode="cover"
                    accessibilityLabel={t('welcome.hero_alt', {
                      defaultValue:
                        'Child in a dream bubble holding a drawing of her puppy Luna, with a cloud castle and sparkle trail',
                    })}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0)', 'rgba(253,245,230,0.85)']}
                    style={styles.heroFade}
                  />
                </View>
                <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
              </View>
            </AnimatedSection>

            {error && (
              <AnimatedSection delay={80} trigger={enterKey}>
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedSection>
            )}

            <AnimatedSection delay={140} trigger={enterKey} style={styles.authCardSection}>
              <GlassCard style={styles.glassForm} borderColors={IRIDESCENT_BORDER_COLORS}>
                <View style={styles.authSection}>
                  <View style={styles.oauthConsentBox}>
                    {renderOAuthConsent(
                      oauthAdultGuardian,
                      () => setOauthAdultGuardian((value) => !value),
                      t('auth.consent_adult_guardian')
                    )}
                    {renderOAuthConsent(
                      oauthTermsAccepted,
                      () => setOauthTermsAccepted((value) => !value),
                      t('auth.consent_terms'),
                      t('auth.terms_link'),
                      LEGAL_URLS.terms
                    )}
                    {renderOAuthConsent(
                      oauthPrivacyAccepted,
                      () => setOauthPrivacyAccepted((value) => !value),
                      t('auth.consent_privacy'),
                      t('auth.privacy_link'),
                      LEGAL_URLS.privacy
                    )}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.googleButton,
                      !canUseOAuth && styles.oauthButtonDisabled,
                    ]}
                    onPress={handleGoogleLogin}
                    disabled={isLoading || !canUseOAuth}
                  >
                    {oauthLoading ? (
                      <ActivityIndicator color={theme.colors.text.inverse} />
                    ) : (
                      <>
                        <Ionicons name="logo-google" size={20} color={theme.colors.text.inverse} />
                        <Text style={styles.buttonText}>{t('welcome.sign_in_google')}</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {showAppleSignIn && (
                    <TouchableOpacity
                      style={[
                        styles.button,
                        styles.appleButton,
                        !canUseOAuth && styles.oauthButtonDisabled,
                      ]}
                      onPress={handleAppleLogin}
                      disabled={isLoading || !canUseOAuth}
                    >
                      {oauthLoading ? (
                        <ActivityIndicator color={theme.colors.text.inverse} />
                      ) : (
                        <>
                          <Ionicons name="logo-apple" size={22} color={theme.colors.text.inverse} />
                          <Text style={styles.buttonText}>{t('welcome.sign_in_apple')}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('auth.or')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>{t('auth.email')}</Text>
                  <TextInput
                    nativeID="login-email"
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('auth.email_placeholder')}
                    placeholderTextColor={theme.colors.text.tertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    autoCorrect={false}
                  />

                  <Text style={[styles.inputLabel, styles.inputLabelMargin]}>
                    {t('auth.password')}
                  </Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      nativeID="login-password"
                      style={[styles.input, styles.passwordInput]}
                      value={password}
                      onChangeText={setPassword}
                      placeholder={t('auth.password_placeholder')}
                      placeholderTextColor={theme.colors.text.tertiary}
                      secureTextEntry={!showPassword}
                      autoComplete="current-password"
                      textContentType="password"
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword(!showPassword)}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={22}
                        color={theme.colors.text.tertiary}
                      />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.forgotLink}
                    onPress={() => navigation.navigate('ForgotPassword')}
                  >
                    <Text style={styles.forgotLinkText}>{t('auth.forgot_password')}</Text>
                  </TouchableOpacity>

                  <GradientButton
                    label={t('auth.login')}
                    onPress={handleEmailLogin}
                    disabled={!canSubmitEmail || isLoading}
                    loading={emailLoginMutation.isPending}
                    style={styles.primaryButtonSpacing}
                  />
                </View>

                <TouchableOpacity
                  style={styles.registerLink}
                  onPress={() => navigation.navigate('Register')}
                >
                  <Text style={styles.registerLinkText}>{t('auth.want_to_create_stories')}</Text>
                </TouchableOpacity>
              </GlassCard>
            </AnimatedSection>

            <AnimatedSection delay={260} trigger={enterKey}>
              <View style={styles.linksSection}>
                <InteractiveSurface
                  style={styles.linkButton}
                  onPress={() => navigation.navigate('Stories')}
                  accessibilityLabel={t('welcome.browse_stories')}
                >
                  <Ionicons
                    name="newspaper-outline"
                    size={24}
                    color={theme.colors.interactive.primary}
                  />
                  <Text style={styles.linkButtonText}>{t('welcome.browse_stories')}</Text>
                </InteractiveSurface>

                <InteractiveSurface
                  style={styles.linkButton}
                  onPress={handleViewPlans}
                  accessibilityLabel={t('welcome.view_plans')}
                >
                  <Ionicons
                    name="diamond-outline"
                    size={24}
                    color={theme.colors.interactive.primary}
                  />
                  <Text style={styles.linkButtonText}>{t('welcome.view_plans')}</Text>
                </InteractiveSurface>
              </View>
            </AnimatedSection>

            {showSkipOption && Platform.OS !== 'web' && (
              <Text style={styles.devNoteText}>
                Dev Tip: Test UI layout on web version, or build with expo-dev-client for native
                OAuth
              </Text>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing[8],
  },
  content: {
    width: '100%',
    maxWidth: 440,
    padding: theme.spacing[6],
  },
  hero: {
    alignItems: 'center',
    marginBottom: theme.spacing[6],
  },
  heroFrame: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: theme.borders.radius['2xl'],
    overflow: 'hidden',
    marginBottom: theme.spacing[5],
    ...Platform.select({
      ios: {
        shadowColor: '#3B2E6E',
        shadowOpacity: 0.22,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 18 },
      },
      android: { elevation: 8 },
      web: {
        boxShadow: '0 30px 60px -30px rgba(59, 46, 110, 0.45)' as unknown as string,
      },
    }),
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '35%',
  },
  bokehOne: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(169, 156, 224, 0.35)',
    opacity: 0.9,
  },
  bokehTwo: {
    position: 'absolute',
    bottom: -140,
    left: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(242, 138, 94, 0.25)',
  },
  glassForm: {
    padding: theme.spacing[5],
  },
  authCardSection: {
    marginBottom: theme.spacing[6],
  },
  primaryButtonSpacing: {
    marginTop: theme.spacing[5],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.lg,
    textAlign: 'center',
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.fontSize.lg * theme.typography.lineHeight.normal,
  },
  errorContainer: {
    backgroundColor: theme.colors.error[50],
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
  },
  errorText: {
    color: theme.colors.status.error,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.sm,
  },
  formSection: {
    marginBottom: theme.spacing[6],
  },
  inputLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  inputLabelMargin: {
    marginTop: theme.spacing[4],
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: theme.borders.width.thin,
    borderColor: 'rgba(235, 226, 247, 0.9)',
    borderRadius: theme.borders.radius.md,
    padding: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: theme.spacing[3],
    padding: theme.spacing[2],
  },
  forgotLink: {
    marginTop: theme.spacing[2],
    alignSelf: 'flex-end',
  },
  forgotLinkText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.interactive.primary,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
  },
  primaryButton: {
    backgroundColor: theme.colors.interactive.primary,
    marginTop: theme.spacing[4],
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing[6],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border.light,
  },
  dividerText: {
    marginHorizontal: theme.spacing[4],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  authSection: {
    width: '100%',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  oauthConsentBox: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  oauthConsentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
  },
  oauthCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: theme.borders.width.medium,
    borderColor: theme.colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  oauthCheckboxChecked: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  oauthConsentText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  oauthConsentLink: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecorationLine: 'underline',
  },
  oauthButtonDisabled: {
    opacity: 0.45,
  },
  googleButton: {
    backgroundColor: theme.colors.google,
  },
  appleButton: {
    backgroundColor: theme.colors.apple,
  },
  buttonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  registerLink: {
    alignSelf: 'center',
  },
  registerLinkText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.interactive.primary,
    textAlign: 'center',
  },
  linksSection: {
    width: '100%',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    ...Platform.select({
      ios: {
        shadowColor: '#3B2E6E',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 2 },
      web: {
        boxShadow: '0 14px 30px -18px rgba(59, 46, 110, 0.3)' as unknown as string,
      },
    }),
  },
  linkButtonText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  devNoteText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.xs,
    textAlign: 'center',
    color: theme.colors.interactive.primary,
    fontStyle: 'italic',
  },
});
