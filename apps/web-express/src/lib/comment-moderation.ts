import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, parseRawPattern } from 'obscenity';
import { filipinoCommentPatterns, commentWordGroups, commentDictionaryVersion } from './comment-moderation-words';
import { commentModerationConfig } from './comment-moderation-config';
let matcher: RegExpMatcher | undefined;
export function hasProfanity(text: string): boolean {
  if (!text.trim()) return false;
  if (text.length > 10_000) throw new RangeError('Moderation input exceeds limit');
  if (!matcher) {
    const dataset = new DataSet<{originalWord: string}>().addAll(englishDataset);
    for (const value of filipinoCommentPatterns) dataset.addPhrase(p => p.addPattern(parseRawPattern(value)));
    matcher = new RegExpMatcher({...dataset.build(), ...englishRecommendedTransformers});
  }
  const normalized = text.normalize('NFKC').replace(/\p{Cf}/gu, '');
  const unspelled = normalized.replace(/(?<=[\p{L}\p{N}])[^\p{L}\p{N}\s]+(?=[\p{L}\p{N}])/gu, '').replace(/\b(?:[a-z0-9][\s._*\-]+){2,}[a-z0-9]\b/gi, value => value.replace(/[\s._*\-]+/g, ''));
  return [normalized, unspelled, unspelled.replace(/(\p{L})\1{2,}/giu, '$1')].some(value => matcher!.hasMatch(value));
}
/** Detector failures are held for human review; never publish unchecked text. */
export function commentVerdict(text: string, detect = hasProfanity): 'published' | 'flagged' | 'rejected' {
  try { return detect(text) ? commentModerationConfig.mode === 'reject' ? 'rejected' : 'flagged' : 'published'; }
  catch { console.error('comment_moderation_unavailable'); return 'flagged'; }
}

export interface CommentAssessment {
  status: 'published'|'flagged'|'rejected';
  reason: 'clear'|'dictionary'|'detector_unavailable';
  rules: string[];
  detectorVersion: string;
}
let commentMatchers: Array<{id:string;matcher:RegExpMatcher}> | undefined;
export function assessComment(text: string): CommentAssessment {
  const detectorVersion='obscenity-0.4.6/'+commentDictionaryVersion;
  try {
    if(text.length>10_000)throw new RangeError('Moderation input exceeds limit');
    if(!commentMatchers){
      commentMatchers=[{id:'english',matcher:new RegExpMatcher({...new DataSet().addAll(englishDataset).build(),...englishRecommendedTransformers})},
        ...commentWordGroups.map(group=>{
          const dataset=new DataSet();for(const pattern of group.patterns)dataset.addPhrase(p=>p.addPattern(parseRawPattern(pattern)));
          return {id:group.id,matcher:new RegExpMatcher({...dataset.build(),...englishRecommendedTransformers})};
        })];
    }
    const normalized=text.normalize('NFKC').replace(/\p{Cf}/gu,'');
    // Collapse only letter-by-letter runs, never arbitrary adjacent words.
    const spelled=normalized.replace(/\b(?:[a-z0-9][\s._*\-!/]+){2,}[a-z0-9]\b/gi,value=>value.replace(/[\s._*\-!/]+/g,''));
    const variants=[normalized,spelled,spelled.replace(/(\p{L})\1{2,}/giu,'$1')];
    const rules=commentMatchers.filter(entry=>variants.some(value=>entry.matcher.hasMatch(value))).map(entry=>entry.id);
    return {status:rules.length?commentModerationConfig.mode==='reject'?'rejected':'flagged':'published',reason:rules.length?'dictionary':'clear',rules,detectorVersion};
  }catch{
    console.error('comment_moderation_unavailable');
    return {status:'flagged',reason:'detector_unavailable',rules:[],detectorVersion};
  }
}
