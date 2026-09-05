import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/screens/dashboard/DashboardScreen.tsx'),
  'utf8'
);

assert.match(
  dashboardSource,
  /const isStackedHero = width < theme\.breakpoints\.tablet/,
  'the dashboard hero should only stack below the 768px tablet breakpoint'
);
assert.match(
  dashboardSource,
  /testID="dashboard-top-row"[\s\S]*isStackedHero && styles\.topSectionCompact[\s\S]*isTabletHero && styles\.topSectionTablet/,
  'tablet layouts should keep the greeting and latest-story cards in the horizontal top row'
);
assert.match(
  dashboardSource,
  /featuredColumnTablet:\s*\{[\s\S]*flex:\s*1,[\s\S]*width:\s*'auto',[\s\S]*minWidth:\s*0/,
  'the latest-story card should flex to the available tablet width instead of staying 420px wide'
);
assert.match(
  dashboardSource,
  /styles\.featuredColumn,[\s\S]*isStackedHero && styles\.featuredColumnCompact,[\s\S]*isTabletHero && styles\.featuredColumnTablet/,
  'the latest-story card should take the full content width below the tablet breakpoint'
);
assert.match(
  dashboardSource,
  /featuredColumnCompact:\s*\{\s*width:\s*'100%'/,
  'the compact latest-story card should not keep the desktop 420px width'
);
assert.match(
  dashboardSource,
  /compact \? styles\.scheduleActionCompact : styles\.scheduleActionDefault/,
  'the scheduler CTA should use a compact layout below the tablet breakpoint'
);
assert.match(
  dashboardSource,
  /scheduleActionCompact:\s*\{\s*left:\s*theme\.spacing\[6\]/,
  'the compact scheduler CTA should align to the left edge'
);

console.log('tablet dashboard hero regression guards passed');
