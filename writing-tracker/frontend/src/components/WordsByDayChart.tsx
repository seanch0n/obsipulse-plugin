import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { DailyStat } from '../lib/api'

interface Props {
  data: DailyStat[]
  month: number
  year: number
}

export default function WordsByDayChart({ data, month, year }: Props) {
  const daysInMonth = new Date(year, month, 0).getDate()

  // Fill every day of the month (missing days = 0)
  const filled = Array.from({ length: daysInMonth }, (_, i) => {
    const d = (i + 1).toString().padStart(2, '0')
    const date = `${year}-${month.toString().padStart(2, '0')}-${d}`
    const found = data.find((s) => s.date === date)
    return { day: i + 1, words: found?.words ?? 0 }
  })

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={filled} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          interval={4}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          formatter={(v: number) => [v.toLocaleString(), 'Words']}
          labelFormatter={(l: number) => `Day ${l}`}
          contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="words" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
