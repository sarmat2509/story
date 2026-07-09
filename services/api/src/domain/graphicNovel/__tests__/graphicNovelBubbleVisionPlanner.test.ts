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
    distancePx >= 76 && distancePx <= 200,
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
    distancePx >= 76 && distancePx <= 200,
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

function testVisionPlacementAvoidsOverlapInNarrowPanel(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [
    {
      speaker: 'Aydragon',
      text: 'The tree waited until someone showed care for its mystery.',
    },
    {
      speaker: 'Petal',
      text: 'Only a kind action can stop this sad whisper.',
    },
  ];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'narrow vertical two-shot, eye level',
    characters: [
      {
        name: 'Aydragon',
        position: 'lower_left_foreground',
        anchor: { x: 0.23, y: 0.62 },
        speechTarget: { x: 0.23, y: 0.52 },
        description: 'lower left creature speaking from the tree root',
      },
      {
        name: 'Petal',
        position: 'lower_center_foreground',
        anchor: { x: 0.5, y: 0.71 },
        speechTarget: { x: 0.5, y: 0.62 },
        description: 'small fairy hovering near the creature',
      },
    ],
  };

  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  page.panels[0].templatePanel.rect = {
    x: 0.673177,
    y: 0.464355,
    width: 0.306641,
    height: 0.520508,
  };

  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [
        {
          name: 'Aydragon',
          mouthCenter: { x: 0.23, y: 0.525 },
          faceCenter: { x: 0.23, y: 0.515 },
          headCenter: { x: 0.23, y: 0.515 },
          confidence: 1,
        },
        {
          name: 'Petal',
          mouthCenter: { x: 0.5, y: 0.62 },
          faceCenter: { x: 0.5, y: 0.61 },
          headCenter: { x: 0.5, y: 0.61 },
          confidence: 1,
        },
      ],
      emptyZones: [
        {
          x: 0.65,
          y: 0.1,
          width: 0.3,
          height: 0.3,
          confidence: 0.8,
          description: 'upper right tree background',
        },
        {
          x: 0.05,
          y: 0.1,
          width: 0.3,
          height: 0.2,
          confidence: 0.7,
          description: 'upper left tree background',
        },
      ],
      occupiedZones: [
        {
          x: 0.05,
          y: 0.45,
          width: 0.35,
          height: 0.75,
          confidence: 1,
          kind: 'character',
          description: 'Aydragon body',
        },
        {
          x: 0.4,
          y: 0.48,
          width: 0.35,
          height: 0.75,
          confidence: 1,
          kind: 'character',
          description: 'Petal body',
        },
      ],
    }],
  });

  const bubbles = result.page.panels[0].bubbles;
  assert.equal(overlapArea(bubbles[0].rect, bubbles[1].rect), 0, 'narrow panel bubbles should not overlap');
  assert.ok(
    Math.abs(rectCenter(bubbles[0].rect).y - rectCenter(bubbles[1].rect).y) > 0.045,
    'narrow panel bubbles should be vertically separated when they cannot fit side-by-side'
  );
}

