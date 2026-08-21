import type { Meta, StoryObj } from '@storybook/react-native';
import type { StoryQuizActivityApi, StoryQuizApi } from '@wondertales/shared';
import { StoryReflectionSection } from './StoryReflectionSection';

const baseActivity = {
  rubric: 'check_reward' as const,
  resultKind: 'objective' as const,
  deliveryMode: 'assisted' as const,
};

const singleChoice: StoryQuizActivityApi = {
  ...baseActivity,
  id: 'hero',
  kind: 'choose_character',
  interactionType: 'single_choice',
  question: 'Who found the lantern?',
  correctOptionId: 'luna',
  evidenceSceneIds: [2],
  options: [
    { id: 'luna', label: 'Luna' },
    { id: 'milo', label: 'Milo' },
    { id: 'owl', label: 'The owl' },
  ],
};
const multipleChoice: StoryQuizActivityApi = {
  ...baseActivity,
  id: 'traits',
  kind: 'choose_three_traits',
  interactionType: 'multi_select',
  question: 'Choose the three traits that helped Luna.',
  correctOptionIds: ['brave', 'kind', 'curious'],
  options: [
    { id: 'brave', label: 'Brave' },
    { id: 'kind', label: 'Kind' },
    { id: 'curious', label: 'Curious' },
    { id: 'sleepy', label: 'Sleepy' },
  ],
};
const sequence: StoryQuizActivityApi = {
  ...baseActivity,
  id: 'events',
  kind: 'sequence_three_events',
  interactionType: 'sequence_order',
  question: 'Put the events in the order they happened.',
  preferredOrderIds: ['map', 'walk', 'lantern'],
  options: [
    { id: 'map', label: 'Luna found a map' },
    { id: 'walk', label: 'She followed the path' },
    { id: 'lantern', label: 'She discovered the lantern' },
  ],
};
const matching: StoryQuizActivityApi = {
  ...baseActivity,
  id: 'pairs',
  kind: 'match_character_action',
  interactionType: 'match_pairs',
  question: 'Match each character to an action.',
  pairs: [
    { leftId: 'luna', rightId: 'found' },
    { leftId: 'milo', rightId: 'climbed' },
  ],
  options: [
    { id: 'luna', label: 'Luna' },
    { id: 'milo', label: 'Milo' },
    { id: 'found', label: 'Found the lantern' },
    { id: 'climbed', label: 'Climbed the tree' },
  ],
};
const reflection: StoryQuizActivityApi = {
  id: 'talk',
  rubric: 'think_talk',
  kind: 'what_if',
  interactionType: 'branch_choice',
  resultKind: 'reflective',
  deliveryMode: 'parent_led',
  question: 'What would you do if you found a mysterious lantern?',
  options: [
    { id: 'ask', label: 'Ask a trusted adult' },
    { id: 'explore', label: 'Explore carefully with a friend' },
  ],
};

function quizFor(activity: StoryQuizActivityApi): StoryQuizApi {
  return {
    id: `quiz-${activity.id}`,
    storyId: 'moonlit-garden',
    language: 'en',
    sourceAgeGroup: '6-8',
    quizAgeBucket: '6-8',
    promptVersion: 'storybook',
    sourceFingerprint: 'storybook',
    status: 'completed',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    payload: {
      title: 'The Moonlit Garden',
      language: 'en',
      sourceAgeGroup: '6-8',
      quizAgeBucket: '6-8',
      createdAt: '2026-08-21T00:00:00.000Z',
      reward: {
        label: 'A star token',
        unlockPolicy: 'complete_check_reward',
        bonusRules: ['all_check_completed'],
      },
      sections: [{ rubric: activity.rubric, title: 'Activities', activityIds: [activity.id] }],
      activities: [activity],
    },
  };
}

const meta: Meta<typeof StoryReflectionSection> = {
  title: 'Story/Quiz activities',
  component: StoryReflectionSection,
  args: { storyId: 'moonlit-garden', enabled: true, initialQuiz: quizFor(singleChoice) },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const SingleChoice: Story = {};
export const MultipleChoice: Story = { args: { initialQuiz: quizFor(multipleChoice) } };
export const Sequence: Story = { args: { initialQuiz: quizFor(sequence) } };
export const MatchPairs: Story = { args: { initialQuiz: quizFor(matching) } };
export const ThinkAndTalk: Story = { args: { initialQuiz: quizFor(reflection) } };
