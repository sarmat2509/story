import type { Meta, StoryObj } from '@storybook/react-native';
import { ScenarioTopicIcon } from './ScenarioTopicIcon';

const meta: Meta<typeof ScenarioTopicIcon> = {
  title: 'Icons/Scenario topic',
  component: ScenarioTopicIcon,
  args: { scenarioId: 'magic_wizards', size: 48 },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Magic: Story = {};
export const Space: Story = { args: { scenarioId: 'space_odyssey' } };
export const Jungle: Story = { args: { scenarioId: 'jungle_adventures', color: '#27844A' } };
