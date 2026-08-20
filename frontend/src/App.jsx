import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MajorExpensesPage from './pages/MajorExpensesPage';
import SmartBudgetingPage from './pages/SmartBudgetingPage';
import EmergencyPage from './pages/EmergencyPage';
import SavingsPage from './pages/SavingsPage';
import GoalsPage from './pages/GoalsPage';
import StocksPage from './pages/StocksPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"               element={<Navigate to="/login" replace />} />
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/dashboard"      element={<DashboardPage />} />
        <Route path="/major-expenses" element={<MajorExpensesPage />} />
        <Route path="/smart-budgeting" element={<SmartBudgetingPage />} />
        <Route path="/emergency"      element={<EmergencyPage />} />
        <Route path="/savings"        element={<SavingsPage />} />
        <Route path="/goals"          element={<GoalsPage />} />
        <Route path="/stocks"         element={<StocksPage />} />
        <Route path="*"               element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
