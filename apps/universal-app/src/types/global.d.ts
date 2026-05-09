declare module '@babel/runtime/helpers/interopRequireDefault';
declare module 'color';
declare module '@/utils/oauth' {
  export const oauth: {
    handleGoogleSignIn(consent?: {
      termsAccepted: boolean;
      privacyAccepted: boolean;
      isAdultGuardian: boolean;
    }): Promise<string | null>;
    handleAppleSignIn(consent?: {
      termsAccepted: boolean;
      privacyAccepted: boolean;
      isAdultGuardian: boolean;
    }): Promise<{ identityToken: string; user?: any } | null>;
  };
}
declare module '@wondertales/shared/i18n/uk.json';
declare module '@wondertales/shared/i18n/ru.json';
declare module '@wondertales/shared/i18n/en.json';
declare module '@wondertales/shared/i18n/es.json';
declare module '@wondertales/shared/i18n/fr.json';
declare module '@wondertales/shared/i18n/de.json';
declare module '@wondertales/shared/i18n/pl.json';
