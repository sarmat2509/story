import assert from 'node:assert/strict';
import { applyGraphicNovelBubbleVisionLayout } from '../bubbleVisionPlanner';
import { GRAPHIC_NOVEL_PAGE_SIZE, planGraphicNovelLayouts } from '../layoutPlanner';
import type { GraphicNovelPageScript } from '../types';

function visual(primaryRead: string) {
  return {
    environmentId: 'env_test',
    primaryRead,
    sceneVisual: {
      setting: primaryRead,
      lighting: 'clear warm light',
      cameraComposition: {
        shot: 'medium shot, eye level',
        characters: [{
          name: 'Mira',
          position: 'right_foreground',
          anchor: { x: 0.72, y: 0.72 },
          speechTarget: { x: 0.72, y: 0.45 },
          description: 'foreground right, readable face, looking at a glowing clue',
        }],
      },
    },
  };
}

function samplePageScript(): GraphicNovelPageScript {
  return {
    pageNumber: 1,
    pageRole: 'conversation',
    panels: [
      {
        panelId: 'p1-1',
        beatType: 'conversation',
        visualAction: 'Mira reacts to a glowing clue.',
        setting: 'Garden path',
        charactersPresent: ['Mira'],
        dialogue: [{ speaker: 'Mira', text: 'I found it!' }],
        thoughts: [],
        visual: visual('Mira reacts to a glowing clue'),
        artPrompt: 'A child reacting to a glowing clue.',
      },
      {
        panelId: 'p1-2',
        beatType: 'reaction',
        visualAction: 'The clue shines.',
        setting: 'Garden path',
        charactersPresent: ['Mira'],
        dialogue: [],
        thoughts: [],
        visual: visual('The clue shines'),
        artPrompt: 'A glowing clue on a path.',
      },
    ],
  };
}

const fixedRandom = () => 0.1;

function distancePxFromRectToPoint(
  rect: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number }
): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width)) * GRAPHIC_NOVEL_PAGE_SIZE.width;
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height)) * GRAPHIC_NOVEL_PAGE_SIZE.height;
  return Math.hypot(dx, dy);
}

function overlapArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function rectCenter(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function testBubbleMovesToVisionEmptyZoneNearMouth(): void {
  const page = planGraphicNovelLayouts({ ageGroup: '4-5', pages: [samplePageScript()], randomSource: fixedRandom })[0];
  const panelRect = page.panels[0].templatePanel.rect;
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [{
        name: 'Mira',
        mouthCenter: { x: 0.72, y: 0.72 },
        faceCenter: { x: 0.72, y: 0.66 },
        headCenter: { x: 0.72, y: 0.62 },
        confidence: 0.96,
      }],
      emptyZones: [
        {
          x: 0.3,
          y: 0.62,
          width: 0.34,
          height: 0.22,
          confidence: 0.94,
          description: 'plain wall space beside Mira face without covering the face',
        },
        {
          x: 0.04,
          y: 0.04,
          width: 0.4,
          height: 0.16,
          confidence: 0.6,
          description: 'top corner space',
        },
      ],
    }],
  });

  const bubble = result.page.panels[0].bubbles[0];
  assert.ok(bubble.tailTo, 'speech bubble should keep a vision-derived tail target');
  assert.ok(Math.abs((bubble.tailTo!.x - panelRect.x) / panelRect.width - 0.72) < 0.02);
  assert.ok(Math.abs((bubble.tailTo!.y - panelRect.y) / panelRect.height - 0.72) < 0.02);
  assert.ok(
    bubble.rect.y > panelRect.y + panelRect.height * 0.4,
    'bubble should move toward the lower safe empty zone near the detected mouth instead of staying at the panel top'
  );
  assert.ok(
    bubble.tailTo!.x < bubble.rect.x ||
      bubble.tailTo!.x > bubble.rect.x + bubble.rect.width ||
      bubble.tailTo!.y < bubble.rect.y ||
      bubble.tailTo!.y > bubble.rect.y + bubble.rect.height,
    'bubble should not cover the detected mouth target'
  );
  const distancePx = distancePxFromRectToPoint(bubble.rect, bubble.tailTo!);
  assert.ok(
    distancePx >= 76 && distancePx <= 200,
    `bubble edge should stay in a readable near-speaker range after frontend-font sizing, got ${distancePx.toFixed(1)}px`
  );
  assert.equal(result.placementSummary.bubblesWithVisionTargets, 1);
  assert.equal(result.placementSummary.bubblesWithVisionEmptyZones, 1);
}

