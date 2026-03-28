import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── Styles ─────────────────────────────────────────────────────────────────────
const C = {
  bg:'#0a0a0a', surface:'#111', border:'#1e1e1e', border2:'#2a2a2a',
  text:'#e8e8e8', dim:'#666', dimmer:'#333',
  green:'#4ade80', greenBg:'#14532d', red:'#f87171', redBg:'#450a0a',
  yellow:'#fbbf24', yellowBg:'#422006', blue:'#93c5fd', blueBg:'#1e3a5f',
  purple:'#c084fc', purpleBg:'#2e1065', indigo:'#a5b4fc', indigoBg:'#1e1b4b',
  accent:'#4f46e5', titlebar:'#080808',
}
const s = {
  root:{ display:'flex', flexDirection:'column', height:'100vh', background:C.bg, color:C.text,
    fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:12, overflow:'hidden',
    borderRadius:0, userSelect:'none' },

  // ── Custom titlebar
  titlebar:{ height:40, background:C.titlebar, display:'flex', alignItems:'center',
    flexShrink:0, WebkitAppRegion:'drag', borderBottom:`1px solid #1a1a1a`,
    paddingLeft:14, gap:10 },
  tbLogo:{ width:22,height:22,borderRadius:6,
    background:'linear-gradient(135deg,#7c5cf6,#3b82f6)',
    display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0 },
  tbTitle:{ fontWeight:700, fontSize:13, color:'#fff', letterSpacing:'-0.01em', flexShrink:0 },
  tbSub:{ fontSize:10, color:C.dim, marginLeft:2 },
  tbBadges:{ display:'flex', gap:3, marginLeft:'auto', WebkitAppRegion:'no-drag', paddingRight:4 },
  tbControls:{ display:'flex', WebkitAppRegion:'no-drag', height:'100%', marginLeft:8 },
  tbBtn:(hover,color)=>({ width:46, height:'100%', border:'none', cursor:'pointer', background:'transparent',
    display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, color:C.dim,
    transition:'background 0.1s, color 0.1s',
    ':hover':{ background: color||'#222', color:'#fff' }
  }),

  header:{ padding:'10px 14px 8px', borderBottom:`1px solid ${C.border2}`, display:'flex', alignItems:'center', gap:10, flexShrink:0 },
  logo:{ width:26,height:26,borderRadius:7,background:'linear-gradient(135deg,#7c5cf6,#3b82f6)',
    display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0 },
  badge:(c)=>({ padding:'2px 7px',borderRadius:10,fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',
    background:c==='green'?C.greenBg:c==='red'?C.redBg:c==='yellow'?C.yellowBg:c==='blue'?C.blueBg:c==='purple'?C.purpleBg:C.indigoBg,
    color:c==='green'?C.green:c==='red'?C.red:c==='yellow'?C.yellow:c==='blue'?C.blue:c==='purple'?C.purple:C.indigo }),
  tabs:{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:'#0d0d0d' },
  tab:(a)=>({ padding:'7px 13px',fontSize:11,cursor:'pointer',border:'none',background:'none',
    color:a?'#fff':C.dim, borderBottom:a?`2px solid ${C.accent}`:'2px solid transparent', fontWeight:a?600:400 }),
  pane:{ flex:1, overflowY:'auto', padding:'12px 14px' },
  btn:(v='default',disabled=false)=>({
    padding:'6px 13px',borderRadius:5,border:'none',cursor:disabled?'not-allowed':'pointer',
    fontSize:11,fontWeight:500,opacity:disabled?0.5:1,transition:'opacity 0.15s',
    background:v==='primary'?C.accent:v==='capture'?C.greenBg:v==='select'?'#1a3a4a':v==='danger'?C.redBg:C.surface,
    color:v==='capture'?C.green:v==='select'?C.blue:v==='danger'?C.red:C.text }),
  sTitle:{ fontSize:10,fontWeight:600,color:C.dim,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6 },
  row:{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 0',borderBottom:`1px solid ${C.border}` },
  label:{ color:C.dim }, value:{ color:C.text,fontFamily:'monospace',fontSize:11 },
  tbl:{ width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:'monospace',marginTop:4 },
  th:{ textAlign:'left',padding:'4px 6px',borderBottom:`1px solid ${C.border2}`,color:C.dim,fontSize:10,
    textTransform:'uppercase',letterSpacing:'0.06em',position:'sticky',top:0,background:C.bg },
  td:(c)=>({ padding:'3px 6px',borderBottom:`1px solid #141414`,
    color:c==='green'?C.green:c==='blue'?C.blue:c==='red'?C.red:c==='dim'?C.dimmer:c==='yellow'?C.yellow:C.text,
    maxWidth:c==='wide'?280:c==='med'?160:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }),
  logEntry:(t)=>({ padding:'2px 0',borderBottom:'1px solid #0f0f0f',display:'flex',gap:6,fontSize:11,fontFamily:'monospace',
    color:t==='match'?C.green:t==='nomatch'?C.dim:t==='ocr'?C.blue:t==='error'?C.red:t==='capture'?'#6ee7b7':'#9ca3af' }),
}

function fmt(ts) { return new Date(ts).toLocaleTimeString('en',{hour12:false}) }

// ── Custom titlebar window controls ──────────────────────────────────────────
function TitleBar({ capBadge, ocrBadge, ocrLabel, selecting, captureState }) {
  const [hovMin, setHovMin]   = useState(false)
  const [hovMax, setHovMax]   = useState(false)
  const [hovClose, setHovClose] = useState(false)

  const btnBase = {
    width:46, height:'100%', border:'none', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:12, transition:'background 0.1s, color 0.1s',
    WebkitAppRegion:'no-drag', background:'transparent',
  }
  return (
    <div style={s.titlebar}>
      <div style={s.tbLogo}>∑</div>
      <span style={s.tbTitle}>Math Scanner</span>
      <span style={s.tbSub}>· Phase 6</span>
      <div style={s.tbBadges}>
        <span style={s.badge(capBadge)}>{captureState}</span>
        <span style={s.badge(ocrBadge)}>OCR {ocrLabel}</span>
        {selecting && <span style={s.badge('blue')}>selecting…</span>}
      </div>
      <div style={s.tbControls}>
        <button style={{...btnBase, color: hovMin?'#fff':'#666', background: hovMin?'#2a2a2a':'transparent'}}
          onMouseEnter={()=>setHovMin(true)} onMouseLeave={()=>setHovMin(false)}
          onClick={()=>window.electronAPI.windowMinimize()}>
          ─
        </button>
        <button style={{...btnBase, color: hovMax?'#fff':'#666', background: hovMax?'#2a2a2a':'transparent'}}
          onMouseEnter={()=>setHovMax(true)} onMouseLeave={()=>setHovMax(false)}
          onClick={()=>window.electronAPI.windowMaximize()}>
          ▢
        </button>
        <button style={{...btnBase, color: hovClose?'#fff':'#666', background: hovClose?'#c0392b':'transparent', borderRadius:'0 0 0 0'}}
          onMouseEnter={()=>setHovClose(true)} onMouseLeave={()=>setHovClose(false)}
          onClick={()=>window.electronAPI.windowClose()}>
          ✕
        </button>
      </div>
    </div>
  )
}

export default function ControlApp() {
  const [tab,          setTab]         = useState('capture')
  const [windowInfo,   setWindowInfo]  = useState(null)
  const [captureState, setCaptureState]= useState('idle')
  const [screenshot,   setScreenshot]  = useState(null)
  const [captureError, setCaptureError]= useState(null)
  const [selecting,    setSelecting]   = useState(false)   // waiting for overlay selection
  const [ocrState,     setOcrState]    = useState('idle')
  const [ocrPct,       setOcrPct]      = useState(0)
  const [ocrResults,   setOcrResults]  = useState([])
  const [ocrDebug,     setOcrDebug]    = useState(null)
  const [logEntries,   setLogEntries]  = useState([])
  const [lastCrop,     setLastCrop]    = useState(null)

  const screenshotRef = useRef(null) // always-current screenshot for use in callbacks
  const logEndRef     = useRef(null)

  const pushLog = (type,msg,detail='') =>
    setLogEntries(p=>[...p.slice(-999),{id:Date.now()+Math.random(),
      ts:new Date().toISOString().split('T')[1].slice(0,12),type,msg,detail}])

  // ── Crop screenshot and send to OCR ────────────────────────────────────────
  function cropAndOcr(screenRect) {
    const shot = screenshotRef.current
    if (!shot) { pushLog('error','No screenshot — capture first'); return }

    setSelecting(false)
    setLastCrop(screenRect)
    setOcrState('running')
    setOcrPct(0)
    setOcrResults([])
    setOcrDebug(null)
    pushLog('ocr',`Cropping ${screenRect.w}×${screenRect.h} at (${screenRect.x},${screenRect.y})`)

    const img = new Image()
    img.onload = () => {
      const canvas    = document.createElement('canvas')
      canvas.width    = screenRect.w
      canvas.height   = screenRect.h
      const ctx       = canvas.getContext('2d')
      ctx.drawImage(img, screenRect.x, screenRect.y, screenRect.w, screenRect.h,
                         0, 0, screenRect.w, screenRect.h)
      const croppedDataURL = canvas.toDataURL('image/png')
      pushLog('ocr',`Cropped ${Math.round(croppedDataURL.length*3/4/1024)}KB — sending to OCR`)
      window.electronAPI.runOcrOnRegion(croppedDataURL, screenRect)
    }
    img.src = shot.dataURL
  }

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(()=>{
    window.electronAPI.getWindowInfo().then(i=>{ setWindowInfo(i); pushLog('ipc','window info') })

    const cleaners = [
      window.electronAPI.onDebugEvent(({event,data})=>{
        const t=event.startsWith('capture')?'capture':event.startsWith('ocr')?'ocr':'info'
        if (event==='capture-start'){ setCaptureState('capturing'); setOcrState('idle'); setOcrResults([]); setOcrDebug(null) }
        if (event==='capture-done') { setCaptureState('done') }
        if (event==='capture-error'){ setCaptureState('error') }
        if (event==='ocr-start')    { setOcrState('running'); setOcrPct(0) }
        if (event==='ocr-done')     { setOcrState('done') }
        if (event==='ocr-error')    { setOcrState('error') }
        pushLog(t,event,data?JSON.stringify(data):'')
      }),

      window.electronAPI.onScreenshotReady(p=>{
        setScreenshot(p)
        screenshotRef.current = p
        setCaptureError(null)
        pushLog('capture',`${p.width}×${p.height} ${p.sizeKb}KB`)
        // main.js already called enableOverlaySelection() after the full capture.
        // We just update the UI state here — don't re-call startOverlaySelection.
        setSelecting(true)
      }),

      window.electronAPI.onScreenshotError(({message})=>{
        setCaptureState('error'); setCaptureError(message); pushLog('error',message)
      }),

      window.electronAPI.onOcrResults(r=>{
        setOcrResults(r); pushLog('ocr',`${r.length} result(s)`)
        if (r.length>0) setTab('results')
      }),

      window.electronAPI.onOcrDebug(d=>{
        setOcrDebug(d)
        pushLog('ocr',`words:${d.summary.totalWords} lines:${d.summary.totalLines} bubbles:${d.summary.bubblesFound}`)
        if (d.summary.bubblesFound===0) setTab('lines')
      }),

      window.electronAPI.onOcrProgress(pct=>setOcrPct(pct)),

      // Overlay finished drawing — main forwards rect here for cropping
      window.electronAPI.onRegionSelected(rect=>{
        pushLog('ocr',`Overlay selection: ${rect.w}×${rect.h} at (${rect.x},${rect.y})`)
        cropAndOcr(rect)
      }),

      // Selection cancelled from overlay (Escape key)
      window.electronAPI.onSelectModeCancelled(()=>{
        setSelecting(false)
        pushLog('ocr','Selection cancelled')
      }),

      // Hotkey or external trigger
      window.electronAPI.onEnterSelectMode(()=>{
        setSelecting(true)
      }),
    ]
    return ()=>cleaners.forEach(c=>c())
  },[])

  useEffect(()=>{ logEndRef.current?.scrollIntoView({behavior:'smooth'}) },[logEntries])

  const busy = captureState==='capturing'

  function handleCapture() {
    if (busy) return
    setCaptureState('capturing')
    setCaptureError(null)
    setOcrResults([])
    setOcrDebug(null)
    setOcrState('idle')
    setSelecting(false)
    pushLog('capture','triggered')
    window.electronAPI.captureScreen()
    // After screenshot-ready fires, main has already enabled the overlay.
    // onScreenshotReady above sets selecting:true.
  }

  function handleSelectRegion() {
    if (ocrState==='running') return
    setSelecting(true)
    pushLog('ocr','starting overlay selection (page-change check in main)')
    // main.js will fingerprint-check and recapture if needed before enabling overlay
    window.electronAPI.startOverlaySelection()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const capBadge  = captureState==='done'?'green':captureState==='error'?'red':captureState==='capturing'?'yellow':'indigo'
  const ocrBadge  = ocrState==='done'?'green':ocrState==='error'?'red':ocrState==='running'?'yellow':'indigo'
  const ocrLabel  = ocrState==='running'?`${ocrPct}%`:ocrState==='done'?`${ocrResults.length} found`:ocrState==='error'?'error':'idle'

  return (
    <div style={s.root}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        button:hover:not(:disabled){opacity:0.85}
        * { box-sizing: border-box; }`}</style>

      {/* Custom Titlebar */}
      <TitleBar capBadge={capBadge} ocrBadge={ocrBadge} ocrLabel={ocrLabel}
        selecting={selecting} captureState={captureState} />

      {/* Tabs */}
      <div style={s.tabs}>
        {['capture','lines','results','log'].map(t=>(
          <button key={t} style={s.tab(tab===t)} onClick={()=>setTab(t)}>
            {t==='lines'?`Lines${ocrDebug?` (${ocrDebug.rawLines.length})`:''}`
            :t==='results'?`Results (${ocrResults.length})`
            :t==='log'?`Log (${logEntries.length})`
            :'Capture'}
          </button>
        ))}
      </div>

      {/* ── TAB: Capture ── */}
      {tab==='capture' && (
        <div style={s.pane}>
          {/* Action bar */}
          <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
            <button style={s.btn('capture',busy)} disabled={busy} onClick={handleCapture}>
              {busy ? '📸 Capturing…' : '📸 Capture screen'}
            </button>
            <button style={s.btn('select', ocrState==='running')}
              disabled={ocrState==='running'}
              onClick={handleSelectRegion}>
              {selecting ? '⏳ Draw on screen…' : '🔲 Select region'}
            </button>
            <button style={s.btn('danger')}
              onClick={()=>{ window.electronAPI.clearOverlay(); setOcrResults([]); setOcrDebug(null); setOcrState('idle') }}>
              Clear overlay
            </button>
            <span style={{color:C.dim,fontSize:11,marginLeft:'auto'}}>Ctrl+Shift+M</span>
          </div>

          {/* Overlay selection status */}
          {selecting && (
            <div style={{background:'rgba(14,165,233,0.1)',border:'1px solid rgba(14,165,233,0.3)',
              borderRadius:6,padding:'8px 12px',marginBottom:8,fontSize:11,color:'#93c5fd',lineHeight:1.5}}>
              <strong>🖱 Draw on your main screen</strong> — drag a box around the math equation.<br/>
              <span style={{color:C.dim}}>The dark overlay with crosshair is on your main display. Press Esc to cancel.</span>
            </div>
          )}

          {captureError && (
            <div style={{color:C.red,fontSize:11,marginTop:6}}>✗ {captureError}</div>
          )}

          {/* Screenshot preview (read-only — selection happens on screen) */}
          {screenshot && (
            <div style={{position:'relative',background:'#000',borderRadius:7,overflow:'hidden',
              border:`1px solid ${C.border2}`,marginBottom:8}}>
              <img src={screenshot.dataURL} alt="preview"
                style={{width:'100%',height:'auto',display:'block',userSelect:'none'}}/>
              {lastCrop && (
                <div style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.7)',
                  color:C.blue,fontSize:10,padding:'2px 6px',borderRadius:4,fontFamily:'monospace'}}>
                  Last scan: {lastCrop.w}×{lastCrop.h}
                </div>
              )}
              <div style={{position:'absolute',bottom:6,left:'50%',transform:'translateX(-50%)',
                background:'rgba(0,0,0,0.6)',color:C.dim,fontSize:10,padding:'2px 8px',borderRadius:4,whiteSpace:'nowrap'}}>
                Preview — selection happens on main screen
              </div>
            </div>
          )}

          {!screenshot && (
            <div style={{background:C.surface,borderRadius:7,border:`1px solid ${C.border2}`,
              minHeight:90,display:'flex',alignItems:'center',justifyContent:'center',
              color:C.dimmer,fontSize:12,marginBottom:8}}>
              No capture yet — press 📸 or Ctrl+Shift+M
            </div>
          )}

          {/* OCR progress bar */}
          {ocrState==='running' && (
            <div style={{marginTop:8}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.dim,marginBottom:3}}>
                <span>Running OCR…</span><span>{ocrPct}%</span>
              </div>
              <div style={{height:4,background:C.border2,borderRadius:2,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${ocrPct}%`,background:C.accent,borderRadius:2,transition:'width 0.1s'}}/>
              </div>
            </div>
          )}

          {/* Screenshot meta */}
          {screenshot && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginTop:8}}>
              {[['Resolution',`${screenshot.width}×${screenshot.height}`],
                ['Size',`${screenshot.sizeKb}KB`],
                ['Time',fmt(screenshot.ts)]].map(([l,v])=>(
                <div key={l} style={{background:C.surface,borderRadius:5,padding:'5px 8px',border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:9,color:C.dim,textTransform:'uppercase'}}>{l}</div>
                  <div style={{fontSize:11,fontFamily:'monospace',marginTop:2}}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* OCR summary */}
          {ocrDebug && (
            <div style={{background:C.surface,borderRadius:6,padding:'8px 10px',border:`1px solid ${C.border}`,marginTop:8}}>
              <div style={s.sTitle}>OCR Summary</div>
              {[['Words read',ocrDebug.summary.totalWords],
                ['Lines found',ocrDebug.summary.totalLines],
                ['Results',ocrDebug.summary.bubblesFound],
                ['Full text (preview)',ocrDebug.fullText?.slice(0,200)??'—']].map(([l,v])=>(
                <div key={l} style={{...s.row,alignItems:'flex-start'}}>
                  <span style={s.label}>{l}</span>
                  <span style={{...s.value,textAlign:'right',maxWidth:340,wordBreak:'break-all',
                    color:typeof v==='number'&&v===0?C.red:C.text}}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {windowInfo && (
            <div style={{marginTop:8}}>
              <div style={s.sTitle}>Window info</div>
              {[['Display',`${windowInfo.display.width}×${windowInfo.display.height}`],
                ['Mode',windowInfo.isDev?'dev':'prod']].map(([l,v])=>(
                <div key={l} style={s.row}><span style={s.label}>{l}</span><span style={s.value}>{v}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Lines ── */}
      {tab==='lines' && (
        <div style={s.pane}>
          {!ocrDebug ? (
            <div style={{color:C.dim,padding:'20px 0'}}>No scan yet. Capture and select a region.</div>
          ) : (
            <>
              <div style={{fontSize:11,color:C.dim,marginBottom:8}}>
                Yellow = vertical math assembled from multiple lines.
                Green = individual line matched a pattern.
                Dim = not matched / skipped.
              </div>
              <table style={s.tbl}>
                <thead><tr>
                  <th style={s.th}>#</th>
                  <th style={s.th}>Text</th>
                  <th style={s.th}>Conf</th>
                  <th style={s.th}>Pattern</th>
                </tr></thead>
                <tbody>
                  {ocrDebug.rawLines.map((ln,i)=>(
                    <tr key={i} style={{
                      background: ln.vertical ? 'rgba(250,204,21,0.08)'
                                 : ln.pattern && !ln.skipped ? 'rgba(20,83,45,0.15)'
                                 : 'transparent',
                      opacity: ln.skipped ? 0.4 : 1,
                    }}>
                      <td style={s.td('dim')}>{i+1}</td>
                      <td style={{...s.td('wide'),
                        color: ln.vertical ? C.yellow
                               : ln.pattern && !ln.skipped ? C.green
                               : C.text}} title={ln.raw}>
                        {ln.vertical && '⊞ '}{ln.raw}
                      </td>
                      <td style={s.td(ln.avgConf>70?'green':ln.avgConf>40?'':'red')}>{ln.avgConf}</td>
                      <td style={s.td(ln.vertical?'yellow':ln.pattern?'green':'dim')}>
                        {ln.skipped ? '(absorbed)' : ln.pattern ?? 'no match'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* ── TAB: Results ── */}
      {tab==='results' && (
        <div style={s.pane}>
          {ocrResults.length === 0 ? (
            <div style={{color:C.dim,padding:'20px 0'}}>
              {ocrState==='running' ? 'Scanning…' : 'No results yet.'}
            </div>
          ) : (
            <table style={s.tbl}>
              <thead><tr>
                <th style={s.th}>#</th>
                <th style={s.th}>Equation</th>
                <th style={s.th}>Answer</th>
                <th style={s.th}>Type</th>
              </tr></thead>
              <tbody>
                {ocrResults.map((r,i)=>(
                  <tr key={r.id} style={{background: r.type?.includes('vertical') ? 'rgba(250,204,21,0.06)' : 'transparent'}}>
                    <td style={s.td('dim')}>{i+1}</td>
                    <td style={s.td('wide')} title={r.equation}>
                      {r.type?.includes('vertical') && '⊞ '}{r.equation}
                    </td>
                    <td style={{...s.td(r.type?.includes('vertical') ? 'yellow' : 'green')}}>{r.answer}</td>
                    <td style={s.td('blue')}>{r.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB: Log ── */}
      {tab==='log' && (
        <div style={{...s.pane,fontFamily:'monospace',fontSize:11}}>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:6}}>
            <button style={s.btn()} onClick={()=>setLogEntries([])}>Clear</button>
          </div>
          {logEntries.map(e=>(
            <div key={e.id} style={s.logEntry(e.type)}>
              <span style={{color:C.dimmer,flexShrink:0}}>{e.ts}</span>
              <span style={{color:'#444',flexShrink:0}}>[{e.type}]</span>
              <span>{e.msg}</span>
              {e.detail && <span style={{color:'#444',wordBreak:'break-all'}}>{e.detail}</span>}
            </div>
          ))}
          <div ref={logEndRef}/>
        </div>
      )}
    </div>
  )
}
