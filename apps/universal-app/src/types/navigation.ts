import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  ModeSelection: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};

export type MainDrawerParamList = {
  Landing: undefined;
  Login: undefined;
  NotFound: undefined;
  OAuthCallback: { provider: 'google' | 'apple' };
  Dashboard: undefined;
  Wizard: undefined;
  Library: { scenarioCardId?: string } | undefined;
  Story: { storyId: string; autoPlay?: boolean };
  Stories: undefined;
  PublishedStory: { slug: string };
  Children: undefined;
  Characters: undefined;
  Plans: undefined;
  Profile: undefined;
  LanguageSettings: undefined;
  ModeSelection: undefined;
};

export type MainTabParamList = MainDrawerParamList;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
