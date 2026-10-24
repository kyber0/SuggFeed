/** Server-owned settings; never accept these values from request bodies. */
export const commentModerationConfig: { mode: 'flag' | 'reject'; reportThreshold: number } = {
  mode: 'flag',
  reportThreshold: 3,
};
