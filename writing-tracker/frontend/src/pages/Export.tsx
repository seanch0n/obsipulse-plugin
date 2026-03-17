import { useEffect, useState, useRef, useCallback, forwardRef } from 'react'
import { toPng } from 'html-to-image'
import {
  getDailyStats,
  getProjectStats,
  getActivity,
  getTargets,
  getGoals,
  type DailyStat,
  type ProjectStat,
  type ActivityEntry,
  type Goal,
} from '../lib/api'

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

function pad(n: number) {
  return n.toString().padStart(2, '0')
}
function mkDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`
}
function mkMonthKey(y: number, m: number) {
  return `${y}-${pad(m)}`
}
function mkWeekKey(y: number, m: number, w: number) {
  return `${y}-${pad(m)}-W${w}`
}

function resolveMonthly(goals: Goal[], mk: string, def: number) {
  return goals.find((g) => g.period_type === 'monthly' && g.period_key === mk)?.target ?? def
}
function resolveDailyTarget(goals: Goal[], ds: string, mk: string, def: number) {
  const explicit = goals.find((g) => g.period_type === 'daily' && g.period_key === ds)
  if (explicit) return explicit.target
  const m = resolveMonthly(goals, mk, def)
  return m > 0 ? Math.round(m / 30) : 0
}
function resolveWeeklyTarget(goals: Goal[], wk: string, mk: string, def: number) {
  const explicit = goals.find((g) => g.period_type === 'weekly' && g.period_key === wk)
  if (explicit) return explicit.target
  const m = resolveMonthly(goals, mk, def)
  return m > 0 ? Math.round((m * 12) / 52) : 0
}

// Square fill: green rising from bottom. Empty = visible against the card's dark navy.
const FILL = '#22c55e'
const EMPTY = 'rgba(0,0,0,0.55)' // dark overlay, always visibly darker than the card gradient behind it

function fillStyle(pct: number): React.CSSProperties {
  const f = Math.min(pct, 100)
  return { background: `linear-gradient(to top, ${FILL} ${f}%, ${EMPTY} ${f}%)` }
}
function emptyStyle(): React.CSSProperties {
  return { background: EMPTY }
}
function futureStyle(): React.CSSProperties {
  return { background: 'rgba(0,0,0,0.25)' }
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  year: number
  month: number
  totalWords: number
  monthlyTarget: number
  projects: ProjectStat[]
  activity: ActivityEntry[]
  daily: DailyStat[]
  goals: Goal[]
  defaultMonthlyTarget: number
}

const ExportCard = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      year,
      month,
      totalWords,
      monthlyTarget,
      projects,
      activity,
      daily,
      goals,
      defaultMonthlyTarget,
    },
    ref
  ) => {
    const mn = MONTH_NAMES[month - 1]
    const daysInMonth = new Date(year, month, 0).getDate()
    const goalPct = monthlyTarget > 0 ? Math.round((totalWords / monthlyTarget) * 100) : null
    const goalMet = goalPct !== null && goalPct >= 100
    const mk = mkMonthKey(year, month)

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

    // Words per day
    const wordsByDate: Record<string, number> = {}
    daily.forEach((d) => {
      wordsByDate[d.date] = d.words
    })

    // Active days
    const activeDays = [...new Set(activity.map((e) => e.date))].filter((d) => d <= todayStr).length

    // Projects
    const sorted = [...projects].sort((a, b) => b.words - a.words)
    const top = sorted.slice(0, 5)
    const otherWords = sorted.slice(5).reduce((s, p) => s + p.words, 0)
    const displayProjects = otherWords > 0 ? [...top, { project: 'Other', words: otherWords }] : top
    const maxProjectWords = displayProjects[0]?.words ?? 1

    // Activity breakdown
    const writingDays = activity.filter((e) => e.writing).length
    const editingDays = activity.filter((e) => e.editing).length
    const planningDays = activity.filter((e) => e.planning).length

    // Daily goal pcts (null = future, number = past/today)
    const dailyPcts: (number | null)[] = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1
      const ds = mkDateStr(year, month, d)
      if (ds > todayStr) return null
      const words = wordsByDate[ds] ?? 0
      const target = resolveDailyTarget(goals, ds, mk, defaultMonthlyTarget)
      if (target === 0) return words > 0 ? 100 : 0
      return Math.round((words / target) * 100)
    })

    // Weekly goal pcts — 4 fixed blocks
    const weekBlocks = [
      { start: 1, end: 7 },
      { start: 8, end: 14 },
      { start: 15, end: 21 },
      { start: 22, end: daysInMonth },
    ]
    const weeklyPcts: (number | null)[] = weekBlocks.map(({ start, end }, i) => {
      const firstDs = mkDateStr(year, month, start)
      if (firstDs > todayStr) return null
      const wk = mkWeekKey(year, month, i + 1)
      const target = resolveWeeklyTarget(goals, wk, mk, defaultMonthlyTarget)
      let words = 0
      for (let d = start; d <= end; d++) words += wordsByDate[mkDateStr(year, month, d)] ?? 0
      if (target === 0) return words > 0 ? 100 : 0
      return Math.round((words / target) * 100)
    })

    // Daily grid: 7 per row, pad last row with nulls
    const SQ = 22 // square size px
    const GAP = 3 // gap px
    const ROW = 7
    const rows: (number | null | undefined)[][] = []
    for (let i = 0; i < daysInMonth; i += ROW) {
      const row: (number | null | undefined)[] = dailyPcts.slice(i, i + ROW)
      while (row.length < ROW) row.push(undefined) // padding
      rows.push(row)
    }

    const T = {
      card: {
        width: 1200,
        minHeight: 630,
        background: 'linear-gradient(135deg, #0f172a 0%, #1a2744 50%, #0f172a 100%)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
      },
      label: {
        fontSize: 10,
        letterSpacing: '0.12em',
        color: '#475569',
        textTransform: 'uppercase' as const,
        fontWeight: 600,
        marginBottom: 10,
      },
    }

    const sq = (style: React.CSSProperties) => ({
      width: SQ,
      height: SQ,
      borderRadius: 3,
      flexShrink: 0,
      boxSizing: 'border-box' as const,
      ...style,
    })

    return (
      <div ref={ref} style={T.card}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '28px 48px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span
            style={{
              fontSize: 13,
              letterSpacing: '0.15em',
              color: '#64748b',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            W.K. Rust Books
          </span>
          <span style={{ fontSize: 28, fontWeight: 700 }}>
            {mn} {year}
          </span>
        </div>

        {/* Top — words/goal bar  |  daily + weekly goal squares */}
        <div style={{ display: 'flex', flex: 1 }}>
          {/* Left top */}
          <div
            style={{
              flex: '0 0 560px',
              padding: '36px 48px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div>
              <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1, letterSpacing: '-2px' }}>
                {totalWords.toLocaleString()}
              </div>
              <div style={{ fontSize: 15, color: '#94a3b8', marginTop: 6 }}>
                words written · {activeDays} active {activeDays === 1 ? 'day' : 'days'}
              </div>
            </div>
            {monthlyTarget > 0 && goalPct !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    color: '#94a3b8',
                  }}
                >
                  <span>Monthly goal: {monthlyTarget.toLocaleString()} words</span>
                  <span style={{ color: goalMet ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>
                    {goalPct}%{goalMet ? ' ✓' : ''}
                  </span>
                </div>
                <div
                  style={{ height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 4,
                      width: `${Math.min(goalPct, 100)}%`,
                      background: goalMet
                        ? 'linear-gradient(90deg,#16a34a,#22c55e)'
                        : 'linear-gradient(90deg,#d97706,#f59e0b)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right top — daily squares + weekly squares */}
          <div
            style={{
              flex: 1,
              padding: '32px 40px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Daily */}
            <div>
              <div style={T.label}>Daily Goals</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                {rows.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: GAP }}>
                    {row.map((pct, ci) => {
                      const day = ri * ROW + ci + 1
                      const isReal = day <= daysInMonth
                      return (
                        <div
                          key={ci}
                          style={sq(
                            !isReal
                              ? { background: 'transparent', border: 'none' }
                              : pct == null
                                ? futureStyle()
                                : fillStyle(pct)
                          )}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly */}
            <div>
              <div style={T.label}>Weekly Goals</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {weeklyPcts.map((pct, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <div
                      style={sq({
                        width: 32,
                        height: 32,
                        ...(pct === null ? futureStyle() : fillStyle(pct)),
                      })}
                    />
                    <span style={{ fontSize: 9, color: '#475569' }}>W{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Full-width divider — perfectly aligned across both columns */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />

        {/* Bottom — projects  |  activity bars */}
        <div style={{ display: 'flex' }}>
          {/* Left bottom */}
          <div
            style={{
              flex: '0 0 560px',
              padding: '24px 48px 36px',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {displayProjects.length > 0 && (
              <div>
                <div style={T.label}>By Project</div>
                {displayProjects.map((p) => (
                  <div
                    key={p.project}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: '#cbd5e1',
                        width: 110,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.project}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: '#1e293b',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 3,
                          width: `${Math.round((p.words / maxProjectWords) * 100)}%`,
                          background: 'linear-gradient(90deg,#2563eb,#3b82f6)',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', width: 48, textAlign: 'right' }}>
                      {p.words >= 1000 ? `${(p.words / 1000).toFixed(1)}k` : p.words}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right bottom */}
          <div style={{ flex: 1, padding: '24px 40px 36px' }}>
            <div style={T.label}>Activity Breakdown</div>
            {(() => {
              const items = [
                { label: 'Writing', days: writingDays, color: '#3b82f6' },
                { label: 'Editing', days: editingDays, color: '#f59e0b' },
                { label: 'Planning', days: planningDays, color: '#8b5cf6' },
              ]
              const maxDays = Math.max(...items.map((x) => x.days), 1)
              return items.map(({ label, days, color }) => (
                <div
                  key={label}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}
                >
                  <div style={{ fontSize: 12, color: '#cbd5e1', width: 56, whiteSpace: 'nowrap' }}>
                    {label}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: '#1e293b',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 3,
                        width: `${Math.round((days / maxDays) * 100)}%`,
                        background: color,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', width: 36, textAlign: 'right' }}>
                    {days}d
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 48px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, color: '#334155' }}>Writing Tracker</span>
          <span style={{ fontSize: 12, color: '#334155' }}>
            {mn} {year}
          </span>
        </div>
      </div>
    )
  }
)

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Export() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const [totalWords, setTotalWords] = useState(0)
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [projects, setProjects] = useState<ProjectStat[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [monthlyTarget, setMonthlyTarget] = useState(0)
  const [goals, setGoals] = useState<Goal[]>([])
  const [defaultMonthlyTarget, setDefaultMonthlyTarget] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [daily, proj, act, tgt, gs] = await Promise.all([
        getDailyStats(year, month),
        getProjectStats(year, month),
        getActivity(year, month),
        getTargets(),
        getGoals(year, month),
      ])
      setTotalWords(daily.reduce((s, d) => s + d.words, 0))
      setDailyStats(daily)
      setProjects(proj)
      setActivity(act)
      setGoals(gs)
      setDefaultMonthlyTarget(tgt.monthly_target)
      const stored = gs.find((g: Goal) => g.period_type === 'monthly')
      setMonthlyTarget(stored ? stored.target : tgt.monthly_target)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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

  const download = async () => {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `writing-stats-${year}-${pad(month)}.png`
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Export Stats</h1>
        <button
          onClick={download}
          disabled={downloading || loading}
          className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {downloading ? 'Generating…' : '↓ Download PNG'}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-200 text-gray-500">
          ←
        </button>
        <span className="text-sm font-medium w-36 text-center">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-200 text-gray-500">
          →
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl shadow-lg">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-xl">
            Loading…
          </div>
        ) : (
          <ExportCard
            ref={cardRef}
            year={year}
            month={month}
            totalWords={totalWords}
            monthlyTarget={monthlyTarget}
            projects={projects}
            activity={activity}
            daily={dailyStats}
            goals={goals}
            defaultMonthlyTarget={defaultMonthlyTarget}
          />
        )}
      </div>
      <p className="text-xs text-gray-400 text-center">
        Downloads at 2× resolution (2400×1260px) for crisp sharing.
      </p>
    </div>
  )
}
