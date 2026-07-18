import assert from 'node:assert/strict';
import { IMAGE_STYLES } from '@wondertales/shared';
import { ART_STYLES } from '../image/styles';

for (const imageStyle of IMAGE_STYLES) {
  assert.ok(
    ART_STYLES[imageStyle],
    `Public image style "${imageStyle}" must have an API prompt definition`
  );
}

assert.match(
  ART_STYLES.retro_magical_shojo.imagePrefix.join(' '),
  /retro shojo anime fantasy/i,
  'the public magical shojo style must resolve to its intended prompt'
);

console.log('image style registry contract tests passed');
