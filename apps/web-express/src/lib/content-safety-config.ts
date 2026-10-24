/** Server-owned policy. Review limits and escalation with each school before rollout. */
export const contentSafetyConfig = {
 comments: {mode: 'flag' as 'flag'|'reject', reportThreshold: 3},
 submissions: {mode: 'flag' as 'flag'|'reject', reportThreshold: 3, limit: 5, windowSeconds: 3600, cooldownSeconds: 30},
 reports: {limit: 20, windowSeconds: 3600},
 similarity: {threshold: 0.22, limit: 5},
 notifications: {inApp: true, urgentEmail: false},
};
