import { Link, useNavigate, useLocation } from 'react-router-dom'
import { logout, clearToken } from '../lib/api'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    try {
      await logout()
    } catch {}
    clearToken()
    navigate('/login')
  }

  const linkClass = (path: string) =>
    `px-3 py-2 rounded text-sm font-medium transition-colors ${
      location.pathname === path
        ? 'bg-gray-900 text-white'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="font-bold text-gray-900 text-lg hover:text-gray-600 transition-colors"
          >
            Writing Tracker
          </Link>
          <Link to="/" className={linkClass('/')}>
            Dashboard
          </Link>
          <Link to="/history" className={linkClass('/history')}>
            History
          </Link>
          <Link to="/export" className={linkClass('/export')}>
            Export
          </Link>
          <Link to="/settings" className={linkClass('/settings')}>
            Settings
          </Link>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          Log out
        </button>
      </div>
    </nav>
  )
}
