import assert from 'node:assert/strict';
import { GRAPHIC_NOVEL_PAGE_TEMPLATES, getTemplatesForAge } from '../pageTemplates';
import { planGraphicNovelLayouts } from '../layoutPlanner';
import { buildGraphicNovelPageEditInstructions } from '../pageRenderer';
import type { GraphicNovelPageScript, Rect } from '../types';

const PAGE_WIDTH = 1536;
const PAGE_HEIGHT = 2048;
const EXPECTED_PANEL_GUTTER_PX = Math.round((PAGE_WIDTH * 0.04) / 2);
const GEOMETRY_EPSILON = 0.001;

function visual(primaryRead: string, names: string[] = ['Mira']) {
  const slots = [
    { position: 'left_foreground', anchor: { x: 0.28, y: 0.66 }, speechTarget: { x: 0.28, y: 0.42 } },
    { position: 'right_foreground', anchor: { x: 0.72, y: 0.66 }, speechTarget: { x: 0.72, y: 0.42 } },
    { position: 'center_midground', anchor: { x: 0.5, y: 0.58 }, speechTarget: { x: 0.5, y: 0.36 } },
  ];
  return {
    environmentId: 'env_test',
    primaryRead,
    sceneVisual: {
      setting: primaryRead,
      lighting: 'clear warm light',
      cameraComposition: {
        shot: names.length > 1 ? 'medium two-shot, eye level' : 'medium shot, eye level',
        characters: names.map((name, index) => ({
          name,
          ...(slots[index] ?? slots[2]),
          description: index === 0
            ? 'foreground left, readable face, clear hand gesture'
            : 'foreground right, readable face, looking toward the other character',
        })),
      },
    },
  };
}

function testTemplateLibrary(): void {
  assert.equal(GRAPHIC_NOVEL_PAGE_TEMPLATES.length, 13);
  assert.equal(GRAPHIC_NOVEL_PAGE_TEMPLATES.some((template) => template.id === 'T02'), false);
  assert.equal(GRAPHIC_NOVEL_PAGE_TEMPLATES.some((template) => template.id === 'T03'), false);
  assert.equal(GRAPHIC_NOVEL_PAGE_TEMPLATES.some((template) => template.id === 'T05'), false);
  assert.equal(GRAPHIC_NOVEL_PAGE_TEMPLATES.some((template) => template.id === 'T07'), false);
  assert.equal(GRAPHIC_NOVEL_PAGE_TEMPLATES.some((template) => template.id === 'T13'), false);
  assert.ok(GRAPHIC_NOVEL_PAGE_TEMPLATES.some((template) => template.id === 'T16' && template.panelCount === 5));
  const coveredAges = new Set<string>();

  for (const template of GRAPHIC_NOVEL_PAGE_TEMPLATES) {
    assert.ok(template.panelCount >= 2, `${template.id} must have at least 2 panels`);
    assert.equal(template.panels.length, template.panelCount);
    assert.equal(template.readingOrder.length, template.panelCount);
    assert.ok(template.allowedAgeGroups.length > 0, `${template.id} must declare age groups`);
    assert.ok(template.bestUseCases.length > 0, `${template.id} must declare use cases`);

    for (const age of template.allowedAgeGroups) {
      coveredAges.add(age);
    }

    for (const panel of template.panels) {
      assert.equal((panel as any).bubbleZones, undefined, `${template.id} must not predefine bubble zones`);
      assert.equal((panel as any).artOnlyRegions, undefined, `${template.id} must not predefine art regions`);
      assert.ok(panel.rect.x >= 0 && panel.rect.x < 1);
      assert.ok(panel.rect.y >= 0 && panel.rect.y < 1);
      assert.ok(panel.rect.width > 0 && panel.rect.x + panel.rect.width <= 1);
      assert.ok(panel.rect.height > 0 && panel.rect.y + panel.rect.height <= 1);
      assert.ok(panel.rect.height < 0.8, `${template.id} must not contain full-height panels`);
    }
  }

  for (const age of ['0-1', '1y', '2-3', '4-5', '6-8', '9-12']) {
    assert.ok(coveredAges.has(age), `age ${age} must be covered`);
  }

  for (const age of ['0-1', '1y', '2-3']) {
    const panelCounts = new Set(getTemplatesForAge(age).map((template) => template.panelCount));
    assert.ok(panelCounts.has(2), `age ${age} must have 2-panel templates`);
    assert.ok(panelCounts.has(3), `age ${age} must have 3-panel templates`);
  }
}

