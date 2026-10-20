import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
function load(...names:string[]){const sandbox:{SfMotion?:any;URL:typeof URL}={URL};vm.createContext(sandbox);for(const name of ['config',...names]){const file=path.join(__dirname,'../public/js/animations',name+'.js');if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);}return sandbox.SfMotion;}
test('animation stagger is bounded to five siblings',()=>{const motion=load('stagger');assert.deepEqual([0,1,2,3,4,5,100].map(i=>motion.staggerDelay(i)),[0,40,80,120,160,0,0]);});
test('page transitions reject authentication, downloads and cross-origin destinations',()=>{const motion=load('page-transition');assert.equal(typeof motion.transitionEligible,'function');for(const url of ['https://elsewhere.test/feed','https://suggfeed.test/auth/callback','https://suggfeed.test/account/security','https://suggfeed.test/api/export','https://suggfeed.test/s/demo/auth/recovery'])assert.equal(motion.transitionEligible(url,'https://suggfeed.test'),false,url);assert.equal(motion.transitionEligible('https://suggfeed.test/s/demo/feed','https://suggfeed.test'),true);});
test('every motion effect is registered once and finite timings stay bounded',()=>{const motion=load('smooth-scroll','stagger','reveal','split-text','page-transition','cursor','magnetic-button','marquee');assert.equal(motion.factories.length,7);assert(Object.isFrozen(motion.config));for(const key of ['interaction','page','reveal','word','headline','scroll'])assert(motion.config[key]>=200&&motion.config[key]<=800,key);});
