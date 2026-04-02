import {
  App,
  Debouncer,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  debounce,
  requestUrl,
} from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import { DeviceData, WritingTrackerSettings, ProjectMapping, SprintRecord } from '@/lib/types'
import { getLocalTodayDate } from './helpers/getLocalTodayDate'
import { SprintView, SPRINT_VIEW_TYPE } from './views/SprintView'

const getTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

const DEFAULT_SETTINGS: WritingTrackerSettings = {
  serverUrl: '',
  apiKey: '',
  devices: {},
  timezone: getTimezone(),
  projects: [],
  ignoredPaths: [],
  statusBarStats: true,
  locations: [],
  defaultSprintMinutes: 25,
  defaultSprintWords: 500,
  defaultCooldownMinutes: 0,
}

class WritingTrackerSettingTab extends PluginSettingTab {
  plugin: WritingTrackerPlugin

  constructor(app: App, plugin: WritingTrackerPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc(
        'The base URL of your writing tracker backend (e.g. https://writing-tracker-api.workers.dev)'
      )
      .addText((text) =>
        text
          .setPlaceholder('https://...')
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim().replace(/\/$/, '')
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your API key from the Writing Tracker web app.')
      .addText((text) =>
        text
          .setPlaceholder('wt_...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim()
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Test connection')
      .setDesc('Verify that the server URL and API key are configured correctly.')
      .addButton((btn) =>
        btn
          .setButtonText('Test')
          .setCta()
          .onClick(async () => {
            const { serverUrl, apiKey } = this.plugin.settings

            if (!serverUrl) {
              new Notice('Server URL is not set.')
              return
            }
            if (!apiKey) {
              new Notice('API key is not set.')
              return
            }

            btn.setButtonText('Testing...')
            btn.setDisabled(true)

            try {
              // Step 1: Check server is reachable
              try {
                await requestUrl({ url: `${serverUrl}/health`, method: 'GET' })
              } catch {
                new Notice('Could not reach server. Check that the URL is correct.')
                return
              }

              // Step 2: Validate API key by sending an empty sync (writes nothing)
              try {
                const resp = await requestUrl({
                  method: 'POST',
                  url: `${serverUrl}/api/sync`,
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                  },
                  body: JSON.stringify({ date: '2000-01-01', projects: {} }),
                })
                if (resp.status === 200) {
                  new Notice('Connection successful! Server URL and API key are valid.')
                } else {
                  new Notice(`Unexpected response (status ${resp.status}).`)
                }
              } catch (err: unknown) {
                const status = (err as { status?: number })?.status
                if (status === 401) {
                  new Notice('Server reachable but API key is invalid.')
                } else {
                  new Notice(`API key check failed (status ${status ?? 'unknown'}).`)
                }
              }
            } finally {
              btn.setButtonText('Test')
              btn.setDisabled(false)
            }
          })
      )

    containerEl.createEl('h3', { text: 'Projects', cls: 'setting-item-heading' })
    containerEl.createEl('p', {
      text: 'Map a vault folder to a project name. All files inside that folder are tracked under that project.',
      cls: 'setting-item-description',
    })

    const renderProjects = () => {
      projectsContainer.empty()

      this.plugin.settings.projects.forEach((project, index) => {
        const row = new Setting(projectsContainer)
          .addText((text) =>
            text
              .setPlaceholder('Folder path (e.g. IFH/IFH 1/Isekai For Hire B1)')
              .setValue(project.folder)
              .onChange(async (value) => {
                this.plugin.settings.projects[index].folder = value.trim().replace(/\\/g, '/')
                await this.plugin.saveSettings()
              })
          )
          .addText((text) =>
            text
              .setPlaceholder('Project name (e.g. IFH B1)')
              .setValue(project.name)
              .onChange(async (value) => {
                this.plugin.settings.projects[index].name = value.trim()
                await this.plugin.saveSettings()
              })
          )
          .addButton((btn) =>
            btn
              .setButtonText('Remove')
              .setWarning()
              .onClick(async () => {
                this.plugin.settings.projects.splice(index, 1)
                await this.plugin.saveSettings()
                renderProjects()
              })
          )

        // Style the two text inputs to share the row evenly
        row.controlEl.querySelectorAll('input[type="text"]').forEach((el) => {
          ;(el as HTMLInputElement).style.width = '220px'
        })
      })

      new Setting(projectsContainer).addButton((btn) =>
        btn
          .setButtonText('+ Add project')
          .setCta()
          .onClick(async () => {
            this.plugin.settings.projects.push({ folder: '', name: '' })
            await this.plugin.saveSettings()
            renderProjects()
          })
      )
    }

    const projectsContainer = containerEl.createDiv()
    renderProjects()

    containerEl.createEl('h3', { text: 'Sprint Defaults', cls: 'setting-item-heading' })

    new Setting(containerEl)
      .setName('Default sprint duration (minutes)')
      .setDesc('The default duration in minutes for a writing sprint.')
      .addText((text) =>
        text
          .setPlaceholder('25')
          .setValue(String(this.plugin.settings.defaultSprintMinutes))
          .onChange(async (value) => {
            const parsed = parseInt(value)
            if (!isNaN(parsed) && parsed > 0) {
              this.plugin.settings.defaultSprintMinutes = parsed
              await this.plugin.saveSettings()
            }
          })
      )

    new Setting(containerEl)
      .setName('Default sprint word goal')
      .setDesc('The default word count goal for a writing sprint.')
      .addText((text) =>
        text
          .setPlaceholder('500')
          .setValue(String(this.plugin.settings.defaultSprintWords))
          .onChange(async (value) => {
            const parsed = parseInt(value)
            if (!isNaN(parsed) && parsed >= 0) {
              this.plugin.settings.defaultSprintWords = parsed
              await this.plugin.saveSettings()
            }
          })
      )

    new Setting(containerEl)
      .setName('Cooldown between sprints (minutes)')
      .setDesc('Rest period automatically started after each sprint completes. 0 = no cooldown.')
      .addText((text) =>
        text
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.defaultCooldownMinutes ?? 0))
          .onChange(async (value) => {
            const parsed = parseInt(value)
            if (!isNaN(parsed) && parsed >= 0) {
              this.plugin.settings.defaultCooldownMinutes = parsed
              await this.plugin.saveSettings()
            }
          })
      )

    containerEl.createEl('h3', { text: 'Locations', cls: 'setting-item-heading' })
    containerEl.createEl('p', {
      text: 'Named locations (e.g. Home, Cafe, Library) to tag your writing sprints with.',
      cls: 'setting-item-description',
    })

    const renderLocations = () => {
      locationsContainer.empty()

      this.plugin.settings.locations.forEach((location, index) => {
        new Setting(locationsContainer)
          .addText((text) =>
            text
              .setPlaceholder('Location name (e.g. Home)')
              .setValue(location)
              .onChange(async (value) => {
                this.plugin.settings.locations[index] = value.trim()
                await this.plugin.saveSettings()
              })
          )
          .addButton((btn) =>
            btn
              .setButtonText('Remove')
              .setWarning()
              .onClick(async () => {
                this.plugin.settings.locations.splice(index, 1)
                await this.plugin.saveSettings()
                renderLocations()
              })
          )
      })

      new Setting(locationsContainer).addButton((btn) =>
        btn
          .setButtonText('+ Add location')
          .setCta()
          .onClick(async () => {
            this.plugin.settings.locations.push('')
            await this.plugin.saveSettings()
            renderLocations()
          })
      )
    }

    const locationsContainer = containerEl.createDiv()
    renderLocations()

    new Setting(containerEl)
      .setName('Ignored Paths')
      .setDesc(
        'Files to exclude from tracking. One entry per line. A bare name like "notes" ignores any folder named "notes" anywhere in your vault. A path with slashes like "Project/notes" only ignores that specific location.'
      )
      .addTextArea((area) =>
        area
          .setPlaceholder('Templates\nDaily Notes/private')
          .setValue(this.plugin.settings.ignoredPaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.ignoredPaths = value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Hide Status Bar')
      .setDesc("Hide today's word count from the status bar.")
      .addToggle((toggle) =>
        toggle.setValue(!this.plugin.settings.statusBarStats).onChange(async (value) => {
          this.plugin.settings.statusBarStats = !value
          this.plugin.updateStatusBarIfNeeded()
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Reset today\u2019s word count')
      .setDesc('Clear all tracked word counts for today. This cannot be undone.')
      .addButton((btn) =>
        btn
          .setButtonText('Reset')
          .setWarning()
          .onClick(async () => {
            // Collect all projects that had words today BEFORE clearing,
            // so we can tell the server to set them to 0
            const projectsToZero: Set<string> = new Set()
            for (const deviceData of Object.values(this.plugin.settings.devices)) {
              if (Object.prototype.hasOwnProperty.call(deviceData.dayCounts, this.plugin.today)) {
                for (const [filepath, wc] of Object.entries(deviceData.todaysWordCount)) {
                  const project = this.plugin.getProjectForFile(filepath)
                  if (project !== null && wc.current - wc.initial !== 0) {
                    projectsToZero.add(project)
                  }
                }
                deviceData.dayCounts[this.plugin.today] = 0
                deviceData.todaysWordCount = {}
              }
            }
            this.plugin.currentWordCount = 0
            this.plugin.updateStatusBarText()

            // Send 0 for each project that was tracked today
            if (projectsToZero.size > 0) {
              const { serverUrl, apiKey } = this.plugin.settings
              if (serverUrl && apiKey) {
                const zeroProjects: Record<string, number> = {}
                for (const p of projectsToZero) zeroProjects[p] = 0
                try {
                  await requestUrl({
                    method: 'POST',
                    url: `${serverUrl}/api/sync`,
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                      date: this.plugin.today,
                      device: this.plugin.getDeviceName(),
                      projects: zeroProjects,
                    }),
                  })
                } catch (err) {
                  console.error('[writing-tracker] reset sync failed', err)
                }
              }
            }

            await this.plugin.saveSettings()
            new Notice('Today\u2019s word count has been reset.')
          })
      )

    new Setting(containerEl).setName('Version').setDesc(this.plugin.manifest.version)
  }
}

export default class WritingTrackerPlugin extends Plugin {
  settings: WritingTrackerSettings
  statusBarEl: HTMLElement
  currentWordCount: number = 0
  today: string

  debouncedUpdate?: Debouncer<[contents: string, filepath: string], void>

  private hasCountChanged: boolean = false
  private deviceName: string
  // Tracks files being actively edited locally (filepath → timestamp)
  private recentLocalEdits = new Map<string, number>()
  // Tracks last interval tick to detect sleep/wake
  private lastTickTime: number = Date.now()
  // When true, ignore quick-preview events (used after wake from sleep)
  private suppressQuickPreview: boolean = false
  // Tracks last keyboard/mouse interaction to distinguish local edits from sync
  private lastUserInteraction: number = 0

  getDeviceName(): string {
    if (this.deviceName) return this.deviceName

    try {
      // @ts-ignore
      const syncPlugin = this.app.internalPlugins.plugins['sync'].instance
      this.deviceName = syncPlugin.deviceName
        ? syncPlugin.deviceName
        : syncPlugin.getDefaultDeviceName()
    } catch {
      // Obsidian Sync not available
    }

    if (!this.deviceName) {
      this.deviceName = this.app.vault.adapter.getName() || uuidv4()
    }

    return this.deviceName
  }

  private ensureDeviceExists(): void {
    if (!this.settings.devices) this.settings.devices = {}
    const name = this.getDeviceName()
    if (!this.settings.devices[name]) {
      this.settings.devices[name] = { dayCounts: {}, todaysWordCount: {} }
    }
    this.deviceName = name
  }

  private getLocalData(): DeviceData {
    this.ensureDeviceExists()
    return this.settings.devices[this.deviceName]
  }

  // Determines the project name for a file path.
  // Returns null if the file is ignored or not matched to any configured project.
  getProjectForFile(filepath: string): string | null {
    const normalizedPath = filepath.replace(/\\/g, '/')

    for (const ignored of this.settings.ignoredPaths) {
      const normalizedIgnored = ignored.replace(/\\/g, '/')
      if (normalizedIgnored.includes('/')) {
        // Contains a slash — prefix match from vault root
        if (
          normalizedPath === normalizedIgnored ||
          normalizedPath.startsWith(normalizedIgnored + '/')
        ) {
          return null
        }
      } else {
        // No slash — match this name as a path segment anywhere in the path
        if (
          normalizedPath === normalizedIgnored ||
          normalizedPath.startsWith(normalizedIgnored + '/') ||
          normalizedPath.includes('/' + normalizedIgnored + '/') ||
          normalizedPath.endsWith('/' + normalizedIgnored)
        ) {
          return null
        }
      }
    }

    // Sort longest folder path first so more specific matches win
    const sorted = [...this.settings.projects].sort((a, b) => b.folder.length - a.folder.length)
    for (const project of sorted) {
      if (normalizedPath.startsWith(project.folder + '/') || normalizedPath === project.folder) {
        return project.name
      }
    }

    return null
  }

  private getProjectWordCounts(): Record<string, number> {
    const counts: Record<string, number> = {}

    // Only count this device's words — the server stores per-device rows
    // and sums them in the stats endpoints.
    const deviceData = this.getLocalData()
    if (!Object.prototype.hasOwnProperty.call(deviceData.dayCounts, this.today)) return counts

    for (const [filepath, wc] of Object.entries(deviceData.todaysWordCount)) {
      const project = this.getProjectForFile(filepath)
      if (project === null) continue
      const words = Math.max(0, wc.current - wc.initial)
      counts[project] = (counts[project] ?? 0) + words
    }

    return counts
  }

  async onload() {
    console.log('[writing-tracker] loaded', this.manifest.version)

    await this.loadSettings()

    this.debouncedUpdate = debounce(
      (contents: string, filepath: string) => this.updateWordCount(contents, filepath),
      1000,
      false
    )

    this.ensureDeviceExists()
    const deviceData = this.getLocalData()
    this.updateDate()

    if (deviceData.dayCounts.hasOwnProperty(this.today)) {
      this.updateCounts()
    } else {
      this.currentWordCount = 0
    }

    this.initStatusBar()

    // Register sprint view
    this.registerView(SPRINT_VIEW_TYPE, (leaf) => new SprintView(leaf, this))

    // File menu: Open Sprint View
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu) => {
        menu.addItem((item) =>
          item
            .setTitle('Open Sprint View')
            .setIcon('timer')
            .onClick(() => this.openSprintView())
        )
      })
    )

    // Track actual user interaction (keyboard/mouse) to distinguish local edits from Obsidian Sync.
    // quick-preview fires for BOTH local typing and Sync file updates on open files,
    // so we need a separate signal to know if the user is actually at the keyboard.
    const onInteraction = () => {
      this.lastUserInteraction = Date.now()
    }
    document.addEventListener('keydown', onInteraction)
    document.addEventListener('mousedown', onInteraction)
    this.register(() => {
      document.removeEventListener('keydown', onInteraction)
      document.removeEventListener('mousedown', onInteraction)
    })

    this.registerEvent(this.app.workspace.on('quick-preview', this.onQuickPreview.bind(this)))

    // Listen for file modifications to handle two cases:
    // 1. Local edits (recent user interaction) → let quick-preview handle word count
    // 2. Obsidian Sync changes (no recent user interaction) → rebase initial so delta stays correct
    this.registerEvent(
      this.app.vault.on('modify', async (file: TFile) => {
        const lastEdit = this.recentLocalEdits.get(file.path) ?? 0
        const isLocalEdit = Date.now() - lastEdit < 5000

        if (isLocalEdit) {
          // Local edit — let quick-preview handle it (already debounced)
          return
        }

        // External change (Obsidian Sync) — rebase initial to prevent double-counting
        this.ensureDeviceExists()
        const deviceData = this.getLocalData()
        if (!deviceData.dayCounts.hasOwnProperty(this.today)) return
        if (!deviceData.todaysWordCount.hasOwnProperty(file.path)) return

        const contents = await this.app.vault.cachedRead(file)
        const newCount = this.getWordCount(contents)
        const entry = deviceData.todaysWordCount[file.path]
        // Shift initial by the same amount current changed, preserving only the local delta
        const externalDelta = newCount - entry.current
        entry.initial += externalDelta
        entry.current = newCount
        this.updateCounts()
      })
    )

    // Save and update date periodically, and refresh other devices' data from disk
    this.registerInterval(
      window.setInterval(async () => {
        const now = Date.now()
        const elapsed = now - this.lastTickTime
        this.lastTickTime = now

        // Detect wake from sleep: if >30s passed since last tick, the computer was asleep.
        // Rebase all tracked files so any Obsidian Sync changes during sleep don't count as local words.
        if (elapsed > 30000) {
          console.log(
            `[writing-tracker] detected wake from sleep (${Math.round(elapsed / 1000)}s gap), rebasing word counts`
          )
          this.suppressQuickPreview = true
          this.recentLocalEdits.clear()
          await this.rebaseAllTrackedFiles()
          // Allow quick-preview again after a short delay so any spurious wake events are ignored
          setTimeout(() => {
            this.suppressQuickPreview = false
          }, 5000)
        }

        this.updateDate()

        // Refresh other devices' data from disk for accurate status bar totals
        try {
          const stored = await this.loadData()
          if (stored?.devices) {
            for (const [device, data] of Object.entries(stored.devices)) {
              if (device === this.deviceName) continue
              this.settings.devices[device] = data as DeviceData
            }
          }
        } catch {
          // ignore — next interval will retry
        }

        this.updateCounts()
        this.updateStatusBarText()
        this.saveSettings()
      }, 5000)
    )

    // Sync to server on file-open (after writing in a file)
    this.registerEvent(
      this.app.workspace.on('file-open', (_file: TFile) => {
        if (this.hasCountChanged) {
          this.hasCountChanged = false
          this.syncToServer()
        }
      })
    )

    // When a file is moved/renamed, update its key in todaysWordCount so
    // project and ignore rules are re-evaluated against the new path.
    this.registerEvent(
      this.app.vault.on('rename', (file: TFile, oldPath: string) => {
        this.ensureDeviceExists()
        const deviceData = this.getLocalData()
        if (oldPath in deviceData.todaysWordCount) {
          deviceData.todaysWordCount[file.path] = deviceData.todaysWordCount[oldPath]
          delete deviceData.todaysWordCount[oldPath]
          this.updateCounts()
        }
      })
    )

    // Also sync periodically so you don't have to switch files
    this.registerInterval(
      window.setInterval(() => {
        if (this.hasCountChanged) {
          this.hasCountChanged = false
          this.syncToServer()
        }
      }, 5 * 1000)
    )

    this.addSettingTab(new WritingTrackerSettingTab(this.app, this))
  }

