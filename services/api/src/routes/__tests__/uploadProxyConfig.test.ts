import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(process.cwd(), '../..');
const devNginx = readFileSync(
  resolve(repositoryRoot, 'nginx/conf.d.dev/wondertales.conf'),
  'utf8'
);
const uploadRoute = readFileSync(resolve(process.cwd(), 'src/routes/upload.ts'), 'utf8');

assert.match(
  devNginx,
  /client_max_body_size\s+10m\s*;/,
  'the dev proxy must allow the same 10 MB uploads as the API'
);
assert.match(
  uploadRoute,
  /fileSize:\s*10\s*\*\s*1024\s*\*\s*1024/,
  'the API upload route must retain its 10 MB validation limit'
);

console.log('upload proxy limit contract passed');
