export type RootStackParamList = {
  Public: undefined;
  Main: undefined;
};

export type PublicStackParamList = {
  Landing: undefined;
  Prices: undefined;
  Login: undefined;
  OAuthCallback: { provider: 'google' | 'apple' };
};

export type MainDrawerParamList = {
  Dashboard: undefined;
  Wizard: undefined;
  Library: undefined;
  Children: undefined;
  Profile: undefined;
};

export type MainTabParamList = MainDrawerParamList;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
