import { useEffect, useState, useCallback } from 'react'
import {
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getProjectNames,
  type StatEntry,
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

interface EditState {
  date: string
  project: string
  word_count: number
}

export default function History() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [entries, setEntries] = useState<StatEntry[]>([])
  const [projectNames, setProjectNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Edit state — null means not editing
  const [editing, setEditing] = useState<{ orig: StatEntry; draft: EditState } | null>(null)
  const [saving, setSaving] = useState(false)

  // Add form
  const [addDate, setAddDate] = useState('')
  const [addProject, setAddProject] = useState('')
  const [addWords, setAddWords] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setEntries(await getEntries(year, month))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  useEffect(() => {
    getProjectNames()
      .then(setProjectNames)
      .catch(() => {})
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

  const startEdit = (entry: StatEntry) => {
    setEditing({
      orig: entry,
      draft: { date: entry.date, project: entry.project, word_count: entry.word_count },
    })
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await updateEntry(editing.orig.date, editing.orig.project, {
        newDate: editing.draft.date,
        newProject: editing.draft.project,
        word_count: editing.draft.word_count,
      })
      setEditing(null)
      fetchEntries()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (entry: StatEntry) => {
    if (
      !confirm(
        `Delete ${entry.word_count.toLocaleString()} words for "${entry.project}" on ${entry.date}?`
      )
    )
      return
    try {
      await deleteEntry(entry.date, entry.project)
      setEntries((prev) =>
        prev.filter((e) => !(e.date === entry.date && e.project === entry.project))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    if (!addDate || !addProject || !addWords) {
      setAddError('All fields are required')
      return
    }
    const words = parseInt(addWords)
    if (isNaN(words) || words < 0) {
      setAddError('Word count must be a positive number')
      return
    }
    setAdding(true)
    try {
      await createEntry(addDate, addProject.trim(), words)
      setAddDate('')
      setAddProject('')
      setAddWords('')
      // If the new entry falls in the current view, refresh
      const [entryYear, entryMonth] = addDate.split('-').map(Number)
      if (entryYear === year && entryMonth === month) fetchEntries()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add entry')
    } finally {
      setAdding(false)
    }
  }

  const inputCls =
    'border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">History</h1>

      {/* Add entry form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Add entry</h2>
        <p className="text-sm text-gray-500">
          Manually record writing for any date — useful for importing past data.
        </p>
        {addError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{addError}</p>}
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
            <select
              value={addProject}
              onChange={(e) => setAddProject(e.target.value)}
              className={`${inputCls} w-44`}
            >
              <option value="">Select project…</option>
              {projectNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Word count</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={addWords}
              onChange={(e) => setAddWords(e.target.value)}
              className={`${inputCls} w-32`}
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Entries</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={prevMonth}
              className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            >
              ←
            </button>
            <span className="text-sm font-medium w-36 text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            >
              →
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No entries for this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-500">Date</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">Project</th>
                <th className="text-right py-2 pr-4 font-medium text-gray-500">Words</th>
                <th className="py-2 w-32" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isEditing =
                  editing?.orig.date === entry.date && editing?.orig.project === entry.project

                if (isEditing && editing) {
                  return (
                    <tr
                      key={`${entry.date}-${entry.project}`}
                      className="border-b border-blue-100 bg-blue-50"
                    >
                      <td className="py-2 pr-4">
                        <input
                          type="date"
                          value={editing.draft.date}
                          onChange={(e) =>
                            setEditing(
                              (s) => s && { ...s, draft: { ...s.draft, date: e.target.value } }
                            )
                          }
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          value={editing.draft.project}
                          onChange={(e) =>
                            setEditing(
                              (s) => s && { ...s, draft: { ...s.draft, project: e.target.value } }
                            )
                          }
                          className={`${inputCls} w-36`}
                        >
                          {projectNames.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <input
                          type="number"
                          min={0}
                          value={editing.draft.word_count}
                          onChange={(e) =>
                            setEditing(
                              (s) =>
                                s && {
                                  ...s,
                                  draft: { ...s.draft, word_count: parseInt(e.target.value) || 0 },
                                }
                            )
                          }
                          className={`${inputCls} w-28 text-right`}
                        />
                      </td>
                      <td className="py-2 text-right space-x-2">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={`${entry.date}-${entry.project}`}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-2 pr-4 tabular-nums text-gray-700">{entry.date}</td>
                    <td className="py-2 pr-4 text-gray-700">{entry.project}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {entry.word_count.toLocaleString()}
                    </td>
                    <td className="py-2 text-right space-x-3">
                      <button
                        onClick={() => startEdit(entry)}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(entry)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
