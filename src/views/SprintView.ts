import { ItemView, Modal, Notice, TFile, WorkspaceLeaf } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'
import type WritingTrackerPlugin from '../main'

export const SPRINT_VIEW_TYPE = 'writing-tracker-sprint'

class EditSprintModal extends Modal {
  private goalMinutes: number
  private goalWords: number
  private cooldownMinutes: number
  private onSave: (minutes: number, words: number, cooldown: number) => void

  constructor(
    app: any,
    goalMinutes: number,
    goalWords: number,
    cooldownMinutes: number,
    onSave: (minutes: number, words: number, cooldown: number) => void
  ) {
    super(app)
    this.goalMinutes = goalMinutes
    this.goalWords = goalWords
    this.cooldownMinutes = cooldownMinutes
    this.onSave = onSave
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Edit Sprint Goals' })

    const row = (label: string) => {
      const r = contentEl.createDiv({ cls: 'setting-item' })
      r.createDiv({ cls: 'setting-item-info' }).createDiv({ cls: 'setting-item-name', text: label })
      return r.createDiv({ cls: 'setting-item-control' })
    }

    const durationControl = row('Duration (minutes)')
    const minutesInput = durationControl.createEl('input', { type: 'number' })
    minutesInput.value = String(this.goalMinutes)
    minutesInput.min = '1'
    minutesInput.max = '120'
    minutesInput.style.width = '80px'

    const wordsControl = row('Word goal')
    const wordsInput = wordsControl.createEl('input', { type: 'number' })
    wordsInput.value = String(this.goalWords)
    wordsInput.min = '0'
    wordsInput.style.width = '80px'

    const cooldownControl = row('Cooldown (minutes)')
    const cooldownInput = cooldownControl.createEl('input', { type: 'number' })
    cooldownInput.value = String(this.cooldownMinutes)
    cooldownInput.min = '0'
    cooldownInput.style.width = '80px'

    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' })
    btnRow.style.marginTop = '16px'
    btnRow.style.display = 'flex'
    btnRow.style.gap = '8px'
    btnRow.style.justifyContent = 'flex-end'

    btnRow.createEl('button', { text: 'Cancel' }).onclick = () => this.close()

    const okBtn = btnRow.createEl('button', { text: 'Save', cls: 'mod-cta' })
    okBtn.onclick = () => {
      const mins = Math.max(1, parseInt(minutesInput.value) || this.goalMinutes)
      const words = Math.max(0, parseInt(wordsInput.value) || 0)
      const cooldown = Math.max(0, parseInt(cooldownInput.value) || 0)
      this.onSave(mins, words, cooldown)
      this.close()
    }
  }

  onClose() {
    this.contentEl.empty()
  }
}

export class SprintView extends ItemView {
  plugin: WritingTrackerPlugin

  // Session state
  private sessionActive = false
  // Map of filepath → {start, current} word counts for the session
  private sessionWordsMap = new Map<string, { start: number; current: number }>()

  // Sprint state
  private sprintActive = false
  private sprintPaused = false
  // Snapshot of word counts at the moment each sprint started
  private sprintBaseline = new Map<string, number>()
  private sprintNumber = 0
  private elapsedSeconds = 0
  private startedAt = 0

  // Cooldown state
  private inCooldown = false
  private cooldownRemaining = 0
  private cooldownIntervalId: number | null = null

  // Goals
  private goalMinutes: number
  private goalWords: number
  private cooldownMinutes: number
  private selectedLocation = ''

  // Timers / animation
  private sprintIntervalId: number | null = null
  private animFrameId: number | null = null
  private quickPreviewRef: any = null

  // Canvas snapshot for cooldown display
  private lastTimeArc = 0
  private lastWordArc = 0

  // UI elements
  private canvas: HTMLCanvasElement
  private sprintHeaderEl: HTMLElement
  private sessionWordsEl: HTMLElement
  private wordCountEl: HTMLElement
  private goalTextEl: HTMLElement
  private timeLeftEl: HTMLElement
  private locationRow: HTMLElement
  private locationSelect: HTMLSelectElement
  private btnRow: HTMLElement

