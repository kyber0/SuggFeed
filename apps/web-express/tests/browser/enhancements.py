"""Local fixtures only. Run workspace-preview.ts first; never contacts production."""
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(service_workers='block')
    context.route('https://**/*',lambda route:route.abort())
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    base='http://127.0.0.1:4317'
    # Late comments must not modify the next idea.
    page.goto(base+'/feed')
    ids=page.locator('[data-idea-id]').evaluate_all('(nodes)=>[...new Set(nodes.map(n=>n.dataset.ideaId))]')
    assert len(ids)>1
    pending=[]
    page.route('**/api/comments/*',lambda route:pending.append(route))
    page.evaluate('(id)=>sfOpenIdeaDetail(id,"comments")',ids[0])
    expect(page.locator('#drawer-columns')).to_be_visible()
    page.locator('#drawer-comment-input').fill('Delayed comment for the original idea only.')
    page.locator('#drawer-comment-submit-btn').click()
    page.wait_for_function('document.querySelector("#drawer-comment-submit-btn").disabled')
    page.evaluate('(id)=>sfOpenIdeaDetail(id,"comments")',ids[1])
    expect(page.locator('#drawer-columns')).to_be_visible()
    assert pending
    pending[0].fulfill(json={'success':True,'data':{'id':'late','body':'Delayed comment for the original idea only.','created_at':'2026-10-14T00:00:00Z','display_name':'You'}})
    page.wait_for_timeout(100)
    expect(page.locator('#drawer-comments-list')).not_to_contain_text('Delayed comment for the original idea only.')
    # Keyboard navigation remains within the modal and restores background usability.
    assert page.locator('#page-content').evaluate('(el)=>el.inert')
    page.locator('#idea-detail-drawer').focus()
    for _ in range(45):
        page.keyboard.press('Tab')
        assert page.evaluate('document.querySelector("#idea-detail-drawer").contains(document.activeElement)')
    page.keyboard.press('Escape')
    expect(page.locator('#idea-detail-drawer')).to_be_hidden()
    assert not page.locator('#page-content').evaluate('(el)=>el.inert')
    # Sending one private reply retains another typed draft.
    page.route('**/api/community/inbox',lambda route:route.fulfill(json={'success':True,'requests':[{'id':'one','title':'First','prompt':'First question'},{'id':'two','title':'Second','prompt':'Second question'}]}))
    page.route('**/api/community/reply',lambda route:route.fulfill(json={'success':True}))
    page.goto(base+'/inbox')
    fields=page.locator('#private-messages textarea')
    expect(fields).to_have_count(2)
    fields.nth(0).fill('First reply ready to send.')
    fields.nth(1).fill('Second reply still being drafted.')
    page.locator('#private-messages form').first.locator('button').click()
    expect(page.locator('#private-messages textarea')).to_have_count(1)
    expect(page.locator('#private-messages textarea')).to_have_value('Second reply still being drafted.')
    # Profile loads no hidden activity. Selecting a tab requests one page.
    calls=[]
    def activity(route):
        body=route.request.post_data_json;calls.append(body)
        offset=body.get('offset',0)
        route.fulfill(json={'success':True,'rows':[{'id':str(offset),'title':'Saved page '+str(offset),'status':'approved','vote_count':2,'categories':{'name':'Learning'}}],'next':{'offset':25,'local':False} if offset==0 else None})
    page.route('**/profile/activity',activity)
    page.goto(base+'/profile')
    expect(page.locator('#tab-btn-bookmarks')).to_be_visible()
    assert not calls
    page.locator('#tab-btn-bookmarks').click()
    expect(page.locator('#prof-pane-bookmarks')).to_contain_text('Saved page 0')
    page.get_by_role('button',name='Load more activity').click()
    expect(page.locator('#prof-pane-bookmarks')).to_contain_text('Saved page 25')
    assert [c['offset'] for c in calls]==[0,25]
    page.locator('#profile-text-size').select_option('comfortable')
    page.reload()
    expect(page.locator('html')).to_have_attribute('data-text-size','comfortable')
    # Representative layouts: no document-wide horizontal overflow; page styles load.
    for width in [390,1280]:
        page.set_viewport_size({'width':width,'height':850})
        for path in ['/profile','/feed','/roadmap','/notifications','/inbox','/admin/board']:
            page.goto(base+path)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,path)
    assert not errors,errors
    browser.close()
    print('Passed: comment race, focus containment, private draft preservation, lazy profile pagination, text preference, 12 responsive screens.')
