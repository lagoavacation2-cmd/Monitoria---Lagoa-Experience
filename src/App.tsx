/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, createContext, useContext } from 'react';
import AdminLayout from './components/AdminLayout';
import MainLayout from './components/MainLayout';
import Home from './pages/Home';
import Admin from './pages/Admin';
import History from './pages/History';
import Details from './pages/Details';
import Login from './pages/Login';

// Simple Auth Context
const AuthContext = createContext<{
  user: string | null;
  login: (u: string, p: string) => boolean;
  logout: () => void;
}>({
  user: null,
  login: () => false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState<string | null>(localStorage.getItem('admin_user'));

  const login = (u: string, p: string) => {
    const adminUser = import.meta.env.VITE_ADMIN_USER || 'Administrador';
    const adminPass = import.meta.env.VITE_ADMIN_PASSWORD || 'Lagoa123@';

    if (u === adminUser && p === adminPass) {
      setUser(u);
      localStorage.setItem('admin_user', u);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('admin_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <Router>
        <Routes>
          {/* Portal da IA (Público/Operacional) */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Home />} />
          </Route>

          {/* Portal Administrador */}
          <Route path="/admin/login" element={<Login />} />
          
          <Route path="/admin" element={user ? <AdminLayout /> : <Navigate to="/admin/login" />}>
            <Route path="dashboard" element={<Admin />} />
            <Route path="historico" element={<History />} />
            <Route path="monitoria/:id" element={<Details />} />
            <Route index element={<Navigate to="/admin/dashboard" />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}
