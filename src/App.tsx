import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import PlanningProvider from "./components/PlanningProvider";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RequestIntake from "./pages/RequestIntake";
import RequestsList from "./pages/RequestsList";
import WhatIf from "./pages/WhatIf";
import Planner from "./pages/Planner";
import MaintenanceMap from "./pages/MaintenanceMap";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<PlanningProvider><Layout /></PlanningProvider>}>
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/status" element={<RequestsList />} />
        <Route path="/app/request" element={<RequestIntake />} />
        <Route path="/app/requests" element={<RequestsList />} />
        <Route path="/app/requests/new" element={<RequestIntake />} />
        <Route path="/app/schedule" element={<Navigate to="/app/planner" replace />} />
        <Route path="/app/whatif" element={<WhatIf />} />
        <Route path="/app/resources" element={<Navigate to="/app/planner" replace />} />
        <Route path="/app/map" element={<MaintenanceMap />} />
        <Route path="/app/planner" element={<Planner />} />
      </Route>
    </Routes>
  );
}
