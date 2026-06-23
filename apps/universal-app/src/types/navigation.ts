import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  OAuthCallback: { provider: 'google' | 'apple' };
  ModeSelection: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Admin: NavigatorScreenParams<AdminStackParamList> | undefined;
};

export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminStories: undefined;
  AdminUsers: undefined;
  AdminFeedback: undefined;
  AdminPrivacyRequests: undefined;
  AdminValidations: undefined;
  AdminContentConfig: undefined;
  AdminVoices: undefined;
  AdminValidationDetail: { id: string };
  AdminScenes: undefined;
  AdminScenesStory: { storyId: string };
};

export type MainDrawerParamList = {
  Welcome: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
  ChildModeRecovery: { token?: string };
  NotFound: undefined;
  OAuthCallback: { provider: 'google' | 'apple' };
  Dashboard: undefined;
  Wizard:
    | {
        childId?: string;
        storyCreationMode?: 'instant' | 'artisan';
        scenarioCardId?: string;
        scenario?: string;
        theme?: string;
      }
    | undefined;
  Library: { scenarioCardId?: string } | undefined;
  LibraryRedirect: undefined;
  Artifacts: undefined;
  MapTiles: { rewardTileId?: string; storyId?: string; childProfileId?: string } | undefined;
  Series: undefined;
  SeriesDetail: { seriesId: string };
  Story: { storyId: string; autoPlay?: boolean; scrollToQuiz?: boolean };
  StoryRedirect: { storyId: string };
  Stories: undefined;
  PublishedStory: { slug: string };
  AuthorProfile: { authorId: string };
  UnlistedStory: { token: string };
  Children: undefined;
  ChildDetail: { childId: string };
  Characters: undefined;
  Plans: undefined;
  Profile: undefined;
  BillingSuccess: { kind?: 'subscription' | 'bundle'; session_id?: string } | undefined;
  LanguageSettings: undefined;
  ThemeSettings: undefined;
};

export type MainTabParamList = MainDrawerParamList;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
