import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { RequireUser } from './components/RequireUser';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Privacy } from './pages/Privacy';
import { Pending } from './pages/Pending';
import { Approvals } from './pages/admin/Approvals';
import { Nickname } from './pages/Nickname';
import { TechTree } from './pages/TechTree';
import { ProfilePage } from './pages/Profile';
import { Players } from './pages/admin/Players';
import { RankingPage } from './pages/Ranking';
import { Overview } from './pages/admin/Overview';
import { Activity } from './pages/admin/Activity';
import { Missions } from './pages/Missions';
import { MissionsAdmin } from './pages/admin/MissionsAdmin';
import { AircraftAdmin } from './pages/admin/AircraftAdmin';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/privacidade" element={<Privacy />} />
      <Route path="/pendente" element={<Pending />} />
      <Route path="/nickname" element={<RequireUser needNickname={false}><Nickname /></RequireUser>} />

      {/* Páginas com a barra superior */}
      <Route element={<RequireUser><Layout /></RequireUser>}>
        <Route index element={<TechTree />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="missoes" element={<Missions />} />
        <Route path="ranking" element={<RankingPage />} />
        <Route path="admin" element={<RequireUser admin><Outlet /></RequireUser>}>
          <Route index element={<Players />} />
          <Route path="aeronaves" element={<AircraftAdmin />} />
          <Route path="visao-geral" element={<Overview />} />
          <Route path="aprovacoes" element={<Approvals />} />
          <Route path="missoes" element={<MissionsAdmin />} />
          <Route path="atividade" element={<Activity />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