function testVisionPlacementPreservesVerticalTargetOrder(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [
    { speaker: 'Mira', text: 'The glow starts up here.' },
    { speaker: 'Leo', text: 'And the trail continues below.' },
  ];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'vertical two-shot, eye level',
    characters: [
      {
        name: 'Mira',
        position: 'upper_right_foreground',
        anchor: { x: 0.72, y: 0.42 },
        speechTarget: { x: 0.72, y: 0.26 },
        description: 'upper right, speaking from near the tree branches',
      },
      {
        name: 'Leo',
        position: 'lower_right_foreground',
        anchor: { x: 0.72, y: 0.82 },
        speechTarget: { x: 0.72, y: 0.64 },
        description: 'lower right, answering from below Mira',
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
          mouthCenter: { x: 0.72, y: 0.26 },
          faceCenter: { x: 0.72, y: 0.22 },
          headCenter: { x: 0.72, y: 0.18 },
          confidence: 0.98,
        },
        {
          name: 'Leo',
          mouthCenter: { x: 0.72, y: 0.64 },
          faceCenter: { x: 0.72, y: 0.6 },
          headCenter: { x: 0.72, y: 0.56 },
          confidence: 0.98,
        },
      ],
      emptyZones: [
        {
          x: 0.05,
          y: 0.04,
          width: 0.7,
          height: 0.2,
          confidence: 0.96,
          description: 'upper clear space near the upper speaker',
        },
        {
          x: 0.05,
          y: 0.7,
          width: 0.72,
          height: 0.22,
          confidence: 0.96,
          description: 'lower clear space near the lower speaker',
        },
      ],
      occupiedZones: [
        {
          x: 0.56,
          y: 0.16,
          width: 0.34,
          height: 0.34,
          confidence: 0.95,
          kind: 'character',
          description: 'Mira upper body and face',
        },
        {
          x: 0.56,
          y: 0.54,
          width: 0.34,
          height: 0.36,
          confidence: 0.95,
          kind: 'character',
          description: 'Leo lower body and face',
        },
      ],
    }],
  });

  const bubbles = result.page.panels[0].bubbles;
  assert.ok(bubbles[0].tailTo && bubbles[1].tailTo, 'both bubbles should have vision targets');
  assert.ok(bubbles[0].tailTo!.y < bubbles[1].tailTo!.y, 'test fixture targets must be vertically ordered');
  assert.ok(
    rectCenter(bubbles[0].rect).y < rectCenter(bubbles[1].rect).y,
    'bubble vertical order should match target vertical order instead of crossing tails'
  );
  assert.equal(overlapArea(bubbles[0].rect, bubbles[1].rect), 0, 'grouped placement should avoid overlaps');
}

function testVisionPlacementPreservesHorizontalTargetOrder(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [
    { speaker: 'Mira', text: 'I will check the left side.' },
    { speaker: 'Leo', text: 'I will watch the right side.' },
  ];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'wide two-shot, eye level',
    characters: [
      {
        name: 'Mira',
        position: 'left_foreground',
        anchor: { x: 0.22, y: 0.68 },
        speechTarget: { x: 0.22, y: 0.38 },
        description: 'foreground left, speaking toward the center',
      },
      {
        name: 'Leo',
        position: 'right_foreground',
        anchor: { x: 0.78, y: 0.68 },
        speechTarget: { x: 0.78, y: 0.38 },
        description: 'foreground right, replying toward the center',
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
          mouthCenter: { x: 0.22, y: 0.38 },
          faceCenter: { x: 0.22, y: 0.32 },
          headCenter: { x: 0.22, y: 0.26 },
          confidence: 0.98,
        },
        {
          name: 'Leo',
          mouthCenter: { x: 0.78, y: 0.38 },
          faceCenter: { x: 0.78, y: 0.32 },
          headCenter: { x: 0.78, y: 0.26 },
          confidence: 0.98,
        },
      ],
      emptyZones: [
        {
          x: 0.04,
          y: 0.04,
          width: 0.36,
          height: 0.26,
          confidence: 0.96,
          description: 'clear space above left speaker',
        },
        {
          x: 0.6,
          y: 0.04,
          width: 0.36,
          height: 0.26,
          confidence: 0.96,
          description: 'clear space above right speaker',
        },
      ],
      occupiedZones: [
        {
          x: 0.12,
          y: 0.28,
          width: 0.24,
          height: 0.62,
          confidence: 0.95,
          kind: 'character',
          description: 'Mira body',
        },
        {
          x: 0.64,
          y: 0.28,
          width: 0.24,
          height: 0.62,
          confidence: 0.95,
          kind: 'character',
          description: 'Leo body',
        },
      ],
    }],
  });

  const bubbles = result.page.panels[0].bubbles;
  assert.ok(bubbles[0].tailTo && bubbles[1].tailTo, 'both bubbles should have vision targets');
  assert.ok(bubbles[0].tailTo!.x < bubbles[1].tailTo!.x, 'test fixture targets must be horizontally ordered');
  assert.ok(
    rectCenter(bubbles[0].rect).x < rectCenter(bubbles[1].rect).x,
    'bubble horizontal order should match target horizontal order instead of crossing tails'
  );
  assert.equal(overlapArea(bubbles[0].rect, bubbles[1].rect), 0, 'grouped placement should avoid overlaps');
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

