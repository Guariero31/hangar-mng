import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { RequireUser } from './components/RequireUser';
import { CanonicalMissionRoute } from './components/CanonicalMissionRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Privacy } from './pages/Privacy';
import { Pending } from './pages/Pending';
import { Approvals } from './pages/admin/Approvals';
import { Nickname } from './pages/Nickname';
import { PilotTutorial } from './pages/PilotTutorial';
import { TechTree } from './pages/TechTree';
import { ProfilePage } from './pages/Profile';
import { Players } from './pages/admin/Players';
import { RankingPage } from './pages/Ranking';
import { Overview } from './pages/admin/Overview';
import { ErrorsAdmin } from './pages/admin/ErrorsAdmin';
import { Activity } from './pages/admin/Activity';
import { Missions } from './pages/Missions';
import { MissionDetail } from './pages/MissionDetail';
import { MissionBriefing } from './pages/MissionBriefing';
import { MissionsAdmin } from './pages/admin/MissionsAdmin';
import { AircraftAdmin } from './pages/admin/AircraftAdmin';
import { ScoringAdmin } from './pages/admin/ScoringAdmin';
import { RibbonsAdmin } from './pages/admin/RibbonsAdmin';
import { MissionReportEditor } from './pages/admin/MissionReportEditor';
import { MissionReportPage } from './pages/MissionReport';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/privacidade" element={<Privacy />} />
      <Route path="/pendente" element={<Pending />} />
      <Route path="/nickname" element={<RequireUser needNickname={false}><Nickname /></RequireUser>} />
      <Route path="/boas-vindas" element={<RequireUser needTutorial={false}><PilotTutorial /></RequireUser>} />
      <Route path="/ajuda" element={<RequireUser needTutorial={false}><PilotTutorial replay /></RequireUser>} />

      {/* Páginas com a barra superior */}
      <Route element={<RequireUser><Layout /></RequireUser>}>
        <Route index element={<TechTree />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="missoes" element={<Missions />} />
        <Route path="missoes/:id" element={<CanonicalMissionRoute><MissionDetail /></CanonicalMissionRoute>} />
        <Route path="missoes/:id/briefing" element={<CanonicalMissionRoute suffix="/briefing"><MissionBriefing /></CanonicalMissionRoute>} />
        <Route path="missoes/:id/relatorio" element={<CanonicalMissionRoute suffix="/relatorio"><MissionReportPage /></CanonicalMissionRoute>} />
        <Route path="ranking" element={<RankingPage />} />
        <Route path="admin" element={<RequireUser admin><Outlet /></RequireUser>}>
          <Route index element={<Players />} />
          <Route path="aeronaves" element={<AircraftAdmin />} />
          <Route path="visao-geral" element={<Overview />} />
          <Route path="aprovacoes" element={<Approvals />} />
          <Route path="missoes" element={<MissionsAdmin />} />
          <Route path="missoes/:id/relatorio" element={<MissionReportEditor />} />
          <Route path="pontuacao" element={<ScoringAdmin />} />
          <Route path="condecoracoes" element={<RibbonsAdmin />} />
          <Route path="atividade" element={<Activity />} />
          <Route path="erros" element={<ErrorsAdmin />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
