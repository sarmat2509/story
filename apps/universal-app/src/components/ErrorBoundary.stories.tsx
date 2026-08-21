import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { theme } from '@/theme';
import { ErrorBoundary } from './ErrorBoundary';

function BrokenContent(): never {
  throw new Error('The preview component could not load.');
}

function ErrorBoundaryPreview({ customFallback = false }: { customFallback?: boolean }) {
  return (
    <ErrorBoundary
      fallback={
        customFallback ? (
          <View style={{ padding: theme.spacing[5], backgroundColor: theme.colors.warning[50] }}>
            <Text style={{ color: theme.colors.text.primary }}>Custom recovery content</Text>
          </View>
        ) : undefined
      }
    >
      <BrokenContent />
    </ErrorBoundary>
  );
}

const meta: Meta<typeof ErrorBoundaryPreview> = {
  title: 'Components/Error boundary',
  component: ErrorBoundaryPreview,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultFallback: Story = {};
export const CustomFallback: Story = { args: { customFallback: true } };
