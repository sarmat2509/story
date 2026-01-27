export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  OAuthCallback: { provider: 'google' | 'apple' };
};

export type MainTabParamList = {
  Home: undefined;
  Create: undefined;
  Library: undefined;
  Profile: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
