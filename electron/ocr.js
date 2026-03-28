/**
 * ocr.js — Phase 6 with eng model, PSM 6, fallback bubble
 */
'use strict'

let _math     = null
let _nerdamer = null

function getMath()     { if (!_math)    _math    = require('mathjs');    return _math }
function getNerdamer() {
  if (!_nerdamer) {
    _nerdamer = require('nerdamer')
    require('nerdamer/Algebra'); require('nerdamer/Calculus'); require('nerdamer/Solve')
  }
  return _nerdamer
}

// ── OCR symbol normalisation ──────────────────────────────────────────────────
const FIXES = [
  [/[×]/g,'*'],[/÷/g,'/'],[/[—–−]/g,'-'],[/\u00b2/g,'^2'],[/\u00b3/g,'^3'],
  [/\u221a/g,'sqrt'],[/\u03c0/g,'pi'],[/O(?=\d)/g,'0'],[/\s*\^\s*/g,'^'],[/==/g,'='],
  [/\bx\b/g,'*'],
  [/[«»‹›]/g,''],
  [/[\u201C\u201D\u201E\u201F\u2018\u2019\u0022\u0027]1(?=\d|$|\s)/g,'4'],
  [/"1(?=\d|$|\s)/g,'4'],
  [/'1(?=\d|$|\s)/g,'4'],
  [/[^\x20-\x7E]/g,''],
]
function norm(s) { for (const [p,r] of FIXES) s=s.replace(p,r); return s.trim() }

// ── Math patterns ─────────────────────────────────────────────────────────────
const PATTERNS = [
  { name:'arith',      re:/\d\s*[+\-\*\/]\s*\d/ },
  { name:'equation-x', re:/\d*\s*[xX]\s*[+\-\*\/\^]?[\s\d]*=\s*-?\d/ },
  { name:'trig',       re:/\b(?:sin|cos|tan|sec|csc|cot)\s*[\^(]/i },
  { name:'vector-dot', re:/\(\s*-?\d[\d\s,.\\-]*\)\s*[·*•]\s*\(\s*-?\d/ },
  { name:'fraction',   re:/\([\d\s+\-*x^.]+\)\/\([\d\s+\-*x^.]+\)/ },
  { name:'poly',       re:/[xX]\^?\d?\s*[+\-]\s*\d/ },
  { name:'loose',      re:/\d\s*[+\-\/\*=]\s*\d/ },
]
function matchPattern(text) { for (const {name,re} of PATTERNS) if (re.test(text)) return name; return null }

function hasVar(expr) {
  return expr.replace(/\b(pi|e|sqrt|sin|cos|tan|sec|csc|cot|abs|log|exp)\b/gi,'')
             .replace(/\d/g,'').replace(/[\s+\-*/^().,=]/g,'').length > 0
}
function fmt(v) {
  if (typeof v!=='number') return String(v)
  if (!isFinite(v)) return String(v)
  if (Math.abs(v-Math.round(v))<1e-10) return String(Math.round(v))
  return parseFloat(v.toPrecision(4)).toString()
}

function solve(raw) {
  const math = getMath()
  let expr = norm(raw).replace(/=\s*$/,'').trim()
  const eqIdx = expr.indexOf('=')
  const isEq  = eqIdx>0 && eqIdx<expr.length-1
  const hasV  = hasVar(isEq ? expr.replace('=','-') : expr)

  if (!hasV) {
    if (isEq) {
      try {
        const [l,r] = expr.split('=')
        const lv=math.evaluate(l.trim()), rv=math.evaluate(r.trim())
        return { type:'verify', answer: Math.abs(lv-rv)<1e-9?`✓ ${fmt(lv)}`:`✗ ${fmt(lv)}≠${fmt(rv)}` }
      } catch {}
    }
    try { return { type:'arith', answer: fmt(math.evaluate(expr)) } }
    catch(e) { return { type:'error', answer:`err: ${e.message.slice(0,40)}` } }
  }
  if (/\b(sin|cos|tan)\b/i.test(expr) && isEq) {
    try {
      const nd=getNerdamer(), [l,r]=expr.split('=')
      const s=nd.solve(`(${l})-(${r})`,'x')
      if (s?.length) return { type:'solve-trig', answer:`x=${s.map(x=>x.toString()).join(',')}` }
    } catch {}
  }
  if (isEq) {
    try {
      const nd=getNerdamer(), [l,r]=expr.split('=')
      const s=nd.solve(`(${l})-(${r})`,'x')
      if (s?.length) return { type:'solve', answer:`x=${s.map(x=>x.toString()).join(',')}` }
      return { type:'solve', answer:'no real solution' }
    } catch(e) { return { type:'error', answer:`err: ${e.message.slice(0,40)}` } }
  }
  try { return { type:'simplify', answer:getNerdamer()(expr).toString() } }
  catch(e) { return { type:'error', answer:`err: ${e.message.slice(0,40)}` } }
}

// ── Word → line grouping ──────────────────────────────────────────────────────
function groupLines(words, yThr=14) {
  if (!words.length) return []
  const sorted=[...words].sort((a,b)=>a.bbox.y0-b.bbox.y0)
  const lines=[]; let cur=[sorted[0]]
  for (let i=1;i<sorted.length;i++) {
    if (Math.abs(sorted[i].bbox.y0-cur[cur.length-1].bbox.y0)<=yThr) cur.push(sorted[i])
    else { lines.push(cur); cur=[sorted[i]] }
  }
  lines.push(cur)
  return lines.map(ws=>ws.sort((a,b)=>a.bbox.x0-b.bbox.x0))
}

function linesToRaw(groupedLines) {
  return groupedLines.map(lw => {
    const text  = lw.map(w=>w.text).join(' ')
    const normed= norm(text)
    const x0    = Math.min(...lw.map(w=>w.bbox.x0))
    const y0    = Math.min(...lw.map(w=>w.bbox.y0))
    const x1    = Math.max(...lw.map(w=>w.bbox.x1))
    const avgC  = Math.round(lw.reduce((s,w)=>s+w.confidence,0)/lw.length)
    return { raw:text, norm:normed, avgConf:avgC, x0, y0, x1 }
  })
}

// ── Vertical math detection ────────────────────────────────────────────────────
const BARE_NUM  = /^\s*\d[\d,. ]*\s*$/
const OP_NUM    = /^\s*([+\-×÷*\/])\s*(\d[\d,. ]*)\s*$/
const SEPARATOR = /^[\-_=\s]{2,}$|^[_=]{1,}$/

function detectVerticalMath(rawLines) {
  const assembled = []
  const usedIdx   = new Set()

  for (let i = 0; i < rawLines.length; i++) {
    if (usedIdx.has(i)) continue
    const top = rawLines[i]
    if (!BARE_NUM.test(top.norm)) continue

    const topNum = top.norm.trim().replace(/[, ]/g,'')
    const parts  = [{ op: null, num: topNum }]
    let j = i + 1

    while (j < rawLines.length && !usedIdx.has(j)) {
      const ln = rawLines[j]
      const m  = ln.norm.match(OP_NUM)
      if (m) {
        let op  = m[1]
        if (op==='×') op='*'
        if (op==='÷') op='/'
        const num = m[2].replace(/[, ]/g,'')
        parts.push({ op, num })
        j++
      } else if (SEPARATOR.test(ln.norm.trim())) {
        j++
      } else {
        break
      }
    }

    if (parts.length >= 2) {
      const expr = parts[0].num + ' ' +
        parts.slice(1).map(p=>`${p.op} ${p.num}`).join(' ')
      const slice = rawLines.slice(i, j)
      const x0 = Math.min(...slice.map(l=>l.x0))
      const y0 = top.y0
      const x1 = Math.max(...slice.map(l=>l.x1))
      assembled.push({ expr: norm(expr), x0, y0, x1, spanEnd: j - 1 })
      for (let k = i; k < j; k++) usedIdx.add(k)
    }
  }

  return { assembled, usedIdx }
}

// ── Extract words from various Tesseract data structures ───────────────────────
function extractWordsFromData(data) {
  if (data.words && Array.isArray(data.words) && data.words.length > 0) {
    console.log('Using data.words, count:', data.words.length);
    return data.words;
  }

  if (data.layoutBlocks && Array.isArray(data.layoutBlocks)) {
    console.log('Checking layoutBlocks');
    const words = [];
    for (const block of data.layoutBlocks) {
      if (block.paragraphs) {
        for (const para of block.paragraphs) {
          if (para.lines) {
            for (const line of para.lines) {
              if (line.words) {
                for (const word of line.words) {
                  words.push({
                    text: word.text,
                    confidence: word.confidence,
                    bbox: word.bbox,
                  });
                }
              }
            }
          }
        }
      }
    }
    if (words.length) {
      console.log('Extracted from layoutBlocks, count:', words.length);
      return words;
    }
  }

  if (data.blocks && Array.isArray(data.blocks)) {
    console.log('Checking blocks');
    const words = [];
    for (const block of data.blocks) {
      if (block.paragraphs) {
        for (const para of block.paragraphs) {
          if (para.lines) {
            for (const line of para.lines) {
              if (line.words) {
                for (const word of line.words) {
                  words.push({
                    text: word.text,
                    confidence: word.confidence,
                    bbox: word.bbox,
                  });
                }
              }
            }
          }
        }
      }
      if (block.lines) {
        for (const line of block.lines) {
          if (line.words) {
            for (const word of line.words) {
              words.push({
                text: word.text,
                confidence: word.confidence,
                bbox: word.bbox,
              });
            }
          }
        }
      }
    }
    if (words.length) {
      console.log('Extracted from blocks, count:', words.length);
      return words;
    }
  }

  console.log('No words found in any structure');
  return [];
}

// ── Main export ────────────────────────────────────────────────────────────────
async function runOcr(dataURL, opts = {}) {
  const {
    confidenceThreshold = 20,
    maxBubbles = 60,
    cropOffset = { x: 0, y: 0 },
    onProgress = () => {},
    signal,
  } = opts;

  const { createWorker } = require('tesseract.js');

  const worker = await createWorker('eng', 1, {
    langPath: process.cwd(),
  });

  if (signal?.aborted) {
    await worker.terminate();
    throw new Error('OCR cancelled');
  }

  let abortHandler = null;
  if (signal) {
    abortHandler = () => {
      worker.terminate().catch(() => {});
    };
    signal.addEventListener('abort', abortHandler);
  }

  try {
    // PSM 6 = uniform block of text (good for math)
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: '0123456789+-*/=()',
    });

    const { data } = await worker.recognize(dataURL);

    console.log('data.text length:', data.text?.length);
    if (data.text) console.log('data.text snippet:', data.text.slice(0, 200));
    console.log('data.blocks length:', data.blocks?.length);
    console.log('data.layoutBlocks length:', data.layoutBlocks?.length);

    let allWords = extractWordsFromData(data);

    if (signal?.aborted) throw new Error('OCR cancelled');

    // Fallback: if no words but text exists, create a single bubble
    if (allWords.length === 0 && data.text?.trim()) {
      console.log('No words, using fallback bubble from full text');
      const fullText = data.text.trim();
      const result = solve(fullText);
      const dummyBubble = {
        id: `fallback-${Date.now()}`,
        x: cropOffset.x + 8,
        y: cropOffset.y + 8,
        equation: fullText,
        answer: result.answer,
        type: result.type,
      };
      return {
        bubbles: [dummyBubble],
        rawWords: [],
        rawLines: [],
        fullText,
      };
    }

    if (allWords.length === 0) {
      return { bubbles: [], rawWords: [], rawLines: [], fullText: data.text ?? '' };
    }

    const filteredWords = allWords.filter(w => w.confidence >= confidenceThreshold);
    const allRawLines   = linesToRaw(groupLines(allWords));

    const { assembled: vertMath, usedIdx: vertUsedIdx } = detectVerticalMath(allRawLines);
    const filteredGrouped = groupLines(filteredWords);
    const bubbles = [];

    for (const vm of vertMath) {
      const result = solve(vm.expr);
      bubbles.push({
        id:       `vert-${Date.now()}-${bubbles.length}`,
        x:        vm.x1 + cropOffset.x + 8,
        y:        vm.y0 + cropOffset.y,
        equation: vm.expr,
        answer:   result.answer,
        type:     result.type + '-vertical',
      });
    }

    for (const lw of filteredGrouped) {
      if (bubbles.length >= maxBubbles) break;

      const text   = lw.map(w=>w.text).join(' ');
      const normed = norm(text);
      const x0     = Math.min(...lw.map(w=>w.bbox.x0));
      const y0     = Math.min(...lw.map(w=>w.bbox.y0));
      const x1     = Math.max(...lw.map(w=>w.bbox.x1));

      const absorbedByVertical = allRawLines.some(
        (al, idx) => vertUsedIdx.has(idx) && Math.abs(al.y0 - y0) < 8
      );
      const isLoneNumber = BARE_NUM.test(normed);

      if (absorbedByVertical || isLoneNumber) continue;

      const pat = matchPattern(normed);
      if (!pat) continue;

      const result = solve(normed);
      bubbles.push({
        id:       `${Date.now()}-${bubbles.length}`,
        x:        x1 + cropOffset.x + 8,
        y:        y0 + cropOffset.y,
        equation: normed.trim(),
        answer:   result.answer,
        type:     result.type,
      });
    }

    return {
      bubbles,
      rawWords: allWords,
      rawLines: allRawLines,
      fullText: data.text ?? '',
    };
  } catch (err) {
    if (signal?.aborted) throw new Error('OCR cancelled');
    throw err;
  } finally {
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    try { await worker.terminate(); } catch {}
  }
}

module.exports = { runOcr, norm, matchPattern, solve };