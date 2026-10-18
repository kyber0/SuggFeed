"""Local browser regressions. Start tests/support/ui-audit-preview.ts first."""
import unittest
from playwright.sync_api import sync_playwright,expect
class UIAudit(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.p=sync_playwright().start();cls.browser=cls.p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.p.stop()
 def setUp(self):
  self.context=self.browser.new_context(service_workers='block',viewport={'width':390,'height':900});self.context.route('https://**/*',lambda r:r.abort());self.page=self.context.new_page()
 def tearDown(self):self.context.close()
 def visit(self,path,theme='light'):
  self.page.goto('http://127.0.0.1:4319'+path);self.page.evaluate('(t)=>{sfPreferences.write("theme",t);document.documentElement.dataset.theme=t}',theme);self.page.add_style_tag(content='*,*::before,*::after{transition:none!important;animation:none!important}')
 def contrast(self,selector):
  return self.page.locator(selector).first.evaluate('''e=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);const a=lum(rgb(getComputedStyle(e).color));let p=e,bg;while(p){bg=rgb(getComputedStyle(p).backgroundColor);if(bg.length===3 || bg[3]===1)break;p=p.parentElement;}const b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}''')
 def test_navigation_staff_links_remain_visible(self):
  for w in [320,390,768]:
   with self.subTest(width=w):
    self.page.set_viewport_size({'width':w,'height':900});self.visit('/admin')
    if not self.page.locator('.staff-navigation-disclosure').evaluate('(el)=>el.open'):self.page.locator('.staff-navigation-disclosure summary').click()
    for label in ['Review submissions','Manage work','Follow-ups','Analytics','Manage staff']:expect(self.page.locator('.staff-navigation-body').get_by_role('link',name=label,exact=False)).to_be_visible()
 def test_navigation_long_header_and_guest_name(self):
  self.page.set_viewport_size({'width':320,'height':900})
  for path in ['/profile?persona=long','/notifications','/inbox','/admin/analytics','/admin/staff']:
   with self.subTest(path=path):self.visit(path);self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),path)
  self.visit('/feed');expect(self.page.get_by_role('link',name='Choose a school',exact=True)).to_be_visible()
 def test_navigation_landscape_tablet(self):
  for width in [801,844,900,1024]:
   self.page.set_viewport_size({'width':width,'height':390})
   for path in ['/','/feed','/roadmap?view=timeline']:
    with self.subTest(width=width,path=path):self.visit(path);self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 def test_color_audited_foregrounds(self):
  cases=[('/','#header-signin-btn'),('/profile?persona=guest','.prof-save-btn'),('/profile?persona=guest','.prof-tab-count'),('/roadmap','.workspace-status[data-status="resolved"]'),('/privacy','.sf-legal-content a'),('/idea/00000000-0000-4000-8000-000000000002','.care-report'),('/roadmap','.roadmap-card-date--completed'),('/admin/staff','.staff-you-badge'),('/roadmap?view=timeline','.work-timeline-today > span'),('/idea/00000000-0000-4000-8000-000000000002','#jump-comment-count')]
  for t in ['light','dark']:
   for path,selector in cases:
    with self.subTest(theme=t,path=path,selector=selector):self.visit(path,t);self.assertGreaterEqual(self.contrast(selector),4.5)
 def test_color_staff_password_toggle(self):
  for theme in ['light','dark']:
   with self.subTest(theme=theme):self.visit('/staff-login',theme);self.assertGreaterEqual(self.contrast('#staff-password-toggle'),4.5)
 def test_touch_primary_controls(self):
  for path,selector in [('/roadmap','.roadmap-card-vote-btn'),('/admin/analytics','.analytics-pill'),('/admin/board','.staff-lane-pagination button')]:
   with self.subTest(path=path):
    self.visit(path)
    for h in self.page.locator(selector).evaluate_all('(els)=>els.filter(e=>e.checkVisibility()).map(e=>e.getBoundingClientRect().height)'):self.assertGreaterEqual(h,44,(path,selector))
 def test_modal_auth_above_editor_and_native_roadmap(self):
  self.visit('/feed');self.page.evaluate('openSubmitPanel()');self.page.evaluate('openAuthModal("signin")');self.page.locator('#signin-email').focus();self.page.keyboard.press('Tab');self.assertTrue(self.page.evaluate('document.querySelector("#auth-modal").contains(document.activeElement)'));self.page.keyboard.press('Escape');expect(self.page.locator('#auth-modal')).to_be_hidden();expect(self.page.locator('#submit-panel')).to_be_visible()
 def test_modal_auth_above_native_roadmap(self):
  self.visit('/roadmap');self.page.locator('[data-roadmap-open]').first.click();expect(self.page.locator('#roadmap-follow')).to_be_visible();self.page.locator('#roadmap-follow').click();expect(self.page.locator('#signin-email')).to_be_visible();self.assertTrue(self.page.locator('#signin-email').evaluate('(e)=>{const r=e.getBoundingClientRect();return document.querySelector("#auth-modal").contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'));self.page.keyboard.press('Escape');self.assertTrue(self.page.locator('#roadmap-dialog').evaluate('(e)=>e.open'))
 def test_modal_auth_rejections_recover_buttons(self):
  self.visit('/feed');self.page.evaluate('window._sb={auth:{signInWithPassword:async()=>{throw new Error("Connection interrupted")},signUp:async()=>{throw new Error("Connection interrupted")}}};openAuthModal("signin")')
  self.page.locator('#signin-email').fill('student@school.example');self.page.locator('#signin-password').fill('test-password');self.page.locator('#btn-signin').click();expect(self.page.locator('#btn-signin')).to_be_enabled();expect(self.page.locator('#auth-modal-feedback')).to_contain_text('Connection interrupted')
  self.page.locator('#tab-signup').click();self.page.locator('#signup-name').fill('Test Student');self.page.locator('#signup-email').fill('student@school.example');self.page.locator('#signup-password').fill('test-password');self.page.locator('#btn-signup').click();expect(self.page.locator('#btn-signup')).to_be_enabled();expect(self.page.locator('#auth-modal-feedback')).to_contain_text('Connection interrupted')
 def test_modal_nested_signup_confirmation_stays_visible(self):
  self.visit('/roadmap');self.page.locator('[data-roadmap-open]').first.click();self.page.locator('#roadmap-follow').click();self.page.evaluate('window._sb={auth:{signUp:async()=>({data:{session:null},error:null})}}');self.page.locator('#tab-signup').click();self.page.locator('#signup-name').fill('Test Student');self.page.locator('#signup-email').fill('student@school.example');self.page.locator('#signup-password').fill('test-password');self.page.locator('#btn-signup').click();expect(self.page.locator('#auth-modal-feedback')).to_contain_text('check your email');expect(self.page.locator('#auth-dialog')).to_be_visible()
 def test_modal_delayed_feedback_stays_with_origin(self):
  self.visit('/feed');self.page.evaluate('window._sb={auth:{signInWithPassword:()=>new Promise(resolve=>window.finishSignin=resolve),resetPasswordForEmail:()=>new Promise(resolve=>window.finishReset=resolve)}};openAuthModal("signin")');self.page.locator('#signin-email').fill('student@school.example');self.page.locator('#signin-password').fill('test-password');self.page.locator('#btn-signin').click();self.page.locator('#tab-signup').click();self.page.evaluate('window.finishSignin({data:{session:null},error:{message:"Invalid old sign-in"}})');expect(self.page.locator('#btn-signin')).to_be_enabled();expect(self.page.locator('#auth-modal-feedback')).to_be_hidden()
  self.page.locator('#tab-signin').click();self.page.locator('#btn-to-forgot').click();self.page.locator('#forgot-email').fill('student@school.example');self.page.locator('#btn-forgot-submit').click();self.page.locator('#btn-back-signin').click();self.page.locator('#tab-signup').click();self.page.evaluate('window.finishReset({error:null})');expect(self.page.locator('#btn-forgot-submit')).to_be_enabled();expect(self.page.locator('#panel-signup')).to_be_visible();expect(self.page.locator('#auth-modal-feedback')).to_be_hidden()
 def test_content_category_focus_and_legal_prose(self):
  self.visit('/feed');self.page.evaluate('openSubmitPanel()');self.page.locator('input[name="sip-category"]').first.focus();self.assertNotEqual(self.page.locator('.sip-cat-card').first.evaluate('(e)=>getComputedStyle(e).outlineStyle'),'none')
 def test_content_legal_prose(self):
  for path in ['/privacy','/terms']:self.visit(path);self.assertNotIn('{" "}',self.page.locator('main').inner_text())
if __name__=='__main__':unittest.main(verbosity=2)
