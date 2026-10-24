import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkProfanity,submissionVerdict} from '../src/lib/content-moderation';
import {contentSafetyConfig} from '../src/lib/content-safety-config';
for(const value of ['', 'Thank you, salamat sa inyong tulong.', 'Scunthorpe classroom assistance', 'Nagbabago ang paaralan.'])test('clean submission '+value,()=>assert.equal(checkProfanity(value),false));
for(const value of ['fuck this idea', 'gago ka talaga', 'b0b0', 'gagoooo', 'p u t a n g i n a', 'f.u.c.k'])test('flag submission '+value,()=>assert.equal(checkProfanity(value),true));
test('submission mode is configurable and overlong detector input is held safely',()=>{const original=contentSafetyConfig.submissions.mode,log=console.error;console.error=()=>{};try{assert.equal(submissionVerdict('gago'),'flagged');contentSafetyConfig.submissions.mode='reject';assert.equal(submissionVerdict('gago'),'rejected');assert.equal(submissionVerdict('x'.repeat(10001)),'flagged');}finally{contentSafetyConfig.submissions.mode=original;console.error=log;}});

import {checkUrgent,categorize,assessSubmission} from '../src/lib/content-moderation';
for(const text of ['May binubully sa classroom.', 'Papatayin daw niya ako.', 'I want to die.', 'Hinipuan ako sa hallway.', 'A self-harm awareness campaign.'])test('urgent review signal '+text,()=>assert.equal(checkUrgent(text),true));
for(const text of ['', 'Please add shaded seating.', 'Salamat po sa bagong library.'])test('no urgent signal '+text,()=>assert.equal(checkUrgent(text),false));
test('urgent overrides reject, custom answers are scanned and category matches only active choices',()=>{
 const original=contentSafetyConfig.submissions.mode;try{contentSafetyConfig.submissions.mode='reject';assert.deepEqual(assessSubmission('A serious concern','fuck you, I will kill you'),{state:'flagged',urgent:true});assert.equal(assessSubmission('A school concern','A detailed constructive description.',{extra:'May baril siya.'}).urgent,true);}finally{contentSafetyConfig.submissions.mode=original;}
 assert.equal(categorize('Add more library seats',[{id:'a',name:'Facilities',slug:'facilities',active:true}]),'a');assert.equal(categorize('',[]),null);assert.equal(categorize('canteen food',[{id:'a',name:'Canteen',active:false},{id:'b',name:'Other',active:true}]),'b');assert.throws(()=>checkUrgent('x'.repeat(16001)));
});
