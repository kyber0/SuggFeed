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

test('hero and header contain no radial or linear gradients', () => {
  const pagesCss = fs.readFileSync(
    path.join(__dirname, '../public/css/modules/pages.css'),
    'utf8',
  );
  const compCss = fs.readFileSync(
    path.join(__dirname, '../public/css/modules/components.css'),
    'utf8',
  );
  assert.doesNotMatch(pagesCss, /\.sf-hero\s*\{[^}]*radial-gradient/);
  assert.doesNotMatch(compCss, /\.avatar-circle\s*\{[^}]*linear-gradient/);
  assert.doesNotMatch(
    compCss,
    /\.dropdown-user-header\s*\{[^}]*linear-gradient/,
  );
});
