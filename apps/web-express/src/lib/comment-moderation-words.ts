/** Obscenity patterns: | asserts word boundaries. Keep short terms bounded.
 * Ambiguous everyday words such as hayop and leche are intentionally excluded.
 */
export const filipinoCommentPatterns = [
  '|puta|', '|putangina|', '|tangina|', '|putang[ ]ina|',
  '|gago|', '|gaga|', '|gagong|', '|bobo|', '|boba|', '|bobong|', '|tanga|', '|tangang|', '|engot|', '|ungas|', '|hinayupak|', '|ulol|', '|pakyu|',
  '|punyeta|', '|p[un]yeta|', '|tarantado|', '|tarantada|', '|putragis|',
  '|bwisit|', '|buwisit|', '|lintik|', '|inutil|', '|kantot|', '|burat|', '|tite|', '|pekpek|',
];
