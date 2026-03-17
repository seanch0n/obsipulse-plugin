import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, setToken } from '../lib/api'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await login(email, password)
      setToken(token)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8">Writing Tracker</h1>
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold">Log in</h2>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
          <div className="flex justify-between text-sm text-gray-500">
            <Link to="/forgot-password" className="hover:text-gray-900">
              Forgot password?
            </Link>
            <Link to="/register" className="hover:text-gray-900">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
