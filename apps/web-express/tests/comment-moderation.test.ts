import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasProfanity,commentVerdict} from '../src/lib/comment-moderation';
import {commentModerationConfig} from '../src/lib/comment-moderation-config';
for (const text of ['Please improve library seating.', 'Salamat po, magandang suggestion ito.', 'Scunthorpe class assistance and constitution', 'Nagbabago ang kalagayan ng paaralan.', 'tanglaw at pagkakaisa', '', '   '])
 test('clean: '+text,()=>assert.equal(hasProfanity(text),false));
for (const text of ['fuck you', 'shit happens', 'gago ka talaga', 'putang ina mo', 'tangina naman', 'b0b0 ka', 'p@kyu ka', 'gagoooo ka', 'f.u.c.k you', 'f!u!c!k you', 'g/a/g/o ka', 'p u t a n g i n a', 'b.o.b.o', 'ｇａｇｏ', 'ga\u200bgo'])
 test('detect: '+text,()=>assert.equal(hasProfanity(text),true));
test('mode and detector failure are safe',()=>{const original=commentModerationConfig.mode,log=console.error;const logged:unknown[]=[];console.error=(...args:unknown[])=>logged.push(args);try {commentModerationConfig.mode='flag';assert.equal(commentVerdict('gago'), 'flagged');commentModerationConfig.mode='reject';assert.equal(commentVerdict('gago'),'rejected');assert.equal(commentVerdict('hello',()=>{throw Error('test');}),'flagged');assert.throws(()=>hasProfanity('a'.repeat(10001)),RangeError);assert.deepEqual(logged,[['comment_moderation_unavailable']]);}finally{commentModerationConfig.mode=original;console.error=log;}});
