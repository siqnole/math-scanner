const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer } = require('electron')
const path = require('path')
const IS_DEV = process.argv.includes('--dev')
const { runOcr } = require('./ocr')

let controlWin  = null
let overlayWin  = null
let splashWin   = null
let lastShot    = null
let isCapturing = false

// ── Fingerprint ───────────────────────────────────────────────────────────────
let lastFingerprint = null
const SHOT_STALE_MS = 3000

function hashNativeImage(nativeImg) {
  const buf  = nativeImg.toPNG()
  let h      = 5381
  const step = Math.max(1, Math.floor(buf.length / 512))
  for (let i = 0; i < buf.length; i += step) h = ((h << 5) + h) ^ buf[i]
  return (h >>> 0).toString(16)
}

function log(a,m,d='') { console.log(`[${new Date().toISOString().split('T')[1].slice(0,12)}] [${a}]`,m,d?JSON.stringify(d):'') }

// ── Splash steps ──────────────────────────────────────────────────────────────
// Keep in sync with STEPS array in splash.html
const SPLASH_STEPS = {
  LAUNCHING:  0,   // app ready, splash shown
  LOADING_UI: 1,   // control + overlay windows created, loading URLs
  OCR_INIT:   2,   // Tesseract worker spinning up
  OCR_WARM:   3,   // Tesseract first recognition (warm-up) running
  READY:      4,   // everything done
}

function splashStep(index) {
  if (!splashWin || splashWin.isDestroyed()) return
  splashWin.webContents.executeJavaScript(`window.setStep(${index})`).catch(()=>{})
}

