import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  ModeSelection: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};

export type MainDrawerParamList = {
  Landing: undefined;
  Welcome: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
  NotFound: undefined;
  OAuthCallback: { provider: 'google' | 'apple' };
  Dashboard: undefined;
  Wizard: undefined;
  Library: { scenarioCardId?: string } | undefined;
  LibraryRedirect: undefined;
  Series: undefined;
  SeriesDetail: { seriesId: string };
  Story: { storyId: string; autoPlay?: boolean };
  StoryRedirect: { storyId: string };
  Stories: undefined;
  PublishedStory: { slug: string };
  UnlistedStory: { token: string };
  Children: undefined;
  Characters: undefined;
  Plans: undefined;
  Profile: undefined;
  BillingSuccess: undefined;
  LanguageSettings: undefined;
  ModeSelection: undefined;
};

export type MainTabParamList = MainDrawerParamList;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
