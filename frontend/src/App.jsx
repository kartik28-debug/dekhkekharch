import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
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
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />

          {/* Protected routes — require auth + completed password change */}
          <Route path="/dashboard"      element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/major-expenses" element={<ProtectedRoute><MajorExpensesPage /></ProtectedRoute>} />
          <Route path="/smart-budgeting" element={<ProtectedRoute><SmartBudgetingPage /></ProtectedRoute>} />
          <Route path="/emergency"      element={<ProtectedRoute><EmergencyPage /></ProtectedRoute>} />
          <Route path="/savings"        element={<ProtectedRoute><SavingsPage /></ProtectedRoute>} />
          <Route path="/goals"          element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
          <Route path="/stocks"         element={<ProtectedRoute><StocksPage /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