  constructor(leaf: WorkspaceLeaf, plugin: WritingTrackerPlugin) {
    super(leaf)
    this.plugin = plugin
    this.goalMinutes = plugin.settings.defaultSprintMinutes ?? 25
    this.goalWords = plugin.settings.defaultSprintWords ?? 500
    this.cooldownMinutes = plugin.settings.defaultCooldownMinutes ?? 0
  }

  getViewType(): string {
    return SPRINT_VIEW_TYPE
  }

  getDisplayText(): string {
    return 'Writing Sprint'
  }

  getIcon(): string {
    return 'timer'
  }

  async onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.style.padding = '16px'
    contentEl.style.display = 'flex'
    contentEl.style.flexDirection = 'column'
    contentEl.style.alignItems = 'center'
    contentEl.style.gap = '8px'

    // Header row: sprint label + session words
    const headerRow = contentEl.createDiv()
    headerRow.style.display = 'flex'
    headerRow.style.justifyContent = 'space-between'
    headerRow.style.width = '100%'
    headerRow.style.maxWidth = '220px'

    this.sprintHeaderEl = headerRow.createEl('span')
    this.sprintHeaderEl.style.fontSize = '12px'
    this.sprintHeaderEl.style.color = 'var(--text-muted)'
    this.sprintHeaderEl.style.fontWeight = 'bold'

    this.sessionWordsEl = headerRow.createEl('span')
    this.sessionWordsEl.style.fontSize = '12px'
    this.sessionWordsEl.style.color = 'var(--text-muted)'

    // Canvas
    this.canvas = contentEl.createEl('canvas')
    this.canvas.width = 200
    this.canvas.height = 200
    this.canvas.style.display = 'block'

    // Sprint word count (large number)
    this.wordCountEl = contentEl.createEl('div', { text: '0' })
    this.wordCountEl.style.fontSize = '36px'
    this.wordCountEl.style.fontWeight = 'bold'
    this.wordCountEl.style.color = 'var(--text-normal)'
    this.wordCountEl.style.lineHeight = '1'
    this.wordCountEl.style.marginTop = '-8px'

    const wordsLabelEl = contentEl.createEl('div', { text: 'sprint words' })
    wordsLabelEl.style.fontSize = '12px'
    wordsLabelEl.style.color = 'var(--text-muted)'

    // Goal / cooldown text
    this.goalTextEl = contentEl.createEl('div')
    this.goalTextEl.style.fontSize = '12px'
    this.goalTextEl.style.color = '#c9a227'
    this.goalTextEl.style.textAlign = 'center'

    // Time remaining / status text
    this.timeLeftEl = contentEl.createEl('div')
    this.timeLeftEl.style.fontSize = '12px'
    this.timeLeftEl.style.color = 'var(--text-muted)'
    this.timeLeftEl.style.textAlign = 'center'

    // Location row
    this.locationRow = contentEl.createDiv()
    this.locationRow.style.display = 'flex'
    this.locationRow.style.alignItems = 'center'
    this.locationRow.style.gap = '6px'
    this.locationRow.style.marginTop = '4px'
    const locationLabel = this.locationRow.createEl('span', { text: 'Location:' })
    locationLabel.style.fontSize = '12px'
    locationLabel.style.color = 'var(--text-muted)'
    this.locationSelect = this.locationRow.createEl('select')
    this.locationSelect.style.fontSize = '12px'
    this.locationSelect.onchange = () => {
      this.selectedLocation = this.locationSelect.value
    }
    this.refreshLocationDropdown()

    // Button row
    this.btnRow = contentEl.createDiv()
    this.btnRow.style.display = 'flex'
    this.btnRow.style.gap = '8px'
    this.btnRow.style.marginTop = '8px'
    this.btnRow.style.flexWrap = 'wrap'
    this.btnRow.style.justifyContent = 'center'

