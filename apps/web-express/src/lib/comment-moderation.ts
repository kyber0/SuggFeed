import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, parseRawPattern } from 'obscenity';
import { filipinoCommentPatterns } from './comment-moderation-words';
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