function testVisionPlacementClearsStaleBubbleOverflow(): void {
  const page = planGraphicNovelLayouts({ ageGroup: '4-5', pages: [samplePageScript()], randomSource: fixedRandom })[0];
  page.panels[0].bubbles[0].overflow = true;

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
      emptyZones: [{
        x: 0.28,
        y: 0.12,
        width: 0.42,
        height: 0.28,
        confidence: 0.94,
      }],
      occupiedZones: [],
    }],
  });

  assert.equal(
    result.page.panels[0].bubbles[0].overflow,
    false,
    'post-art Vision placement should remeasure and clear stale script-layout overflow'
  );
}

function testWidePanelKeepsLeftSpeakerBubbleOnLeftSide(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [
    { speaker: 'Mira', text: 'Wait, Leo! We should not rush ahead.' },
    { speaker: 'Leo', text: 'I see the path!' },
  ];
  script.panels[0].charactersPresent = ['Mira', 'Leo'];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'wide shot, side view',
    characters: [
      {
        name: 'Mira',
        position: 'left_foreground',
        anchor: { x: 0.28, y: 0.76 },
        description: 'left side, calling out',
      },
      {
        name: 'Leo',
        position: 'right_midground',
        anchor: { x: 0.62, y: 0.76 },
        description: 'right side, moving away',
      },
    ],
  };
  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const panelBounds = { x: 0.02, y: 0.81, width: 0.96, height: 0.17 };
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      plannedPanelIndex: 1,
      panelBounds,
      detectedCharacters: [
        {
          name: 'Mira',
          mouthCenter: { x: 0.32, y: 0.855 },
          faceCenter: { x: 0.32, y: 0.835 },
          headCenter: { x: 0.32, y: 0.815 },
          confidence: 0.98,
        },
        {
          name: 'Leo',
          mouthCenter: { x: 0.62, y: 0.855 },
          faceCenter: { x: 0.62, y: 0.835 },
          headCenter: { x: 0.62, y: 0.815 },
          confidence: 0.95,
        },
      ],
      occupiedZones: [
        {
          x: 0.12,
          y: 0.775,
          width: 0.25,
          height: 0.2,
          confidence: 0.98,
          kind: 'character',
        },
        {
          x: 0.52,
          y: 0.805,
          width: 0.1,
          height: 0.1,
          confidence: 0.95,
          kind: 'character',
        },
      ],
      emptyZones: [],
    }],
  }, { useDetectedPanelBounds: true });

  const miraBubble = result.page.panels[0].bubbles[0];
  const miraBubbleCenterX = miraBubble.rect.x + miraBubble.rect.width / 2;
  assert.ok(
    miraBubbleCenterX <= panelBounds.x + panelBounds.width * 0.58,
    `Mira bubble should not jump to the far right side of the wide panel; got center x=${miraBubbleCenterX.toFixed(3)}`
  );
}

