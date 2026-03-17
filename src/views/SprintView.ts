import { ItemView, Modal, Notice, TFile, WorkspaceLeaf } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'
import type WritingTrackerPlugin from '../main'

export const SPRINT_VIEW_TYPE = 'writing-tracker-sprint'

class EditSprintModal extends Modal {
  private goalMinutes: number
  private goalWords: number
  private onSave: (minutes: number, words: number) => void

  constructor(
    app: any,
    goalMinutes: number,
    goalWords: number,
    onSave: (minutes: number, words: number) => void
  ) {
    super(app)
    this.goalMinutes = goalMinutes
    this.goalWords = goalWords
    this.onSave = onSave
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Edit Sprint Goals' })

    // Duration input
    const durationRow = contentEl.createDiv({ cls: 'setting-item' })
    const durationInfo = durationRow.createDiv({ cls: 'setting-item-info' })
    durationInfo.createDiv({ cls: 'setting-item-name', text: 'Duration (minutes)' })
    const durationControl = durationRow.createDiv({ cls: 'setting-item-control' })
    const minutesInput = durationControl.createEl('input', { type: 'number' })
    minutesInput.value = String(this.goalMinutes)
    minutesInput.min = '1'
    minutesInput.max = '120'
    minutesInput.style.width = '80px'

    // Word goal input
    const wordsRow = contentEl.createDiv({ cls: 'setting-item' })
    const wordsInfo = wordsRow.createDiv({ cls: 'setting-item-info' })
    wordsInfo.createDiv({ cls: 'setting-item-name', text: 'Word goal' })
    const wordsControl = wordsRow.createDiv({ cls: 'setting-item-control' })
    const wordsInput = wordsControl.createEl('input', { type: 'number' })
    wordsInput.value = String(this.goalWords)
    wordsInput.min = '0'
    wordsInput.style.width = '80px'

    // Buttons
    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' })
    btnRow.style.marginTop = '16px'
    btnRow.style.display = 'flex'
    btnRow.style.gap = '8px'
    btnRow.style.justifyContent = 'flex-end'

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' })
    cancelBtn.onclick = () => this.close()

    const okBtn = btnRow.createEl('button', { text: 'Save', cls: 'mod-cta' })
    okBtn.onclick = () => {
      const mins = Math.max(1, parseInt(minutesInput.value) || this.goalMinutes)
      const words = Math.max(0, parseInt(wordsInput.value) || 0)
      this.onSave(mins, words)
      this.close()
    }
  }

  onClose() {
    this.contentEl.empty()
  }
}

export class SprintView extends ItemView {
  plugin: WritingTrackerPlugin

  private file: TFile | null = null
  private isRunning = false
  private elapsedSeconds = 0
  private wordsAtStart = 0
  private wordsInSprint = 0
  private goalMinutes: number
  private goalWords: number
  private startedAt = 0
  private selectedLocation = ''

  private canvas: HTMLCanvasElement
  private animFrameId: number | null = null
  private intervalId: number | null = null

  private fileNameEl: HTMLElement
  private wordCountEl: HTMLElement
  private wordsLabelEl: HTMLElement
  private goalTextEl: HTMLElement
  private timeLeftEl: HTMLElement
  private locationSelect: HTMLSelectElement
  private locationRow: HTMLElement
  private startBtn: HTMLButtonElement
  private editBtn: HTMLButtonElement
  private resetBtn: HTMLButtonElement

  private quickPreviewRef: any = null