function testBubblePrefersExpandedEmptyZoneOverCharacterBody(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [{
    speaker: 'Mira',
    text: 'Let us go check very quietly.',
  }];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'medium shot, side view',
    characters: [{
      name: 'Mira',
      position: 'center_midground',
      anchor: { x: 0.52, y: 0.7 },
      speechTarget: { x: 0.54, y: 0.28 },
      description: 'walking carefully, full body visible in the middle of the panel',
    }],
  };

  const page = planGraphicNovelLayouts({ ageGroup: '4-5', pages: [script], randomSource: fixedRandom })[0];
  const panelRect = page.panels[0].templatePanel.rect;
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [{
        name: 'Mira',
        mouthCenter: { x: 0.55, y: 0.31 },
        faceCenter: { x: 0.54, y: 0.27 },
        headCenter: { x: 0.53, y: 0.23 },
        confidence: 0.98,
      }],
      emptyZones: [
        {
          x: 0.68,
          y: 0.05,
          width: 0.25,
          height: 0.28,
          confidence: 0.95,
          description: 'clear sky to the upper right of the walking body',
        },
        {
          x: 0.38,
          y: 0.42,
          width: 0.36,
          height: 0.24,
          confidence: 0.8,
          description: 'visually simple but directly over the torso',
        },
      ],
    }],
  });

  const bubble = result.page.panels[0].bubbles[0];
  const estimatedBody = {
    x: panelRect.x + panelRect.width * 0.39,
    y: panelRect.y + panelRect.height * 0.17,
    width: panelRect.width * 0.31,
    height: panelRect.height * 0.68,
  };
  const bubbleArea = bubble.rect.width * bubble.rect.height;

  assert.ok(
    bubble.rect.y < panelRect.y + panelRect.height * 0.36,
    'long bubble should move toward an upper empty side instead of sitting across the character body'
  );
  assert.ok(
    overlapArea(bubble.rect, estimatedBody) < bubbleArea * 0.25,
    'bubble should avoid covering the estimated visible body'
  );
}

function testBubbleUsesFarEmptyZoneAsDirectionNotContainer(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [{
    speaker: 'Mira',
    text: 'Look, the glowing sand is making a path!',
  }];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'wide shot, eye level',
    characters: [{
      name: 'Mira',
      position: 'center_left_midground',
      anchor: { x: 0.43, y: 0.76 },
      speechTarget: { x: 0.45, y: 0.34 },
      description: 'walking in the center-left of the panel, with open sky and dunes to the right',
    }],
  };

  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const panelRect = page.panels[0].templatePanel.rect;
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [{
        name: 'Mira',
        mouthCenter: { x: 0.44, y: 0.34 },
        faceCenter: { x: 0.44, y: 0.3 },
        headCenter: { x: 0.44, y: 0.25 },
        confidence: 0.97,
      }],
      emptyZones: [
        {
          x: 0.66,
          y: 0.12,
          width: 0.28,
          height: 0.32,
          confidence: 0.95,
          description: 'large clear sky area to the right of the speaker',
        },
        {
          x: 0.1,
          y: 0.5,
          width: 0.32,
          height: 0.24,
          confidence: 0.88,
          description: 'closer empty sand patch on the left',
        },
      ],
    }],
  });

  const bubble = result.page.panels[0].bubbles[0];
  assert.ok(bubble.tailTo, 'speech bubble should keep the detected mouth target');
  const center = rectCenter(bubble.rect);
  const target = bubble.tailTo!;
  const distancePx = distancePxFromRectToPoint(bubble.rect, target);

  assert.ok(
    center.x > target.x,
    'far right empty zone should be used as a direction vector, so the bubble body lands to the right of the speaker'
  );
  assert.ok(
    distancePx >= 76 && distancePx <= 130,
    `bubble should preserve the 100px mouth-to-bubble rule while following the far empty zone direction, got ${distancePx.toFixed(1)}px`
  );
}

