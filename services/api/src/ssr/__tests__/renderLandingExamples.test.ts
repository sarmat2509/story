import assert from 'node:assert/strict';
import { renderLandingHtml } from '../renderLandingHtml';

const emptyEnHtml = renderLandingHtml({ locale: 'en', exampleStories: [] });

assert.doesNotMatch(emptyEnHtml, /Examples of magical stories/);
assert.doesNotMatch(emptyEnHtml, /No stories in this language yet/);
assert.match(emptyEnHtml, /Built for children\. Valuable for parents\./);

const enWithStoryHtml = renderLandingHtml({
  locale: 'en',
  exampleStories: [
    {
      age: '6-8',
      title: 'The Moonlit Garden',
      time: '4 min',
      slug: 'the-moonlit-garden',
      thumbnailUrl: null,
    },
  ],
});

assert.match(enWithStoryHtml, /Examples of magical stories/);
assert.match(enWithStoryHtml, /The Moonlit Garden/);
assert.match(enWithStoryHtml, /href="https:\/\/app\.wondertales\.com\/stories\/the-moonlit-garden"/);
assert.match(enWithStoryHtml, /href="https:\/\/app\.wondertales\.com\/en\/stories" class="cta-purple"/);

const emptyUkHtml = renderLandingHtml({ locale: 'uk', exampleStories: [] });

assert.match(emptyUkHtml, /Історій цією мовою поки що немає/);
assert.match(emptyUkHtml, /href="https:\/\/app\.wondertales\.com\/wizard" class="cta-purple"/);

console.log('renderLandingExamples tests passed');