  async openSprintView() {
    const { workspace } = this.app
    let leaf = workspace.getRightLeaf(false)
    if (!leaf) {
      leaf = workspace.getLeaf('split', 'vertical')
    }
    await leaf.setViewState({ type: SPRINT_VIEW_TYPE, active: true })
    workspace.revealLeaf(leaf)
  }

  async syncSprint(record: SprintRecord) {
    const { serverUrl, apiKey } = this.settings
    if (!serverUrl || !apiKey) return

    // Flush any pending word counts immediately so sprint words hit daily totals
    await this.syncToServer()

    try {
      await requestUrl({
        method: 'POST',
        url: `${serverUrl}/api/sprints`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(record),
      })
    } catch (err) {
      console.error('[writing-tracker] sprint sync failed', err)
    }
  }

  onunload(): void {
    console.log('[writing-tracker] unloaded')
  }

  updateStatusBarIfNeeded() {
    if (this.settings.statusBarStats) {
      if (!this.statusBarEl) this.addStatusBar()
    } else {
      if (this.statusBarEl) {
        this.statusBarEl.remove()
        this.statusBarEl = undefined as unknown as HTMLElement
      }
    }
  }

  addStatusBar() {
    this.statusBarEl = this.addStatusBarItem()
    this.updateStatusBarText()
  }

