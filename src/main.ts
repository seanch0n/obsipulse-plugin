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

  private getDeviceName(): string {
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
  // Returns null if the file should be ignored.
  private getProjectForFile(filepath: string): string | null {
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

    return 'default'
  }

  private getProjectWordCounts(): Record<string, number> {
    const counts: Record<string, number> = {}

    // Sum across all devices that have been active today.
    // Obsidian Sync shares the settings file, so other devices' data is available here.
    for (const deviceData of Object.values(this.settings.devices)) {
      // Skip devices that haven't tracked anything today
      if (!Object.prototype.hasOwnProperty.call(deviceData.dayCounts, this.today)) continue

      for (const [filepath, wc] of Object.entries(deviceData.todaysWordCount)) {
        const project = this.getProjectForFile(filepath)
        if (project === null) continue
        const words = Math.max(0, wc.current - wc.initial)
        if (words > 0) counts[project] = (counts[project] ?? 0) + words
      }
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

    // File menu: Start Writing Sprint
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        menu.addItem((item) =>
          item
            .setTitle('Start Writing Sprint')
            .setIcon('timer')
            .onClick(() => this.startSprint(file as TFile))
        )
      })
    )

    this.registerEvent(this.app.workspace.on('quick-preview', this.onQuickPreview.bind(this)))

    // Save and update date periodically
    this.registerInterval(
      window.setInterval(() => {
        this.updateDate()
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
      }, 30 * 1000)
    )

    this.addSettingTab(new WritingTrackerSettingTab(this.app, this))
  }

  async startSprint(file: TFile) {
    const { workspace } = this.app
    let leaf = workspace.getRightLeaf(false)
    if (!leaf) {
      leaf = workspace.getLeaf('split', 'vertical')
    }
    await leaf.setViewState({ type: SPRINT_VIEW_TYPE, active: true })
    workspace.revealLeaf(leaf)

    const view = leaf.view as SprintView
    await view.initSprint(file)
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
    if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
      this.debouncedUpdate?.(contents, file.path)
    }
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

    const deviceData = this.getLocalData()
    console.log('[writing-tracker] todaysWordCount paths:', Object.keys(deviceData.todaysWordCount))
    console.log('[writing-tracker] configured projects:', JSON.stringify(this.settings.projects))

    const projects = this.getProjectWordCounts()
    console.log('[writing-tracker] computed project counts:', JSON.stringify(projects))

    if (Object.keys(projects).length === 0) return

    try {
      await requestUrl({
        method: 'POST',
        url: `${serverUrl}/api/sync`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ date: this.today, projects }),
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
