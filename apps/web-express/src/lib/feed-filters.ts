import { DEFAULT_CATEGORIES, SortMode } from './data';
export interface FeedFilters { sort: SortMode; category: string; search: string; scope: 'all' | 'following'; page: number; }
/** Only applied public filters belong in saved searches; identity and capabilities are ignored. */
export function feedFilters(input: Record<string, unknown> = {}): FeedFilters {
  const text = (key: string) => typeof input[key] === 'string' ? input[key] as string : '';
  const sort = ['all','latest','popular','top','oldest'].includes(text('sort')) ? text('sort') as SortMode : 'all';
  const category = (DEFAULT_CATEGORIES as readonly string[]).includes(text('category')) ? text('category') : 'All';
  const pageText = text('page');
  return { sort, category, search: text('search').trim().slice(0,120), scope: text('scope') === 'following' ? 'following' : 'all',
    page: /^\d+$/.test(pageText) ? Math.min(100000, Math.max(1, Number(pageText))) : 1 };
}
export function savedSearchFilters(input: Record<string, unknown> = {}) {
  const { page, ...filters } = feedFilters(input);
  return filters;
}
