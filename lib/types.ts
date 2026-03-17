export interface WordCount {
  initial: number
  current: number
}

export interface DeviceData {
  dayCounts: Record<string, number>
  todaysWordCount: Record<string, WordCount>
}

export interface ProjectMapping {
  folder: string
  name: string
}

export interface WritingTrackerSettings {
  serverUrl: string
  apiKey: string
  devices: Record<string, DeviceData>
  timezone: string
  projects: ProjectMapping[]
  ignoredPaths: string[]
  statusBarStats: boolean
  locations: string[]
  defaultSprintMinutes: number
  defaultSprintWords: number
}

export interface SprintRecord {
  id: string
  file_name: string
  project: string | null
  started_at: number
  ended_at: number
  duration_seconds: number
  goal_duration_minutes: number
  goal_words: number
  words_written: number
  location: string | null
  completed: boolean
}

export interface DailyCountItem {
  key: string
  value: number
  date: Date
}
