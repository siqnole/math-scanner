const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  ping:              ()  => ipcRenderer.invoke('ping'),
  getWindowInfo:     ()  => ipcRenderer.invoke('get-window-info'),
  getLastScreenshot: ()  => ipcRenderer.invoke('get-last-screenshot'),

  // Custom titlebar controls
  windowMinimize:    ()  => ipcRenderer.send('window-minimize'),
  windowMaximize:    ()  => ipcRenderer.send('window-maximize'),
  windowClose:       ()  => ipcRenderer.send('window-close'),
  windowIsMaximized: ()  => ipcRenderer.invoke('window-is-maximized'),

  captureScreen:        ()    => ipcRenderer.send('capture-screen'),
  clearOverlay:         ()    => ipcRenderer.send('overlay-clear'),
  toggleOverlayMouse:   (v)   => ipcRenderer.send('overlay-toggle-mouse', v),
  sendTestBubble:       (p)   => ipcRenderer.send('overlay-test-bubble', p),
  overlaySelectionMode: (v)   => ipcRenderer.send('overlay-selection-mode', v),

  // Phase 4: send cropped region for OCR
  runOcrOnRegion: (croppedDataURL, cropRect) =>
    ipcRenderer.send('run-ocr-on-region', { croppedDataURL, cropRect }),

  // Phase 5: full-screen overlay selection
  startOverlaySelection:  ()     => ipcRenderer.send('start-overlay-selection'),
  cancelOverlaySelection: ()     => ipcRenderer.send('cancel-overlay-selection'),
  sendRegionSelected:     (rect) => ipcRenderer.send('overlay-region-selected', rect),  // overlay → main

  // ── Listeners ──────────────────────────────────────────────────────────────
  onDebugEvent:      cb => { ipcRenderer.on('debug-event',       (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('debug-event') },
  onScreenshotReady: cb => { ipcRenderer.on('screenshot-ready',  (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('screenshot-ready') },
  onScreenshotError: cb => { ipcRenderer.on('screenshot-error',  (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('screenshot-error') },
  onOcrResults:      cb => { ipcRenderer.on('ocr-results',       (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('ocr-results') },
  onOcrDebug:        cb => { ipcRenderer.on('ocr-debug',         (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('ocr-debug') },
  onOcrProgress:     cb => { ipcRenderer.on('ocr-progress',      (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('ocr-progress') },
  onShowBubbles:     cb => { ipcRenderer.on('show-bubbles',      (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('show-bubbles') },
  onOverlayInit:     cb => { ipcRenderer.on('overlay-init',      (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('overlay-init') },
  onEnterSelectMode: cb => { ipcRenderer.on('enter-select-mode', (_  )=>cb() ); return ()=>ipcRenderer.removeAllListeners('enter-select-mode') },

  // Phase 5: overlay reports selection back to control
  onRegionSelected:      cb => { ipcRenderer.on('region-selected',      (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('region-selected') },
  onSelectModeCancelled: cb => { ipcRenderer.on('select-mode-cancelled',(_  )=>cb() ); return ()=>ipcRenderer.removeAllListeners('select-mode-cancelled') },

  // Overlay-specific
  onScanStart:    cb => { ipcRenderer.on('scan-start',    (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('scan-start') },
  onScanProgress: cb => { ipcRenderer.on('scan-progress', (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('scan-progress') },
  onScanDone:     cb => { ipcRenderer.on('scan-done',     (_,p)=>cb(p)); return ()=>ipcRenderer.removeAllListeners('scan-done') },
  onScanClear:    cb => { ipcRenderer.on('scan-clear',    (_  )=>cb() ); return ()=>ipcRenderer.removeAllListeners('scan-clear') },
})