function testWidePanelKeepsSecondLeftSpeakerBubbleNearOwnCharacter(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [
    { speaker: 'Tik', text: 'Then faster! I want to find the treasure first!' },
    { speaker: 'Mira', text: 'Careful, Tik! We should not rush through the jungle.' },
  ];
  script.panels[0].charactersPresent = ['Mira', 'Tik'];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'wide shot, side view',
    characters: [
      {
        name: 'Mira',
        position: 'left_foreground',
        anchor: { x: 0.32, y: 0.78 },
        description: 'left side, calling out from near the lower edge',
      },
      {
        name: 'Tik',
        position: 'right_midground',
        anchor: { x: 0.58, y: 0.78 },
        description: 'right side, running away',
      },
    ],
  };
  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const panelBounds = { x: 0.02, y: 0.81, width: 0.96, height: 0.17 };
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      plannedPanelIndex: 1,
      panelBounds,
      detectedCharacters: [
        {
          name: 'Mira',
          mouthCenter: { x: 0.32, y: 0.855 },
          faceCenter: { x: 0.32, y: 0.835 },
          headCenter: { x: 0.32, y: 0.835 },
          confidence: 0.98,
        },
        {
          name: 'Tik',
          mouthCenter: { x: 0.58, y: 0.855 },
          faceCenter: { x: 0.58, y: 0.835 },
          headCenter: { x: 0.58, y: 0.835 },
          confidence: 0.95,
        },
      ],
      occupiedZones: [
        {
          x: 0.12,
          y: 0.775,
          width: 0.25,
          height: 0.2,
          confidence: 0.98,
          kind: 'character',
          label: 'Mira',
        },
        {
          x: 0.52,
          y: 0.805,
          width: 0.1,
          height: 0.1,
          confidence: 0.95,
          kind: 'character',
          label: 'Tik',
        },
      ],
      emptyZones: [],
    }],
  }, { useDetectedPanelBounds: true });

  const miraBubble = result.page.panels[0].bubbles[1];
  const miraBubbleCenter = rectCenter(miraBubble.rect);
  assert.ok(miraBubble.tailTo, 'Mira bubble should keep the detected mouth target');
  assert.ok(Math.abs(miraBubble.tailTo!.x - 0.32) < 0.02);
  assert.ok(
    miraBubbleCenter.x < 0.58,
    `Mira bubble should stay closer to Mira than to Tik; got center x=${miraBubbleCenter.x.toFixed(3)}`
  );
  const distancePx = distancePxFromRectToPoint(miraBubble.rect, miraBubble.tailTo!);
  assert.ok(
    distancePx <= 150,
    `Mira bubble edge should stay within 150px of the detected mouth target; got ${distancePx.toFixed(1)}px`
  );
}

function testNarrowDetectedPanelKeepsSpeakerBubbleNearOwnCharacter(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [
    { speaker: 'Tik', text: 'I am ready to listen to the old stone.' },
    { speaker: 'Mira', text: 'The path asks us to be patient.' },
  ];
  script.panels[0].charactersPresent = ['Mira', 'Tik'];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'medium shot, side view',
    characters: [
      {
        name: 'Tik',
        position: 'left_foreground',
        anchor: { x: 0.16, y: 0.84 },
        description: 'left side, sitting low',
      },
      {
        name: 'Mira',
        position: 'right_foreground',
        anchor: { x: 0.36, y: 0.77 },
        description: 'right side, pointing toward the path',
      },
    ],
  };
  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      plannedPanelIndex: 1,
      panelBounds: { x: 0.03, y: 0.69, width: 0.46, height: 0.28 },
      detectedCharacters: [
        {
          name: 'Tik',
          mouthCenter: { x: 0.16, y: 0.84 },
          faceCenter: { x: 0.16, y: 0.82 },
          headCenter: { x: 0.16, y: 0.82 },
          confidence: 0.95,
        },
        {
          name: 'Mira',
          mouthCenter: { x: 0.36, y: 0.77 },
          faceCenter: { x: 0.36, y: 0.75 },
          headCenter: { x: 0.36, y: 0.75 },
          confidence: 0.95,
        },
      ],
      occupiedZones: [
        {
          x: 0.1,
          y: 0.78,
          width: 0.12,
          height: 0.15,
          confidence: 0.9,
          kind: 'character',
          description: 'Tik sitting',
        },
        {
          x: 0.3,
          y: 0.7,
          width: 0.12,
          height: 0.25,
          confidence: 0.9,
          kind: 'character',
          description: 'Mira pointing',
        },
      ],
      emptyZones: [],
    }],
  }, { useDetectedPanelBounds: true });

  const miraBubble = result.page.panels[0].bubbles[1];
  assert.ok(miraBubble.tailTo, 'Mira bubble should keep the detected mouth target');
  const distancePx = distancePxFromRectToPoint(miraBubble.rect, miraBubble.tailTo!);
  assert.ok(
    distancePx <= 150,
    `Mira bubble edge should stay within 150px in a narrow multi-character panel; got ${distancePx.toFixed(1)}px`
  );
  assert.ok(
    rectCenter(miraBubble.rect).x > 0.22,
    `Mira bubble should not jump over to Tik's side; got center x=${rectCenter(miraBubble.rect).x.toFixed(3)}`
  );
}

