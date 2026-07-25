import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tourSource = readFileSync(
  resolve(process.cwd(), 'src/features/productTour/ProductTourProvider.tsx'),
  'utf8'
);
const rootNavigatorSource = readFileSync(resolve(process.cwd(), 'src/navigation/RootNavigator.tsx'), 'utf8');
const drawerSource = readFileSync(
  resolve(process.cwd(), 'src/navigation/CollapsibleDrawerContent.tsx'),
  'utf8'
);
const modeSelectionSource = readFileSync(
  resolve(process.cwd(), 'src/screens/onboarding/ModeSelectionScreen.tsx'),
  'utf8'
);

for (const id of [
  'dashboard',
  'library',
  'artisan',
  'wizard_basics',
  'wizard_details',
  'wizard_characters',
  'instant',
  'artifacts',
  'map',
  'profile',
  'child',
]) {
  assert.match(tourSource, new RegExp(`id: '${id}'`), `the ${id} tour step should remain available`);
}

for (const target of [
  'nav-drawer-Dashboard',
  'nav-drawer-Library',
  'nav-drawer-Wizard',
  'nav-drawer-Artifacts',
  'nav-drawer-MapTiles',
  'nav-drawer-Profile',
  'wizard-step-0',
  'wizard-step-1',
  'wizard-step-2',
  'profile-story-mode-instant',
  'mode-selection-child-name',
]) {
  assert.match(
    tourSource,
    new RegExp(`targetId: '${target}'`),
    `the tour should focus the ${target} tour control instead of a full-screen container`
  );
}

assert.match(
  tourSource,
  /const MS_PER_WORD = 300/,
  'tooltip timing should use a comfortable reading pace'
);
const readingTimeFunction = tourSource.match(
  /function getReadingTimeMs\(text: string\): number \{([\s\S]*?)\n\}/
);
assert.ok(readingTimeFunction, 'the tour must calculate reading time from tooltip content');
assert.doesNotMatch(
  readingTimeFunction[1],
  /Math\.max/,
  'reading time must not impose a fixed minimum duration'
);
assert.match(
  tourSource,
  /Platform\.OS !== 'web' \|\| !isDesktop/,
  'the automatic tour must remain desktop-web only'
);
assert.match(
  tourSource,
  /backgroundColor: 'rgba\(0, 0, 0, 0\.24\)'/,
  'the tour dimmer should remain visibly darker than the original 15% overlay'
);
assert.match(
  tourSource,
  /document\.getElementById\(step\.targetId\)/,
  'the tooltip must stay anchored to the active interface target'
);
assert.match(
  tourSource,
  /document\.querySelector<HTMLElement>\(`\[data-testid="\$\{step\.targetId\}"\]`\)/,
  'tour steps should be able to anchor to specific buttons and controls'
);
assert.match(
  tourSource,
  /isOutsideViewport\(rect, width, height\)/,
  'the tour should detect targets outside the current viewport'
);
assert.match(
  tourSource,
  /target\.scrollIntoView\(\{ behavior: 'smooth', block: 'center', inline: 'nearest' \}\)/,
  'the tour should scroll an off-screen target into view before measuring its tooltip'
);
assert.match(
  tourSource,
  /SCROLL_SETTLE_MS/,
  'the tour should wait for scrolling to settle before attaching the tooltip'
);
assert.match(
  tourSource,
  /const placeRight =[\s\S]*target\.x \+ target\.width \+ tooltipWidth/,
  'sidebar targets should position their tooltip alongside the navigation button'
);
assert.match(
  tourSource,
  /const placeAbove =[\s\S]*!placeRight && !hasRoomBelow/,
  'a tooltip near the bottom edge should be placed above its target'
);
assert.match(
  tourSource,
  /if \(!targetRect\) return;/,
  'the reading timer should begin only when the tooltip is attached to its navigation target'
);
assert.match(
  tourSource,
  /attempts < 120/,
  'the tour should keep waiting for the sidebar target instead of falling back to the centre'
);
assert.match(
  tourSource,
  /\{target \? \([\s\S]*testID="product-tour-tooltip"/,
  'the tooltip should remain hidden until its navigation target is available'
);
for (const control of ['overlay', 'tooltip', 'previous', 'next', 'skip']) {
  assert.match(
    tourSource,
    new RegExp(`testID="product-tour-${control}"`),
    `the ${control} control should remain accessible to UI automation`
  );
}
assert.match(
  tourSource,
  /updateMe\.mutateAsync\(\{ productTourCompleted: true \}\)/,
  'dismissing a first-run prompt or tour must persist its decision'
);
for (const promptControl of ['prompt', 'prompt-accept', 'prompt-decline']) {
  assert.match(
    tourSource,
    new RegExp(`testID="product-tour-${promptControl}"`),
    `the first-login prompt should expose the ${promptControl} control`
  );
}
assert.match(
  tourSource,
  /setIsPromptOpen\(true\)/,
  'a new account should be asked before the product tour begins'
);
assert.doesNotMatch(
  tourSource,
  /setTimeout\(start, NAVIGATION_SETTLE_MS\)/,
  'the tour should not start automatically on first login'
);
assert.match(
  tourSource,
  /navigationRef\.navigate\('ModeSelection'\)/,
  'the final step must navigate to child-profile onboarding'
);
assert.match(
  tourSource,
  /tourStep: step\.route\.wizardStep/,
  'the tour must reveal the matching wizard step before explaining it'
);
assert.match(
  rootNavigatorSource,
  /user\?\.productTourCompleted !== false/,
  'new accounts must see the tour before the existing onboarding flow'
);
assert.match(
  modeSelectionSource,
  /keepChildProfileVisible && \(isChildrenLoading \|\| !hasExistingChildProfile\)/,
  'the child-profile screen should stay open after the final tooltip only when no child profile exists'
);
assert.match(
  tourSource,
  /TOUR_STEPS\[stepIndex\]\?\.id === 'child'/,
  'closing the final child-profile step should preserve the child-profile screen'
);
assert.match(
  drawerSource,
  /testID="nav-drawer-product-tour"/,
  'the tour must be restartable from the sidebar'
);
assert.match(
  drawerSource,
  /width:\s*34,[\s\S]*height:\s*34,[\s\S]*borderRadius:\s*17/,
  'the sidebar restart button should remain compact and round'
);
assert.match(
  drawerSource,
  /productTourItem:\s*\{[\s\S]*alignSelf:\s*'center'/,
  'the sidebar restart button should remain centered'
);

console.log('product tour UI contract passed');
