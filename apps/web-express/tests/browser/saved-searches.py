"""Saved-search UI checks with local fixtures and real Chromium storage.
Start tests/support/workspace-preview.ts first. No hosted database writes.
"""
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:4317'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,theme in [(1280,'light'),(390,'light'),(390,'dark')]:
  context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block')
  page=context.new_page();page.on('dialog',lambda dialog:dialog.accept())
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.route('https://**/*',lambda route:route.abort())
  page.goto(BASE+'/feed?category=Learning&search=library',wait_until='domcontentloaded')
  page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
  page.locator('.saved-searches summary').click()
  expect(page.locator('#saved-search-add')).to_be_enabled()
  expect(page.locator('#saved-search-form')).to_be_hidden()
  expect(page.locator('.saved-search-empty')).to_be_visible()
  page.locator('#saved-search-add').click()
  expect(page.locator('#saved-search-name')).to_be_focused()
  page.locator('#saved-search-name').fill('Library improvements')
  page.locator('#saved-search-form button[type=submit]').click()
  expect(page.locator('.saved-search-name')).to_have_text('Library improvements')
  expect(page.locator('#saved-search-count')).to_have_text('1 / 10')
  expect(page.locator('#saved-search-add')).to_be_disabled()
  expect(page.locator('.saved-search-current-badge')).to_have_text('Current view')
  expect(page.locator('.saved-search-item .saved-search-chips')).to_contain_text('Learning')
  expect(page.locator('.saved-search-item .saved-search-chips')).to_contain_text('library')
  expect(page.locator('#saved-search-list input')).to_have_count(0)
  page.get_by_role('button',name='Rename Library improvements',exact=True).click()
  expect(page.locator('.saved-search-rename input')).to_be_focused()
  page.locator('.saved-search-rename input').fill('Discard this edit')
  page.keyboard.press('Escape')
  expect(page.locator('.saved-search-name')).to_have_text('Library improvements')
  expect(page.get_by_role('button',name='Rename Library improvements',exact=True)).to_be_focused()
  page.get_by_role('button',name='Rename Library improvements',exact=True).click()
  page.locator('.saved-search-rename input').fill('Campus library')
  page.get_by_role('button',name='Save name',exact=True).click()
  expect(page.locator('.saved-search-name')).to_have_text('Campus library')
  expect(page.get_by_role('button',name='Rename Campus library',exact=True)).to_be_focused()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Page overflows viewport'
  assert errors==[],errors
  page.locator('.saved-searches').screenshot(path=f'/tmp/suggfeed-saved-{width}-{theme}.png')
  page.get_by_role('button',name='Delete Campus library',exact=True).click()
  page.locator('#sf-confirm-dialog [data-confirm-accept]').click()
  expect(page.locator('#saved-search-count')).to_have_text('0 / 10')
  expect(page.locator('.saved-search-empty')).to_be_visible()
  expect(page.locator('#saved-search-add')).to_be_focused()
  context.close()
  print(f'PASS: {width}px {theme} cards, save/rename/cancel/delete, focus and overflow')
 context=browser.new_context(service_workers='block');page=context.new_page()
 page.route('https://**/*',lambda route:route.abort())
 rows=[];initial_error=[True];write_error=[False]
 def api(route):
  if route.request.method=='GET':
   if initial_error[0]:route.fulfill(status=503,json={'success':False,'error':'Temporarily unavailable'})
   else:route.fulfill(json={'success':True,'searches':rows})
  else:
   if write_error[0]:route.fulfill(status=503,json={'success':False,'error':'Unavailable'})
   else:
    row={'id':'10000000-0000-4000-8000-000000000099','name':route.request.post_data_json['name'],'filters':route.request.post_data_json['filters']}
    rows.append(row);route.fulfill(status=201,json={'success':True,'search':row})
 page.route('**/api/saved-searches**',api)
 def account_html(route):
  response=route.fetch()
  route.fulfill(response=response,body=response.text().replace('data-user=""','data-user="account-fixture"'))
 page.route('**/feed?category=Safety',account_html)
 page.goto(BASE+'/feed?category=Safety',wait_until='domcontentloaded')
 page.locator('.saved-searches summary').click()
 expect(page.locator('#saved-search-status')).to_contain_text('could not load')
 expect(page.locator('#saved-search-add')).to_be_disabled()
 expect(page.locator('#saved-search-retry')).to_be_visible()
 initial_error[0]=False
 page.locator('#saved-search-retry').click()
 expect(page.locator('#saved-search-add')).to_be_enabled()
 expect(page.locator('#saved-search-storage')).to_have_text('Saved to your account')
 page.locator('#saved-search-add').click()
 page.locator('#saved-search-name').fill('Safe campus')
 write_error[0]=True
 page.locator('#saved-search-form button[type=submit]').click()
 expect(page.locator('#saved-search-status')).to_contain_text('could not be confirmed')
 expect(page.locator('#saved-search-add')).to_be_disabled()
 assert rows==[]
 write_error[0]=False
 page.locator('#saved-search-retry').click()
 expect(page.locator('#saved-search-add')).to_be_enabled()
 page.locator('#saved-search-form button[type=submit]').click()
 expect(page.locator('.saved-search-name')).to_have_text('Safe campus')
 assert len(rows)==1
 print('PASS: account load failures and uncertain writes require reconciliation before retry')
 browser.close()
