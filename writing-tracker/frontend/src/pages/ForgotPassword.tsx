import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../lib/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8">Writing Tracker</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-2xl">✉️</p>
              <p className="font-semibold">Check your email</p>
              <p className="text-sm text-gray-500">
                If an account exists for <strong>{email}</strong>, we sent a password reset link.
              </p>
              <Link to="/login" className="block text-sm text-blue-600 hover:text-blue-800">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-semibold">Reset password</h2>
              <p className="text-sm text-gray-500">
                Enter your email and we'll send you a reset link.
              </p>
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
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <Link
                to="/login"
                className="block text-center text-sm text-gray-500 hover:text-gray-900"
              >
                Back to login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