  updateStatusBarText() {
    if (this.statusBarEl) {
      this.statusBarEl.setText(`${this.currentWordCount ?? 0} words today`)
    }
  }

  initStatusBar() {
    this.registerInterval(window.setInterval(() => this.updateStatusBarText(), 4000))
    if (this.settings.statusBarStats) this.addStatusBar()
  }

  onQuickPreview(file: TFile, contents: string) {
    if (this.suppressQuickPreview) return

    // quick-preview fires for BOTH local typing AND Obsidian Sync updates to open files.
    // Only treat it as a local edit if the user recently pressed a key or clicked.
    // Without this check, Sync file updates on an idle machine get counted as local words.
    const isUserActive = Date.now() - this.lastUserInteraction < 5000
    if (!isUserActive) return

    this.recentLocalEdits.set(file.path, Date.now())
    this.debouncedUpdate?.(contents, file.path)
  }

  // Re-read all tracked files and rebase initial/current so that any external
  // changes (e.g. Obsidian Sync during sleep) don't inflate the local delta.
  private async rebaseAllTrackedFiles() {
    this.ensureDeviceExists()
    const deviceData = this.getLocalData()
    if (!Object.prototype.hasOwnProperty.call(deviceData.dayCounts, this.today)) return

    for (const [filepath, entry] of Object.entries(deviceData.todaysWordCount)) {
      const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
      if (!(abstractFile instanceof TFile)) continue
      try {
        const contents = await this.app.vault.cachedRead(abstractFile)
        const newCount = this.getWordCount(contents)
        // Shift initial by the difference so the local delta is preserved
        const externalDelta = newCount - entry.current
        if (externalDelta !== 0) {
          entry.initial += externalDelta
          entry.current = newCount
        }
      } catch {
        // File may have been deleted — ignore
      }
    }
    this.updateCounts()
  }

