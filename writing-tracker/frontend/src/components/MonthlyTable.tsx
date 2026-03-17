import type { MonthlyStat } from '../lib/api'

interface Props {
  data: MonthlyStat[]
  target: number
  year: number
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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getProjected(words: number, year: number, month: number): number | null {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  if (year > currentYear || (year === currentYear && month > currentMonth)) return null
  if (year < currentYear || month < currentMonth) return null

  const dayOfMonth = now.getDate()
  const days = daysInMonth(year, month)
  if (dayOfMonth === 0) return words
  return Math.round((words / dayOfMonth) * days)
}

export default function MonthlyTable({ data, target, year }: Props) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const byMonth: Record<number, number> = {}
  data.forEach((d) => {
    byMonth[d.month] = d.words
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 pr-4 font-medium text-gray-500 w-32">Month</th>
            <th className="text-right py-2 px-4 font-medium text-gray-500">Words Written</th>
            <th className="text-right py-2 px-4 font-medium text-gray-500">Target</th>
            <th className="text-right py-2 pl-4 font-medium text-gray-500">Projected</th>
          </tr>
        </thead>
        <tbody>
          {MONTH_NAMES.map((name, i) => {
            const month = i + 1
            const words = byMonth[month] ?? 0
            const isFuture = year > currentYear || (year === currentYear && month > currentMonth)
            const isCurrent = year === currentYear && month === currentMonth
            const projected = isCurrent ? getProjected(words, year, month) : null

            let statusEl: React.ReactNode = null
            if (!isFuture && target > 0) {
              const compare = isCurrent ? (projected ?? words) : words
              if (compare >= target) {
                statusEl = <span className="text-green-600 ml-1">✓</span>
              } else if (compare > 0) {
                statusEl = <span className="text-amber-500 ml-1">~</span>
              }
            }

            return (
              <tr
                key={month}
                className={`border-b border-gray-100 ${isCurrent ? 'bg-blue-50' : ''}`}
              >
                <td className="py-2 pr-4 font-medium text-gray-700">
                  {name}
                  {isCurrent && <span className="ml-2 text-xs text-blue-500 font-normal">now</span>}
                </td>
                <td className="text-right py-2 px-4 tabular-nums">
                  {isFuture ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <span className={words === 0 ? 'text-gray-300' : 'text-gray-900'}>
                      {words.toLocaleString()}
                    </span>
                  )}
                  {statusEl}
                </td>
                <td className="text-right py-2 px-4 tabular-nums text-gray-400">
                  {target > 0 ? target.toLocaleString() : '—'}
                </td>
                <td className="text-right py-2 pl-4 tabular-nums">
                  {isCurrent && projected !== null ? (
                    <span
                      className={
                        projected >= target && target > 0 ? 'text-green-600' : 'text-gray-600'
                      }
                    >
                      {projected.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
