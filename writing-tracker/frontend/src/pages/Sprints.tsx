import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ComposedChart,
  Line,
  Scatter,
} from 'recharts'
import { getSprints, type SprintRecord } from '../lib/api'

function wpm(s: SprintRecord): number {
  if (s.duration_seconds <= 0) return 0
  return Math.round((s.words_written / s.duration_seconds) * 60)
}

function hourBucket(ts: number): string {
  const h = new Date(ts).getHours()
  if (h >= 5 && h < 12) return 'Morning'
  if (h >= 12 && h < 17) return 'Afternoon'
  if (h >= 17 && h < 21) return 'Evening'
  return 'Night'
}

function durationBucket(minutes: number): string {
  if (minutes <= 15) return '≤15 min'
  if (minutes <= 25) return '20–25 min'
  if (minutes <= 35) return '30 min'
  if (minutes <= 50) return '45 min'
  return '60+ min'
}

const BUCKET_ORDER = ['Morning', 'Afternoon', 'Evening', 'Night']
const DUR_ORDER = ['≤15 min', '20–25 min', '30 min', '45 min', '60+ min']

function avgWpm(sprints: SprintRecord[]): number {
  const completed = sprints.filter((s) => s.completed && s.words_written > 0)
  if (completed.length === 0) return 0
  return Math.round(completed.reduce((sum, s) => sum + wpm(s), 0) / completed.length)
}

function groupAvgWpm<K extends string>(
  sprints: SprintRecord[],
  keyFn: (s: SprintRecord) => K
): { key: K; wpm: number; count: number }[] {
  const map = new Map<K, SprintRecord[]>()
  for (const s of sprints) {
    if (!s.completed || s.words_written <= 0) continue
    const k = keyFn(s)
    const arr = map.get(k) ?? []
    arr.push(s)
    map.set(k, arr)
  }
  return Array.from(map.entries()).map(([key, arr]) => ({
    key,
    wpm: avgWpm(arr),
    count: arr.length,
  }))
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }

export default function Sprints() {
  const [sprints, setSprints] = useState<SprintRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all')

  useEffect(() => {
    getSprints()
      .then(setSprints)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const years = Array.from(new Set(sprints.map((s) => new Date(s.started_at).getFullYear()))).sort(
    (a, b) => b - a
  )

  const filtered =
    yearFilter === 'all'
      ? sprints
      : sprints.filter((s) => new Date(s.started_at).getFullYear() === yearFilter)

  const completed = filtered.filter((s) => s.completed && s.words_written > 0)

  // Summary stats
  const totalSprints = filtered.length
  const totalWords = filtered.reduce((s, r) => s + r.words_written, 0)
  const completionRate =
    filtered.length > 0 ? Math.round((completed.length / filtered.length) * 100) : 0
  const bestWpm = completed.length > 0 ? Math.max(...completed.map(wpm)) : 0
  const overallAvgWpm = avgWpm(completed)

  // WPM by time of day
  const byTimeRaw = groupAvgWpm(
    completed,
    (s) => hourBucket(s.started_at) as ReturnType<typeof hourBucket>
  )
  const byTime = BUCKET_ORDER.map((key) => {
    const found = byTimeRaw.find((r) => r.key === key)
    return { bucket: key, wpm: found?.wpm ?? 0, count: found?.count ?? 0 }
  })

  // WPM by location
  const byLocationRaw = groupAvgWpm(
    completed.filter((s) => s.location),
    (s) => s.location!
  )
  const byLocation = byLocationRaw.sort((a, b) => b.wpm - a.wpm)

  // WPM by sprint duration
  const byDurRaw = groupAvgWpm(
    completed,
    (s) => durationBucket(s.goal_duration_minutes) as ReturnType<typeof durationBucket>
  )
  const byDuration = DUR_ORDER.map((key) => {
    const found = byDurRaw.find((r) => r.key === key)
    return { bucket: key, wpm: found?.wpm ?? 0, count: found?.count ?? 0 }
  }).filter((r) => r.count > 0)

  // WPM trend (chronological, completed only)
  const trendData = [...completed]
    .sort((a, b) => a.started_at - b.started_at)
    .map((s, i) => {
      const d = new Date(s.started_at)
      return {
        i,
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        wpm: wpm(s),
        project: s.project ?? s.file_name,
      }
    })

  // Moving average (window=5)
  const trendWithMa = trendData.map((row, i) => {
    const window = trendData.slice(Math.max(0, i - 4), i + 1)
    return { ...row, ma: Math.round(window.reduce((s, r) => s + r.wpm, 0) / window.length) }
  })

  // Recent sprints (all, sorted desc)
  const recent = [...filtered].sort((a, b) => b.started_at - a.started_at).slice(0, 20)

  if (loading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Sprint Analytics</h1>
        <select
          value={yearFilter}
          onChange={(e) =>
            setYearFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))
          }
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All time</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {totalSprints === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">
            No sprint data yet. Start a writing sprint from Obsidian!
          </p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard label="Total Sprints" value={totalSprints} />
            <StatCard label="Sprint Words" value={totalWords.toLocaleString()} />
            <StatCard label="Avg WPM" value={overallAvgWpm} sub="completed sprints" />
            <StatCard label="Best WPM" value={bestWpm} />
            <StatCard
              label="Completion"
              value={`${completionRate}%`}
              sub={`${completed.length} of ${totalSprints}`}
            />
          </div>

          {/* WPM by time of day */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Avg WPM by Time of Day</h2>
            {completed.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No completed sprints</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byTime} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 12, fill: '#374151' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    unit=" wpm"
                  />
                  <Tooltip
                    formatter={(
                      v: number,
                      _name: string,
                      props: { payload?: { count: number } }
                    ) => [`${v} wpm (${props.payload?.count ?? 0} sprints)`, 'Avg WPM']}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Bar dataKey="wpm" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* WPM by location + WPM by duration side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* By location */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Avg WPM by Location</h2>
              {byLocation.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  No location data — set a location when starting sprints
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, byLocation.length * 44)}>
                  <BarChart
                    data={byLocation.map((r) => ({ ...r, name: r.key }))}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                      unit=" wpm"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12, fill: '#374151' }}
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip
                      formatter={(
                        v: number,
                        _name: string,
                        props: { payload?: { count: number } }
                      ) => [`${v} wpm (${props.payload?.count ?? 0} sprints)`, 'Avg WPM']}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    <Bar dataKey="wpm" fill="#10b981" radius={[0, 3, 3, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* By sprint duration */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Avg WPM by Sprint Duration
              </h2>
              {byDuration.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">No completed sprints</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, byDuration.length * 44)}>
                  <BarChart
                    data={byDuration.map((r) => ({ ...r, name: r.bucket }))}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                      unit=" wpm"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12, fill: '#374151' }}
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip
                      formatter={(
                        v: number,
                        _name: string,
                        props: { payload?: { count: number } }
                      ) => [`${v} wpm (${props.payload?.count ?? 0} sprints)`, 'Avg WPM']}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    <Bar dataKey="wpm" fill="#f59e0b" radius={[0, 3, 3, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* WPM trend */}
          {trendWithMa.length >= 2 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">WPM Trend</h2>
              <p className="text-xs text-gray-400 mb-4">
                Per-sprint WPM (blue dots) with 5-sprint moving average (red line)
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart
                  data={trendWithMa}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    unit=" wpm"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload as (typeof trendWithMa)[0]
                      return (
                        <div style={{ ...TOOLTIP_STYLE, background: '#fff', padding: '8px 12px' }}>
                          <p className="text-xs text-gray-500">{d.date}</p>
                          <p className="text-sm font-semibold">{d.wpm} wpm</p>
                          <p className="text-xs text-gray-400">{d.project}</p>
                          <p className="text-xs text-gray-400">5-sprint avg: {d.ma} wpm</p>
                        </div>
                      )
                    }}
                  />
                  <Scatter dataKey="wpm" fill="#3b82f6" opacity={0.55} />
                  <Line
                    type="monotone"
                    dataKey="ma"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="5-sprint avg"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recent sprints table */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Recent Sprints{filtered.length > 20 ? ` (showing 20 of ${filtered.length})` : ''}
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Date</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">File</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Location</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Duration</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Words</th>
                  <th className="text-right py-2 font-medium text-gray-500">WPM</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => {
                  const d = new Date(s.started_at)
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  const mins = Math.round(s.duration_seconds / 60)
                  const w = wpm(s)
                  return (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 tabular-nums text-gray-700">{dateStr}</td>
                      <td className="py-2 pr-4 text-gray-700 max-w-[180px] truncate">
                        {s.project ?? s.file_name}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">{s.location ?? '—'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-700">
                        {mins}m
                        {!s.completed && (
                          <span className="ml-1 text-xs text-gray-400">(abandoned)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-700">
                        {s.words_written.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {s.words_written > 0 ? (
                          <span className={w >= overallAvgWpm ? 'text-green-600' : 'text-gray-700'}>
                            {w}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
