/** Obscenity patterns: | asserts word boundaries. Keep short terms bounded.
 * Ambiguous everyday words such as hayop and leche are intentionally excluded.
 */
export const filipinoCommentPatterns = [
  '|puta|', '|putangina|', '|tangina|', '|putang[ ]ina|',
  '|gago|', '|gaga|', '|gagong|', '|bobo|', '|boba|', '|bobong|', '|tanga|', '|tangang|', '|engot|', '|ungas|', '|hinayupak|', '|ulol|', '|pakyu|',
  '|punyeta|', '|p[un]yeta|', '|tarantado|', '|tarantada|', '|putragis|',
  '|bwisit|', '|buwisit|', '|lintik|', '|inutil|', '|kantot|', '|burat|', '|tite|', '|pekpek|',
];

/** Comment-specific rules are reviewed independently of the legacy submission filter. */
export const commentDictionaryVersion = '2026-10-25.1';
export const commentWordGroups = [
  {id:'filipino-explicit', patterns:[
    '|puta|','|putangina|','|tangina|','|putang[ ]ina|','|pakyu|','|pak[ ]yu|',
    '|punyeta|','|p[un]yeta|','|tarantado|','|tarantada|','|putragis|',
    '|kantot|','|burat|','|tite|','|pekpek|','|hinayupak|',
  ]},
  {id:'filipino-insult', patterns:[
    '|gago|','|gagong|','|bobong|','|tanga|','|tangang|','|engot|','|ungas|','|ulol|','|inutil|',
    '|bobo ka|','|boba ka|','|gaga ka|','|ang bobo|','|ang boba|','|ang gaga|',
  ]},
] as const;
// Boba, Gaga, lintik, bwisit, hayop and leche are not standalone comment rules.