  constructor(leaf: WorkspaceLeaf, plugin: WritingTrackerPlugin) {
    super(leaf)
    this.plugin = plugin
    this.goalMinutes = plugin.settings.defaultSprintMinutes ?? 25
    this.goalWords = plugin.settings.defaultSprintWords ?? 500
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

    // File name
    this.fileNameEl = contentEl.createEl('div', { text: 'No file selected' })
    this.fileNameEl.style.fontSize = '13px'
    this.fileNameEl.style.color = 'var(--text-muted)'
    this.fileNameEl.style.marginBottom = '4px'
    this.fileNameEl.style.maxWidth = '200px'
    this.fileNameEl.style.overflow = 'hidden'
    this.fileNameEl.style.textOverflow = 'ellipsis'
    this.fileNameEl.style.whiteSpace = 'nowrap'
    this.fileNameEl.style.textAlign = 'center'

    // Canvas
    this.canvas = contentEl.createEl('canvas')
    this.canvas.width = 200
    this.canvas.height = 200
    this.canvas.style.display = 'block'

    // Word count display
    this.wordCountEl = contentEl.createEl('div', { text: '0' })
    this.wordCountEl.style.fontSize = '36px'
    this.wordCountEl.style.fontWeight = 'bold'
    this.wordCountEl.style.color = 'var(--text-normal)'
    this.wordCountEl.style.lineHeight = '1'
    this.wordCountEl.style.marginTop = '-8px'

    this.wordsLabelEl = contentEl.createEl('div', { text: 'words in sprint' })
    this.wordsLabelEl.style.fontSize = '12px'
    this.wordsLabelEl.style.color = 'var(--text-muted)'

    // Goal text
    this.goalTextEl = contentEl.createEl('div')
    this.goalTextEl.style.fontSize = '12px'
    this.goalTextEl.style.color = '#c9a227'
    this.goalTextEl.style.textAlign = 'center'

    // Time left
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

    // Buttons
    const btnRow = contentEl.createDiv()
    btnRow.style.display = 'flex'
    btnRow.style.gap = '8px'
    btnRow.style.marginTop = '8px'

    this.startBtn = btnRow.createEl('button', { text: 'Start' })
    this.startBtn.style.backgroundColor = '#7c5cbf'
    this.startBtn.style.color = '#fff'
    this.startBtn.style.border = 'none'
    this.startBtn.style.borderRadius = '4px'
    this.startBtn.style.padding = '6px 14px'
    this.startBtn.style.cursor = 'pointer'
    this.startBtn.style.fontWeight = 'bold'
    this.startBtn.onclick = () => this.toggleStartPause()

    this.editBtn = btnRow.createEl('button', { text: 'Edit' })
    this.editBtn.style.backgroundColor = '#3a3a3a'
    this.editBtn.style.color = '#fff'
    this.editBtn.style.border = 'none'
    this.editBtn.style.borderRadius = '4px'
    this.editBtn.style.padding = '6px 14px'
    this.editBtn.style.cursor = 'pointer'
    this.editBtn.onclick = () => this.openEditModal()

    this.resetBtn = btnRow.createEl('button', { text: 'Reset' })
    this.resetBtn.style.backgroundColor = '#7a2020'
    this.resetBtn.style.color = '#fff'
    this.resetBtn.style.border = 'none'
    this.resetBtn.style.borderRadius = '4px'
    this.resetBtn.style.padding = '6px 14px'
    this.resetBtn.style.cursor = 'pointer'
    this.resetBtn.onclick = () => this.resetSprint()

    this.updateBottomText()
    this.draw()
  }

  async onClose() {
    this.stopAnimation()
    this.stopTimer()
    if (this.quickPreviewRef) {
      this.app.workspace.offref(this.quickPreviewRef)
      this.quickPreviewRef = null
    }
  }

