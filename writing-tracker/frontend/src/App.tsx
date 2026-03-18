import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isLoggedIn } from './lib/api'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import History from './pages/History'
import Export from './pages/Export'
import Sprints from './pages/Sprints'
import Navbar from './components/Navbar'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  return !isLoggedIn() ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Navbar />
              <main className="max-w-5xl mx-auto px-4 py-8">
                <Dashboard />
              </main>
            </PrivateRoute>
          }
        />
        <Route
          path="/history"
          element={
            <PrivateRoute>
              <Navbar />
              <main className="max-w-5xl mx-auto px-4 py-8">
                <History />
              </main>
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <Navbar />
              <main className="max-w-5xl mx-auto px-4 py-8">
                <Settings />
              </main>
            </PrivateRoute>
          }
        />
        <Route
          path="/export"
          element={
            <PrivateRoute>
              <Navbar />
              <main className="max-w-5xl mx-auto px-4 py-8">
                <Export />
              </main>
            </PrivateRoute>
          }
        />
        <Route
          path="/sprints"
          element={
            <PrivateRoute>
              <Navbar />
              <main className="max-w-5xl mx-auto px-4 py-8">
                <Sprints />
              </main>
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
