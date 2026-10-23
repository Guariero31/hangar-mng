import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useMission } from '../api/hooks';
import { missionPath } from '../lib/mission-path';

export function CanonicalMissionRoute({ children, suffix = '' }: { children: ReactNode; suffix?: string }) {
  const { id = '' } = useParams();
  const { data: mission } = useMission(id, { poll: false });
  if (mission?.slug && id !== mission.slug) return <Navigate replace to={missionPath(mission, suffix)} />;
  return <>{children}</>;
}