function rectRight(rect: Rect): number {
  return rect.x + rect.width;
}

function rectBottom(rect: Rect): number {
  return rect.y + rect.height;
}

function assertClose(actual: number, expected: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) < GEOMETRY_EPSILON,
    `${message}: expected ${expected}, got ${actual}`
  );
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > GEOMETRY_EPSILON;
}

function gapIsExpected(gap: number, axis: 'x' | 'y'): boolean {
  const pixelGap = gap * (axis === 'x' ? PAGE_WIDTH : PAGE_HEIGHT);
  return Math.abs(pixelGap - EXPECTED_PANEL_GUTTER_PX) <= 1.5;
}

function hasHorizontalPanelBetween(left: Rect, right: Rect, panels: Rect[]): boolean {
  const leftEdge = rectRight(left);
  const rightEdge = right.x;

  return panels.some((candidate) =>
    candidate !== left &&
    candidate !== right &&
    candidate.x >= leftEdge - GEOMETRY_EPSILON &&
    rectRight(candidate) <= rightEdge + GEOMETRY_EPSILON &&
    rangesOverlap(candidate.y, rectBottom(candidate), left.y, rectBottom(left)) &&
    rangesOverlap(candidate.y, rectBottom(candidate), right.y, rectBottom(right))
  );
}

function hasVerticalPanelBetween(top: Rect, bottom: Rect, panels: Rect[]): boolean {
  const topEdge = rectBottom(top);
  const bottomEdge = bottom.y;

  return panels.some((candidate) =>
    candidate !== top &&
    candidate !== bottom &&
    candidate.y >= topEdge - GEOMETRY_EPSILON &&
    rectBottom(candidate) <= bottomEdge + GEOMETRY_EPSILON &&
    rangesOverlap(candidate.x, rectRight(candidate), top.x, rectRight(top)) &&
    rangesOverlap(candidate.x, rectRight(candidate), bottom.x, rectRight(bottom))
  );
}

