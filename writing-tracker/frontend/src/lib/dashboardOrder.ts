export const SECTIONS = [
  { id: 'progress', label: 'Progress' },
  { id: 'goal-history', label: 'Goal History' },
  { id: 'words-by-day', label: 'Words by Day' },
  { id: 'words-by-project', label: 'Words by Project' },
  { id: 'activity', label: 'Activity Grid' },
  { id: 'monthly-overview', label: 'Monthly Overview' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

const KEY = 'wt_dashboard_order'
const DEFAULT_ORDER: SectionId[] = SECTIONS.map((s) => s.id)

export function getOrder(): SectionId[] {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as SectionId[]
      const valid = parsed.filter((id): id is SectionId => DEFAULT_ORDER.includes(id as SectionId))
      const missing = DEFAULT_ORDER.filter((id) => !valid.includes(id))
      return [...valid, ...missing]
    }
  } catch {}
  return DEFAULT_ORDER
}

export function saveOrder(order: SectionId[]) {
  localStorage.setItem(KEY, JSON.stringify(order))
}
