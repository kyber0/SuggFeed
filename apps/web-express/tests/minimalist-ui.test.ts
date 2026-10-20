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

test('idea and post cards have no spinning conic borders, spotlights, or colored outlines', () => {
  const pagesCss = fs.readFileSync(
    path.join(__dirname, '../public/css/modules/pages.css'),
    'utf8',
  );
  const feedCss = fs.readFileSync(
    path.join(__dirname, '../public/css/modules/feed.css'),
    'utf8',
  );
  assert.doesNotMatch(pagesCss, /conic-gradient/);
  assert.doesNotMatch(pagesCss, /sfBorderSpin/);
  assert.doesNotMatch(pagesCss, /sfCardShineSweep/);
  assert.doesNotMatch(pagesCss, /\.sf-card-tilt-wrap\s*\{[^}]*perspective/);
  assert.doesNotMatch(
    feedCss,
    /\.post-card:hover\s*\{[^}]*border-color:\s*#b8cbdc/,
  );
});

test('buttons and submit elements use flat solid backgrounds without gradients', () => {
  const submitCss = fs.readFileSync(
    path.join(__dirname, '../public/css/modules/submit.css'),
    'utf8',
  );
  const compCss = fs.readFileSync(
    path.join(__dirname, '../public/css/modules/components.css'),
    'utf8',
  );
  assert.doesNotMatch(submitCss, /linear-gradient/);
  assert.doesNotMatch(compCss, /\.btn-primary[^{]*\{[^}]*linear-gradient/);
});

test('compiled bundles contain no conic gradients or shiny card sweeps', () => {
  const base = fs.readFileSync(
    path.join(__dirname, '../public/css/base.bundle.css'),
    'utf8',
  );
  const enhancements = fs.readFileSync(
    path.join(__dirname, '../public/css/enhancements.bundle.css'),
    'utf8',
  );
  assert.doesNotMatch(enhancements, /conic-gradient/);
  assert.doesNotMatch(enhancements, /sfCardShineSweep/);
});