function createSplashWindow() {
  splashWin = new BrowserWindow({
    width: 340, height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  splashWin.loadFile(path.join(__dirname, 'splash.html'))
  splashWin.once('ready-to-show', () => splashWin.show())
}

function closeSplash() {
  if (!splashWin || splashWin.isDestroyed()) return
  // Fade out via opacity before destroy (best effort — supported on Win/Mac)
  splashWin.setOpacity(0)
  setTimeout(() => { if (!splashWin?.isDestroyed()) splashWin.close(); splashWin = null }, 250)
}

// ── Tesseract pre-warm ────────────────────────────────────────────────────────
// We run a tiny blank-image recognition on startup so Tesseract's WASM and
// language data are cached before the user's first real scan.
async function prewarmTesseract() {
  log('PREWARM', 'Starting Tesseract pre-warm')
  try {
    const { createWorker } = require('tesseract.js')
    // Step: OCR_INIT — worker is being created, WASM loading
    splashStep(SPLASH_STEPS.OCR_INIT)

    const worker = await createWorker('eng', 1, {
      logger: m => {
        // Tesseract logs "loading language traineddata", "initializing api", etc.
        if (m.status === 'loading language traineddata') splashStep(SPLASH_STEPS.OCR_INIT)
        if (m.status === 'initializing api')             splashStep(SPLASH_STEPS.OCR_WARM)
        if (m.status === 'recognizing text')             splashStep(SPLASH_STEPS.OCR_WARM)
      },
      errorHandler: ()=>{},
    })

    // Step: OCR_WARM — do a minimal recognition to JIT-compile everything
    splashStep(SPLASH_STEPS.OCR_WARM)
    // 1×1 white PNG: data:image/png;base64,...
    const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=='
    await worker.recognize(BLANK)
    await worker.terminate()
    log('PREWARM', 'Tesseract pre-warm complete')
  } catch(e) {
    log('PREWARM', 'Pre-warm failed (non-fatal):', e.message)
  }
}

function rendererUrl(page) {
  return IS_DEV
    ? `http://localhost:5173/src/${page}/index.html`
    : `file://${path.join(__dirname,'..','dist','src',page,'index.html')}`
}

async function loadWithRetry(win, page, retries=20, delay=500) {
  const url = rendererUrl(page)
  for (let i = 0; i < retries; i++) {
    try { await fetch('http://localhost:5173'); await win.loadURL(url); return } catch {}
    await new Promise(r=>setTimeout(r,delay))
  }
  await win.loadURL(url)
}

function sendToControl(channel, data) {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send(channel, data)
}
function sendToOverlay(channel, data) {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send(channel, data)
}

function enableOverlaySelection() {
  if (!overlayWin || overlayWin.isDestroyed()) return
  overlayWin.setFocusable(true)
  overlayWin.focus()
  overlayWin.setIgnoreMouseEvents(false)
  sendToOverlay('enter-select-mode')
  log('SELECT', 'overlay selection enabled')
}
function disableOverlaySelection() {
  if (!overlayWin || overlayWin.isDestroyed()) return
  overlayWin.setIgnoreMouseEvents(true, { forward: true })
  overlayWin.setFocusable(false)
  log('SELECT', 'overlay selection disabled')
}

async function captureScreen() {
  if (isCapturing) return
  isCapturing = true
  sendToControl('debug-event', { event:'capture-start', data:{}, ts:Date.now() })
  log('CAPTURE','Starting')
  try {
    await new Promise(r=>setTimeout(r,150))
    const { width, height } = screen.getPrimaryDisplay().bounds
    const sources = await desktopCapturer.getSources({ types:['screen'], thumbnailSize:{width,height} })
    if (!sources.length) throw new Error('No sources')
    const src = sources.find(s=>/screen|entire|display/i.test(s.name)) ?? sources[0]
    lastFingerprint = hashNativeImage(src.thumbnail)
    const dataURL = src.thumbnail.toDataURL()
    const sizeKb  = Math.round(dataURL.length*3/4/1024)
    lastShot      = { dataURL, width, height, ts: Date.now() }
    log('CAPTURE','Done',{width,height,sizeKb})
    sendToControl('screenshot-ready',{ dataURL, width, height, sizeKb, ts:Date.now(), sourceName:src.name })
    sendToControl('debug-event',{ event:'capture-done', data:{width,height,sizeKb}, ts:Date.now() })
  } catch(err) {
    log('CAPTURE','ERR',{message:err.message})
    sendToControl('screenshot-error',{message:err.message})
    sendToControl('debug-event',{event:'capture-error',data:{message:err.message},ts:Date.now()})
  } finally { isCapturing=false }
}

async function runOcrOnRegion(croppedDataURL, cropRect) {
  sendToControl('debug-event',{event:'ocr-start',data:{},ts:Date.now()})
  log('OCR','Starting on cropped region',cropRect)
  sendToOverlay('scan-start', cropRect)
  try {
    const { bubbles, rawWords, rawLines, fullText } = await runOcr(croppedDataURL, {
      confidenceThreshold: 40,
      maxBubbles: 60,
      cropOffset: { x: cropRect.x, y: cropRect.y },
      onProgress: pct => {
        sendToControl('ocr-progress', pct)
        sendToOverlay('scan-progress', { pct, cropRect })
      },
    })
    log('OCR','Done',{ bubbles:bubbles.length, words:rawWords.length, lines:rawLines.length })
    sendToControl('ocr-results', bubbles)
    sendToControl('ocr-debug',{ rawWords, rawLines, fullText,
      summary:{ totalWords:rawWords.length, totalLines:rawLines.length, bubblesFound:bubbles.length } })
    sendToControl('debug-event',{event:'ocr-done',data:{count:bubbles.length},ts:Date.now()})
    sendToOverlay('scan-done', { bubbles, cropRect })
    if (bubbles.length>0) sendToOverlay('show-bubbles', bubbles)
  } catch(err) {
    log('OCR','ERR',{message:err.message})
    sendToControl('screenshot-error',{message:err.message})
    sendToControl('debug-event',{event:'ocr-error',data:{message:err.message},ts:Date.now()})
    sendToOverlay('scan-done',{ bubbles:[], cropRect })
  }
}

function createControlWindow() {
  controlWin = new BrowserWindow({
    width:680, height:860, minWidth:460, minHeight:500,
    title:'Math Scanner',
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    backgroundColor: '#0a0a0a',
    show: false,   // ← hidden until splash finishes
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false },
  })
  controlWin.on('closed',()=>{ controlWin=null; app.quit() })
  controlWin.webContents.on('did-finish-load',()=>
    sendToControl('debug-event',{event:'window-ready',data:{window:'control'},ts:Date.now()}))
}

// ── Custom titlebar IPC ───────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => controlWin?.minimize())
ipcMain.on('window-maximize', () => {
  if (!controlWin) return
  controlWin.isMaximized() ? controlWin.unmaximize() : controlWin.maximize()
})
ipcMain.on('window-close', () => controlWin?.close())
ipcMain.handle('window-is-maximized', () => controlWin?.isMaximized() ?? false)

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  overlayWin = new BrowserWindow({
    width, height, x:0, y:0, transparent:true, frame:false,
    alwaysOnTop:true, skipTaskbar:true, focusable:false,
    show: false,   // ← hidden until splash finishes
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false },
  })
  overlayWin.setIgnoreMouseEvents(true,{forward:true})
  overlayWin.webContents.on('did-finish-load',()=>{
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    overlayWin.webContents.send('overlay-init',{width,height})
  })
  overlayWin.on('closed',()=>{ overlayWin=null })
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on('start-overlay-selection', async () => {
  const age     = lastShot ? Date.now() - lastShot.ts : Infinity
  const isStale = age > SHOT_STALE_MS
  if (!lastShot || isStale) {
    log('SELECT', lastShot ? `shot ${age}ms old — recapturing` : 'no shot — capturing')
    await captureScreen()
  } else {
    log('SELECT', `reusing shot (${age}ms old)`)
  }
  enableOverlaySelection()
  sendToControl('debug-event', { event:'select-mode-start', data:{}, ts:Date.now() })
})

