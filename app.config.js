throw new Error(
  [
    'WonderTales native store builds must be run from apps/universal-app.',
    'The root Expo/native files are legacy workspace artifacts and are not a submission source.',
    'Use: cd apps/universal-app && eas build --profile production --platform ios|android',
  ].join(' ')
);
