import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Public: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
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
  Story: { storyId: string; autoPlay?: boolean };
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