function testAlternatingHalfStackTemplate(): void {
  const template = GRAPHIC_NOVEL_PAGE_TEMPLATES.find((candidate) => candidate.id === 'T18');
  assert.ok(template, 'T18 must exist');
  assert.equal(template.panelCount, 6);
  assert.deepEqual(template.readingOrder, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  assert.ok(template.allowedAgeGroups.includes('6-8'));
  assert.ok(template.allowedAgeGroups.includes('9-12'));
  assert.ok(getTemplatesForAge('6-8').some((candidate) => candidate.id === 'T18'));

  const [p1, p2, p3, p4, p5, p6] = template.panels.map((panel) => panel.rect);

  assertClose(p1.x, p4.x, 'top whole-left and bottom left stack should share left edge');
  assertClose(p2.x, p3.x, 'top right stack should share left edge');
  assertClose(p2.x, p6.x, 'top right stack and bottom whole-right should share left edge');
  assertClose(p2.width, p3.width, 'top right stacked panels should share width');
  assertClose(p4.width, p5.width, 'bottom left stacked panels should share width');
  assertClose(p1.width, p2.width, 'top row should be split into equal half columns');
  assertClose(p4.width, p6.width, 'bottom row should be split into equal half columns');

  assertClose(p1.y, p2.y, 'top whole-left and top right stack should start on same row');
  assert.ok(p2.y < p3.y, 'top right stack should read top before bottom');
  assertClose(rectBottom(p1), rectBottom(p3), 'top whole-left should span both top-right stacked panels');

  assertClose(p4.y, p6.y, 'bottom left stack and bottom whole-right should start on same row');
  assert.ok(p4.y < p5.y, 'bottom left stack should read top before bottom');
  assertClose(rectBottom(p5), rectBottom(p6), 'bottom whole-right should span both bottom-left stacked panels');
}

function testT08UsesEqualHeightRows(): void {
  const template = GRAPHIC_NOVEL_PAGE_TEMPLATES.find((candidate) => candidate.id === 'T08');
  assert.ok(template, 'T08 must exist');
  assert.equal(template.panelCount, 3);
  const [top, bottomLeft, bottomRight] = template.panels.map((panel) => panel.rect);
  assertClose(top.height, bottomLeft.height, 'T08 first row should match second-row height');
  assertClose(bottomLeft.height, bottomRight.height, 'T08 second-row panels should have equal height');
  assertClose(rectBottom(top), bottomLeft.y - EXPECTED_PANEL_GUTTER_PX / PAGE_HEIGHT, 'T08 rows should be separated by one gutter');
}

function testTemplateGutters(): void {
  for (const template of GRAPHIC_NOVEL_PAGE_TEMPLATES) {
    const rects = template.panels.map((panel) => panel.rect);
    const leftMarginPx = Math.min(...rects.map((rect) => rect.x)) * PAGE_WIDTH;
    const topMarginPx = Math.min(...rects.map((rect) => rect.y)) * PAGE_HEIGHT;
    const rightMarginPx = (1 - Math.max(...rects.map(rectRight))) * PAGE_WIDTH;
    const bottomMarginPx = (1 - Math.max(...rects.map(rectBottom))) * PAGE_HEIGHT;

    for (const [label, marginPx] of [
      ['left', leftMarginPx],
      ['top', topMarginPx],
      ['right', rightMarginPx],
      ['bottom', bottomMarginPx],
    ] as const) {
      assert.ok(
        Math.abs(marginPx - EXPECTED_PANEL_GUTTER_PX) <= 1.5,
        `${template.id} ${label} page margin must be ${EXPECTED_PANEL_GUTTER_PX}px`
      );
    }

    for (const left of rects) {
      for (const right of rects) {
        const horizontalGap = right.x - rectRight(left);
        if (
          horizontalGap > GEOMETRY_EPSILON &&
          rangesOverlap(left.y, rectBottom(left), right.y, rectBottom(right)) &&
          !hasHorizontalPanelBetween(left, right, rects)
        ) {
          assert.ok(gapIsExpected(horizontalGap, 'x'), `${template.id} horizontal gutter must be ${EXPECTED_PANEL_GUTTER_PX}px`);
        }

        const verticalGap = right.y - rectBottom(left);
        if (
          verticalGap > GEOMETRY_EPSILON &&
          rangesOverlap(left.x, rectRight(left), right.x, rectRight(right)) &&
          !hasVerticalPanelBetween(left, right, rects)
        ) {
          assert.ok(gapIsExpected(verticalGap, 'y'), `${template.id} vertical gutter must be ${EXPECTED_PANEL_GUTTER_PX}px`);
        }
      }
    }
  }
}

function testDynamicBubblePlacement(): void {
  const page: GraphicNovelPageScript = {
    pageNumber: 1,
    pageRole: 'conversation',
    panels: [
      {
        panelId: 'p1-1',
        beatType: 'conversation',
        visualAction: 'Two friends compare clues.',
        setting: 'Sunny garden',
        charactersPresent: ['Mira', 'Leo'],
        dialogue: [
          { speaker: 'Mira', text: 'This clue points to the blue gate.' },
          { speaker: 'Leo', text: 'Then we should check it together.' },
        ],
        thoughts: [{ speaker: 'Mira', text: 'I hope I am brave enough.' }],
        visual: visual('Two friends compare clues', ['Mira', 'Leo']),
        artPrompt: 'Two children in a sunny garden comparing a clue.',
      },
      {
        panelId: 'p1-2',
        beatType: 'reaction',
        visualAction: 'They smile and run forward.',
        setting: 'Sunny garden path',
        charactersPresent: ['Mira', 'Leo'],
        dialogue: [{ speaker: 'Leo', text: 'Race you there!' }],
        thoughts: [],
        visual: visual('They smile and run forward', ['Mira', 'Leo']),
        artPrompt: 'Two children running along a garden path.',
      },
    ],
  };

  const planned = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [page] });
  assert.equal(planned.length, 1);
  assert.ok(planned[0].panels.length >= 4);
  assert.equal(planned[0].panels[0].bubbles.length, 3);
  assert.equal(planned[0].panels[1].bubbles.length, 1);

  const firstPanel = planned[0].panels[0];
  const firstPanelRect = firstPanel.templatePanel.rect;
  const miraSpeechTarget = firstPanel.bubbles[0].tailTo!;
  const leoSpeechTarget = firstPanel.bubbles[1].tailTo!;
  assert.ok(Math.abs((miraSpeechTarget.x - firstPanelRect.x) / firstPanelRect.width - 0.28) < 0.02);
  assert.ok(Math.abs((leoSpeechTarget.x - firstPanelRect.x) / firstPanelRect.width - 0.72) < 0.02);
  assert.ok(firstPanel.bubbles[0].rect.x < firstPanel.bubbles[1].rect.x, 'speaker bubble side should follow speaker anchor');
  assert.ok(
    firstPanel.bubbles.some((bubble) => bubble.rect.y > firstPanelRect.y + firstPanelRect.height * 0.55),
    'multi-bubble panels should use lower/side negative space, not only the top band'
  );

  for (const panel of planned[0].panels) {
    for (const bubble of panel.bubbles) {
      const panelRect = panel.templatePanel.rect;
      assert.ok(bubble.rect.x >= panelRect.x);
      assert.ok(bubble.rect.y >= panelRect.y);
      assert.ok(bubble.rect.x + bubble.rect.width <= panelRect.x + panelRect.width + 0.001);
      assert.ok(bubble.rect.y + bubble.rect.height <= panelRect.y + panelRect.height + 0.001);
    }

    for (let i = 0; i < panel.bubbles.length; i += 1) {
      for (let j = i + 1; j < panel.bubbles.length; j += 1) {
        const first = panel.bubbles[i].rect;
        const second = panel.bubbles[j].rect;
        assert.ok(
          !rangesOverlap(first.x, rectRight(first), second.x, rectRight(second)) ||
            !rangesOverlap(first.y, rectBottom(first), second.y, rectBottom(second)),
          'bubble rectangles should not overlap each other'
        );
      }
    }
  }
}

