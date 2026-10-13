import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

test('root commands choose Express explicitly and preserve independent Next commands', () => {
  const pkg = json('package.json');
  assert.equal(pkg.scripts.dev, 'pnpm dev:express');
  assert.match(pkg.scripts['dev:express'], /--filter suggfeed-express dev$/);
  assert.match(pkg.scripts.build, /--filter=suggfeed-express$/);
  assert.match(pkg.scripts.test, /--filter suggfeed-express test$/);
  assert.match(pkg.scripts['dev:next'], /--filter web dev$/);
  assert.match(pkg.scripts['build:next'], /--filter=web$/);
  assert.ok(pkg.workspaces.includes('apps/web-express'));
  for (const workspace of ['apps/web', 'apps/web-express']) {
    assert.match(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8'), new RegExp(workspace));
  }
  assert.equal(pkg.workspaces.includes('apps/mobile'), false);
  assert.equal(json('apps/web-express/vercel.json').installCommand, 'npm ci --workspaces=false --include=dev');
  for (const path of ['.github/workflows/ci.yml', '.github/workflows/deploy.yml']) {
    assert.match(readFileSync(resolve(root, path), 'utf8'), /npm ci --workspaces=false --include=dev/);
  }
});

test('Turbo models both artifact sets and cannot reuse stale production verification', () => {
  const tasks = json('turbo.json').tasks;
  assert.deepEqual(tasks['suggfeed-express#build'].outputs, ['dist/**', 'public/js/**', 'public/sw.js']);
  assert.ok(tasks.build.outputs.includes('.next/**'));
  for (const name of ['build', 'suggfeed-express#build', 'test', 'typecheck']) {
    assert.equal(tasks[name].cache, false);
  }
});

test('strict browser cohort stays enforced by development, build and typecheck', () => {
  const pkg = json('apps/web-express/package.json');
  const config = json('apps/web-express/tsconfig.client.strict.json');
  assert.equal(config.compilerOptions.noImplicitAny, true);
  assert.equal(config.compilerOptions.strictNullChecks, true);
  assert.equal(config.compilerOptions.useUnknownInCatchVariables, true);
  assert.match(pkg.scripts['build:client'], /typecheck:client:strict/);
  assert.match(pkg.scripts.typecheck, /typecheck:client:strict/);
  assert.match(pkg.scripts.predev, /build:client/);
  for (const file of ['theme-init.ts', 'theme.ts', 'toast.ts']) {
    assert.ok(config.include.includes('src/client/' + file));
  }
});
