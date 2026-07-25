import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaSource = readFileSync(resolve(process.cwd(), 'src/db/schema.ts'), 'utf8');
const routeSource = readFileSync(resolve(process.cwd(), 'src/routes/user.ts'), 'utf8');
const serviceSource = readFileSync(resolve(process.cwd(), 'src/services/userService.ts'), 'utf8');
const migrationSource = readFileSync(resolve(process.cwd(), 'drizzle/0143_add_product_tour_completed.sql'), 'utf8');

assert.match(
  schemaSource,
  /productTourCompleted:\s*boolean\('product_tour_completed'\)\.notNull\(\)\.default\(false\)/,
  'a newly created account must be eligible for the product tour'
);
assert.match(
  routeSource,
  /productTourCompleted:\s*z\.boolean\(\)\.optional\(\)/,
  'the current-user API must accept a tour-completion update'
);
assert.match(
  routeSource,
  /updateUser\(req\.user!\.id,\s*\{[\s\S]*productTourCompleted,/,
  'the current-user API must persist the accepted tour-completion update'
);
assert.match(
  serviceSource,
  /productTourCompleted\?:\s*boolean/,
  'the user service update contract must retain the product-tour field'
);
assert.match(
  migrationSource,
  /ADD COLUMN IF NOT EXISTS product_tour_completed boolean NOT NULL DEFAULT false/,
  'the database migration must add the persisted tour-completion flag safely'
);

console.log('product tour persistence contract passed');
