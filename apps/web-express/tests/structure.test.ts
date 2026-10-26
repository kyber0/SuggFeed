import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

test('root commands and workspace configuration target the active Express app', () => {
  const pkg = json('package.json');
  assert.equal(pkg.scripts.dev, 'pnpm dev:express');
  assert.match(pkg.scripts['dev:express'], /--filter suggfeed-express dev$/);
  assert.match(pkg.scripts.build, /--filter suggfeed-express build$/);
  assert.match(pkg.scripts.test, /--filter suggfeed-express test$/);
  assert.equal(pkg.scripts['dev:next'],undefined);
  assert.equal(pkg.scripts['build:next'],undefined);
  assert.equal(existsSync(resolve(root,'apps/web')),false);
  assert.ok(pkg.workspaces.includes('apps/web-express'));
  for (const workspace of ['apps/web-express']) {
    assert.match(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8'), new RegExp(workspace));
  }
  assert.equal(pkg.workspaces.includes('apps/mobile'), false);
  assert.equal(json('apps/web-express/vercel.json').installCommand, 'npm ci --workspaces=false --include=dev');
  for (const path of ['.github/workflows/ci.yml', '.github/workflows/deploy.yml']) {
    assert.match(readFileSync(resolve(root, path), 'utf8'), /npm ci --workspaces=false --include=dev/);
  }
});

test('aggregate commands delegate to Express without a second build orchestrator', () => {
  const pkg=json('package.json');
  assert.equal(pkg.scripts['build:all'],'pnpm run build');
  assert.equal(pkg.scripts['test:all'],'pnpm run test');
  assert.match(pkg.scripts.typecheck,/--filter suggfeed-express typecheck$/);
  assert.equal(existsSync(resolve(root,'turbo.json')),false);
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
  for (const file of ['preferences.ts', 'theme-init.ts', 'theme.ts', 'toast.ts']) {
    assert.ok(config.include.includes('src/client/' + file));
  }
});

test('release and CI preserve verification gates and pinned deployment CLIs',()=>{
 for(const file of ['.github/workflows/ci.yml','.github/workflows/deploy.yml']){
  const workflow=readFileSync(resolve(root,file),'utf8');
  for(const script of ['lint:animations','lint:moderation','lint:assistant','lint:assignments','check:boundaries','check:postgres'])assert.ok(workflow.includes('npm run '+script),file+' omits '+script);
 }
 const deploy=readFileSync(resolve(root,'.github/workflows/deploy.yml'),'utf8');
 assert.match(deploy,/version: '2\.122\.0'/);assert.doesNotMatch(deploy,/version: latest/);
 assert.match(deploy,/npx --yes vercel@65\.2\.0 --prod/);
 const pkg=json('apps/web-express/package.json');assert.equal(pkg.scripts['check:postgres'],'node scripts/check-postgres.cjs');
});

test('supported lockfiles keep Supabase and Node type resolutions aligned',()=>{
 const lock=json('apps/web-express/package-lock.json');
 const pnpm=readFileSync(resolve(root,'pnpm-lock.yaml'),'utf8');
 for(const name of ['@supabase/supabase-js','@types/node']){
  const npmVersion=lock.packages['node_modules/'+name].version;
  const versions=Array.from(pnpm.matchAll(new RegExp("^  '"+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"@([^':(]+)",'gm')),match=>match[1]);
  assert.ok(versions.length>0,name+' must be present in pnpm');
  assert.deepEqual([...new Set(versions)],[npmVersion],name+' lock drift');
 }
});

test('changed cached client assets use the remediation revision',()=>{
 const templates=['layout','home','feed','school-customization','staff-board','staff-community','staff-comment-review','admin'];
 for(const template of templates){
  const text=readFileSync(resolve(root,'apps/web-express/views/'+template+'.eta'),'utf8');
  for(const match of text.matchAll(/\/js\/(school-colors|school-design|staff-progress|staff-tools|feed|school-studio-inspector)\.js\?v=([\w-]+)/g))assert.equal(match[2],'20261026-audit-remediation',template+':'+match[1]);
 }
});