function testBubbleUsesOccupiedZonesWhenEmptyZonesAreUnavailable(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [{
    speaker: 'Mira',
    text: 'This clue is brighter than before!',
  }];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'medium shot, eye level',
    characters: [{
      name: 'Mira',
      position: 'center_midground',
      anchor: { x: 0.5, y: 0.72 },
      speechTarget: { x: 0.5, y: 0.34 },
      description: 'standing in the center with important body silhouette and hands visible',
    }],
  };

  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const panelRect = page.panels[0].templatePanel.rect;
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [{
        name: 'Mira',
        mouthCenter: { x: 0.5, y: 0.34 },
        faceCenter: { x: 0.5, y: 0.29 },
        headCenter: { x: 0.5, y: 0.24 },
        confidence: 0.98,
      }],
      occupiedZones: [
        {
          x: 0.39,
          y: 0.16,
          width: 0.22,
          height: 0.2,
          confidence: 0.98,
          kind: 'face',
          label: 'Mira face and hair',
        },
        {
          x: 0.32,
          y: 0.28,
          width: 0.36,
          height: 0.58,
          confidence: 0.94,
          kind: 'character',
          label: 'Mira body and hands',
        },
      ],
      emptyZones: [],
    }],
  });

  const bubble = result.page.panels[0].bubbles[0];
  const occupiedBody = {
    x: panelRect.x + panelRect.width * 0.32,
    y: panelRect.y + panelRect.height * 0.28,
    width: panelRect.width * 0.36,
    height: panelRect.height * 0.58,
  };
  const bubbleArea = bubble.rect.width * bubble.rect.height;
  const distancePx = distancePxFromRectToPoint(bubble.rect, bubble.tailTo!);

  assert.ok(
    distancePx >= 76 && distancePx <= 150,
    `occupied-zone placement should keep the bubble near the 100px speaker distance, got ${distancePx.toFixed(1)}px`
  );
  assert.ok(
    overlapArea(bubble.rect, occupiedBody) < bubbleArea * 0.2,
    'bubble should choose the lowest-overlap region around the speaker when only occupied zones are available'
  );
  assert.equal(result.placementSummary.bubblesWithVisionOccupiedZones, 1);
}

function testBubbleAvoidsAllDetectedCharactersNotOnlySpeaker(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [{
    speaker: 'Mira',
    text: 'The clue points right, but we should leave room for Leo.',
  }];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'medium two-shot, eye level',
    characters: [
      {
        name: 'Mira',
        position: 'left_foreground',
        anchor: { x: 0.22, y: 0.76 },
        speechTarget: { x: 0.22, y: 0.34 },
        description: 'foreground left, speaking while pointing toward the right side',
      },
      {
        name: 'Leo',
        position: 'right_foreground',
        anchor: { x: 0.72, y: 0.82 },
        speechTarget: { x: 0.72, y: 0.38 },
        description: 'foreground right, full body visible, standing in the right side of the panel',
      },
    ],
  };

  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const panelRect = page.panels[0].templatePanel.rect;
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [
        {
          name: 'Mira',
          mouthCenter: { x: 0.22, y: 0.34 },
          faceCenter: { x: 0.22, y: 0.29 },
          headCenter: { x: 0.22, y: 0.24 },
          confidence: 0.98,
        },
        {
          name: 'Leo',
          mouthCenter: { x: 0.72, y: 0.38 },
          faceCenter: { x: 0.72, y: 0.32 },
          headCenter: { x: 0.72, y: 0.26 },
          confidence: 0.96,
        },
      ],
      occupiedZones: [
        {
          x: 0.13,
          y: 0.18,
          width: 0.2,
          height: 0.66,
          confidence: 0.96,
          kind: 'character',
          description: 'Mira body; Leo was detected but not returned as an occupied zone',
        },
      ],
      emptyZones: [],
    }],
  });

  const bubble = result.page.panels[0].bubbles[0];
  const leoEstimatedBody = {
    x: panelRect.x + panelRect.width * 0.48,
    y: panelRect.y + panelRect.height * 0.17,
    width: panelRect.width * 0.45,
    height: panelRect.height * 0.72,
  };
  const bubbleArea = bubble.rect.width * bubble.rect.height;

  assert.ok(
    overlapArea(bubble.rect, leoEstimatedBody) < bubbleArea * 0.28,
    'bubble placement should account for every detected character zone, not only the speaking character'
  );
}