  async initSprint(file: TFile) {
    this.file = file
    this.goalMinutes = this.plugin.settings.defaultSprintMinutes ?? 25
    this.goalWords = this.plugin.settings.defaultSprintWords ?? 500

    // Read initial word count
    const content = await this.app.vault.read(file)
    this.wordsAtStart = this.plugin.getWordCount(content)
    this.wordsInSprint = 0

    this.fileNameEl.setText(file.name)
    this.wordCountEl.setText('0')
    this.refreshLocationDropdown()
    this.updateBottomText()

    // Register quick-preview listener
    if (this.quickPreviewRef) {
      this.app.workspace.offref(this.quickPreviewRef)
    }
    this.quickPreviewRef = this.app.workspace.on(
      'quick-preview',
      (previewFile: TFile, content: string) => {
        if (previewFile.path === this.file?.path) {
          const currentWords = this.plugin.getWordCount(content)
          this.wordsInSprint = Math.max(0, currentWords - this.wordsAtStart)
          this.wordCountEl.setText(String(this.wordsInSprint))
          this.updateBottomText()
        }
      }
    )
  }

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
      const opt = this.locationSelect.createEl('option', { value: loc, text: loc })
      opt.value = loc
    }
    this.selectedLocation = this.locationSelect.value
  }

  private toggleStartPause() {
    if (!this.file) {
      new Notice('No file selected for sprint.')
      return
    }

    if (this.isRunning) {
      this.pauseSprint()
    } else {
      this.startSprint()
    }
  }

  private startSprint() {
    if (this.startedAt === 0) {
      this.startedAt = Date.now()
    }
    this.isRunning = true
    this.startBtn.setText('Pause')

    this.startTimer()
  }

  private pauseSprint() {
    this.isRunning = false
    this.startBtn.setText('Start')
    this.stopTimer()
  }

  private startTimer() {
    if (this.intervalId !== null) return
    this.intervalId = window.setInterval(() => {
      if (!this.isRunning) return
      this.elapsedSeconds++
      this.updateBottomText()

      if (this.elapsedSeconds >= this.goalMinutes * 60) {
        this.completeSprint()
      }
    }, 1000)
  }

  private stopTimer() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async completeSprint() {
    this.isRunning = false
    this.stopTimer()
    this.startBtn.setText('Start')

    new Notice(
      `Sprint complete! You wrote ${this.wordsInSprint} words in ${this.goalMinutes} minutes.`
    )

    const record = this.buildRecord(true)
    await this.plugin.syncSprint(record)
  }

  private buildRecord(completed: boolean) {
    const endedAt = Date.now()
    return {
      id: uuidv4(),
      file_name: this.file?.name ?? '',
      project: this.file ? this.getProjectForFile(this.file.path) : null,
      started_at: this.startedAt || endedAt - this.elapsedSeconds * 1000,
      ended_at: endedAt,
      duration_seconds: this.elapsedSeconds,
      goal_duration_minutes: this.goalMinutes,
      goal_words: this.goalWords,
      words_written: this.wordsInSprint,
      location: this.selectedLocation || null,
      completed,
    }
  }

  private getProjectForFile(filepath: string): string | null {
    const normalizedPath = filepath.replace(/\\/g, '/')
    const projects = this.plugin.settings.projects ?? []
    const sorted = [...projects].sort((a, b) => b.folder.length - a.folder.length)
    for (const project of sorted) {
      if (normalizedPath.startsWith(project.folder + '/') || normalizedPath === project.folder) {
        return project.name
      }
    }
    return null
  }

  private resetSprint() {
    this.isRunning = false
    this.stopTimer()
    this.elapsedSeconds = 0
    this.wordsInSprint = 0
    this.startedAt = 0
    this.startBtn.setText('Start')
    this.wordCountEl.setText('0')
    this.updateBottomText()
  }

  private openEditModal() {
    const wasRunning = this.isRunning
    if (wasRunning) this.pauseSprint()

    new EditSprintModal(this.app, this.goalMinutes, this.goalWords, (mins, words) => {
      this.goalMinutes = mins
      this.goalWords = words
      this.updateBottomText()
      if (wasRunning) this.startSprint()
    }).open()
  }

  private updateBottomText() {
    this.goalTextEl.setText(`${this.wordsInSprint} of ${this.goalWords} word goal`)

    const totalSeconds = this.goalMinutes * 60
    const remaining = Math.max(0, totalSeconds - this.elapsedSeconds)
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
    const ss = String(remaining % 60).padStart(2, '0')

    this.timeLeftEl.innerHTML = ''
    const timeSpan = document.createElement('span')
    timeSpan.style.color = '#7c5cbf'
    timeSpan.style.fontWeight = 'bold'
    timeSpan.textContent = `${mm}:${ss}`
    const restSpan = document.createElement('span')
    restSpan.textContent = ` left in `
    const minsSpan = document.createElement('span')
    minsSpan.style.color = '#7c5cbf'
    minsSpan.style.fontWeight = 'bold'
    minsSpan.textContent = `${this.goalMinutes}`
    const endSpan = document.createElement('span')
    endSpan.textContent = ` minute sprint`
    this.timeLeftEl.appendChild(timeSpan)
    this.timeLeftEl.appendChild(restSpan)
    this.timeLeftEl.appendChild(minsSpan)
    this.timeLeftEl.appendChild(endSpan)
  }

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
    const fullCircle = 2 * Math.PI

    // Time arc (outer, radius 88)
    const timeR = 88
    const timePct = Math.min(this.elapsedSeconds / (this.goalMinutes * 60), 1)
    ctx.beginPath()
    ctx.arc(cx, cy, timeR, 0, fullCircle)
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 10
    ctx.stroke()
    if (timePct > 0) {
      ctx.beginPath()
      ctx.arc(cx, cy, timeR, startAngle, startAngle + fullCircle * timePct)
      ctx.strokeStyle = '#7c5cbf'
      ctx.lineWidth = 10
      ctx.stroke()
    }

    // Words arc (inner, radius 68)
    const wordR = 68
    const wordPct = this.goalWords > 0 ? Math.min(this.wordsInSprint / this.goalWords, 1) : 0
    ctx.beginPath()
    ctx.arc(cx, cy, wordR, 0, fullCircle)
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 10
    ctx.stroke()
    if (wordPct > 0) {
      ctx.beginPath()
      ctx.arc(cx, cy, wordR, startAngle, startAngle + fullCircle * wordPct)
      ctx.strokeStyle = '#8b4513'
      ctx.lineWidth = 10
      ctx.stroke()
    }

    // Seconds hand (thin red line)
    const seconds = (now / 1000) % 60
    const secAngle = startAngle + (seconds / 60) * fullCircle
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(secAngle) * 55, cy + Math.sin(secAngle) * 55)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Center dot
    ctx.beginPath()
    ctx.arc(cx, cy, 3, 0, fullCircle)
    ctx.fillStyle = '#ef4444'
    ctx.fill()

    this.animFrameId = requestAnimationFrame(() => this.draw())
  }
}
