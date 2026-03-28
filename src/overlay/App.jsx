import React, { useState, useEffect, useRef } from 'react'

// ── Full-screen selection canvas ──────────────────────────────────────────────
function SelectionCanvas({ onSelected, onCancel }) {
  const canvasRef  = useRef(null)
  const dragging   = useRef(false)
  const startPt    = useRef(null)
  const currentRect= useRef(null)
  const animFrame  = useRef(null)

  // Initial paint + key handler
  useEffect(() => {
    document.body.style.cursor = 'crosshair'
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)

    // Size canvas to window and draw initial dark overlay
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      paint(null)
    }

    return () => {
      document.body.style.cursor = 'default'
      window.removeEventListener('keydown', onKey)
      if (animFrame.current) cancelAnimationFrame(animFrame.current)
    }
  }, [])

  function paint(r) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Dark screen overlay
    ctx.fillStyle = 'rgba(0,0,0,0.50)'
    ctx.fillRect(0, 0, W, H)

    if (r && r.w > 1 && r.h > 1) {
      // Punch out selected area so the real screen shows through
      ctx.clearRect(r.x, r.y, r.w, r.h)

      // Selection border
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth   = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
      ctx.setLineDash([])

      // Corner handles
      const HS = 8
      ctx.fillStyle = '#38bdf8'
      ;[ [r.x, r.y], [r.x+r.w-HS, r.y], [r.x, r.y+r.h-HS], [r.x+r.w-HS, r.y+r.h-HS] ]
        .forEach(([hx,hy]) => ctx.fillRect(hx, hy, HS, HS))

      // Size label
      const label = `${Math.round(r.w)} × ${Math.round(r.h)}`
      ctx.font = 'bold 12px monospace'
      const tw = ctx.measureText(label).width
      const lx = Math.min(r.x, W - tw - 12)
      const ly = r.y > 24 ? r.y - 6 : r.y + r.h + 18
      ctx.fillStyle = 'rgba(14,165,233,0.9)'
      ctx.fillRect(lx - 4, ly - 14, tw + 8, 18)
      ctx.fillStyle = '#fff'
      ctx.fillText(label, lx, ly)
    }

    // Instruction banner at the top
    const msg = r && r.w > 10 ? 'Release to scan this region • Esc to cancel'
                               : 'Drag to select the math region • Esc to cancel'
    ctx.font = '14px -apple-system, sans-serif'
    const mw = ctx.measureText(msg).width
    const bx = (W - mw) / 2 - 12
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.beginPath()
    ctx.roundRect(bx, 8, mw + 24, 28, 6)
    ctx.fill()
    ctx.fillStyle = '#93c5fd'
    ctx.fillText(msg, bx + 12, 27)
  }

  function schedulePaint() {
    if (animFrame.current) cancelAnimationFrame(animFrame.current)
    animFrame.current = requestAnimationFrame(() => paint(currentRect.current))
  }

  function getXY(e) { return { x: e.clientX, y: e.clientY } }

  function onMouseDown(e) {
    e.preventDefault()
    const pt   = getXY(e)
    startPt.current = pt
    dragging.current = true
    currentRect.current = { x: pt.x, y: pt.y, w: 0, h: 0 }
    schedulePaint()
  }

  function onMouseMove(e) {
    if (!dragging.current || !startPt.current) return
    const pt = getXY(e)
    currentRect.current = {
      x: Math.min(pt.x, startPt.current.x),
      y: Math.min(pt.y, startPt.current.y),
      w: Math.abs(pt.x - startPt.current.x),
      h: Math.abs(pt.y - startPt.current.y),
    }
    schedulePaint()
  }

  function onMouseUp(e) {
    if (!dragging.current) return;
    dragging.current = false;
    const r = currentRect.current;
    if (!r || r.w < 10 || r.h < 10) { onCancel(); return; }
    // Add margin
    const margin = 10;
    const expanded = {
      x: Math.max(0, Math.round(r.x) - margin),
      y: Math.max(0, Math.round(r.y) - margin),
      w: Math.round(r.w) + 2 * margin,
      h: Math.round(r.h) + 2 * margin,
    };
    onSelected(expanded);
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ position:'fixed', inset:0, width:'100%', height:'100%',
               cursor:'crosshair', pointerEvents:'auto', zIndex:9999 }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    />
  )
}

// ── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ x, y, equation, answer, type }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const isVertical = type?.includes('vertical')
  const color =
    isVertical                                              ? '#facc15' :
    type==='arith'||type==='arithmetic'||type==='addition' ? '#6ee7b7' :
    type==='solve'||type==='solve-trig'                    ? '#fbbf24' :
    type==='verify'                                         ? '#86efac' :
    type==='dot'||type==='magnitude'                        ? '#93c5fd' :
    type==='error'                                          ? '#f87171' : '#a5b4fc'

  return (
    <div style={{
      position:'absolute', left:x, top:y,
      background:'rgba(10,10,10,0.93)',
      border:`1px solid ${color}`,
      borderRadius:8, padding:'4px 10px',
      boxShadow:`0 0 14px ${color}55`,
      transform: visible?'translateY(0) scale(1)':'translateY(-6px) scale(0.92)',
      opacity: visible?1:0,
      transition:'all 0.2s cubic-bezier(.34,1.56,.64,1)',
      pointerEvents:'none', maxWidth:280,
    }}>
      <div style={{fontSize:10,color:'#555',fontFamily:'monospace',marginBottom:1,
        whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
        {isVertical ? '⊞ ' : ''}{equation}
      </div>
      <div style={{fontSize:15,fontWeight:700,color,fontFamily:'monospace'}}>{answer}</div>
    </div>
  )
}

// ── Scan animation ────────────────────────────────────────────────────────────
function ScanOverlay({ cropRect, progress }) {
  if (!cropRect) return null
  const { x, y, w, h } = cropRect
  return (
    <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
      <defs>
        <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#38bdf8" stopOpacity="0"/>
          <stop offset="50%"  stopColor="#38bdf8" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0"/>
        </linearGradient>
        <clipPath id="regionClip">
          <rect x={x} y={y} width={w} height={h}/>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.3)"/>
      <rect x={x} y={y} width={w} height={h} fill="transparent"/>
      <rect x={x} y={y} width={w} height={h}
        fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="8 4"
        style={{ animation:'dash 1s linear infinite' }}/>
      {[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([cx,cy],i)=>(
        <circle key={i} cx={cx} cy={cy} r={4} fill="#38bdf8"/>
      ))}
      {progress > 0 && progress < 100 && (
        <g clipPath="url(#regionClip)">
          <rect x={x} y={y + (h*progress/100) - 20} width={w} height={40}
            fill="url(#scanGrad)" style={{ filter:'blur(2px)' }}/>
          <line x1={x} y1={y+h*progress/100} x2={x+w} y2={y+h*progress/100}
            stroke="#38bdf8" strokeWidth="1.5" opacity="0.9"/>
        </g>
      )}
      {progress > 0 && progress < 100 && (
        <text x={x+w-4} y={y-6} textAnchor="end" fontSize="11" fontFamily="monospace" fill="#38bdf8" opacity="0.8">
          {progress}%
        </text>
      )}
      {progress >= 100 && (
        <rect x={x} y={y} width={w} height={h}
          fill="rgba(74,222,128,0.08)" stroke="#4ade80" strokeWidth="2" rx="4"/>
      )}
    </svg>
  )
}

// ── Root overlay ──────────────────────────────────────────────────────────────
export default function OverlayApp() {
  const [bubbles,     setBubbles]     = useState([])
  const [scanRect,    setScanRect]    = useState(null)
  const [scanPct,     setScanPct]     = useState(0)
  const [isSelecting, setIsSelecting] = useState(false)
  const doneTimer = useRef(null)

  useEffect(() => {
    const api = window.electronAPI

    const cleaners = [
      api.onShowBubbles(b  => setBubbles(b)),

      // Activate full-screen selection mode
      api.onEnterSelectMode(() => {
        setIsSelecting(true)
        setScanRect(null)
        setScanPct(0)
      }),

      api.onScanStart(rect => {
        setScanRect(rect); setScanPct(0); setBubbles([])
        clearTimeout(doneTimer.current)
      }),

      api.onScanProgress(({ pct }) => setScanPct(pct)),

      api.onScanDone(({ bubbles: b }) => {
        setScanPct(100); setBubbles(b)
        doneTimer.current = setTimeout(() => {
          setScanRect(null); setScanPct(0)
        }, 1200)
      }),

      api.onScanClear(() => {
        setBubbles([]); setScanRect(null); setScanPct(0); setIsSelecting(false)
      }),

      api.onOverlayInit(() => {}),
    ]
    return () => { cleaners.forEach(c=>c()); clearTimeout(doneTimer.current) }
  }, [])

  function handleRegionSelected(rect) {
    setIsSelecting(false)
    window.electronAPI.sendRegionSelected(rect)
  }

  function handleSelectionCancelled() {
    setIsSelecting(false)
    window.electronAPI.cancelOverlaySelection()
  }

  return (
    <div style={{ position:'fixed', inset:0, overflow:'hidden',
                  pointerEvents: isSelecting ? 'auto' : 'none' }}>
      <style>{`@keyframes dash { to { stroke-dashoffset: -24; } }`}</style>

      {/* Full-screen region selector (active when isSelecting) */}
      {isSelecting && (
        <SelectionCanvas
          onSelected={handleRegionSelected}
          onCancel={handleSelectionCancelled}
        />
      )}

      {/* Scan animation layer (shown during OCR) */}
      {!isSelecting && scanRect && (
        <ScanOverlay cropRect={scanRect} progress={scanPct}/>
      )}

      {/* Result bubbles */}
      {!isSelecting && bubbles.map(b => (
        <Bubble key={b.id} x={b.x} y={b.y} equation={b.equation} answer={b.answer} type={b.type}/>
      ))}
    </div>
  )
}
