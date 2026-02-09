import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { storage } from '@/utils/storage';

const LANGUAGES = [
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
];

export function LanguageDropdown() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<View>(null);

  // Only render on web
  if (Platform.OS !== 'web') return null;

  const currentLanguage = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  const handleLanguageChange = async (languageCode: string) => {
    try {
      // Change language via i18n
      await i18n.changeLanguage(languageCode);
      
      // Save to storage
      await storage.setLanguage(languageCode);
      
      // Close dropdown
      setIsOpen(false);
      
      // Reload page to apply changes (simple approach for Phase 1)
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // @ts-ignore - web-specific code
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  return (
    // @ts-ignore - web-specific ref
    <View style={styles.container} ref={dropdownRef}>
      <TouchableOpacity 
        style={styles.trigger}
        onPress={() => setIsOpen(!isOpen)}
      >
        <Text style={styles.flag}>{currentLanguage.flag}</Text>
        <Text style={styles.code}>{currentLanguage.code.toUpperCase()}</Text>
        <Ionicons 
          name={isOpen ? 'chevron-up' : 'chevron-down'} 
          size={16} 
          color={theme.colors.text.secondary} 
        />
      </TouchableOpacity>
      
      {isOpen && (
        <View style={styles.dropdown}>
          {LANGUAGES.map((language) => (
            <TouchableOpacity
              key={language.code}
              style={[
                styles.option,
                language.code === i18n.language && styles.selectedOption
              ]}
              onPress={() => handleLanguageChange(language.code)}
            >
              <Text style={styles.flag}>{language.flag}</Text>
              <Text style={styles.languageName}>{language.name}</Text>
              {language.code === i18n.language && (
                <Ionicons 
                  name="checkmark" 
                  size={20} 
                  color={theme.colors.interactive.primary}
                  style={styles.checkmark}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginRight: theme.spacing[4],
    zIndex: 1000,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    // @ts-ignore - web-specific
    cursor: 'pointer',
  },
  flag: {
    fontSize: 20,
  },
  code: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: theme.spacing[1],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    minWidth: 200,
    // @ts-ignore - web-specific
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
    // @ts-ignore - web-specific
    cursor: 'pointer',
  },
  selectedOption: {
    backgroundColor: theme.colors.primary[50],
  },
  languageName: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    flex: 1,
  },
  checkmark: {
    marginLeft: 'auto' as any,
  },
});