function testBubbleMatchesSpeakerByMultilingualAlias(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [{ speaker: 'Тік', text: 'Ми все перевірили!' }];
  script.panels[0].charactersPresent = ['Тік', 'Моховик'];
  const composition = script.panels[0].visual.sceneVisual.cameraComposition;
  if (typeof composition !== 'string') {
    composition.characters = [
      {
        name: 'Тік',
        position: 'left_foreground',
        anchor: { x: 0.32, y: 0.78 },
        description: 'left foreground, smiling toward the other character',
      },
      {
        name: 'Моховик',
        position: 'right_foreground',
        anchor: { x: 0.78, y: 0.72 },
        description: 'right foreground, listening',
      },
    ];
  }

  const page = {
    ...planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0],
    characterAliases: {
      'Тік': ['Тік', 'Тик', 'Tik'],
      'Моховик': ['Моховик', 'Mossy'],
    },
  };
  const panelRect = page.panels[0].templatePanel.rect;
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      detectedCharacters: [
        {
          name: 'Tik',
          mouthCenter: { x: 0.25, y: 0.62 },
          faceCenter: { x: 0.25, y: 0.56 },
          headCenter: { x: 0.25, y: 0.5 },
          confidence: 0.95,
        },
        {
          name: 'Mossy',
          mouthCenter: { x: 0.78, y: 0.48 },
          faceCenter: { x: 0.78, y: 0.42 },
          headCenter: { x: 0.78, y: 0.36 },
          confidence: 0.95,
        },
      ],
      occupiedZones: [],
      emptyZones: [{
        x: 0.35,
        y: 0.08,
        width: 0.45,
        height: 0.2,
        confidence: 0.9,
        description: 'open sky',
      }],
    }],
  });

  const bubble = result.page.panels[0].bubbles[0];
  assert.ok(bubble.tailTo, 'bubble should receive a vision-derived target');
  assert.ok(
    Math.abs((bubble.tailTo!.x - panelRect.x) / panelRect.width - 0.25) < 0.02,
    'speaker Тік should match Vision name Tik instead of the other visible character'
  );
}

function testDetectedPanelBoundsOverrideTemplateRects(): void {
  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [samplePageScript()], randomSource: fixedRandom })[0];
  const detectedBounds = {
    x: 0.08,
    y: 0.12,
    width: 0.84,
    height: 0.28,
  };
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 1,
      panelId: 'p1-1',
      panelBounds: detectedBounds,
      detectedCharacters: [{
        name: 'Mira',
        mouthCenter: { x: 0.5, y: 0.29 },
        faceCenter: { x: 0.5, y: 0.25 },
        headCenter: { x: 0.5, y: 0.22 },
        confidence: 0.95,
      }],
      occupiedZones: [],
      emptyZones: [{
        x: 0.12,
        y: 0.14,
        width: 0.3,
        height: 0.12,
        confidence: 0.9,
        description: 'open sky inside actual first detected panel',
      }],
    }],
  }, { useDetectedPanelBounds: true });

  const panelRect = result.page.panels[0].templatePanel.rect;
  const bubble = result.page.panels[0].bubbles[0];
  assert.deepEqual(panelRect, detectedBounds);
  assert.equal(result.placementSummary.panelsWithDetectedBounds, 1);
  assert.equal(result.placementSummary.coordinateSpace, 'page');
  assert.ok(
    bubble.rect.y >= detectedBounds.y && bubble.rect.y + bubble.rect.height <= detectedBounds.y + detectedBounds.height,
    'bubble should be placed inside the detected panel bounds'
  );
  assert.ok(bubble.tailTo, 'speech bubble should keep a target mapped through detected panel bounds');
  assert.ok(Math.abs(bubble.tailTo!.x - 0.5) < 0.02);
  assert.ok(Math.abs(bubble.tailTo!.y - 0.29) < 0.02);
}

