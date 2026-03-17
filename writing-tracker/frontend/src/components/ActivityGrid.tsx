import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { setActivity, type ActivityEntry } from '../lib/api'

interface Props {
  year: number
  month: number
  projects: string[]
  data: ActivityEntry[]
  onChange: (updated: ActivityEntry[]) => void
}

interface Flags {
  writing: boolean
  editing: boolean
  planning: boolean
}

const MODES: { key: keyof Flags; label: string; color: string; bg: string }[] = [
  { key: 'writing', label: 'Writing', color: '#3b82f6', bg: 'bg-blue-500' },
  { key: 'editing', label: 'Editing', color: '#fbbf24', bg: 'bg-amber-400' },
  { key: 'planning', label: 'Planning', color: '#8b5cf6', bg: 'bg-violet-500' },
]

function CellDisplay({ entry }: { entry: Flags | null }) {
  const active = MODES.filter((m) => entry?.[m.key])
  if (active.length === 0) return null

  if (active.length === 1) {
    return <div className={`w-full h-full rounded-sm ${active[0].bg}`} />
  }

  return (
    <div className="w-full h-full rounded-sm overflow-hidden flex flex-col">
      {active.map((m) => (
        <div key={m.key} className={`flex-1 ${m.bg}`} />
      ))}
    </div>
  )
}

interface PopoverProps {
  flags: Flags
  anchor: DOMRect
  onToggle: (key: keyof Flags) => void
  onClose: () => void
}

function Popover({ flags, anchor, onToggle, onClose }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const top = anchor.bottom + window.scrollY + 4
  const left = anchor.left + anchor.width / 2 + window.scrollX

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'absolute', top, left, transform: 'translateX(-50%)', zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-col gap-1 min-w-[110px]"
    >
      {MODES.map((m) => (
        <button
          key={m.key}
          onClick={() => onToggle(m.key)}
          className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-colors w-full text-left
            ${flags[m.key] ? 'text-white' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}
          style={flags[m.key] ? { backgroundColor: m.color } : {}}
        >
          <span
            className={`w-2.5 h-2.5 rounded-sm shrink-0 border ${flags[m.key] ? 'border-white/40' : 'border-gray-300'}`}
            style={flags[m.key] ? { backgroundColor: m.color } : {}}
          />
          {m.label}
        </button>
      ))}
    </div>,
    document.body
  )
}

export default function ActivityGrid({ year, month, projects, data, onChange }: Props) {
  const [openCell, setOpenCell] = useState<string | null>(null) // "project:day"
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())

  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthStr = month.toString().padStart(2, '0')

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  function getEntry(project: string, day: number): ActivityEntry | null {
    const date = `${year}-${monthStr}-${day.toString().padStart(2, '0')}`
    return data.find((e) => e.date === date && e.project === project) ?? null
  }

  function getFlags(project: string, day: number): Flags {
    const e = getEntry(project, day)
    return {
      writing: e?.writing ?? false,
      editing: e?.editing ?? false,
      planning: e?.planning ?? false,
    }
  }

  async function handleToggle(project: string, day: number, key: keyof Flags) {
    const cellKey = `${project}:${day}`
    if (pending.has(cellKey)) return

    const date = `${year}-${monthStr}-${day.toString().padStart(2, '0')}`
    const current = getFlags(project, day)
    const next = { ...current, [key]: !current[key] }

    setPending((s) => new Set(s).add(cellKey))
    try {
      await setActivity(date, project, next)
      const without = data.filter((e) => !(e.date === date && e.project === project))
      const anyActive = next.writing || next.editing || next.planning
      onChange(anyActive ? [...without, { date, project, ...next }] : without)
    } finally {
      setPending((s) => {
        const n = new Set(s)
        n.delete(cellKey)
        return n
      })
    }
  }

  if (projects.length === 0) {
    return <p className="text-sm text-gray-400">No projects tracked yet.</p>
  }

  const openParts = openCell ? openCell.split(':') : null
  const openProject = openParts ? openParts.slice(0, -1).join(':') : null
  const openDay = openParts ? parseInt(openParts[openParts.length - 1]) : null
  const openFlags = openProject && openDay ? getFlags(openProject, openDay) : null

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        {MODES.map((m) => (
          <span key={m.key} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: m.color }}
            />
            {m.label}
          </span>
        ))}
        <span className="text-gray-300">|</span>
        <span className="text-gray-400">Click a cell to toggle activity types</span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: `${96 + daysInMonth * 28}px` }}>
          {/* Day header */}
          <div className="flex">
            <div className="w-24 shrink-0" />
            {days.map((d) => {
              const date = `${year}-${monthStr}-${d.toString().padStart(2, '0')}`
              const dow = new Date(date).getDay()
              const isWeekend = dow === 0 || dow === 6
              const isToday = date === todayStr
              return (
                <div
                  key={d}
                  className={`w-6 mx-0.5 shrink-0 text-center text-xs leading-6 select-none
                  ${isToday ? 'font-bold text-blue-600' : isWeekend ? 'text-gray-300' : 'text-gray-400'}`}
                >
                  {d}
                </div>
              )
            })}
          </div>

          {/* Project rows */}
          {projects.map((project) => (
            <div key={project} className="flex items-center mb-2">
              <div
                className="w-24 shrink-0 pr-2 text-xs text-gray-600 font-medium truncate text-right"
                title={project}
              >
                {project}
              </div>
              {days.map((d) => {
                const cellKey = `${project}:${d}`
                const date = `${year}-${monthStr}-${d.toString().padStart(2, '0')}`
                const isFuture = date > todayStr
                const flags = getFlags(project, d)
                const hasAny = flags.writing || flags.editing || flags.planning
                const isOpen = openCell === cellKey

                return (
                  <div key={d} className="mx-0.5">
                    <button
                      onClick={(e) => {
                        if (isFuture) return
                        if (isOpen) {
                          setOpenCell(null)
                          setAnchorRect(null)
                        } else {
                          setOpenCell(cellKey)
                          setAnchorRect(
                            (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                          )
                        }
                      }}
                      disabled={pending.has(cellKey)}
                      title={project + ' · ' + date}
                      className={`w-6 h-6 rounded-sm transition-colors flex items-center justify-center
                        ${isFuture ? 'bg-gray-50 cursor-default' : hasAny ? 'ring-2 ring-offset-1 ring-gray-300 cursor-pointer' : 'bg-gray-100 hover:bg-gray-200 cursor-pointer'}
                        ${pending.has(cellKey) ? 'opacity-50' : ''}
                        ${isOpen ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                    >
                      {!isFuture && hasAny && (
                        <div className="w-full h-full rounded-sm overflow-hidden">
                          <CellDisplay entry={flags} />
                        </div>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {openCell && anchorRect && openFlags && openProject && openDay && (
        <Popover
          flags={openFlags}
          anchor={anchorRect}
          onToggle={(key) => handleToggle(openProject, openDay, key)}
          onClose={() => {
            setOpenCell(null)
            setAnchorRect(null)
          }}
        />
      )}
    </div>
  )
}
