export type RootStackParamList = {
  Public: undefined;
  Main: undefined;
};

export type PublicStackParamList = {
  Landing: undefined;
  Plans: undefined;
  Login: undefined;
  OAuthCallback: { provider: 'google' | 'apple' };
};

export type MainDrawerParamList = {
  Dashboard: undefined;
  Wizard: undefined;
  Library: { scenarioCardId?: string } | undefined;
  Story: { storyId: string };
  Children: undefined;
  Characters: undefined;
  Plans: undefined;
  Profile: undefined;
  LanguageSettings: undefined;
};

export type MainTabParamList = MainDrawerParamList;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