ipcMain.on('overlay-region-selected', (_, rect) => {
  log('SELECT', 'region selected', rect)
  disableOverlaySelection()
  sendToControl('region-selected', rect)
  sendToControl('debug-event',{ event:'region-selected', data:rect, ts:Date.now() })
})

ipcMain.on('cancel-overlay-selection', () => {
  log('SELECT', 'cancelled')
  disableOverlaySelection()
  sendToControl('select-mode-cancelled')
})

ipcMain.on('run-ocr-on-region', (_, { croppedDataURL, cropRect }) => {
  runOcrOnRegion(croppedDataURL, cropRect)
})

ipcMain.on('capture-screen',       () => captureScreen())
ipcMain.on('overlay-clear',        () => { sendToOverlay('show-bubbles',[]); sendToOverlay('scan-clear') })
ipcMain.on('overlay-toggle-mouse', (_,pt) => overlayWin?.setIgnoreMouseEvents(pt,{forward:true}))
ipcMain.on('overlay-test-bubble',  (_,p)  => sendToOverlay('show-bubbles',[p]))
ipcMain.on('overlay-selection-mode', (_,enable) => {
  if (!overlayWin||overlayWin.isDestroyed()) return
  enable ? enableOverlaySelection() : disableOverlaySelection()
})

ipcMain.handle('get-last-screenshot', () => lastShot)
ipcMain.handle('get-window-info', () => ({
  control: controlWin?.getBounds()??null,
  overlay: overlayWin?.getBounds()??null,
  display: screen.getPrimaryDisplay().workAreaSize,
  isDev:   IS_DEV,
}))
ipcMain.handle('ping', () => ({ pong:true, ts:Date.now() }))

// ── Boot sequence ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {

  // 1. Show splash immediately — pure HTML, zero deps, loads in <100ms
  createSplashWindow()
  splashStep(SPLASH_STEPS.LAUNCHING)

  // 2. Create app windows (hidden) + start loading their URLs in parallel
  splashStep(SPLASH_STEPS.LOADING_UI)
  createControlWindow()
  createOverlayWindow()

  // Load both windows concurrently
  const uiReady = Promise.all([
    loadWithRetry(controlWin, 'control'),
    loadWithRetry(overlayWin, 'overlay'),
  ])

  // 3. Pre-warm Tesseract while UI loads — both run in parallel
  //    prewarmTesseract() advances splash through OCR_INIT → OCR_WARM itself
  const warmReady = prewarmTesseract()

  // 4. Wait for both to finish
  await Promise.all([uiReady, warmReady])

  // 5. Everything ready — show app, close splash
  splashStep(SPLASH_STEPS.READY)
  await new Promise(r => setTimeout(r, 350))  // let "Ready" render briefly

  controlWin.show()
  overlayWin.show()

  if (IS_DEV) controlWin.webContents.openDevTools({mode:'detach'})

  closeSplash()

  // 6. Register global hotkey
  const ok = globalShortcut.register('CommandOrControl+Shift+M', async () => {
    log('HOTKEY','Ctrl+Shift+M triggered')
    await captureScreen()
    enableOverlaySelection()
    sendToControl('enter-select-mode')
  })
  log('HOTKEY', ok?'Registered':'FAILED')

  app.on('activate',()=>{
    if (!BrowserWindow.getAllWindows().length) {
      createControlWindow(); createOverlayWindow()
    }
  })
})

app.on('will-quit',()=>globalShortcut.unregisterAll())
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit() })