function testBubbleStretchingKeepsText(): void {
  const line = 'I found the clue, but I need one brave friend to help me open the blue gate.';
  const planned = planGraphicNovelLayouts({
    ageGroup: '2-3',
    pages: [{
      pageNumber: 1,
      pageRole: 'conversation',
      panels: [
        {
          panelId: 'p1-1',
          beatType: 'conversation',
          visualAction: 'A child points at a sparkling clue.',
          setting: 'Garden path',
          charactersPresent: ['Mira'],
          dialogue: [{ speaker: 'Mira', text: line }],
          thoughts: [],
          visual: visual('Mira points at a sparkling clue', ['Mira']),
          artPrompt: 'A child pointing at a sparkling clue on a garden path.',
        },
        {
          panelId: 'p1-2',
          beatType: 'reaction',
          visualAction: 'The friend listens and smiles.',
          setting: 'Garden path',
          charactersPresent: ['Leo'],
          dialogue: [{ speaker: 'Leo', text: 'Short version?' }],
          thoughts: [],
          visual: visual('Leo listens and smiles', ['Leo']),
          artPrompt: 'A child smiling while listening on a garden path.',
        },
      ],
    }],
  });

  const firstBubble = planned[0].panels[0].bubbles[0];
  assert.equal(firstBubble.speaker, 'Mira');
  assert.equal(firstBubble.text, line);
  assert.equal(firstBubble.overflow, false);
  assert.ok(firstBubble.rect.width > 0.12, 'bubble should remain wide enough for longer text at the agreed frontend font size');
  assert.ok(firstBubble.rect.height > 0.04, 'bubble should add height for wrapped longer text at the agreed frontend line height');
  assert.equal('compressionApplied' in firstBubble, false);
  assert.equal('sourceText' in firstBubble, false);
}

