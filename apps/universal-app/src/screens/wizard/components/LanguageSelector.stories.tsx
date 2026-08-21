import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { LanguageSelector } from './LanguageSelector';

function ControlledLanguageSelector(props: React.ComponentProps<typeof LanguageSelector>) {
  const [selected, setSelected] = React.useState(props.selected);
  const [selectedLanguages, setSelectedLanguages] = React.useState(props.selectedLanguages ?? []);
  return (
    <LanguageSelector
      {...props}
      selected={selected}
      onSelect={setSelected}
      selectedLanguages={selectedLanguages}
      onLanguagesChange={setSelectedLanguages}
    />
  );
}
const meta: Meta<typeof LanguageSelector> = {
  title: 'Selectors/Language selector',
  component: LanguageSelector,
  args: { selected: 'en', defaultLanguage: 'en', onSelect: () => undefined },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const SingleChoice: Story = { render: (args) => <ControlledLanguageSelector {...args} /> };
export const MultipleChoice: Story = {
  args: { schedulerMode: true, selectedLanguages: ['en'] },
  render: (args) => <ControlledLanguageSelector {...args} />,
};
export const RestrictedLanguages: Story = {
  args: { allowedLanguageCodes: ['en', 'es'], selected: 'es' },
  render: (args) => <ControlledLanguageSelector {...args} />,
};
