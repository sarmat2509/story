import assert from 'node:assert/strict';
import {
  getPublicSeoLocaleOverrideFromPath,
  getPublicSeoLocaleOverrideFromSearch,
} from '../publicSeoLocale';

assert.equal(getPublicSeoLocaleOverrideFromPath('/'), 'en');
assert.equal(getPublicSeoLocaleOverrideFromPath('/pricing'), 'en');
assert.equal(getPublicSeoLocaleOverrideFromPath('/stories'), 'en');
assert.equal(getPublicSeoLocaleOverrideFromPath('/blog/adhd-story-attention'), 'en');
assert.equal(getPublicSeoLocaleOverrideFromPath('/support'), 'en');
assert.equal(getPublicSeoLocaleOverrideFromPath('/uk/'), 'uk');
assert.equal(getPublicSeoLocaleOverrideFromPath('/uk/pricing'), 'uk');
assert.equal(getPublicSeoLocaleOverrideFromPath('/ru/pricing'), 'ru');
assert.equal(getPublicSeoLocaleOverrideFromPath('/es/pricing'), 'es');
assert.equal(getPublicSeoLocaleOverrideFromPath('/de/blog/adhd-story-attention'), 'de');
assert.equal(getPublicSeoLocaleOverrideFromPath('/es/wizard'), null);
assert.equal(getPublicSeoLocaleOverrideFromPath('/wizard'), null);
assert.equal(getPublicSeoLocaleOverrideFromSearch('?locale=en'), 'en');
assert.equal(getPublicSeoLocaleOverrideFromSearch('locale=uk'), 'uk');
assert.equal(getPublicSeoLocaleOverrideFromSearch('?locale=ru'), 'ru');
assert.equal(getPublicSeoLocaleOverrideFromSearch('?locale=zz'), null);

console.log('publicSeoLocale tests passed');
