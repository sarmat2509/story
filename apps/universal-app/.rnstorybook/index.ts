import AsyncStorage from '@react-native-async-storage/async-storage';
import { view } from './storybook.requires';

const StorybookUIRoot = view.getStorybookUI({
  storage: AsyncStorage,
  shouldPersistSelection: true,
});

export default StorybookUIRoot;