function testOpeningForSixToEightUsesAtLeastFourPanels(): void {
  const planned = planGraphicNovelLayouts({
    ageGroup: '6-8',
    pages: [{
      pageNumber: 1,
      pageRole: 'opening',
      panels: [
        {
          panelId: 'p1-1',
          beatType: 'setup',
          visualAction: 'Friends enter a room.',
          setting: 'Old room',
          charactersPresent: ['Mira'],
          dialogue: [],
          thoughts: [],
          caption: 'A quiet room waits.',
          visual: visual('Friends enter a room', ['Mira']),
          artPrompt: 'A child entering an old room.',
        },
        {
          panelId: 'p1-2',
          beatType: 'conversation',
          visualAction: 'They spot a clue.',
          setting: 'Old room',
          charactersPresent: ['Mira', 'Leo'],
          dialogue: [
            { speaker: 'Mira', text: 'Look over there.' },
            { speaker: 'Leo', text: 'Something is glowing.' },
          ],
          thoughts: [],
          visual: visual('They spot a clue', ['Mira', 'Leo']),
          artPrompt: 'Two children spotting a clue.',
        },
        {
          panelId: 'p1-3',
          beatType: 'reaction',
          visualAction: 'The clue shines.',
          setting: 'Old room',
          charactersPresent: ['Mira'],
          dialogue: [],
          thoughts: [{ speaker: 'Mira', text: 'This feels important.' }],
          visual: visual('The clue shines', ['Mira']),
          artPrompt: 'A glowing clue.',
        },
      ],
    }],
  });

  assert.ok(planned[0].panels.length >= 4, '6-8 opening pages should be expanded to at least 4 panels');
  assert.equal(planned[0].panels.length, planned[0].template.panelCount);
  assert.equal(planned[0].template.panels.length, planned[0].panels.length);
}

function testTemplatePanelCountMustMatchScriptPanels(): void {
  const planned = planGraphicNovelLayouts({
    ageGroup: '6-8',
    pages: [{
      pageNumber: 8,
      pageRole: 'resolution',
      panels: [
        {
          panelId: 'p8-1',
          beatType: 'resolution',
          visualAction: 'Friends admire the bridge.',
          setting: 'Sunny bridge',
          charactersPresent: ['Mira', 'Leo'],
          dialogue: [
            { speaker: 'Mira', text: 'The bridge is shining.' },
            { speaker: 'Leo', text: 'It feels like a promise.' },
          ],
          thoughts: [],
          visual: visual('Friends admire the bridge', ['Mira', 'Leo']),
          artPrompt: 'Two friends admiring a shining bridge.',
        },
        {
          panelId: 'p8-2',
          beatType: 'reveal',
          visualAction: 'A friendly helper lifts a key.',
          setting: 'Sunny bridge',
          charactersPresent: ['Puff'],
          dialogue: [{ speaker: 'Puff', text: 'This key opens kind hearts.' }],
          thoughts: [],
          visual: visual('A friendly helper lifts a key', ['Puff']),
          artPrompt: 'A small magical helper lifting a golden key.',
        },
        {
          panelId: 'p8-3',
          beatType: 'resolution',
          visualAction: 'Everyone celebrates together.',
          setting: 'Sunny bridge',
          charactersPresent: ['Mira', 'Leo', 'Puff'],
          dialogue: [{ speaker: 'Mira', text: 'Together, we are ready for the next adventure.' }],
          thoughts: [],
          caption: 'Together to new adventures!',
          visual: visual('Everyone celebrates together', ['Mira', 'Leo', 'Puff']),
          artPrompt: 'Friends and neighbors celebrating together near the bridge.',
        },
      ],
    }],
  });

  assert.equal(planned[0].panels.length, 3);
  assert.equal(planned[0].template.panelCount, 3);
  assert.equal(planned[0].template.panels.length, 3);
  assert.equal(planned[0].template.id, 'T08');
}

