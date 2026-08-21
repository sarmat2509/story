import type { Meta, StoryObj } from '@storybook/react-native';
import type { CollectedStoryArtifactApi } from '@/api/artifacts';
import { ArtifactTile } from './ArtifactsScreen';

const artifact: CollectedStoryArtifactApi = {
  id: 'artifact-1',
  userId: 'user-1',
  childProfileId: 'mia',
  artifactId: 'star-map',
  storyId: 'moon-garden',
  acquiredLabel: 'Found in chapter 3',
  acquiredAt: '2026-08-21T00:00:00.000Z',
  collectedByChild: { id: 'mia', name: 'Mia' },
  artifact: {
    id: 'star-map',
    artifactCode: 'star-map',
    title: 'Star map',
    description: 'A map of the night sky.',
    imagePath: '',
    fullImagePath: '',
    fullImageUrl: '',
    thumbnailPath: '',
    thumbnailUrl: '',
    imageUrl: '',
  },
  story: {
    id: 'moon-garden',
    title: 'The Moonlit Garden',
    language: 'en',
    createdAt: '2026-08-20T00:00:00.000Z',
  },
};
const meta: Meta<typeof ArtifactTile> = {
  title: 'Cards/Artifact tile',
  component: ArtifactTile,
  args: { item: artifact, onPress: () => undefined },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Placeholder: Story = {};
