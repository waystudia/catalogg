import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/shared/ExactScrollRestoration.tsx', 'utf8');

test('new app pages begin at the top while Back restores the saved position', () => {
  assert.match(source, /navigationType !== 'PUSH'/);
  assert.match(source, /window\.scrollTo\(\{ left: 0, top: 0, behavior: 'auto' \}\);/);
  assert.match(source, /window\.scrollTo\(\{\s*left: position\.x,\s*top: position\.y,\s*behavior: 'auto'/s);
  assert.match(source, /const onPopState/);
});
