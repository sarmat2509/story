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

console.log('tablet dashboard hero regression guards passed');