function testPreservePanelCountKeepsExactSceneCount(): void {
  const page: GraphicNovelPageScript = {
    pageNumber: 2,
    pageRole: 'opening',
    panels: [
      {
        panelId: 'p2-1',
        beatType: 'setup',
        visualAction: 'A child notices a clue.',
        setting: 'Town square',
        charactersPresent: ['Mira'],
        dialogue: [{ speaker: 'Mira', text: 'This mark looks familiar.' }],
        thoughts: [],
        visual: visual('A child notices a clue', ['Mira']),
        artPrompt: 'A child noticing a clue in a town square.',
      },
      {
        panelId: 'p2-2',
        beatType: 'conversation',
        visualAction: 'A friend compares the map.',
        setting: 'Town square',
        charactersPresent: ['Leo'],
        dialogue: [{ speaker: 'Leo', text: 'The map points this way.' }],
        thoughts: [],
        visual: visual('A friend compares the map', ['Leo']),
        artPrompt: 'A friend comparing a map in a town square.',
      },
      {
        panelId: 'p2-3',
        beatType: 'reaction',
        visualAction: 'They look toward the path.',
        setting: 'Town square',
        charactersPresent: ['Mira', 'Leo'],
        dialogue: [{ speaker: 'Mira', text: 'Then we go together.' }],
        thoughts: [],
        visual: visual('They look toward the path', ['Mira', 'Leo']),
        artPrompt: 'Two friends looking toward a path.',
      },
    ],
  };

  const expanded = planGraphicNovelLayouts({ ageGroup: '6-8', pages: [page] });
  assert.equal(expanded[0].panels.length, 4, 'default 6-8 opening pages may expand to 4 panels');

  const preserved = planGraphicNovelLayouts({
    ageGroup: '6-8',
    pages: [page],
    preservePanelCount: true,
  });
  assert.equal(preserved[0].panels.length, 3);
  assert.equal(preserved[0].template.panelCount, 3);

  assert.throws(
    () => planGraphicNovelLayouts({
      ageGroup: '6-8',
      pages: [page],
      preservePanelCount: true,
      preferredTemplateId: 'T17',
    }),
    /T17 has 4 panels, but script has 3 panels/
  );
}

function testTemplateSelectionRandomizesEquivalentCandidates(): void {
  const page: GraphicNovelPageScript = {
    pageNumber: 3,
    pageRole: 'conversation',
    panels: [
      {
        panelId: 'p3-1',
        beatType: 'conversation',
        visualAction: 'Friends compare two clues.',
        setting: 'Garden path',
        charactersPresent: ['Mira', 'Leo'],
        dialogue: [{ speaker: 'Mira', text: 'This clue points left.' }],
        thoughts: [],
        visual: visual('Friends compare two clues', ['Mira', 'Leo']),
        artPrompt: 'Two friends comparing clues.',
      },
      {
        panelId: 'p3-2',
        beatType: 'response',
        visualAction: 'A friend answers with a grin.',
        setting: 'Garden path',
        charactersPresent: ['Leo'],
        dialogue: [{ speaker: 'Leo', text: 'Then I will check right.' }],
        thoughts: [],
        visual: visual('A friend answers with a grin', ['Leo']),
        artPrompt: 'A friend answering with a grin.',
      },
      {
        panelId: 'p3-3',
        beatType: 'reaction',
        visualAction: 'They notice a small sparkle.',
        setting: 'Garden path',
        charactersPresent: ['Mira'],
        dialogue: [{ speaker: 'Mira', text: 'Wait, it sparkles here.' }],
        thoughts: [],
        visual: visual('They notice a small sparkle', ['Mira']),
        artPrompt: 'A child noticing a sparkle.',
      },
      {
        panelId: 'p3-4',
        beatType: 'conversation',
        visualAction: 'They agree on the next step.',
        setting: 'Garden path',
        charactersPresent: ['Mira', 'Leo'],
        dialogue: [{ speaker: 'Leo', text: 'Good catch. Together?' }],
        thoughts: [],
        visual: visual('They agree on the next step', ['Mira', 'Leo']),
        artPrompt: 'Two friends agreeing on the next step.',
      },
    ],
  };

  const highRoll = planGraphicNovelLayouts({
    ageGroup: '4-5',
    pages: [page],
    randomSource: () => 0.99,
  })[0].template.id;
  const lowRoll = planGraphicNovelLayouts({
    ageGroup: '4-5',
    pages: [page],
    randomSource: () => 0,
  })[0].template.id;

  assert.ok(['T09', 'T11', 'T17'].includes(highRoll));
  assert.ok(['T09', 'T11', 'T17'].includes(lowRoll));
  assert.notEqual(highRoll, lowRoll, 'equivalent 4-panel candidates should be randomized');
}

