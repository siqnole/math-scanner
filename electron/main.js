const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer } = require('electron')
const path = require('path')
const IS_DEV = process.argv.includes('--dev')
const { runOcr } = require('./ocr')

let controlWin  = null
let overlayWin  = null
let splashWin   = null
let lastShot    = null
let isCapturing = false
let currentOcrController = null   // ← new: for cancellation

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
  LAUNCHING:  0,
  LOADING_UI: 1,
  OCR_INIT:   2,
  OCR_WARM:   3,
  READY:      4,
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
  splashWin.setOpacity(0)
  setTimeout(() => { if (!splashWin?.isDestroyed()) splashWin.close(); splashWin = null }, 250)
}

// ── Tesseract pre-warm (unchanged, but note the error you saw might be fixed with proper import) ──
async function prewarmTesseract() {
  log('PREWARM', 'Starting Tesseract pre-warm')
  try {
    const { createWorker } = require('tesseract.js')
    splashStep(SPLASH_STEPS.OCR_INIT)

    const worker = await createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'loading language traineddata') splashStep(SPLASH_STEPS.OCR_INIT)
        if (m.status === 'initializing api')             splashStep(SPLASH_STEPS.OCR_WARM)
        if (m.status === 'recognizing text')             splashStep(SPLASH_STEPS.OCR_WARM)
      },
      errorHandler: ()=>{},
    })

    splashStep(SPLASH_STEPS.OCR_WARM)
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

// ── Updated OCR runner with cancellation ──────────────────────────────────────
async function runOcrOnRegion(croppedDataURL, cropRect) {
  // Cancel any ongoing OCR
  if (currentOcrController) {
    currentOcrController.abort();
    currentOcrController = null;
  }

  const controller = new AbortController();
  currentOcrController = controller;

  sendToControl('debug-event', { event: 'ocr-start', data: {}, ts: Date.now() });
  log('OCR', 'Starting on cropped region', cropRect);
  sendToOverlay('scan-start', cropRect);

  try {
    const { bubbles, rawWords, rawLines, fullText } = await runOcr(croppedDataURL, {
      confidenceThreshold: 40,
      maxBubbles: 60,
      cropOffset: { x: cropRect.x, y: cropRect.y },
      onProgress: pct => {
        sendToControl('ocr-progress', pct);
        sendToOverlay('scan-progress', { pct, cropRect });
      },
      signal: controller.signal,
    });

    // If aborted, ignore results
    if (controller.signal.aborted) return;

    log('OCR', 'Done', { bubbles: bubbles.length, words: rawWords.length, lines: rawLines.length });
    sendToControl('ocr-results', bubbles);
    sendToControl('ocr-debug', { rawWords, rawLines, fullText,
      summary: { totalWords: rawWords.length, totalLines: rawLines.length, bubblesFound: bubbles.length } });
    sendToControl('debug-event', { event: 'ocr-done', data: { count: bubbles.length }, ts: Date.now() });
    sendToOverlay('scan-done', { bubbles, cropRect });
    if (bubbles.length > 0) sendToOverlay('show-bubbles', bubbles);
  } catch (err) {
    if (controller.signal.aborted) {
      log('OCR', 'Cancelled');
      sendToControl('debug-event', { event: 'ocr-cancelled', data: {}, ts: Date.now() });
    } else {
      log('OCR', 'ERR', { message: err.message });
      sendToControl('screenshot-error', { message: err.message });
      sendToControl('debug-event', { event: 'ocr-error', data: { message: err.message }, ts: Date.now() });
      sendToOverlay('scan-done', { bubbles: [], cropRect });
    }
  } finally {
    if (currentOcrController === controller) currentOcrController = null;
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
    show: false,
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
    show: false,
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

  createSplashWindow()
  splashStep(SPLASH_STEPS.LAUNCHING)

  splashStep(SPLASH_STEPS.LOADING_UI)
  createControlWindow()
  createOverlayWindow()

  const uiReady = Promise.all([
    loadWithRetry(controlWin, 'control'),
    loadWithRetry(overlayWin, 'overlay'),
  ])

  const warmReady = prewarmTesseract()

  await Promise.all([uiReady, warmReady])

  splashStep(SPLASH_STEPS.READY)
  await new Promise(r => setTimeout(r, 350))

  controlWin.show()
  overlayWin.show()

  if (IS_DEV) controlWin.webContents.openDevTools({mode:'detach'})

  closeSplash()

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