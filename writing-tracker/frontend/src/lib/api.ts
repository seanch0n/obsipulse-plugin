const BASE_URL = import.meta.env.VITE_API_URL ?? ''

function getToken(): string | null {
  return localStorage.getItem('wt_token')
}

export function setToken(token: string) {
  localStorage.setItem('wt_token', token)
}

export function clearToken() {
  localStorage.removeItem('wt_token')
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

// Auth
export const register = (email: string, password: string) =>
  request<{ token: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

export const login = (email: string, password: string) =>
  request<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

export const logout = () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })

export const forgotPassword = (email: string) =>
  request<{ ok: boolean }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })

export const resetPassword = (token: string, password: string) =>
  request<{ ok: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })

// API Keys
export interface ApiKey {
  id: string
  key_prefix: string
  name: string
  created_at: number
}

export const listKeys = () => request<ApiKey[]>('/api/keys')

export const createKey = (name: string) =>
  request<{ id: string; key: string; key_prefix: string; name: string; created_at: number }>(
    '/api/keys',
    { method: 'POST', body: JSON.stringify({ name }) }
  )

export const deleteKey = (id: string) =>
  request<{ ok: boolean }>(`/api/keys/${id}`, { method: 'DELETE' })

// Stats
export interface DailyStat {
  date: string
  words: number
}

export interface ProjectStat {
  project: string
  words: number
}

export interface MonthlyStat {
  month: number
  words: number
}

export const getDailyStats = (year: number, month: number) =>
  request<DailyStat[]>(`/api/stats/daily?year=${year}&month=${month}`)

export const getProjectStats = (year: number, month: number) =>
  request<ProjectStat[]>(`/api/stats/projects?year=${year}&month=${month}`)

export const getYearlyStats = (year: number) =>
  request<MonthlyStat[]>(`/api/stats/yearly?year=${year}`)

export const getProjectNames = () => request<string[]>('/api/stats/project-names')

// Activity tracking (writing vs editing)
export interface ActivityEntry {
  date: string
  project: string
  writing: boolean
  editing: boolean
  planning: boolean
}

export const getActivity = (year: number, month: number) =>
  request<ActivityEntry[]>(`/api/activity?year=${year}&month=${month}`)

export const setActivity = (
  date: string,
  project: string,
  flags: { writing: boolean; editing: boolean; planning: boolean }
) =>
  request<{ ok: boolean }>('/api/activity', {
    method: 'PUT',
    body: JSON.stringify({ date, project, ...flags }),
  })

// Entries (manual management)
export interface StatEntry {
  date: string
  project: string
  word_count: number
}

export const getEntries = (year: number, month: number) =>
  request<StatEntry[]>(`/api/entries?year=${year}&month=${month}`)

export const createEntry = (date: string, project: string, word_count: number) =>
  request<{ ok: boolean }>('/api/entries', {
    method: 'POST',
    body: JSON.stringify({ date, project, word_count }),
  })

export const updateEntry = (
  date: string,
  project: string,
  updates: { newDate?: string; newProject?: string; word_count: number }
) =>
  request<{ ok: boolean }>('/api/entry', {
    method: 'PUT',
    body: JSON.stringify({ date, project, ...updates }),
  })

export const deleteEntry = (date: string, project: string) =>
  request<{ ok: boolean }>(
    `/api/entry?date=${encodeURIComponent(date)}&project=${encodeURIComponent(project)}`,
    { method: 'DELETE' }
  )

// Goals (per-period stored targets)
// period_type: 'daily' | 'weekly' | 'monthly'
// period_key:  '2026-03-09' | '2026-03-W2' | '2026-03'
export interface Goal {
  period_type: 'daily' | 'weekly' | 'monthly'
  period_key: string
  target: number
}

export const getGoals = (year: number, month: number) =>
  request<Goal[]>(`/api/goals?year=${year}&month=${month}`)

export const setGoal = (period_type: string, period_key: string, target: number) =>
  request<{ ok: boolean }>('/api/goals', {
    method: 'PUT',
    body: JSON.stringify({ period_type, period_key, target }),
  })

export const deleteGoal = (period_type: string, period_key: string) =>
  request<{ ok: boolean }>(
    `/api/goals?period_type=${encodeURIComponent(period_type)}&period_key=${encodeURIComponent(period_key)}`,
    { method: 'DELETE' }
  )

// Targets
export const getTargets = () => request<{ monthly_target: number }>('/api/targets')

export const updateTargets = (monthly_target: number) =>
  request<{ monthly_target: number }>('/api/targets', {
    method: 'PUT',
    body: JSON.stringify({ monthly_target }),
  })

// Sprints
export interface SprintRecord {
  id: string
  file_name: string
  project: string | null
  started_at: number
  ended_at: number
  duration_seconds: number
  goal_duration_minutes: number
  goal_words: number
  words_written: number
  location: string | null
  completed: number
}

export const getSprints = (year?: number, month?: number) => {
  if (year != null && month != null) {
    return request<SprintRecord[]>(`/api/sprints?year=${year}&month=${month}`)
  }
  return request<SprintRecord[]>('/api/sprints')
}
