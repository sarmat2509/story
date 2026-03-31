import React, { useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { APP_CONFIG } from '@/config/constants';
import { DEFAULT_LOCALE, SUPPORTED_LANGUAGES, isValidLocale } from '@wondertales/shared';
import type { Locale } from '@wondertales/shared';
import { theme } from '@/theme';
import { storage } from '@/utils/storage';
import { useAuthStore } from '@/store/authStore';
import apiClient from '@/api/client';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import type { MainDrawerParamList } from '@/types/navigation';

export default function LanguageSettingsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { user: _user, setUser } = useAuthStore();
  const normalizedCurrentLanguage = i18n.language?.split('-')[0]?.toLowerCase() || DEFAULT_LOCALE;
  const [selectedLanguage, setSelectedLanguage] = useState(
    isValidLocale(normalizedCurrentLanguage) ? normalizedCurrentLanguage : DEFAULT_LOCALE
  );
  const [isChanging, setIsChanging] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const languages = APP_CONFIG.supportedLanguages.map((code) => ({
    code,
    name: t(`language_names.${code}`, { defaultValue: SUPPORTED_LANGUAGES[code].nativeName }),
    flag: SUPPORTED_LANGUAGES[code].flag,
  }));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />
      ),
    });
  }, [navigation]);

  const handleLanguageChange = async (languageCode: Locale) => {
    if (isChanging || selectedLanguage === languageCode) return;
    
    try {
      setIsChanging(true);
      
      // Update i18n
      await i18n.changeLanguage(languageCode);
      
      // Save to storage
      await storage.setLanguage(languageCode);
      
      // Update user preference in API
      const response = await apiClient.patch('/api/v1/me', {
        preferredLocale: languageCode
      });
      
      if (response.data.user) {
        setUser(response.data.user);
      }
      
      setSelectedLanguage(languageCode);
    } catch (error) {
      console.error('Failed to change language:', error);
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('profile.language_settings')}</Text>
      <Text style={styles.description}>
        {t('profile.language_settings_description')}
      </Text>
      
      {languages.map((language) => {
        const isSelected = selectedLanguage === language.code;
        
        return (
          <TouchableOpacity
            key={language.code}
            style={[
              styles.languageButton,
              isSelected && styles.selectedLanguage
            ]}
            onPress={() => handleLanguageChange(language.code)}
            disabled={isChanging}
          >
            <View style={styles.languageInfo}>
              <Text style={styles.flag}>{language.flag}</Text>
              <Text style={[
                styles.languageName,
                isSelected && styles.selectedLanguageName
              ]}>
                {language.name}
              </Text>
            </View>
            {isChanging && isSelected ? (
              <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
            ) : isSelected ? (
              <Ionicons 
                name="checkmark-circle" 
                size={24} 
                color={theme.colors.interactive.primary} 
              />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
    <FeedbackModal
      visible={showFeedbackModal}
      onClose={() => setShowFeedbackModal(false)}
      initialReportedScreen="profile"
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  content: {
    padding: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[6],
  },
  languageButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    marginBottom: theme.spacing[2],
  },
  selectedLanguage: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flag: {
    fontSize: 28,
    marginRight: theme.spacing[3],
  },
  languageName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  selectedLanguageName: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.interactive.primary,
  },
});
