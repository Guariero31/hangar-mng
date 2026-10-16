// Hooks do painel de erros (separados de hooks.ts para não misturar com o resto).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface ErrorEntry {
  id: string; source: 'server' | 'client' | 'mail'; message: string; stack: string | null; route: string | null;
  method: string | null; status: number | null; nickname: string | null; userAgent: string | null;
  count: number; resolved: boolean; firstSeen: string; lastSeen: string;
}
export interface ErrorList { items: ErrorEntry[]; open: number; total: number; retentionDays: number }

export function useErrorLog(filter: string, source: string) {
  return useQuery({
    queryKey: ['admin', 'errors', filter, source],
    queryFn: () => api.get<ErrorList>(`/admin/errors?filter=${filter}&source=${source}&limit=100`),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useOpenErrorCount() {
  return useQuery({
    queryKey: ['admin', 'errors', 'count'],
    queryFn: () => api.get<{ open: number }>('/admin/errors/count'),
    refetchInterval: 60_000,
  });
}

export function useErrorActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'errors'] });
  return {
    resolve: useMutation({
      mutationFn: (v: { id: string; resolved: boolean }) => api.post(`/admin/errors/${v.id}/resolve`, { resolved: v.resolved }),
      onSettled: refresh,
    }),
    clearResolved: useMutation({ mutationFn: () => api.post<{ removed: number }>('/admin/errors/clear-resolved', {}), onSettled: refresh }),
  };
}