function testEditPromptPreservationRules(): void {
  const planned = planGraphicNovelLayouts({
    ageGroup: '4-5',
    pages: [{
      pageNumber: 1,
      pageRole: 'opening',
      panels: [
        {
          panelId: 'p1-1',
          beatType: 'setup',
          visualAction: 'A child opens a small box.',
          setting: 'Bedroom',
          charactersPresent: ['Nika'],
          dialogue: [{ speaker: 'Nika', text: 'What is inside?' }],
          thoughts: [],
          visual: visual('Nika opens a small box', ['Nika']),
          artPrompt: 'A child opening a small box in a bedroom.',
        },
        {
          panelId: 'p1-2',
          beatType: 'response',
          visualAction: 'A soft glow appears.',
          setting: 'Bedroom',
          charactersPresent: ['Nika'],
          dialogue: [],
          thoughts: [{ speaker: 'Nika', text: 'It feels friendly.' }],
          visual: visual('A soft glow appears', ['Nika']),
          artPrompt: 'A friendly soft glow from a box.',
        },
      ],
    }],
  });

  const prompt = buildGraphicNovelPageEditInstructions(planned[0]);
  assert.doesNotMatch(prompt, /PAGE STRUCTURE/);
  assert.doesNotMatch(prompt, /Exactly 2 color-coded slots/);
  assert.match(prompt, /sky-blue slot:\n- Slot color: sky-blue\.\n- Slot position: x=/);
  assert.match(prompt, /- Slot size: width=/);
  assert.match(prompt, /peach slot:\n- Slot color: peach\.\n- Slot position: x=/);
  assert.doesNotMatch(prompt, /Black slot frames and gutters stay as the fixed page structure/);
  assert.doesNotMatch(prompt, /Each slot contains one single visual moment/);
  assert.doesNotMatch(prompt, /Environment id:/);
  assert.doesNotMatch(prompt, /ENVIRONMENT TO REUSE/);
  assert.doesNotMatch(prompt, /Character staging/);
  assert.doesNotMatch(prompt, /If Character staging mentions/);
  assert.doesNotMatch(prompt, /The only valid color-coded slots are/);
  assert.doesNotMatch(prompt, /\b(?:Do not|Never|do not|never)\b/);
  assert.doesNotMatch(prompt, /numbered/i);
  assert.doesNotMatch(prompt, /bubble/i);
  assert.doesNotMatch(prompt, /comic/i);
  assert.doesNotMatch(prompt, /graphic[- ]novel/i);
}

export async function runGraphicNovelLayoutTests(): Promise<void> {
  testTemplateLibrary();
  testAlternatingHalfStackTemplate();
  testT08UsesEqualHeightRows();
  testTemplateGutters();
  testDynamicBubblePlacement();
  testBubbleStretchingKeepsText();
  testOpeningForSixToEightUsesAtLeastFourPanels();
  testTemplatePanelCountMustMatchScriptPanels();
  testPreservePanelCountKeepsExactSceneCount();
  testTemplateSelectionRandomizesEquivalentCandidates();
  testEditPromptPreservationRules();
}

if (require.main === module) {
  runGraphicNovelLayoutTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
