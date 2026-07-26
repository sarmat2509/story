import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const recoveryScreenSource = readFileSync(
  resolve(process.cwd(), 'src/screens/auth/ChildModeRecoveryScreen.tsx'),
  'utf8'
);

const tokenParsingEffect = recoveryScreenSource.slice(
  recoveryScreenSource.indexOf('useEffect(() => {'),
  recoveryScreenSource.indexOf('const handleContinue')
);

assert.doesNotMatch(
  tokenParsingEffect,
  /recovery\.mutate\(/,
  'opening a recovery link must not consume its one-time token automatically'
);
assert.match(
  recoveryScreenSource,
  /const handleContinue = \(\) => \{[\s\S]*?recovery\.mutate\(token,/,
  'the recovery token must be consumed only by the explicit continue action'
);
assert.match(
  recoveryScreenSource,
  /onPress=\{handleContinue\}[\s\S]*?testID="child-mode-recovery-continue"/,
  'the recovery screen must expose a continue action for the recipient'
);

console.log('child mode recovery interaction contract passed');