function testDetectedPanelBoundsSplitOnePlannedPanelAcrossPhysicalPanels(): void {
  const script = samplePageScript();
  script.panels[0].dialogue = [
    { speaker: 'Mira', text: 'I see the clue on the left!' },
    { speaker: 'Leo', text: 'And I see the path on the right!' },
  ];
  script.panels[0].charactersPresent = ['Mira', 'Leo'];
  script.panels[0].visual.sceneVisual.cameraComposition = {
    shot: 'two close panels, eye level',
    characters: [
      {
        name: 'Mira',
        position: 'left_foreground',
        anchor: { x: 0.24, y: 0.72 },
        description: 'left side, speaking first',
      },
      {
        name: 'Leo',
        position: 'right_foreground',
        anchor: { x: 0.76, y: 0.72 },
        description: 'right side, answering',
      },
    ],
  };
  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [
      {
        panelIndex: 1,
        plannedPanelIndex: 1,
        plannedPanelId: 'p1-1',
        panelBounds: { x: 0.05, y: 0.12, width: 0.4, height: 0.24 },
        detectedCharacters: [{
          name: 'Mira',
          mouthCenter: { x: 0.2, y: 0.24 },
          faceCenter: { x: 0.2, y: 0.21 },
          headCenter: { x: 0.2, y: 0.18 },
          confidence: 0.96,
        }, {
          name: 'Leo',
          mouthCenter: { x: 0.74, y: 0.24 },
          faceCenter: { x: 0.74, y: 0.21 },
          headCenter: { x: 0.74, y: 0.18 },
          confidence: 0.96,
        }],
        occupiedZones: [{
          x: 0.14,
          y: 0.18,
          width: 0.12,
          height: 0.12,
          confidence: 0.9,
          kind: 'character',
        }],
        emptyZones: [{
          x: 0.27,
          y: 0.14,
          width: 0.14,
          height: 0.1,
          confidence: 0.9,
        }],
      },
      {
        panelIndex: 2,
        plannedPanelIndex: 1,
        plannedPanelId: 'p1-1',
        panelBounds: { x: 0.55, y: 0.12, width: 0.4, height: 0.24 },
        detectedCharacters: [{
          name: 'Leo',
          mouthCenter: { x: 0.74, y: 0.24 },
          faceCenter: { x: 0.74, y: 0.21 },
          headCenter: { x: 0.74, y: 0.18 },
          confidence: 0.96,
        }],
        occupiedZones: [{
          x: 0.68,
          y: 0.18,
          width: 0.12,
          height: 0.12,
          confidence: 0.9,
          kind: 'character',
        }],
        emptyZones: [{
          x: 0.58,
          y: 0.14,
          width: 0.14,
          height: 0.1,
          confidence: 0.9,
        }],
      },
    ],
  }, { useDetectedPanelBounds: true });

  const [miraBubble, leoBubble] = result.page.panels[0].bubbles;
  assert.ok(miraBubble.tailTo, 'Mira bubble should get a target');
  assert.ok(leoBubble.tailTo, 'Leo bubble should get a target');
  assert.ok(miraBubble.rect.x < 0.48, 'Mira bubble should be placed in the left physical panel');
  assert.ok(leoBubble.rect.x > 0.5, 'Leo bubble should be placed in the right physical panel');
  assert.ok(Math.abs(miraBubble.tailTo!.x - 0.2) < 0.02);
  assert.ok(Math.abs(leoBubble.tailTo!.x - 0.74) < 0.02);
}

function testDetectedPanelBoundsTrimOverlappingPanels(): void {
  const script = samplePageScript();
  script.panels[1].dialogue = [{ speaker: 'Mira', text: 'The lower clue is here.' }];
  const page = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [script], randomSource: fixedRandom })[0];
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [
      {
        panelIndex: 1,
        plannedPanelIndex: 1,
        panelBounds: { x: 0.04, y: 0.34, width: 0.45, height: 0.62 },
        detectedCharacters: [{
          name: 'Mira',
          mouthCenter: { x: 0.2, y: 0.45 },
          faceCenter: { x: 0.2, y: 0.43 },
          headCenter: { x: 0.2, y: 0.41 },
          confidence: 0.98,
        }],
        occupiedZones: [],
        emptyZones: [{
          x: 0.2,
          y: 0.82,
          width: 0.22,
          height: 0.1,
          confidence: 0.9,
          description: 'zone actually belongs to the lower physical panel',
        }],
      },
      {
        panelIndex: 2,
        plannedPanelIndex: 2,
        panelBounds: { x: 0.04, y: 0.7, width: 0.45, height: 0.26 },
        detectedCharacters: [{
          name: 'Mira',
          mouthCenter: { x: 0.18, y: 0.82 },
          faceCenter: { x: 0.18, y: 0.8 },
          headCenter: { x: 0.18, y: 0.78 },
          confidence: 0.98,
        }],
        occupiedZones: [],
        emptyZones: [],
      },
    ],
  }, { useDetectedPanelBounds: true });

  const upperPanelRect = result.page.panels[0].templatePanel.rect;
  const upperPanelBottom = upperPanelRect.y + upperPanelRect.height;
  const upperBubble = result.page.panels[0].bubbles[0];
  assert.ok(
    upperPanelBottom <= 0.7,
    `overlapping upper panel bounds should be trimmed above the lower panel; got bottom=${upperPanelBottom.toFixed(3)}`
  );
  assert.ok(
    upperBubble.rect.y + upperBubble.rect.height <= upperPanelBottom,
    'bubble from the upper planned panel should stay inside the trimmed upper physical panel'
  );
}

