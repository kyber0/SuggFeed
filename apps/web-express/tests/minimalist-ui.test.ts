import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('design tokens enforce neutral card borders and semantic tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/css/modules/tokens.css'), 'utf8');
  assert.match(css, /--line:/);
  assert.match(css, /--surface-card:/);
  // Gradient tokens must be intentionally named
  assert.match(css, /--grad-primary:/);
  assert.match(css, /--grad-hero:/);
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

test('buttons use gradient tokens not raw conic or decorative multi-stop gradients', () => {
  const submitCss = fs.readFileSync(
    path.join(__dirname, '../public/css/modules/submit.css'),
    'utf8',
  );
  const compCss = fs.readFileSync(
    path.join(__dirname, '../public/css/modules/components.css'),
    'utf8',
  );
  // submit.css must not use raw linear-gradient
  assert.doesNotMatch(submitCss, /linear-gradient/);
  // btn-primary must not use conic or decorative gradients
  assert.doesNotMatch(compCss, /\.btn-primary[^{]*\{[^}]*conic-gradient/);
  // Intentional gradient token must be referenced
  assert.match(compCss, /var\(--grad-primary\)/);
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
