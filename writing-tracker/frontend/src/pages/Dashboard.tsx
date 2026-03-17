import { useEffect, useState, useCallback } from 'react'
import {
  getDailyStats,
  getProjectStats,
  getYearlyStats,
  getTargets,
  getActivity,
  getProjectNames,
  getGoals,
  type DailyStat,
  type ProjectStat,
  type MonthlyStat,
  type ActivityEntry,
  type Goal,
} from '../lib/api'
import { getOrder, type SectionId } from '../lib/dashboardOrder'
import WordsByDayChart from '../components/WordsByDayChart'
import WordsByProjectChart from '../components/WordsByProjectChart'
import MonthlyTable from '../components/MonthlyTable'
import ActivityGrid from '../components/ActivityGrid'
import GoalHistory from '../components/GoalHistory'

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

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  return mon
}

interface ProgressRowProps {
  label: string
  words: number
  target: number
  loading: boolean
}

function ProgressRow({ label, words, target, loading }: ProgressRowProps) {
  const pct = target > 0 ? Math.min(100, Math.round((words / target) * 100)) : null
  const over = target > 0 && words >= target

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm font-semibold tabular-nums">
            {loading ? '—' : words.toLocaleString()}
          </span>
          {target > 0 && (
            <span className="text-xs text-gray-400 tabular-nums">
              / {target.toLocaleString()}
              {pct !== null && (
                <span className={`ml-1.5 font-medium ${over ? 'text-green-600' : 'text-gray-500'}`}>
                  {pct}%
                </span>
              )}
            </span>
          )}
        </div>
        {target > 0 && !loading && (
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${over ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [order, setOrder] = useState<SectionId[]>(() => getOrder())

  const [daily, setDaily] = useState<DailyStat[]>([])
  const [projects, setProjects] = useState<ProjectStat[]>([])
  const [yearly, setYearly] = useState<MonthlyStat[]>([])
  const [target, setTarget] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [projectNames, setProjectNames] = useState<string[]>([])
  const [goals, setGoals] = useState<Goal[]>([])

  const [currentDaily, setCurrentDaily] = useState<DailyStat[]>([])
  const [currentYearly, setCurrentYearly] = useState<MonthlyStat[]>([])
  const [currentLoading, setCurrentLoading] = useState(true)

  // Re-read order from localStorage when the page becomes visible (e.g. after visiting Settings)
  useEffect(() => {
    const handler = () => setOrder(getOrder())
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [d, p, y, t, a, names, g] = await Promise.all([
        getDailyStats(year, month),
        getProjectStats(year, month),
        getYearlyStats(year),
        getTargets(),
        getActivity(year, month),
        getProjectNames(),
        getGoals(year, month),
      ])
      setDaily(d)
      setProjects(p)
      setYearly(y)
      setTarget(t.monthly_target)
      setActivity(a)
      setProjectNames(names)
      setGoals(g)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const n = new Date()
    Promise.all([getDailyStats(n.getFullYear(), n.getMonth() + 1), getYearlyStats(n.getFullYear())])
      .then(([d, y]) => {
        setCurrentDaily(d)
        setCurrentYearly(y)
      })
      .catch(() => {})
      .finally(() => setCurrentLoading(false))
  }, [])

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else setMonth((m) => m + 1)
  }

  const todayStr = toDateStr(now)
  const weekStart = startOfWeek(now)

  const todayWords = currentDaily.find((d) => d.date === todayStr)?.words ?? 0
  const weekWords = currentDaily
    .filter((d) => d.date >= toDateStr(weekStart) && d.date <= todayStr)
    .reduce((s, d) => s + d.words, 0)
  const monthWords = currentDaily.reduce((s, d) => s + d.words, 0)
  const yearWords = currentYearly.reduce((s, d) => s + d.words, 0)

  const dailyTarget = target > 0 ? Math.round(target / 30) : 0
  const weeklyTarget = target > 0 ? Math.round((target * 12) / 52) : 0
  const yearlyTarget = target * 12

  const mn = MONTH_NAMES[month - 1]

  const sections: Record<SectionId, React.ReactNode> = {
    progress: (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Progress</h2>
        <ProgressRow
          label="Today"
          words={todayWords}
          target={dailyTarget}
          loading={currentLoading}
        />
        <ProgressRow
          label="Week"
          words={weekWords}
          target={weeklyTarget}
          loading={currentLoading}
        />
        <ProgressRow label="Month" words={monthWords} target={target} loading={currentLoading} />
        <ProgressRow
          label="Year"
          words={yearWords}
          target={yearlyTarget}
          loading={currentLoading}
        />
      </div>
    ),
    'goal-history': (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Goal History — {mn} {year}
        </h2>
        {loading ? (
          <div className="text-gray-400 text-sm py-4 text-center">Loading…</div>
        ) : (
          <GoalHistory
            year={year}
            month={month}
            daily={daily}
            goals={goals}
            defaultMonthlyTarget={target}
          />
        )}
      </div>
    ),
    'words-by-day': (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Words by Day — {mn} {year}
        </h2>
        {loading ? (
          <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
            Loading…
          </div>
        ) : (
          <WordsByDayChart data={daily} month={month} year={year} />
        )}
      </div>
    ),
    'words-by-project': (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Words by Project — {mn} {year}
        </h2>
        {loading ? (
          <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
            Loading…
          </div>
        ) : (
          <WordsByProjectChart data={projects} />
        )}
      </div>
    ),
    activity: (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Activity — {mn} {year}
        </h2>
        {loading ? (
          <div className="text-gray-400 text-sm py-4 text-center">Loading…</div>
        ) : (
          <ActivityGrid
            year={year}
            month={month}
            projects={projectNames}
            data={activity}
            onChange={setActivity}
          />
        )}
      </div>
    ),
    'monthly-overview': (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{year} Overview</h2>
        {loading ? (
          <div className="text-gray-400 text-sm py-4 text-center">Loading…</div>
        ) : (
          <MonthlyTable data={yearly} target={target} year={year} />
        )}
      </div>
    ),
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500"
          >
            ←
          </button>
          <span className="text-sm font-medium w-36 text-center">
            {mn} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500"
          >
            →
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {order.map((id) => (
        <div key={id}>{sections[id]}</div>
      ))}
    </div>
  )
}
