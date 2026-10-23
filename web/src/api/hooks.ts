// Hooks de dados (React Query). As telas usam só estes hooks — nunca fetch direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './client';
import { invalidatePlayerData } from './cache';
import type { MusicTrack, Mission, MissionInput, Approvals, MedalLite, Achievements, Ranking, Activity, Overview, News, Profile, AdminTree, Aircraft, AuthConfig, LedgerEntry, Me, PlayerDetail, PlayerRow, TechTreeState, Tier } from './types';

// ------------------------------------------------------------------ sessão

/** Usuário logado, ou null se não houver sessão */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 30_000,
  });
}

export function useAuthConfig() {
  return useQuery({ queryKey: ['auth-config'], queryFn: () => api.get<AuthConfig>('/auth/config'), staleTime: Infinity });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => { qc.clear(); qc.setQueryData(['me'], null); },
  });
}

export function useSetNickname() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nickname: string) => api.post<Me>('/me/nickname', { nickname }),
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}

export const checkNickname = (nickname: string) =>
  api.get<{ available: boolean }>(`/me/nickname-available?nickname=${encodeURIComponent(nickname)}`);

export function useSetTutorialStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: 'completed' | 'skipped') => api.post<Me>('/me/tutorial', { status }),
    onSuccess: (me) => queryClient.setQueryData(['me'], me),
  });
}

export function useCompleteTutorialModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: number) => api.post<Me>(`/me/tutorial/modules/${moduleId}`),
    onSuccess: (me) => queryClient.setQueryData(['me'], me),
  });
}

// ------------------------------------------------------------------ jogador

export function useTechTree() {
  return useQuery({ queryKey: ['techtree'], queryFn: () => api.get<TechTreeState>('/techtree') });
}

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: () => api.get<Profile>('/me/profile') });
}

export function useAchievements() {
  return useQuery({ queryKey: ['achievements'], queryFn: () => api.get<Achievements>('/me/achievements') });
}

export function useHistory(offset = 0) {
  return useQuery({ queryKey: ['history', offset], queryFn: () => api.get<{ items: LedgerEntry[]; total: number }>(`/me/history/page?limit=50&offset=${offset}`) });
}

export function useUndoUnlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aircraftId: string) => api.post<{ balance: number }>('/techtree/undo', { aircraftId }),
    onSettled: () => invalidatePlayerData(qc),
  });
}

/** Define a aeronave-meta do piloto (null limpa) */
export function useSetGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aircraftId: string | null) => api.put('/me/goal', { aircraftId }),
    onSuccess: (_r, aircraftId) => {
      qc.setQueryData<Me | null>(['me'], (m) => (m ? { ...m, goalAircraftId: aircraftId } : m));
      return invalidatePlayerData(qc);
    },
  });
}

/** Novidades do admin para o piloto (atualiza a cada minuto) */
export function useNews() {
  return useQuery({ queryKey: ['news'], queryFn: () => api.get<News>('/me/news'), refetchInterval: 60_000 });
}

export function useMarkNewsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/me/news/seen'),
    onSuccess: () => qc.setQueryData<News>(['news'], (n) => (n ? { unread: 0, items: n.items.map((item) => ({ ...item, unread: false })) } : n)),
  });
}

export function useUnlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aircraftId: string) => api.post<{ balance: number; undoSeconds: number; achievements: MedalLite[] }>('/techtree/unlock', { aircraftId }),
    onSettled: () => invalidatePlayerData(qc),
  });
}

// ------------------------------------------------------------------ admin