function testPanelLocalVisionCoordinatesMapToWholePage(): void {
  const script = samplePageScript();
  script.panels[1].dialogue = [{ speaker: 'Mira', text: 'I see it too!' }];
  const page = planGraphicNovelLayouts({ ageGroup: '4-5', pages: [script], randomSource: fixedRandom })[0];
  const panelRect = page.panels[1].templatePanel.rect;
  const result = applyGraphicNovelBubbleVisionLayout(page, {
    panels: [{
      panelIndex: 2,
      panelId: 'p1-2',
      detectedCharacters: [{
        name: 'Mira',
        mouthCenter: { x: 0.5, y: 0.4 },
        faceCenter: { x: 0.5, y: 0.35 },
        headCenter: { x: 0.5, y: 0.3 },
        confidence: 0.98,
      }],
      occupiedZones: [{
        x: 0.42,
        y: 0.25,
        width: 0.16,
        height: 0.3,
        confidence: 0.9,
        kind: 'character',
      }],
      emptyZones: [{
        x: 0.05,
        y: 0.05,
        width: 0.35,
        height: 0.2,
        confidence: 0.9,
      }],
    }],
  });

  const bubble = result.page.panels[1].bubbles[0];
  assert.ok(bubble.tailTo, 'panel 2 bubble should receive a vision-derived target');
  assert.ok(Math.abs(bubble.tailTo!.x - (panelRect.x + panelRect.width * 0.5)) < 0.02);
  assert.ok(Math.abs(bubble.tailTo!.y - (panelRect.y + panelRect.height * 0.4)) < 0.02);
  assert.notEqual(
    Math.round(bubble.tailTo!.y * 1000) / 1000,
    0.4,
    'panel-local y=0.4 should be transformed into whole-page coordinates'
  );
}

export async function runGraphicNovelBubbleVisionPlannerTests(): Promise<void> {
  testBubbleMovesToVisionEmptyZoneNearMouth();
  testBubblePrefersExpandedEmptyZoneOverCharacterBody();
  testBubbleUsesFarEmptyZoneAsDirectionNotContainer();
  testBubbleUsesOccupiedZonesWhenEmptyZonesAreUnavailable();
  testBubbleAvoidsAllDetectedCharactersNotOnlySpeaker();
  testVisionPlacementAvoidsBubbleOverlap();
  testVisionPlacementAvoidsOverlapInNarrowPanel();
  testVisionPlacementPreservesVerticalTargetOrder();
  testVisionPlacementPreservesHorizontalTargetOrder();
  testCaptionDoesNotShrinkToTinyVisionEmptyZone();
  testVisionPlacementClearsStaleBubbleOverflow();
  testWidePanelKeepsLeftSpeakerBubbleOnLeftSide();
  testWidePanelKeepsSecondLeftSpeakerBubbleNearOwnCharacter();
  testNarrowDetectedPanelKeepsSpeakerBubbleNearOwnCharacter();
  testBubbleMatchesSpeakerByMultilingualAlias();
  testDetectedPanelBoundsOverrideTemplateRects();
  testDetectedPanelBoundsSplitOnePlannedPanelAcrossPhysicalPanels();
  testDetectedPanelBoundsTrimOverlappingPanels();
  testPanelLocalVisionCoordinatesMapToWholePage();
}

if (require.main === module) {
  runGraphicNovelBubbleVisionPlannerTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
