import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/StoryReflectionSection.tsx'),
  'utf8'
);

assert.match(
  source,
  /const \[quizRequestedStoryId, setQuizRequestedStoryId\] = useState<string \| null>\(null\)/,
  'story quiz requests should start behind an explicit per-story interaction gate'
);
assert.match(
  source,
  /useStoryQuiz\(storyId, enabled && quizRequestedStoryId === storyId\)/,
  'the quiz cache check should stay disabled until the current story was explicitly requested'
);
assert.match(
  source,
  /const handleGenerateQuiz = \(\) => \{[\s\S]*?generateQuiz\.mutate\([\s\S]*?\{ storyId \},[\s\S]*?onSettled: \(\) => setQuizRequestedStoryId\(storyId\)/,
  'the quiz query gate should open only after the user-triggered generation request settles'
);
assert.match(
  source,
  /onPress=\{handleGenerateQuiz\}/,
  'Prepare activities should be the action that starts quiz generation'
);

console.log('story quiz explicit request regression guards passed');
