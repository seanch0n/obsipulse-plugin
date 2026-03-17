import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ProjectStat } from '../lib/api'

interface Props {
  data: ProjectStat[]
}

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16']

export default function WordsByProjectChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
        No data yet
      </div>
    )
  }

  const colored = data.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={colored} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="project"
          tick={{ fontSize: 12, fill: '#374151' }}
          tickLine={false}
          axisLine={false}
          width={90}
        />
        <Tooltip
          formatter={(v: number) => [v.toLocaleString(), 'Words']}
          contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="words" radius={[0, 3, 3, 0]} maxBarSize={28} fill="#3b82f6" />
      </BarChart>
    </ResponsiveContainer>
  )
}
