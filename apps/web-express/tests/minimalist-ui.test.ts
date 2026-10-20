import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('design tokens enforce neutral card borders and flat shadow tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/css/modules/tokens.css'), 'utf8');
  assert.doesNotMatch(css, /linear-gradient/);
  assert.match(css, /--line:/);
  assert.match(css, /--surface-card:/);
});
