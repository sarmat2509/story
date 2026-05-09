import assert from 'node:assert/strict';
import { renderSupportHtml } from '../renderSupportHtml';

const html = renderSupportHtml();

assert.match(html, /<title>Support — WonderTales<\/title>/);
assert.match(html, /parent-managed family storytelling app/);
assert.match(html, /account setup, payments, image uploads, publication\/sharing/);
assert.match(html, /does not replace faces in existing photos or videos/);
assert.match(html, /optional references to generate safe, fictional, illustrated story characters/);

console.log('renderSupportHtml tests passed');
