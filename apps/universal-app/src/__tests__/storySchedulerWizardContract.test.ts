import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const wizard = readFileSync(resolve(process.cwd(), 'src/screens/wizard/WizardScreen.tsx'), 'utf8');
const dashboard = readFileSync(resolve(process.cwd(), 'src/screens/dashboard/DashboardScreen.tsx'), 'utf8');
const scheduleApi = readFileSync(resolve(process.cwd(), 'src/api/storySchedule.ts'), 'utf8');
const navigator = readFileSync(resolve(process.cwd(), 'src/navigation/MainNavigator.tsx'), 'utf8');

assert.match(wizard, /isSchedulerMode/, 'the existing wizard owns scheduler mode');
assert.match(wizard, /route\.params\?\.scheduler === true/, 'scheduler mode is opt-in');
assert.match(
  wizard,
  /activeStep === 0[\s\S]*?AdvancedSettingsForm[\s\S]*?childProfileIds=\{isSchedulerMode \? scheduleProfileIds : undefined\}/,
  'child-profile selection is rendered on the first shared wizard step'
);
assert.match(wizard, /__free__/, 'scheduler defaults preserve the free theme/moral options');
assert.match(wizard, /runAtTime/, 'scheduler exposes the local target time control');
assert.match(wizard, /hourCycle:\s*['"]h23['"]|is24Hour/i, 'the time picker is constrained to 24-hour time');
assert.match(dashboard, /dashboard-story-schedule-card/, 'dashboard includes the dedicated scheduler discovery card');
assert.match(dashboard, /onPress=\{onPress\}/, 'only the scheduler CTA owns navigation');
assert.match(scheduleApi, /\/api\/v1\/me\/story-schedule/, 'app API hooks use the shared scheduler endpoint');
assert.match(navigator, /route\.params\?\.scheduler[\s\S]*?<WizardScreen schedulerMode\s*\/>/, 'scheduler navigation renders the same wizard in scheduler mode');

console.log('story scheduler wizard contract passed');
