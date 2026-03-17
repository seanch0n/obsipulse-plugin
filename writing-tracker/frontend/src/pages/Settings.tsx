import { useEffect, useState, useCallback } from 'react'
import {
  getTargets,
  updateTargets,
  listKeys,
  createKey,
  deleteKey,
  type ApiKey,
  getGoals,
  setGoal,
  deleteGoal,
  type Goal,
} from '../lib/api'
import { SECTIONS, getOrder, saveOrder, type SectionId } from '../lib/dashboardOrder'

function calcFromMonthly(monthly: number) {
  return {
    daily: Math.round(monthly / 30),
    weekly: Math.round((monthly * 12) / 52),
    yearly: monthly * 12,
  }
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function weekLabel(year: number, month: number, weekNum: number) {
  const start = (weekNum - 1) * 7 + 1
  const end = Math.min(start + 6, daysInMonth(year, month))
  return `Week ${weekNum} (${MONTH_NAMES[month - 1].slice(0, 3)} ${start}–${end})`
}

function numWeeks(year: number, month: number) {
  return Math.ceil(daysInMonth(year, month) / 7)
}

function periodLabel(g: Goal) {
  const [year, month, rest] = [
    g.period_key.slice(0, 4),
    g.period_key.slice(5, 7),
    g.period_key.slice(8),
  ]
  const monthName = MONTH_NAMES[Number(month) - 1]
  if (g.period_type === 'monthly') return `${monthName} ${year}`
  if (g.period_type === 'weekly') {
    const wn = parseInt(rest.replace('W', ''))
    const y = parseInt(year),
      m = parseInt(month)
    const start = (wn - 1) * 7 + 1
    const end = Math.min(start + 6, daysInMonth(y, m))
    return `${monthName} Week ${wn} (${start}–${end})`
  }
  // daily
  return `${monthName} ${parseInt(rest)}, ${year}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  )
}

export default function Settings() {
  const inputClass =
    'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  // --- Default target ---
  const [monthly, setMonthly] = useState(0)
  const [derived, setDerived] = useState({ daily: 0, weekly: 0, yearly: 0 })
  const [targetSaved, setTargetSaved] = useState(false)
  const [targetLoading, setTargetLoading] = useState(false)

  useEffect(() => {
    getTargets()
      .then((t) => {
        setMonthly(t.monthly_target)
        setDerived(calcFromMonthly(t.monthly_target))
      })
      .catch(() => {})
  }, [])

  const handleMonthlyChange = (val: number) => {
    setMonthly(val)
    setDerived(calcFromMonthly(val))
    setTargetSaved(false)
  }
  const handleDailyChange = (val: number) => {
    const m = Math.round(val * 30)
    setMonthly(m)
    setDerived(calcFromMonthly(m))
    setTargetSaved(false)
  }
  const handleWeeklyChange = (val: number) => {
    const m = Math.round((val * 52) / 12)
    setMonthly(m)
    setDerived(calcFromMonthly(m))
    setTargetSaved(false)
  }
  const handleYearlyChange = (val: number) => {
    const m = Math.round(val / 12)
    setMonthly(m)
    setDerived(calcFromMonthly(m))
    setTargetSaved(false)
  }

  const saveTargets = async () => {
    setTargetLoading(true)
    try {
      await updateTargets(monthly)
      setTargetSaved(true)
    } finally {
      setTargetLoading(false)
    }
  }

  // --- Goal History Admin ---
  const now = new Date()
  const [adminYear, setAdminYear] = useState(now.getFullYear())
  const [adminMonth, setAdminMonth] = useState(now.getMonth() + 1)
  const [adminGoals, setAdminGoals] = useState<Goal[]>([])
  const [adminLoading, setAdminLoading] = useState(false)

  // Form state
  const [formType, setFormType] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [formDay, setFormDay] = useState(1)
  const [formWeek, setFormWeek] = useState(1)
  const [formTarget, setFormTarget] = useState(0)
  const [formSaving, setFormSaving] = useState(false)

  const fetchAdminGoals = useCallback(async () => {
    setAdminLoading(true)
    try {
      const g = await getGoals(adminYear, adminMonth)
      setAdminGoals(g)
    } finally {
      setAdminLoading(false)
    }
  }, [adminYear, adminMonth])

  useEffect(() => {
    fetchAdminGoals()
  }, [fetchAdminGoals])

  function getPeriodKey() {
    const mk = `${adminYear}-${pad(adminMonth)}`
    if (formType === 'monthly') return mk
    if (formType === 'weekly') return `${mk}-W${formWeek}`
    return `${mk}-${pad(formDay)}`
  }

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formTarget <= 0) return
    setFormSaving(true)
    try {
      const key = getPeriodKey()
      await setGoal(formType, key, formTarget)
      setAdminGoals((prev) => {
        const without = prev.filter((g) => !(g.period_type === formType && g.period_key === key))
        return [...without, { period_type: formType, period_key: key, target: formTarget }].sort(
          (a, b) =>
            a.period_type.localeCompare(b.period_type) || a.period_key.localeCompare(b.period_key)
        )
      })
    } finally {
      setFormSaving(false)
    }
  }

  const handleDeleteGoal = async (g: Goal) => {
    await deleteGoal(g.period_type, g.period_key)
    setAdminGoals((prev) =>
      prev.filter((x) => !(x.period_type === g.period_type && x.period_key === g.period_key))
    )
  }

  const prevAdminMonth = () => {
    if (adminMonth === 1) {
      setAdminMonth(12)
      setAdminYear((y) => y - 1)
    } else setAdminMonth((m) => m - 1)
  }
  const nextAdminMonth = () => {
    if (adminMonth === 12) {
      setAdminMonth(1)
      setAdminYear((y) => y + 1)
    } else setAdminMonth((m) => m + 1)
  }

  const weeks = Array.from({ length: numWeeks(adminYear, adminMonth) }, (_, i) => i + 1)
  const days = Array.from({ length: daysInMonth(adminYear, adminMonth) }, (_, i) => i + 1)

  // --- Dashboard Layout ---
  const [dashOrder, setDashOrder] = useState<SectionId[]>(() => getOrder())

  const moveSection = (index: number, dir: -1 | 1) => {
    const next = [...dashOrder]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    setDashOrder(next)
    saveOrder(next)
  }

  // --- API Keys ---
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyError, setKeyError] = useState('')

  useEffect(() => {
    listKeys()
      .then(setKeys)
      .catch(() => {})
  }, [])

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setKeyError('')
    setKeyLoading(true)
    try {
      const result = await createKey(newKeyName || 'Default')
      setNewKeyValue(result.key)
      setNewKeyName('')
      setKeys((prev) => [
        {
          id: result.id,
          key_prefix: result.key_prefix,
          name: result.name,
          created_at: result.created_at,
        },
        ...prev,
      ])
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setKeyLoading(false)
    }
  }

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Delete this API key? The plugin will stop syncing if it uses this key.')) return
    try {
      await deleteKey(id)
      setKeys((prev) => prev.filter((k) => k.id !== id))
    } catch {}
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      <Section title="Default Word Count Target">
        <p className="text-sm text-gray-500">
          Used for any month or day that doesn't have a specific goal stored. Set any field — the
          others update automatically.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Daily</label>
            <input
              type="number"
              min={0}
              className={`${inputClass} w-full`}
              value={derived.daily || ''}
              onChange={(e) => handleDailyChange(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Weekly</label>
            <input
              type="number"
              min={0}
              className={`${inputClass} w-full`}
              value={derived.weekly || ''}
              onChange={(e) => handleWeeklyChange(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Monthly</label>
            <input
              type="number"
              min={0}
              className={`${inputClass} w-full`}
              value={monthly || ''}
              onChange={(e) => handleMonthlyChange(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Yearly</label>
            <input
              type="number"
              min={0}
              className={`${inputClass} w-full`}
              value={derived.yearly || ''}
              onChange={(e) => handleYearlyChange(Number(e.target.value))}
            />
          </div>
        </div>
        <button
          onClick={saveTargets}
          disabled={targetLoading}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {targetLoading ? 'Saving…' : targetSaved ? 'Saved ✓' : 'Save target'}
        </button>
      </Section>

      <Section title="Goal History">
        <p className="text-sm text-gray-500">
          Set specific goals for any day, week, or month. The goal history on the dashboard checks
          your actual words against the goal you had at that time.
        </p>

        {/* Month navigation */}
        <div className="flex items-center gap-3">
          <button onClick={prevAdminMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            ←
          </button>
          <span className="text-sm font-semibold w-36 text-center">
            {MONTH_NAMES[adminMonth - 1]} {adminYear}
          </span>
          <button onClick={nextAdminMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            →
          </button>
        </div>

        {/* Add goal form */}
        <form
          onSubmit={handleSaveGoal}
          className="flex flex-wrap gap-2 items-end border border-gray-100 rounded-lg p-3 bg-gray-50"
        >
          <div>
            <label className={labelClass}>Type</label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value as 'daily' | 'weekly' | 'monthly')}
              className={inputClass}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {formType === 'daily' && (
            <div>
              <label className={labelClass}>Day</label>
              <select
                value={formDay}
                onChange={(e) => setFormDay(Number(e.target.value))}
                className={inputClass}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {MONTH_NAMES[adminMonth - 1].slice(0, 3)} {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {formType === 'weekly' && (
            <div>
              <label className={labelClass}>Week</label>
              <select
                value={formWeek}
                onChange={(e) => setFormWeek(Number(e.target.value))}
                className={inputClass}
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    {weekLabel(adminYear, adminMonth, w)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {formType === 'monthly' && (
            <div>
              <label className={labelClass}>Month</label>
              <span className={`${inputClass} inline-block bg-gray-100 text-gray-500`}>
                {MONTH_NAMES[adminMonth - 1]} {adminYear}
              </span>
            </div>
          )}

          <div>
            <label className={labelClass}>Goal (words)</label>
            <input
              type="number"
              min={1}
              placeholder="e.g. 500"
              value={formTarget || ''}
              onChange={(e) => setFormTarget(Number(e.target.value))}
              className={`${inputClass} w-28`}
            />
          </div>

          <button
            type="submit"
            disabled={formSaving || formTarget <= 0}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {formSaving ? 'Saving…' : 'Save goal'}
          </button>
        </form>

        {/* Stored goals table */}
        {adminLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : adminGoals.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">Period</th>
                <th className="text-left py-2 font-medium text-gray-500">Type</th>
                <th className="text-left py-2 font-medium text-gray-500 tabular-nums">Goal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {adminGoals.map((g) => (
                <tr key={`${g.period_type}:${g.period_key}`} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{periodLabel(g)}</td>
                  <td className="py-2 pr-4 text-gray-400 capitalize">{g.period_type}</td>
                  <td className="py-2 pr-4 tabular-nums">{g.target.toLocaleString()} words</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleDeleteGoal(g)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">
            No goals set for {MONTH_NAMES[adminMonth - 1]} {adminYear}.
          </p>
        )}
      </Section>

      <Section title="Dashboard Layout">
        <p className="text-sm text-gray-500">
          Drag the boxes into the order you want them to appear on the dashboard.
        </p>
        <div className="space-y-1">
          {dashOrder.map((id, i) => {
            const label = SECTIONS.find((s) => s.id === id)?.label ?? id
            return (
              <div
                key={id}
                className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              >
                <span className="flex-1 text-sm text-gray-700">{label}</span>
                <button
                  onClick={() => moveSection(i, -1)}
                  disabled={i === 0}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-500 text-xs"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveSection(i, 1)}
                  disabled={i === dashOrder.length - 1}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-500 text-xs"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="API Keys">
        <p className="text-sm text-gray-500">
          Use an API key to connect your Obsidian plugin. Copy the full key when it's created — it
          won't be shown again.
        </p>

        {newKeyValue && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-green-800">New API key created — copy it now:</p>
            <code className="block text-xs bg-white border border-green-200 rounded p-2 break-all select-all font-mono">
              {newKeyValue}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(newKeyValue)}
              className="text-xs text-green-700 hover:text-green-900 underline"
            >
              Copy to clipboard
            </button>
          </div>
        )}

        {keyError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{keyError}</p>}

        <form onSubmit={handleCreateKey} className="flex gap-2">
          <input
            type="text"
            placeholder="Key name (e.g. MacBook)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className={`flex-1 ${inputClass}`}
          />
          <button
            type="submit"
            disabled={keyLoading}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {keyLoading ? 'Creating…' : 'Create key'}
          </button>
        </form>

        {keys.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">Name</th>
                <th className="text-left py-2 font-medium text-gray-500">Prefix</th>
                <th className="text-left py-2 font-medium text-gray-500">Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{k.name}</td>
                  <td className="py-2 pr-4 font-mono text-gray-400">{k.key_prefix}…</td>
                  <td className="py-2 pr-4 text-gray-400">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleDeleteKey(k.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">No API keys yet.</p>
        )}
      </Section>
    </div>
  )
}
