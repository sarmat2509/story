import React from 'react';
import { render } from '@testing-library/react-native';
import type { AdminGenerationStageEvent } from '@/admin/api/admin';
import { AdminGenerationTimeline } from '@/admin/components/AdminGenerationTimeline';

function stageEvent(
  id: string,
  operation: string,
  startedAt: string,
  completedAt: string
): AdminGenerationStageEvent {
  return {
    id,
    generationKind: 'story',
    pipelinePhase: operation === 'story_ready' ? 'postprocess' : 'asset_generation',
    operation,
    targetType: 'story',
    targetKey: 'story-1',
    sceneIndex: null,
    pageNumber: null,
    status: 'completed',
    attempt: 1,
    cacheStatus: null,
    startedAt,
    completedAt,
    durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
  };
}

describe('Admin generation timeline', () => {
  it('splits image generation at the ready-to-read boundary', () => {
    const view = render(
      <AdminGenerationTimeline
        events={[
          stageEvent(
            'writer',
            'writer_text',
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:10.000Z'
          ),
          stageEvent(
            'images',
            'image_batch',
            '2026-01-01T00:00:10.000Z',
            '2026-01-01T00:00:40.000Z'
          ),
          stageEvent(
            'ready',
            'story_ready',
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:25.000Z'
          ),
        ]}
      />
    );

    expect(view.getByText('Image generation before ready')).toBeTruthy();
    expect(view.getByText('Image generation after ready')).toBeTruthy();
    expect(view.getAllByText(/15 s/)).toHaveLength(2);
    expect(view.getByText('ready to read in 25 s')).toBeTruthy();
  });
});