export function usePlayers(search: string, offset = 0, filter = 'all', sort = 'earned', direction = 'desc') {
  return useQuery({
    queryKey: ['admin', 'players', search, offset, filter, sort, direction],
    queryFn: () => api.get<{ players: PlayerRow[]; total: number; summary: { active: number; banned: number; circ: number; online: number } }>(
      `/admin/players?limit=50&offset=${offset}&filter=${filter}&sort=${sort}&direction=${direction}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    placeholderData: (prev) => prev,
  });
}

export function usePlayer(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'player', id],
    queryFn: () => api.get<PlayerDetail>(`/admin/players/${id}`),
    enabled: !!id,
  });
}

/** Árvore completa para o admin (inclui aeronaves inativas) */
export function useAdminTree() {
  return useQuery({ queryKey: ['admin', 'tree'], queryFn: () => api.get<AdminTree>('/admin/tree') });
}

/** Mutação de admin que atualiza tudo que depende dela */
function useAdminMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => invalidatePlayerData(qc),
  });
}

export const useAddPoints = () =>
  useAdminMutation((v: { id: string; amount: number; reason: string }) =>
    api.post(`/admin/players/${v.id}/points`, { amount: v.amount, reason: v.reason }));

export const useAddPointsBatch = () =>
  useAdminMutation((v: { userIds: string[]; amount: number; reason: string }) =>
    api.post<{ count: number; total: number }>('/admin/points/batch', v));

export const useGrantAircraft = () =>
  useAdminMutation((v: { id: string; aircraftId: string }) =>
    api.post(`/admin/players/${v.id}/aircraft`, { aircraftId: v.aircraftId }));

export const useRevokeAircraft = () =>
  useAdminMutation((v: { id: string; aircraftId: string; refund: boolean }) =>
    api.del(`/admin/players/${v.id}/aircraft/${encodeURIComponent(v.aircraftId)}?refund=${v.refund}`));

export const useUpdatePlayer = () =>
  useAdminMutation((v: { id: string; status?: 'active' | 'banned'; role?: 'player' | 'admin' }) =>
    api.patch(`/admin/players/${v.id}`, { status: v.status, role: v.role }));

export const useDeletePlayer = () =>
  useAdminMutation((id: string) => api.del(`/admin/players/${id}`));

export const useRenamePlayer = () =>
  useAdminMutation((v: { id: string; nickname: string }) =>
    api.put(`/admin/players/${v.id}/nickname`, { nickname: v.nickname }));

export const useSaveAircraft = () =>
  useAdminMutation((v: { isNew: boolean; data: Aircraft }) =>
    v.isNew ? api.post('/admin/aircraft', v.data) : api.put(`/admin/aircraft/${encodeURIComponent(v.data.id)}`, v.data));

export const useSaveTier = () =>
  useAdminMutation((v: { isNew: boolean; data: Tier }) =>
    v.isNew ? api.post('/admin/tiers', v.data) : api.put(`/admin/tiers/${v.data.tier}`, v.data));


export function useApprovals(enabled = true, offset = 0) {
  return useQuery({ queryKey: ['admin', 'approvals', offset], queryFn: () => api.get<Approvals>(`/admin/approvals?limit=50&offset=${offset}`), refetchInterval: 60_000, enabled });
}

export const useDecideApproval = () =>
  useAdminMutation((v: { id: string; decision: 'approve' | 'reject' }) =>
    api.post(`/admin/approvals/${v.id}`, { decision: v.decision }));

export function useMissions() {
  return useQuery({ queryKey: ['missions'], queryFn: () => api.get<{ upcoming: Mission[]; past: Mission[] }>('/missions') });
}

export function useMission(id: string, { poll = true }: { poll?: boolean } = {}) {
  return useQuery({ queryKey: ['missions', id], queryFn: () => api.get<Mission>(`/missions/${id}`), enabled: !!id, refetchInterval: poll ? 30_000 : false });
}

function useMissionMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ['missions'] }), invalidatePlayerData(qc)]),
  });
}

export const useMissionSignup = () =>
  useMissionMutation((v: { id: string; aircraftId: string | null }) =>
    v.aircraftId ? api.put(`/missions/${v.id}/signup`, { aircraftId: v.aircraftId }) : api.del(`/missions/${v.id}/signup`));

export function useAdminMissions() {
  return useQuery({ queryKey: ['admin', 'missions'], queryFn: () => api.get<{ items: Mission[]; total: number }>('/admin/missions?limit=100') });
}

export function useMusicLibrary() {
  return useQuery({ queryKey: ['admin', 'music'], queryFn: () => api.get<MusicTrack[]>('/admin/music') });
}

export const useSaveMission = () =>
  useMissionMutation((v: { id?: string; input: MissionInput }) =>
    v.id ? api.put(`/admin/missions/${v.id}`, v.input) : api.post('/admin/missions', v.input));

export const useCancelMission = () => useMissionMutation((id: string) => api.post(`/admin/missions/${id}/cancel`, {}));

export function useRemoveMissionSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ missionId, userId }: { missionId: string; userId: string }) => api.del(`/admin/missions/${missionId}/signups/${userId}`),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['missions'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'missions'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'mission-report'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'activity'] }),
    ]),
  });
}

export const useDeleteMission = () => useMissionMutation((id: string) => api.del(`/admin/missions/${id}`));

export const useCloseMission = () =>
  useMissionMutation((v: { id: string; attendees: { userId: string; pm: number }[] }) =>
    api.post<{ pilots: number; total: number }>(`/admin/missions/${v.id}/close`, { attendees: v.attendees }));

export function useOverview() {
  return useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api.get<Overview>('/admin/overview') });
}

export function useActivity(group: string, limit: number, offset = 0) {
  return useQuery({
    queryKey: ['admin', 'activity', group, limit, offset],
    queryFn: () => api.get<Activity>(`/admin/activity?limit=${limit}&offset=${offset}${group ? `&group=${group}` : ''}`),
    placeholderData: (prev) => prev,
  });
}

export function useRanking(offset = 0, period: 'all' | 'month' = 'all') {
  return useQuery({
    queryKey: ['ranking', offset, period],
    queryFn: () => api.get<Ranking>(`/ranking?limit=20&offset=${offset}&period=${period}`),
    refetchInterval: 60_000,
  });
}
