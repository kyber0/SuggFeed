import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import ts from 'typescript';
const root = resolve(__dirname, '../../..');

test('worker compiler emits the classic-script logo cache change, rather than silently skipping a module', () => {
  const folder = resolve(root, 'apps/web-express');
  const config = ts.readConfigFile(resolve(folder, 'tsconfig.sw.json'), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, folder);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  assert.equal(ts.getPreEmitDiagnostics(program).length, 0);
  const outputs: string[] = [];
  const result = program.emit(undefined, (_file, content) => outputs.push(content));
  assert.equal(result.emitSkipped, false);
  assert.equal(outputs.length, 1);
  assert.match(outputs[0], /cv-v16-sugi-help/);
  assert.match(outputs[0], /\/branding\/sf-monogram\.png/);
  assert.doesNotMatch(outputs[0], /^\s*(?:export\s*\{|Object\.defineProperty\(exports)/m);
});

test('both apps share the supplied transparent monogram and correctly sized installation icons', async () => {
  const roots = ['apps/web-express/public', 'apps/web/public'];
  for (const publicRoot of roots) {
    const manifest = JSON.parse(readFileSync(resolve(root, publicRoot, 'manifest.json'), 'utf8'));
    for (const icon of manifest.icons) {
      const asset = resolve(root, publicRoot, icon.src.slice(1));
      const meta = await sharp(asset).metadata();
      assert.equal(`${meta.width}x${meta.height}`, icon.sizes);
      assert.equal(meta.format, 'png');
      assert.match(icon.src, /^\/branding\//);
      if (icon.purpose === 'maskable') assert.equal((await sharp(asset).stats()).isOpaque, true);
    }
    const logo = await sharp(resolve(root, publicRoot, 'branding/sf-monogram.png')).metadata();
    assert.equal(logo.width, 240); assert.equal(logo.height, 160); assert.equal(logo.hasAlpha, true);
    for (const size of [16, 32, 48, 180]) {
      const meta = await sharp(resolve(root, publicRoot, `branding/icon-${size}.png`)).metadata();
      assert.equal(meta.width, size); assert.equal(meta.height, size);
    }
    const ico = readFileSync(resolve(root, publicRoot, 'branding/favicon.ico'));
    assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  }
  assert.deepEqual(readFileSync(resolve(root, roots[0], 'branding/sf-monogram.png')), readFileSync(resolve(root, roots[1], 'branding/sf-monogram.png')));
});

test('navigation stays text-only while staff, auth, offline and email branding retain the supplied asset', () => {
  for (const file of ['views/partials/staff-sidebar.eta', 'views/partials/auth-modal.eta', 'views/staff-login.eta', 'public/offline.html']) {
    assert.match(readFileSync(resolve(root, 'apps/web-express', file), 'utf8'), /\/branding\/sf-monogram\.png/);
  }
  const header = readFileSync(resolve(root, 'apps/web-express/views/partials/header.eta'), 'utf8');
  assert.match(header, /aria-label="SuggFeed home"/);
  assert.match(header, /Sugg<span>Feed<\/span>/);
  const brand = header.match(/<a class="brand"[\s\S]*?<\/a>/)?.[0];
  assert.ok(brand);
  assert.doesNotMatch(brand, /<img|sf-brand-logo/);
  for (const file of ['header.tsx', 'admin-dashboard.tsx']) {
    const source = readFileSync(resolve(root, 'apps/web/components', file), 'utf8');
    assert.doesNotMatch(source, /BrandLogo|sf-brand-logo/);
    assert.match(source, /Sugg<span>Feed<\/span>/);
  }
  for (const template of ['confirmation', 'email_change', 'invite', 'magic_link', 'recovery']) {
    const html = readFileSync(resolve(root, 'supabase/templates/' + template + '.html'), 'utf8');
    assert.match(html, /\{\{ \.SiteURL \}\}\/branding\/sf-monogram\.png/);
    assert.match(html, /SuggFeed/);
  }
});
