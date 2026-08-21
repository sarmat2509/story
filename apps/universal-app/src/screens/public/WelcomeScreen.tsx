import React, { useEffect, useState } from 'react';
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
import { AppButton } from '@/components/AppButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { useAuthStore } from '@/store/authStore';
import { resetToMainRoute } from '@/navigation/navigationRef';
import { resolveBillingEntryTarget } from '@/utils/billingEntry';
import { getLocalizedApiError } from '@/utils/localizedApiError';
import { assignWebLocation, getWebPathname } from '@/utils/webRuntime';
import { replaceWithStoredWebAuthRedirect } from '@/utils/authRedirect';
import { getLegalUrl } from '@/config/constants';

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
  const [oauthConsentAccepted, setOauthConsentAccepted] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);

  const isLoading = oauthLoading || emailLoginMutation.isPending;
  const emailValid = EMAIL_REGEX.test(email);
  const canSubmitEmail = emailValid && password.length >= 8 && oauthConsentAccepted;
  const canUseOAuth = oauthConsentAccepted;
  const showAppleSignIn = Platform.OS === 'ios';

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const query = window.matchMedia('(min-width: 1180px)');
    const updateLayout = () => setIsDesktopLayout(query.matches);
    updateLayout();
    query.addEventListener('change', updateLayout);
    return () => query.removeEventListener('change', updateLayout);
  }, []);

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
      if (replaceWithStoredWebAuthRedirect()) {
        return;
      }
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
        termsAccepted: true,
        privacyAccepted: true,
        isAdultGuardian: true,
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
        termsAccepted: true,
        privacyAccepted: true,
        isAdultGuardian: true,
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

  const renderLegalLink = (label: string, url: string) =>
    Platform.OS === 'web' ? (
      <a
        href={url}
        style={{
          color: theme.colors.interactive.primary,
          fontWeight: theme.typography.fontWeight.semibold,
          textDecorationLine: 'underline',
        }}
      >
        {label}
      </a>
    ) : (
      <Text
        style={styles.oauthConsentLink}
        onPress={() => {
          if (assignWebLocation(url)) return;
          Linking.openURL(url);
        }}
      >
        {label}
      </Text>
    );

  const renderOAuthConsent = () => (
    <View style={styles.oauthConsentRow}>
      <TouchableOpacity
        onPress={() => setOauthConsentAccepted((value) => !value)}
        disabled={isLoading}
        accessibilityRole="checkbox"
        accessibilityLabel={t('auth.consent_all', {
          defaultValue:
            'Confirm parental status and accept the Terms of Service and Privacy Policy',
        })}
        accessibilityState={{ checked: oauthConsentAccepted }}
        activeOpacity={0.75}
      >
        <View style={[styles.oauthCheckbox, oauthConsentAccepted && styles.oauthCheckboxChecked]}>
          {oauthConsentAccepted ? (
            <Ionicons name="checkmark" size={14} color={theme.colors.text.inverse} />
          ) : null}
        </View>
      </TouchableOpacity>
      <View style={styles.oauthConsentCopy}>
        <Text style={styles.oauthConsentText}>
          {t('auth.consent_all', {
            defaultValue: 'I confirm that I am an adult parent or legal guardian and agree to the',
          })}{' '}
          {renderLegalLink(t('auth.terms_link'), getLegalUrl('terms', i18n.language))}{' '}
          {t('auth.consent_and', { defaultValue: 'and' })}{' '}
          {renderLegalLink(t('auth.privacy_link'), getLegalUrl('privacy', i18n.language))}.
        </Text>
      </View>
    </View>
  );

  const renderDiscoveryLinks = (desktop = false) => (
    <AnimatedSection
      delay={260}
      trigger={enterKey}
      style={desktop ? styles.discoveryLinksDesktop : undefined}
    >
      <View style={[styles.linksSection, desktop && styles.linksSectionDesktop]}>
        <AppButton
          label={t('welcome.browse_stories')}
          onPress={() => navigation.navigate('Stories')}
          variant="secondary"
          leading={
            <Ionicons name="newspaper-outline" size={22} color={theme.colors.interactive.primary} />
          }
        />
        <AppButton
          label={t('welcome.view_plans')}
          onPress={handleViewPlans}
          variant="secondary"
          leading={
            <Ionicons name="diamond-outline" size={22} color={theme.colors.interactive.primary} />
          }
        />
      </View>
    </AnimatedSection>
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
          <View style={[styles.content, isDesktopLayout && styles.contentDesktop]}>
            <AnimatedSection delay={0} trigger={enterKey}>
              <Text
                style={[styles.pageTitle, isDesktopLayout && styles.pageTitleDesktop]}
                accessibilityRole="header"
              >
                {t('auth.subtitle')}
              </Text>
            </AnimatedSection>
            <View style={[styles.loginLayout, isDesktopLayout && styles.loginLayoutDesktop]}>
              <View style={[styles.leftColumn, isDesktopLayout && styles.leftColumnDesktop]}>
                <AnimatedSection delay={80} trigger={enterKey} style={styles.heroSection}>
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
                  </View>
                </AnimatedSection>
                {isDesktopLayout ? renderDiscoveryLinks(true) : null}
              </View>

              <View style={[styles.authColumn, isDesktopLayout && styles.authColumnDesktop]}>
                {error && (
                  <AnimatedSection delay={80} trigger={enterKey}>
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  </AnimatedSection>
                )}

                <AnimatedSection delay={140} trigger={enterKey} style={styles.authCardSection}>
                  <View style={[styles.authPanel, isDesktopLayout && styles.authPanelDesktop]}>
                    <View style={styles.authIntro}>
                      <Text style={styles.authTitle}>
                        {t('auth.welcome_back', { defaultValue: 'Welcome back' })}
                      </Text>
                      <Text style={styles.authIntroText}>
                        {t('auth.login_intro', {
                          defaultValue: 'Continue creating stories made just for your family.',
                        })}
                      </Text>
                    </View>
                    <View style={styles.oauthConsentBox}>{renderOAuthConsent()}</View>
                    {!showEmailLogin ? (
                      <View style={styles.authSection}>
                        <TouchableOpacity
                          style={[
                            styles.providerButton,
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
                              <Ionicons
                                name="logo-google"
                                size={20}
                                color={theme.colors.text.inverse}
                              />
                              <Text style={styles.providerButtonText}>
                                {t('welcome.sign_in_google')}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        {showAppleSignIn && (
                          <TouchableOpacity
                            style={[
                              styles.providerButton,
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
                                <Ionicons
                                  name="logo-apple"
                                  size={22}
                                  color={theme.colors.text.inverse}
                                />
                                <Text style={styles.providerButtonText}>
                                  {t('welcome.sign_in_apple')}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : null}

                    {showEmailLogin ? (
                      <View style={[styles.formSection, styles.formSectionAfterConsent]}>
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

                        <AppButton
                          label={t('auth.login')}
                          onPress={handleEmailLogin}
                          disabled={!canSubmitEmail || isLoading}
                          loading={emailLoginMutation.isPending}
                          style={styles.emailLoginAction}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.emailFallbackLink}
                        onPress={() => setShowEmailLogin(true)}
                        accessibilityRole="button"
                        testID="login-show-email-password"
                      >
                        <Text style={styles.emailFallbackLinkText}>
                          {t('auth.use_email_password_instead', {
                            defaultValue: 'Don’t use Google? Sign in with email and password',
                          })}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {showEmailLogin ? (
                      <View style={styles.authFooterLinks}>
                        <TouchableOpacity
                          style={styles.authFooterLink}
                          onPress={() => setShowEmailLogin(false)}
                          accessibilityRole="link"
                          testID="login-show-google"
                        >
                          <Text style={styles.authFooterLinkText}>
                            {t('welcome.sign_in_google')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.authFooterLink}
                          onPress={() => navigation.navigate('Register')}
                        >
                          <Text style={styles.authFooterLinkText}>
                            {t('auth.want_to_create_stories')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                </AnimatedSection>
              </View>
            </View>

            {!isDesktopLayout ? renderDiscoveryLinks() : null}

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
  contentDesktop: {
    maxWidth: 1080,
    paddingHorizontal: theme.spacing[8],
  },
  loginLayout: {
    width: '100%',
  },
  loginLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
    padding: theme.spacing[6],
    borderRadius: theme.borders.radius['2xl'],
    borderWidth: theme.borders.width.thin,
    borderColor: 'rgba(219, 197, 240, 0.78)',
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    ...Platform.select({
      web: {
        boxShadow: '0 24px 60px -42px rgba(59, 46, 110, 0.5)' as unknown as string,
      },
    }),
  },
  leftColumn: {
    width: '100%',
  },
  leftColumnDesktop: {
    flex: 1,
    minWidth: 0,
  },
  heroSection: {
    width: '100%',
  },
  authColumn: {
    width: '100%',
  },
  authColumnDesktop: {
    flex: 1,
    minWidth: 0,
  },
  hero: {
    alignItems: 'center',
    marginBottom: theme.spacing[6],
  },
  pageTitle: {
    marginBottom: theme.spacing[6],
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
  },
  pageTitleDesktop: {
    textAlign: 'left',
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
  authPanel: {
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.64)',
    borderWidth: theme.borders.width.thin,
    borderColor: 'rgba(235, 226, 247, 0.9)',
  },
  authPanelDesktop: {
    padding: theme.spacing[3],
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  authIntro: {
    marginBottom: theme.spacing[5],
  },
  authTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
  },
  authIntroText: {
    marginTop: theme.spacing[2],
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
  },
  authCardSection: {
    marginBottom: theme.spacing[6],
  },
  emailLoginAction: {
    marginTop: theme.spacing[5],
  },
  authFooterLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: theme.spacing[2],
  },
  authFooterLink: {
    paddingVertical: theme.spacing[2],
  },
  authFooterLinkText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecorationLine: 'underline',
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
  formSectionAfterConsent: {
    marginTop: theme.spacing[5],
  },
  emailFallbackLink: {
    alignSelf: 'center',
    paddingVertical: theme.spacing[2],
  },
  emailFallbackLinkText: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: 'center',
    textDecorationLine: 'underline',
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
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.md,
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
    marginTop: theme.spacing[4],
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
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.text.secondary,
  },
  oauthConsentCopy: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[1],
  },
  oauthConsentLink: {
    color: theme.colors.interactive.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    lineHeight: 20,
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
  providerButtonText: {
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
  linksSectionDesktop: {
    marginBottom: 0,
    flexDirection: 'row',
  },
  discoveryLinksDesktop: {
    width: '100%',
  },
  devNoteText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.xs,
    textAlign: 'center',
    color: theme.colors.interactive.primary,
    fontStyle: 'italic',
  },
});
