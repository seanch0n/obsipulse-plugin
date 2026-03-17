import type { DailyStat, Goal } from '../lib/api'

interface Props {
  year: number
  month: number
  daily: DailyStat[]
  goals: Goal[]
  defaultMonthlyTarget: number
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}
function dateStr(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}
function monthKey(year: number, month: number) {
  return `${year}-${pad(month)}`
}
function weekKey(year: number, month: number, weekNum: number) {
  return `${year}-${pad(month)}-W${weekNum}`
}

// Fallback chain: specific goal → monthly goal for this month → default
function resolveMonthly(goals: Goal[], mk: string, defaultMonthly: number): number {
  return (
    goals.find((g) => g.period_type === 'monthly' && g.period_key === mk)?.target ?? defaultMonthly
  )
}
function resolveDailyTarget(goals: Goal[], ds: string, mk: string, defaultMonthly: number): number {
  const explicit = goals.find((g) => g.period_type === 'daily' && g.period_key === ds)
  if (explicit) return explicit.target
  const monthly = resolveMonthly(goals, mk, defaultMonthly)
  return monthly > 0 ? Math.round(monthly / 30) : 0
}
function resolveWeeklyTarget(
  goals: Goal[],
  wk: string,
  mk: string,
  defaultMonthly: number
): number {
  const explicit = goals.find((g) => g.period_type === 'weekly' && g.period_key === wk)
  if (explicit) return explicit.target
  const monthly = resolveMonthly(goals, mk, defaultMonthly)
  return monthly > 0 ? Math.round((monthly * 12) / 52) : 0
}

type Status = 'active' | 'future' | 'none'

const FILL_COLOR = '#22c55e' // green
const EMPTY_COLOR = '#1e293b' // dark slate

function pctToColor(pct: number): string {
  return FILL_COLOR
} // kept for legend

function Dot({
  status,
  pct,
  label,
  title,
}: {
  status: Status
  pct?: number
  label: string
  title?: string
}) {
  const fillPct = status === 'active' ? Math.min(pct ?? 0, 100) : 0
  const met = status === 'active' && (pct ?? 0) >= 100

  let cellStyle: React.CSSProperties
  if (status === 'future' || status === 'none') {
    cellStyle = { backgroundColor: '#e5e7eb' }
  } else {
    cellStyle = {
      background: `linear-gradient(to top, ${FILL_COLOR} ${fillPct}%, ${EMPTY_COLOR} ${fillPct}%)`,
    }
  }

  return (
    <div className="flex flex-col items-center gap-0.5" title={title}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium select-none"
        style={cellStyle}
      >
        {met && <span className="text-white text-[10px]">✓</span>}
      </div>
      <span className="text-[10px] text-gray-400 leading-none">{label}</span>
    </div>
  )
}