function testVisionPlacementAvoidsBubbleOverlap(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [
    { speaker: 'Mira', text: 'This clue is brighter than before!' },
    { speaker: 'Leo', text: 'Then we should follow it together.' },
  ];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'medium two-shot, eye level',
    characters: [
      {
        name: 'Mira',
        position: 'left_foreground',
        anchor: { x: 0.28, y: 0.7 },
        speechTarget: { x: 0.28, y: 0.35 },
        description: 'foreground left, readable face, pointing toward the clue',
      },
      {
        name: 'Leo',
        position: 'right_foreground',
        anchor: { x: 0.72, y: 0.7 },
        speechTarget: { x: 0.72, y: 0.35 },
        description: 'foreground right, readable face, answering Mira',
      },
    ],
  };

  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [
        {
          name: 'Mira',
          mouthCenter: { x: 0.28, y: 0.34 },
          faceCenter: { x: 0.28, y: 0.29 },
          headCenter: { x: 0.28, y: 0.24 },
          confidence: 0.98,
        },
        {
          name: 'Leo',
          mouthCenter: { x: 0.72, y: 0.34 },
          faceCenter: { x: 0.72, y: 0.29 },
          headCenter: { x: 0.72, y: 0.24 },
          confidence: 0.98,
        },
      ],
      emptyZones: [
        {
          x: 0.22,
          y: 0.03,
          width: 0.56,
          height: 0.3,
          confidence: 0.95,
          description: 'shared clear sky band above both speakers',
        },
      ],
      occupiedZones: [
        {
          x: 0.18,
          y: 0.28,
          width: 0.22,
          height: 0.62,
          confidence: 0.95,
          kind: 'character',
          description: 'Mira body',
        },
        {
          x: 0.61,
          y: 0.28,
          width: 0.22,
          height: 0.62,
          confidence: 0.95,
          kind: 'character',
          description: 'Leo body',
        },
      ],
    }],
  });

  const bubbles = result.page.panels[0].bubbles;
  assert.ok(bubbles.length >= 2);
  assert.equal(overlapArea(bubbles[0].rect, bubbles[1].rect), 0, 'vision-placed bubbles should not overlap');
  assert.equal(bubbles[0].overflow, false);
  assert.equal(bubbles[1].overflow, false);
}

function testCaptionDoesNotShrinkToTinyVisionEmptyZone(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [];
  script.panels[0].thoughts = [];
  script.panels[0].caption = 'Real joy comes when we help others with a brave heart.';

  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const panelRect = page.panels[0].templatePanel.rect;
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [],
      emptyZones: [
        {
          x: 0.24,
          y: 0.05,
          width: 0.1,
          height: 0.18,
          confidence: 0.9,
          description: 'tiny sky pocket',
        },
        {
          x: 0.64,
          y: 0.05,
          width: 0.1,
          height: 0.18,
          confidence: 0.9,
          description: 'another tiny sky pocket',
        },
      ],
      occupiedZones: [
        {
          x: 0.36,
          y: 0.0,
          width: 0.28,
          height: 0.7,
          confidence: 0.95,
          kind: 'character',
          description: 'large central character',
        },
      ],
    }],
  });

  const caption = result.page.panels[0].bubbles.find((bubble) => bubble.kind === 'caption');
  assert.ok(caption, 'caption bubble should exist');
  assert.equal(caption.overflow, false, 'caption should not select a text-overflowing tiny-zone candidate');
  assert.ok(
    caption.rect.width > panelRect.width * 0.25,
    `caption should expand beyond tiny Vision zone; got width ratio ${(caption.rect.width / panelRect.width).toFixed(3)}`
  );
}

export async function runGraphicNovelBubbleVisionPlannerTests(): Promise<void> {
  testBubbleMovesToVisionEmptyZoneNearMouth();
  testBubblePrefersExpandedEmptyZoneOverCharacterBody();
  testBubbleUsesFarEmptyZoneAsDirectionNotContainer();
  testBubbleUsesOccupiedZonesWhenEmptyZonesAreUnavailable();
  testBubbleAvoidsAllDetectedCharactersNotOnlySpeaker();
  testVisionPlacementAvoidsBubbleOverlap();
  testCaptionDoesNotShrinkToTinyVisionEmptyZone();
}

if (require.main === module) {
  runGraphicNovelBubbleVisionPlannerTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
