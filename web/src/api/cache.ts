import type { QueryClient } from '@tanstack/react-query';

/** Keep all views of points, ownership and achievements consistent after writes. */
export function invalidatePlayerData(client: QueryClient) {
  return Promise.all(['me', 'techtree', 'profile', 'history', 'achievements', 'news', 'ranking', 'admin']
    .map(key => client.invalidateQueries({ queryKey: [key] })));
}