export default function GoalHistory({ year, month, daily, goals, defaultMonthlyTarget }: Props) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const wordsByDate: Record<string, number> = {}
  daily.forEach((d) => {
    wordsByDate[d.date] = d.words
  })

  const mk = monthKey(year, month)
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthlyTarget = resolveMonthly(goals, mk, defaultMonthlyTarget)

  if (monthlyTarget === 0 && goals.length === 0) {
    return (
      <p className="text-sm text-gray-400">No goals set for this month. Add goals in Settings.</p>
    )
  }

  // --- Daily ---
  const dayStatuses: {
    day: number
    status: Status
    pct?: number
    words: number
    target: number
  }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateStr(year, month, d)
    const words = wordsByDate[ds] ?? 0
    const target = resolveDailyTarget(goals, ds, mk, defaultMonthlyTarget)
    let status: Status
    let pct: number | undefined
    if (ds > todayStr) {
      status = 'future'
    } else if (target > 0) {
      status = 'active'
      pct = Math.round((words / target) * 100)
    } else {
      status = words > 0 ? 'active' : 'none'
      pct = words > 0 ? 100 : undefined
    }
    dayStatuses.push({ day: d, status, pct, words, target })
  }

  // --- Weekly (7-day blocks: 1-7, 8-14, 15-21, 22-28, 29-end) ---
  const weekBlocks: { start: number; end: number }[] = []
  for (let start = 1; start <= daysInMonth; start += 7) {
    weekBlocks.push({ start, end: Math.min(start + 6, daysInMonth) })
  }

  const weekStatuses = weekBlocks.map(({ start, end }, i) => {
    const wk = weekKey(year, month, i + 1)
    const target = resolveWeeklyTarget(goals, wk, mk, defaultMonthlyTarget)
    let words = 0
    for (let d = start; d <= end; d++) {
      words += wordsByDate[dateStr(year, month, d)] ?? 0
    }
    const lastDayStr = dateStr(year, month, end)
    const firstDayStr = dateStr(year, month, start)
    const hasPast = firstDayStr <= todayStr
    const weekComplete = lastDayStr < todayStr

    let status: Status
    let pct: number | undefined
    if (!hasPast) {
      status = 'future'
    } else if (target > 0) {
      status = 'active'
      pct = Math.round((words / target) * 100)
    } else {
      status = words > 0 ? 'active' : 'none'
      pct = words > 0 ? 100 : undefined
    }

    return {
      label: `W${i + 1}`,
      status,
      pct,
      title: `Week ${i + 1} (${start}–${end}): ${words.toLocaleString()} words / ${target.toLocaleString()} target${pct !== undefined ? ` (${pct}%)` : ''}`,
    }
  })

  // --- Monthly ---
  const monthTotal = daily.reduce((s, d) => s + d.words, 0)
  let monthStatus: Status
  let monthPct: number | undefined
  if (monthlyTarget > 0) {
    monthStatus = 'active'
    monthPct = Math.round((monthTotal / monthlyTarget) * 100)
  } else {
    monthStatus = monthTotal > 0 ? 'active' : 'none'
    monthPct = monthTotal > 0 ? 100 : undefined
  }

  // Group days into rows of 7
  const rows: (typeof dayStatuses)[] = []
  for (let i = 0; i < dayStatuses.length; i += 7) {
    rows.push(dayStatuses.slice(i, i + 7))
  }

  return (
    <div className="space-y-5">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="flex gap-1 items-center">
            {[0, 25, 50, 75, 100].map((p) => (
              <span
                key={p}
                className="w-4 h-4 rounded-full inline-block"
                style={{
                  background: `linear-gradient(to top, ${FILL_COLOR} ${p}%, ${EMPTY_COLOR} ${p}%)`,
                }}
              />
            ))}
          </span>
          0% → 100%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full inline-block bg-gray-200" />
          Upcoming
        </span>
      </div>

      {/* Daily */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Daily</p>
        <div className="space-y-1">
          {rows.map((row, ri) => (
            <div key={ri} className="flex gap-1">
              {row.map(({ day, status, pct, words, target }) => (
                <Dot
                  key={day}
                  status={status}
                  pct={pct}
                  label={String(day)}
                  title={`${dateStr(year, month, day)}: ${words.toLocaleString()} / ${target.toLocaleString()} words${pct !== undefined ? ` (${pct}%)` : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Weekly */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Weekly</p>
        <div className="flex flex-wrap gap-1">
          {weekStatuses.map(({ status, pct, label, title }) => (
            <Dot key={label} status={status} pct={pct} label={label} title={title} />
          ))}
        </div>
      </div>

      {/* Monthly */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Monthly</p>
        <div className="flex items-center gap-3">
          <Dot
            status={monthStatus}
            pct={monthPct}
            label="month"
            title={`${monthTotal.toLocaleString()} / ${monthlyTarget.toLocaleString()} words${monthPct !== undefined ? ` (${monthPct}%)` : ''}`}
          />
          <span className="text-sm text-gray-500">
            {monthTotal.toLocaleString()} / {monthlyTarget.toLocaleString()} words
            {monthlyTarget > 0 && (
              <span className="ml-1.5 text-gray-400">
                ({Math.round((monthTotal / monthlyTarget) * 100)}%)
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