  getWordCount(text: string): number {
    let words = 0
    const matches = text.match(
      /[a-zA-Z0-9_\u0392-\u03c9\u00c0-\u00ff\u0600-\u06ff]+|[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af]+/gm
    )
    if (matches) {
      for (const match of matches) {
        words += match.charCodeAt(0) > 19968 ? match.length : 1
      }
    }
    return words
  }

  updateWordCount(contents: string, filepath: string) {
    if (this.getProjectForFile(filepath) === null) return

    this.ensureDeviceExists()
    const deviceData = this.getLocalData()
    const curr = this.getWordCount(contents)

    if (deviceData.dayCounts.hasOwnProperty(this.today)) {
      if (deviceData.todaysWordCount.hasOwnProperty(filepath)) {
        deviceData.todaysWordCount[filepath].current = curr
      } else {
        deviceData.todaysWordCount[filepath] = { initial: curr, current: curr }
      }
    } else {
      deviceData.todaysWordCount = {}
      deviceData.todaysWordCount[filepath] = { initial: curr, current: curr }
    }

    this.updateCounts()
  }

  updateDate() {
    this.today = getLocalTodayDate()
    this.ensureDeviceExists()
    const deviceData = this.getLocalData()
    if (deviceData.dayCounts[this.today] === undefined) {
      deviceData.dayCounts[this.today] = 0
      deviceData.todaysWordCount = {}
    }
  }

