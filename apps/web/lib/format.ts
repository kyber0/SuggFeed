/**
 * Shared formatting utilities — single source of truth.
 * Previously duplicated across sugg-feed, community-feed, idea-detail-panel, profile-dashboard.
 */

export function relativeDate(value: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

export function relativeDateShort(value: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
}

export function readableStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
