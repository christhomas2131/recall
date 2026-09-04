import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { useSettings } from '@/db/hooks';
import Onboarding from '@/routes/Onboarding';
import Projects from '@/routes/Projects';
import Intake from '@/routes/Intake';
import ParseReview from '@/routes/ParseReview';
import Verify from '@/routes/Verify';
import Calibration from '@/routes/Calibration';
import Harvest from '@/routes/Harvest';
import Churn from '@/routes/Churn';
import Drill from '@/routes/Drill';
import ExportRoute from '@/routes/Export';
import SettingsRoute from '@/routes/Settings';

function RequireAcknowledgment({ children }: { children: React.ReactNode }) {
  const { hasAcknowledged } = useSettings();
  if (!hasAcknowledged) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* The deck is the landing page. */}
        <Route path="/" element={<Onboarding />} />
        <Route path="/onboarding" element={<Navigate to="/" replace />} />
        <Route
          path="/projects"
          element={
            <RequireAcknowledgment>
              <Projects />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/new"
          element={
            <RequireAcknowledgment>
              <Intake />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/p/:projectId/review"
          element={
            <RequireAcknowledgment>
              <ParseReview />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/p/:projectId/verify"
          element={
            <RequireAcknowledgment>
              <Verify />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/p/:projectId/verify/:questionId"
          element={
            <RequireAcknowledgment>
              <Verify />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/p/:projectId/export"
          element={
            <RequireAcknowledgment>
              <ExportRoute />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/p/:projectId/drill"
          element={
            <RequireAcknowledgment>
              <Drill />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/p/:projectId/calibrate"
          element={
            <RequireAcknowledgment>
              <Calibration />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/harvest"
          element={
            <RequireAcknowledgment>
              <Harvest />
            </RequireAcknowledgment>
          }
        />
        <Route
          path="/churn"
          element={
            <RequireAcknowledgment>
              <Churn />
            </RequireAcknowledgment>
          }
        />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </Router>
  );
}
