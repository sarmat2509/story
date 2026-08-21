import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import './global.css';
import App from './src/App';

const AppEntryPoint =
  process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true'
    ? require('./.rnstorybook').default
    : App;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(AppEntryPoint);
