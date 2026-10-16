import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

test('strict preference/theme integration tolerates missing, malformed and unavailable storage', () => {
  const source = (name: string) => readFileSync(resolve(__dirname, '../public/js/' + name + '.js'), 'utf8');
  for (const initial of [null, 'null', '{bad', '{"version":1,"value":false}', '{"version":1,"value":"dark"}']) {
    const storage = new Map<string, string>();
    if (initial !== null) storage.set('sf:preferences:v1:theme', initial);
    const attrs = new Map<string, string>();
    const browser: any = { matchMedia: () => ({ matches: false }) };
    const context = { window: browser, localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }, document: { documentElement: { dataset: {},
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => attrs.set(name, value),
    } } };
    runInNewContext(source('preferences'), context);
    runInNewContext(source('theme-init'), context);
    assert.equal(attrs.get('data-theme'), initial?.includes('"dark"') ? 'dark' : 'light');
    runInNewContext(source('theme'), context);
    browser.sfToggleTheme();
    assert.equal(browser.sfPreferences.read('theme'), attrs.get('data-theme'));
    assert.equal(browser.sfPreferences.write('theme', 'invalid'), false);
  }
  const attrs = new Map<string, string>();
  const notices: string[] = [];
  const browser: any = { matchMedia: () => ({ matches: true }), sfToast: (message: string) => notices.push(message) };
  const context = { window: browser, localStorage: {
    getItem() { throw new Error('Storage unavailable'); },
    setItem() { throw new Error('Storage unavailable'); },
  }, document: { documentElement: { dataset: {},
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => attrs.set(name, value),
  } } };
  runInNewContext(source('preferences'), context);
  runInNewContext(source('theme-init'), context);
  assert.equal(attrs.get('data-theme'), 'dark');
  runInNewContext(source('theme'), context);
  browser.sfToggleTheme();
  assert.equal(attrs.get('data-theme'), 'light');
  assert.equal(browser.sfPreferences.read('theme'), 'light');
  assert.equal(notices.length, 1);
});