  updateCounts() {
    this.ensureDeviceExists()
    const deviceData = this.getLocalData()

    // Store this device's contribution in its own dayCounts
    const thisDeviceCount = Object.values(deviceData.todaysWordCount)
      .map((wc) => Math.max(0, wc.current - wc.initial))
      .reduce((a, b) => a + b, 0)
    deviceData.dayCounts[this.today] = thisDeviceCount

    // Status bar shows combined total across all devices active today
    this.currentWordCount = Object.values(this.settings.devices)
      .filter((d) => Object.prototype.hasOwnProperty.call(d.dayCounts, this.today))
      .flatMap((d) => Object.values(d.todaysWordCount))
      .map((wc) => Math.max(0, wc.current - wc.initial))
      .reduce((a, b) => a + b, 0)

    this.hasCountChanged = true
  }

  async syncToServer() {
    const { serverUrl, apiKey } = this.settings
    if (!serverUrl || !apiKey) return

    const projects = this.getProjectWordCounts()

    if (Object.keys(projects).length === 0) return

    try {
      await requestUrl({
        method: 'POST',
        url: `${serverUrl}/api/sync`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          date: this.today,
          device: this.getDeviceName(),
          projects,
        }),
      })
    } catch (err) {
      console.error('[writing-tracker] sync failed', err)
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    this.settings.timezone = getTimezone()

    // Normalize any backslashes in stored project folder paths
    if (this.settings.projects) {
      this.settings.projects = this.settings.projects.map((p) => ({
        ...p,
        folder: p.folder.replace(/\\/g, '/'),
      }))
    }

    this.ensureDeviceExists()

    // Migrate old dayCounts/todaysWordCount top-level fields if present
    const raw = this.settings as any
    if (raw.dayCounts || raw.todaysWordCount) {
      const name = this.getDeviceName()
      if (!this.settings.devices[name]) {
        this.settings.devices[name] = { dayCounts: {}, todaysWordCount: {} }
      }
      if (raw.dayCounts) this.settings.devices[name].dayCounts = raw.dayCounts
      if (raw.todaysWordCount) this.settings.devices[name].todaysWordCount = raw.todaysWordCount
    }
  }

  async saveSettings() {
    if (Object.keys(this.settings).length === 0) return

    if (this.settings.devices && Object.keys(this.settings.devices).length > 0) {
      try {
        const stored = await this.loadData()
        if (stored?.devices) {
          delete stored.devices[this.deviceName]
          for (const [device, data] of Object.entries(stored.devices)) {
            this.settings.devices[device] = {
              ...(data as DeviceData),
              ...(this.settings.devices[device] ?? {}),
            }
          }
        }
      } catch (err) {
        console.error('[writing-tracker] error merging device settings', err)
      }
    }

    await this.saveData(this.settings)
  }
}
