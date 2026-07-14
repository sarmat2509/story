import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/components/LibraryHeader.tsx'), 'utf8');

assert.match(
  source,
  /<ScrollView[\s\S]*?style=\{styles\.dropdownMenuScroll\}[\s\S]*?showsVerticalScrollIndicator/,
  'catalog dropdown options should scroll inside a bounded menu'
);
assert.match(
  source,
  /dropdownMenu:\s*\{[\s\S]*?maxHeight:\s*384,[\s\S]*?borderRadius:\s*theme\.borders\.radius\.xl,[\s\S]*?overflow:\s*'hidden'/,
  'catalog dropdown should have a rounded, clipped maximum-height shell'
);
assert.match(
  source,
  /dropdownItem:\s*\{[\s\S]*?minHeight:\s*48,[\s\S]*?marginHorizontal:\s*theme\.spacing\[2\],[\s\S]*?paddingVertical:\s*theme\.spacing\[3\],[\s\S]*?borderRadius:\s*theme\.borders\.radius\.full/,
  'catalog dropdown items should be inset, taller pills'
);
const dropdownItemStyle = source.match(
  /dropdownItem:\s*\{([\s\S]*?)\n\s*\},\n\s*dropdownItemHovered:/
)?.[1];
assert.ok(dropdownItemStyle, 'catalog dropdown item style should exist');
assert.doesNotMatch(
  dropdownItemStyle,
  /borderBottom/,
  'catalog dropdown items should not separate'
);

console.log('library dropdown style regression guards passed');