    this.refreshUI()
    this.draw()
  }

  async onClose() {
    this.stopAnimation()
    this.stopSprintTimer()
    this.stopCooldownTimer()
    if (this.quickPreviewRef) {
      this.app.workspace.offref(this.quickPreviewRef)
      this.quickPreviewRef = null
    }
  }

  // ─── Word count helpers ───────────────────────────────────────────────────

  private getSessionWords(): number {
    let total = 0
    for (const { start, current } of this.sessionWordsMap.values()) {
      total += Math.max(0, current - start)
    }
    return total
  }

  private getSprintWords(): number {
    let total = 0
    for (const [path, { current }] of this.sessionWordsMap) {
      const base = this.sprintBaseline.get(path) ?? current
      total += Math.max(0, current - base)
    }
    return total
  }

  private onQuickPreview(file: TFile, content: string) {
    if (!this.sessionActive) return
    if (this.plugin.getProjectForFile(file.path) === null) return

    const wordCount = this.plugin.getWordCount(content)

    // Session tracking — always update while session is active (including cooldown, pause, between sprints)
    if (!this.sessionWordsMap.has(file.path)) {
      this.sessionWordsMap.set(file.path, { start: wordCount, current: wordCount })
    } else {
      this.sessionWordsMap.get(file.path)!.current = wordCount
    }

    // Sprint tracking — only attribute words to the sprint while it's actively running
    if (this.sprintActive && !this.sprintPaused) {
      if (!this.sprintBaseline.has(file.path)) {
        this.sprintBaseline.set(file.path, wordCount)
      }
    }

    this.updateDisplay()
  }

  // ─── Session lifecycle ────────────────────────────────────────────────────

  private startSession() {
    this.sessionActive = true
    this.sessionWordsMap.clear()
    this.sprintNumber = 0

    if (this.quickPreviewRef) {
      this.app.workspace.offref(this.quickPreviewRef)
    }
    this.quickPreviewRef = this.app.workspace.on('quick-preview', (file: TFile, content: string) =>
      this.onQuickPreview(file, content)
    )

    this.refreshUI()
    new Notice('Sprint session started!')
  }

  private async endSession() {
    // Save current sprint if in progress
    if (this.sprintActive && this.elapsedSeconds > 5) {
      const completed = this.getSprintWords() >= this.goalWords
      await this.plugin.syncSprint(this.buildRecord(completed))
    }

    const totalWords = this.getSessionWords()

    this.stopSprintTimer()
    this.stopCooldownTimer()
    if (this.quickPreviewRef) {
      this.app.workspace.offref(this.quickPreviewRef)
      this.quickPreviewRef = null
    }

    this.sessionActive = false
    this.sprintActive = false
    this.sprintPaused = false
    this.inCooldown = false
    this.sessionWordsMap.clear()
    this.sprintBaseline.clear()
    this.elapsedSeconds = 0
    this.startedAt = 0
    this.sprintNumber = 0
    this.lastTimeArc = 0
    this.lastWordArc = 0

    this.refreshUI()
    new Notice(`Session ended! Total session words: ${totalWords.toLocaleString()}`)
  }

  // ─── Sprint lifecycle ─────────────────────────────────────────────────────

  private startSprint() {
    this.sprintActive = true
    this.sprintPaused = false
    this.sprintNumber++
    this.elapsedSeconds = 0
    this.startedAt = Date.now()
    this.sprintBaseline.clear()

    // Snapshot current session state as sprint baseline
    for (const [path, { current }] of this.sessionWordsMap) {
      this.sprintBaseline.set(path, current)
    }

    this.startSprintTimer()
    this.refreshUI()
  }

  private togglePause() {
    this.sprintPaused = !this.sprintPaused
    if (this.sprintPaused) {
      this.stopSprintTimer()
    } else {
      this.startSprintTimer()
    }
    this.refreshUI()
  }

  private async endSprint() {
    this.stopSprintTimer()
    const words = this.getSprintWords()
    const completed = words >= this.goalWords

    if (this.elapsedSeconds > 5) {
      await this.plugin.syncSprint(this.buildRecord(completed))
      new Notice(
        `Sprint #${this.sprintNumber} saved: ${words.toLocaleString()} words in ${Math.round(this.elapsedSeconds / 60)} min`
      )
    }

    this.sprintActive = false
    this.sprintPaused = false
    this.refreshUI()
  }

  private async completeSprint() {
    this.stopSprintTimer()
    const words = this.getSprintWords()

    // Snapshot arc values for cooldown display
    this.lastTimeArc = 1
    this.lastWordArc = this.goalWords > 0 ? Math.min(words / this.goalWords, 1) : 0

    await this.plugin.syncSprint(this.buildRecord(true))
    new Notice(
      `Sprint #${this.sprintNumber} complete! ${words.toLocaleString()} words in ${this.goalMinutes} min.`
    )

    this.sprintActive = false
    this.sprintPaused = false

    if (this.cooldownMinutes > 0) {
      this.startCooldown()
    } else {
      this.refreshUI()
    }
  }

  // ─── Cooldown ─────────────────────────────────────────────────────────────

  private startCooldown() {
    this.inCooldown = true
    this.cooldownRemaining = this.cooldownMinutes * 60
    this.refreshUI()

    this.cooldownIntervalId = window.setInterval(() => {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - 1)
      this.updateDisplay()
      if (this.cooldownRemaining <= 0) {
        this.stopCooldownTimer()
        this.inCooldown = false
        this.startSprint()
      }
    }, 1000)
  }

  private skipCooldown() {
    this.stopCooldownTimer()
    this.inCooldown = false
    this.startSprint()
  }

  // ─── Timer helpers ────────────────────────────────────────────────────────

  private startSprintTimer() {
    if (this.sprintIntervalId !== null) return
    this.sprintIntervalId = window.setInterval(() => {
      this.elapsedSeconds++
      this.updateDisplay()
      if (this.elapsedSeconds >= this.goalMinutes * 60) {
        this.completeSprint()
      }
    }, 1000)
  }

  private stopSprintTimer() {
    if (this.sprintIntervalId !== null) {
      clearInterval(this.sprintIntervalId)
      this.sprintIntervalId = null
    }
  }

  private stopCooldownTimer() {
    if (this.cooldownIntervalId !== null) {
      clearInterval(this.cooldownIntervalId)
      this.cooldownIntervalId = null
    }
  }

  // ─── Build sprint record ──────────────────────────────────────────────────

  private buildRecord(completed: boolean) {
    const endedAt = Date.now()
    const words = this.getSprintWords()

    // Find the project with most sprint words
    let topProject: string | null = null
    let maxWords = 0
    for (const [path, base] of this.sprintBaseline) {
      const current = this.sessionWordsMap.get(path)?.current ?? base
      const delta = Math.max(0, current - base)
      if (delta > maxWords) {
        maxWords = delta
        topProject = this.plugin.getProjectForFile(path)
      }
    }

    return {
      id: uuidv4(),
      file_name: `Sprint Session #${this.sprintNumber}`,
      project: topProject,
      started_at: this.startedAt || endedAt - this.elapsedSeconds * 1000,
      ended_at: endedAt,
      duration_seconds: this.elapsedSeconds,
      goal_duration_minutes: this.goalMinutes,
      goal_words: this.goalWords,
      words_written: words,
      location: this.selectedLocation || null,
      completed,
    }
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  private refreshLocationDropdown() {
    const locations = this.plugin.settings.locations ?? []
    this.locationSelect.innerHTML = ''

    if (locations.length === 0) {
      this.locationRow.style.display = 'none'
      this.selectedLocation = ''
      return
    }

    this.locationRow.style.display = 'flex'
    const blankOpt = this.locationSelect.createEl('option', { value: '', text: '— none —' })
    blankOpt.value = ''
    for (const loc of locations) {
      this.locationSelect.createEl('option', { value: loc, text: loc })
    }
    this.selectedLocation = this.locationSelect.value
  }

  private makeBtn(text: string, bg: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.backgroundColor = bg
    btn.style.color = '#fff'
    btn.style.border = 'none'
    btn.style.borderRadius = '4px'
    btn.style.padding = '6px 12px'
    btn.style.cursor = 'pointer'
    btn.style.fontWeight = 'bold'
    btn.style.fontSize = '12px'
    return btn
  }

  private refreshUI() {
    this.btnRow.empty()
    this.updateDisplay()

    if (!this.sessionActive) {
      // IDLE
      const btn = this.makeBtn('Start Session', '#7c5cbf')
      btn.onclick = () => this.startSession()
      this.btnRow.appendChild(btn)
      return
    }

    if (this.inCooldown) {
      // COOLDOWN
      const skip = this.makeBtn('Skip Cooldown', '#3a3a3a')
      skip.onclick = () => this.skipCooldown()
      this.btnRow.appendChild(skip)

      const endSession = this.makeBtn('End Session', '#7a2020')
      endSession.onclick = () => this.endSession()
      this.btnRow.appendChild(endSession)
      return
    }

    if (!this.sprintActive) {
      // SESSION_READY
      const startSprint = this.makeBtn('Start Sprint', '#7c5cbf')
      startSprint.onclick = () => this.startSprint()
      this.btnRow.appendChild(startSprint)

      const edit = this.makeBtn('Edit', '#3a3a3a')
      edit.onclick = () => this.openEditModal()
      this.btnRow.appendChild(edit)

      const endSession = this.makeBtn('End Session', '#7a2020')
      endSession.onclick = () => this.endSession()
      this.btnRow.appendChild(endSession)
      return
    }

    // SPRINT RUNNING or PAUSED
    const toggle = this.makeBtn(this.sprintPaused ? 'Resume' : 'Pause', '#7c5cbf')
    toggle.onclick = () => this.togglePause()
    this.btnRow.appendChild(toggle)

    const edit = this.makeBtn('Edit', '#3a3a3a')
    edit.onclick = () => this.openEditModal()
    this.btnRow.appendChild(edit)

    const endSprint = this.makeBtn('End Sprint', '#b45309')
    endSprint.onclick = () => this.endSprint()
    this.btnRow.appendChild(endSprint)

    const endSession = this.makeBtn('End Session', '#7a2020')
    endSession.onclick = () => this.endSession()
    this.btnRow.appendChild(endSession)
  }

  private updateDisplay() {
    const sprintWords = this.getSprintWords()
    const sessionWords = this.getSessionWords()

    // Header
    if (!this.sessionActive) {
      this.sprintHeaderEl.setText('Sprint')
      this.sessionWordsEl.setText('')
    } else if (this.sprintActive || this.inCooldown) {
      this.sprintHeaderEl.setText(`Sprint #${this.sprintNumber}`)
      this.sessionWordsEl.setText(`Session: ${sessionWords.toLocaleString()} words`)
    } else {
      this.sprintHeaderEl.setText(`Sprint #${this.sprintNumber + 1} ready`)
      this.sessionWordsEl.setText(`Session: ${sessionWords.toLocaleString()} words`)
    }

    // Word count
    this.wordCountEl.setText(String(sprintWords))

    // Goal / cooldown line
    if (this.inCooldown) {
      const mm = String(Math.floor(this.cooldownRemaining / 60)).padStart(2, '0')
      const ss = String(this.cooldownRemaining % 60).padStart(2, '0')
      this.goalTextEl.setText(`Cooldown: ${mm}:${ss}`)
      this.timeLeftEl.setText('Take a break before the next sprint')
      return
    }

    this.goalTextEl.setText(`${sprintWords} of ${this.goalWords} word goal`)

    // Time line
    if (!this.sessionActive || !this.sprintActive) {
      this.timeLeftEl.setText(
        `${this.goalMinutes} min sprint · ${this.goalWords} word goal${this.cooldownMinutes > 0 ? ` · ${this.cooldownMinutes} min cooldown` : ''}`
      )
      return
    }

    const remaining = Math.max(0, this.goalMinutes * 60 - this.elapsedSeconds)
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
    const ss = String(remaining % 60).padStart(2, '0')

    this.timeLeftEl.innerHTML = ''
    const timeSpan = document.createElement('span')
    timeSpan.style.color = this.sprintPaused ? '#9ca3af' : '#7c5cbf'
    timeSpan.style.fontWeight = 'bold'
    timeSpan.textContent = `${mm}:${ss}`
    const restSpan = document.createElement('span')
    restSpan.textContent = this.sprintPaused ? ' (paused) · ' : ' left in '
    const minsSpan = document.createElement('span')
    minsSpan.style.color = '#7c5cbf'
    minsSpan.style.fontWeight = 'bold'
    minsSpan.textContent = `${this.goalMinutes}`
    const endSpan = document.createElement('span')
    endSpan.textContent = ' min sprint'
    this.timeLeftEl.appendChild(timeSpan)
    this.timeLeftEl.appendChild(restSpan)
    if (!this.sprintPaused) {
      this.timeLeftEl.appendChild(minsSpan)
      this.timeLeftEl.appendChild(endSpan)
    }
  }

  private openEditModal() {
    const wasRunning = this.sprintActive && !this.sprintPaused
    if (wasRunning) this.togglePause()

    new EditSprintModal(
      this.app,
      this.goalMinutes,
      this.goalWords,
      this.cooldownMinutes,
      (mins, words, cooldown) => {
        this.goalMinutes = mins
        this.goalWords = words
        this.cooldownMinutes = cooldown
        this.updateDisplay()
        if (wasRunning) this.togglePause()
      }
    ).open()
  }

  // ─── Canvas ───────────────────────────────────────────────────────────────

  private stopAnimation() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  private draw() {
    const ctx = this.canvas.getContext('2d')!
    const cx = this.canvas.width / 2
    const cy = this.canvas.height / 2
    const now = Date.now()

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    const startAngle = -Math.PI / 2
    const full = 2 * Math.PI

    // Determine arc fractions
    let timePct: number
    let wordPct: number

    if (this.inCooldown) {
      // Keep last sprint's completed state frozen
      timePct = this.lastTimeArc
      wordPct = this.lastWordArc
    } else if (this.sprintActive) {
      timePct = Math.min(this.elapsedSeconds / (this.goalMinutes * 60), 1)
      wordPct = this.goalWords > 0 ? Math.min(this.getSprintWords() / this.goalWords, 1) : 0
    } else {
      timePct = 0
      wordPct = 0
    }

    // Time arc (outer, r=88, purple)
    const timeR = 88
    ctx.beginPath()
    ctx.arc(cx, cy, timeR, 0, full)
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 10
    ctx.stroke()
    if (timePct > 0) {
      ctx.beginPath()
      ctx.arc(cx, cy, timeR, startAngle, startAngle + full * timePct)
      ctx.strokeStyle = this.sprintPaused ? '#5a4a8a' : '#7c5cbf'
      ctx.lineWidth = 10
      ctx.stroke()
    }

    // Word arc (inner, r=68, brown)
    const wordR = 68
    ctx.beginPath()
    ctx.arc(cx, cy, wordR, 0, full)
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 10
    ctx.stroke()
    if (wordPct > 0) {
      ctx.beginPath()
      ctx.arc(cx, cy, wordR, startAngle, startAngle + full * wordPct)
      ctx.strokeStyle = wordPct >= 1 ? '#22c55e' : '#8b4513'
      ctx.lineWidth = 10
      ctx.stroke()
    }

    // Seconds hand (only when sprint is running)
    if (this.sprintActive && !this.sprintPaused) {
      const seconds = (now / 1000) % 60
      const secAngle = startAngle + (seconds / 60) * full
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(secAngle) * 55, cy + Math.sin(secAngle) * 55)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Center dot
    ctx.beginPath()
    ctx.arc(cx, cy, 3, 0, full)
    ctx.fillStyle = this.sprintActive && !this.sprintPaused ? '#ef4444' : '#555'
    ctx.fill()

    this.animFrameId = requestAnimationFrame(() => this.draw())
  }
}
