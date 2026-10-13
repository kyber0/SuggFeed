"""Real Chromium interaction checks against the documented workspace fixture.
Start tests/support/workspace-preview.ts first. API routing below supplies local
fixtures only; HTTP/SQL tests cover production routes and database behavior.
Requires Python Playwright and Chromium; never calls hosted Supabase or email.
"""
import json
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(service_workers='block')
    page = context.new_page()
    page.on('dialog', lambda dialog: dialog.accept())
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    actor = ['a' * 64]
    records = {}
    sends = []
    lose_response = [True]
    page.route('https://**/*', lambda route: route.abort())
    def api(route):
        path = route.request.url.split('/api/', 1)[1]
        if path == 'submission-context':
            route.fulfill(json={'success': True, 'actor': actor[0], 'signedIn': False})
        elif path == 'submit':
            body = route.request.post_data_json
            sends.append(body)
            records.setdefault(body['requestId'], {'success': True, 'id': body['requestId'], 'tracking_code': 'CV-' + 'A' * 32})
            if lose_response[0]:
                lose_response[0] = False
                route.abort()
            else:
                route.fulfill(json=records[body['requestId']])
        elif path == 'submission-receipt':
            body = route.request.post_data_json
            route.fulfill(json={'success': True, 'found': body['requestId'] in records, **records.get(body['requestId'], {})})
        else:
            route.continue_()
    page.route('**/api/**', api)
    page.goto('http://127.0.0.1:4317/feed?category=Learning&search=library', wait_until='domcontentloaded')
    page.locator('.saved-searches summary').click()
    expect(page.locator('#saved-search-add')).to_be_enabled()
    page.locator('#saved-search-add').click()
    page.locator('#saved-search-form input').fill('Library ideas')
    page.locator('#saved-search-form button[type=submit]').click()
    expect(page.locator('#saved-search-list')).to_contain_text('Library ideas')
    href = page.locator('#saved-search-list a').get_attribute('href')
    assert 'category=Learning' in href and 'search=library' in href and 'page=' not in href
    page.reload(wait_until='domcontentloaded')
    page.locator('.saved-searches summary').click()
    expect(page.locator('#saved-search-list')).to_contain_text('Library ideas')
    expect(page.locator('#saved-search-list input')).to_have_count(0)
    expect(page.locator('#saved-search-count')).to_have_text('1 / 10')
    expect(page.locator('#saved-search-add')).to_be_disabled()
    page.locator('#saved-search-list button', has_text='Rename').click()
    page.locator('#saved-search-list input').fill('Library updates')
    page.locator('#saved-search-list button', has_text='Save name').click()
    expect(page.locator('#saved-search-list a')).to_have_text('Library updates')
    print('PASS: saved searches survive reload, rename and restore only applied public filters')
    page.evaluate('openSubmitPanel()')
    page.locator('.submission-recovery summary').click()
    page.locator('input[name="sip-category"][value="Facilities"]').check(force=True)
    page.locator('#sip-next-btn').click()
    page.locator('#sip-title').fill('Improve library seating')
    page.locator('#sip-description').fill('Add more seating near the library entrance for students.')
    page.locator('#sip-anon').check(force=True)
    page.locator('#sip-remember-draft').check()
    expect(page.locator('#sip-recovery-status')).to_contain_text('Draft saved')
    page.evaluate('closeSubmitPanel(); openSubmitPanel()')
    assert page.locator('#sip-title').input_value() == 'Improve library seating'
    print('PASS: closing and reopening the panel keeps the in-memory draft')
    page.reload(wait_until='domcontentloaded')
    page.evaluate('openSubmitPanel()')
    page.locator('.submission-recovery summary').click()
    expect(page.locator('#sip-restore-draft')).to_be_visible()
    page.locator('#sip-restore-draft').click()
    expect(page.locator('#sip-step-2')).to_be_visible()
    assert page.locator('#sip-title').input_value() == 'Improve library seating'
    page.locator('#step-btn-2').focus()
    page.keyboard.press('ArrowLeft')
    expect(page.locator('#step-btn-1')).to_have_attribute('aria-selected', 'true')
    page.keyboard.press('ArrowRight')
    expect(page.locator('#step-btn-2')).to_have_attribute('aria-selected', 'true')
    print('PASS: opted-in drafts restore after reload and submission tabs support keyboard navigation')
    page.locator('#sip-next-btn').click()
    page.locator('#sip-consent').check(force=True)
    context.set_offline(True)
    page.locator('#sip-queue-btn').click()
    expect(page.locator('#sip-recovery-status')).to_contain_text('Queued')
    page.locator('#sip-queue-btn').click()
    page.wait_for_timeout(100)
    queue = page.evaluate("window.sfSubmissionStorage.records().then(rows=>rows.filter(row=>row.kind==='operation'))")
    assert len(queue) == 1 and queue[0]['state'] == 'Waiting for connection'
    assert 'tracking_code' not in json.dumps(queue) and 'CV-' not in json.dumps(queue)
    context.set_offline(False)
    expect(page.locator('#sip-queue-list button').first).to_be_enabled()
    page.locator('#sip-queue-list button', has_text='Send now').click()
    expect(page.locator('#sip-queue-list')).to_contain_text('Needs attention')
    assert len(sends) == 1
    page.reload(wait_until='domcontentloaded')
    page.evaluate('openSubmitPanel()')
    page.locator('.submission-recovery summary').click()
    expect(page.locator('#sip-queue-list')).to_contain_text('Needs attention')
    actor[0] = 'b' * 64
    page.locator('#sip-queue-list button', has_text='Send now').click()
    expect(page.locator('#sip-recovery-status')).to_contain_text('Account changed')
    assert len(sends) == 1
    actor[0] = 'a' * 64
    page.locator('#sip-check-receipt').click()
    expect(page.locator('#sip-success')).to_be_visible()
    assert len(sends) == 1 and page.locator('#sip-success-code').inner_text() == 'CV-' + 'A' * 32
    assert page.evaluate("localStorage.getItem('sf_my_tracking_codes')") is None
    page.locator('#sip-save-code').click()
    assert 'CV-' in page.evaluate("localStorage.getItem('sf_my_tracking_codes')")
    page.locator('#sip-clear-codes').click()
    page.locator('#sf-confirm-dialog [data-confirm-accept]').click()
    assert page.evaluate("localStorage.getItem('sf_my_tracking_codes')") is None
    assert not page.evaluate("window.sfSubmissionStorage.records().then(rows=>rows.some(row=>row.kind==='operation'))")
    print('PASS: offline queue deduplicates clicks, survives lost response/reload, blocks account changes and recovers a receipt')
    print('PASS: anonymous tracking codes require explicit save and can be cleared')
    page.evaluate('''async () => {
      const now=Date.now();await window.sfSubmissionStorage.put({key:'draft',version:1,kind:'draft',createdAt:now,expiresAt:now+7*86400000,payload:{title:'Expired draft',description:'Text to be removed after expiry',category:'Other',isAnonymous:true}});
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('suggfeed-submissions',1);req.onsuccess=()=>resolve(req.result);req.onerror=reject;});
      await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),req=store.get('draft');req.onsuccess=()=>{const row=req.result;row.createdAt=now-8*86400000;row.expiresAt=now-86400000;store.put(row);};tx.oncomplete=resolve;tx.onerror=reject;});db.close();
      if((await window.sfSubmissionStorage.records()).some(row=>row.kind==='draft'))throw new Error('Expired draft retained');
    }''')
    print('PASS: expired drafts are purged and cannot be restored')
    context.close()
    blocked = browser.new_context(service_workers='block')
    blocked.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}})")
    tab = blocked.new_page()
    tab.route('https://**/*', lambda route: route.abort())
    tab.goto('http://127.0.0.1:4317/feed', wait_until='domcontentloaded')
    tab.evaluate('sfToggleTheme()')
    assert tab.locator('html').get_attribute('data-theme') == 'dark'
    print('PASS: blocked local storage does not break theme/navigation')
    tab.goto('http://127.0.0.1:4317/roadmap?view=tree', wait_until='domcontentloaded')
    tab.locator('.roadmap-other-views summary').click()
    tab.locator('[data-roadmap-view="tree"]').click()
    assert 'view=tree' in tab.url
    expect(tab.locator('.roadmap-other-views')).to_be_visible()
    print('PASS: roadmap remains navigable when preference storage is blocked')
    blocked.close()
    unavailable = browser.new_context(service_workers='block')
    unavailable.add_init_script("Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Blocked','SecurityError')}})")
    missing = unavailable.new_page()
    missing.route('https://**/*', lambda route: route.abort())
    missing.goto('http://127.0.0.1:4317/feed', wait_until='domcontentloaded')
    missing.evaluate('openSubmitPanel()')
    missing.locator('.submission-recovery summary').click()
    expect(missing.locator('#sip-recovery-status')).to_contain_text('Browser storage is unavailable')
    missing.locator('input[name="sip-category"][value="Facilities"]').check(force=True)
    missing.locator('#sip-next-btn').click()
    missing.locator('#sip-title').fill('Still editable without storage')
    missing.locator('#sip-remember-draft').check()
    expect(missing.locator('#sip-recovery-status')).to_contain_text('Browser storage is unavailable')
    assert missing.locator('#sip-title').input_value() == 'Still editable without storage'
    print('PASS: unavailable IndexedDB reports failure while preserving editable text')
    unavailable.close()
    assert errors == [], errors
    browser.close()
