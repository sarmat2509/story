export type RootStackParamList = {
  Public: undefined;
  Main: undefined;
};

export type PublicStackParamList = {
  Landing: undefined;
  Plans: undefined; // CHANGED from 'Prices'
  Login: undefined;
  OAuthCallback: { provider: 'google' | 'apple' };
};

export type MainDrawerParamList = {
  Dashboard: undefined;
  Wizard: undefined;
  Library: undefined;
  Story: { storyId: string };
  Children: undefined;
  Characters: undefined;
  Plans: undefined; // NEW - same screen in both stacks
  Profile: undefined;
};

export type MainTabParamList = MainDrawerParamList;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
