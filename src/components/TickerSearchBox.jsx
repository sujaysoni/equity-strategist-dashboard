import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const RATING_COLORS = {
  BUY:  { bg: 'color-mix(in oklch,var(--color-buy)  14%,transparent)', border: 'color-mix(in oklch,var(--color-buy)  35%,transparent)', text: 'var(--color-buy)'  },
  HOLD: { bg: 'color-mix(in oklch,var(--color-hold) 14%,transparent)', border: 'color-mix(in oklch,var(--color-hold) 35%,transparent)', text: 'var(--color-hold)' },
  SELL: { bg: 'color-mix(in oklch,var(--color-sell) 14%,transparent)', border: 'color-mix(in oklch,var(--color-sell) 35%,transparent)', text: 'var(--color-sell)' },
}

const HORIZON_LABELS = {
  ultra_short: 'Ultra Short (0–3m)',
  short:       'Short (0–12m)',
  medium:      'Medium (0–36m)',
  long:        'Long (0–60m)',
  ultra_long:  'Ultra Long (0–360m)',
}

function sortByScore(stocks, horizon) {
  return [...stocks].sort((a, b) => {
    const ratingOrder = { BUY: 0, HOLD: 1, SELL: 2 }
    const ra = ratingOrder[a.horizons?.[horizon]?.rating] ?? 1
    const rb = ratingOrder[b.horizons?.[horizon]?.rating] ?? 1
    if (ra !== rb) return ra - rb
    const sa = a.horizons?.[horizon]?.score ?? 0
    const sb = b.horizons?.[horizon]?.score ?? 0
    return sb - sa
  })
}

function ScoreBar({ score, color }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100))
  return (
    <div style={{ position: 'relative', height: '6px', borderRadius: '3px', background: 'var(--color-surface-offset)', overflow: 'hidden', flex: 1 }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${pct}%`,
        background: color,
        borderRadius: '3px',
        transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)',
        boxShadow: `0 0 8px ${color}`,
      }} />
    </div>
  )
}

function ReasonBadge({ label, positive }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 9px',
      borderRadius: 'var(--radius-full)',
      fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.02em',
      background: positive
        ? 'color-mix(in oklch,var(--color-buy) 10%,transparent)'
        : 'color-mix(in oklch,var(--color-sell) 10%,transparent)',
      border: positive
        ? '1px solid color-mix(in oklch,var(--color-buy) 25%,transparent)'
        : '1px solid color-mix(in oklch,var(--color-sell) 25%,transparent)',
      color: positive ? 'var(--color-buy)' : 'var(--color-sell)',
    }}>
      {positive ? '✓' : '✗'} {label}
    </span>
  )
}

function buildReasoning(stock, horizon) {
  const h = stock.horizons?.[horizon]
  if (!h) return []
  const reasons = []
  if (h.rating === 'BUY')  reasons.push({ label: `Rated BUY on ${HORIZON_LABELS[horizon]}`, positive: true })
  if (h.rating === 'HOLD') reasons.push({ label: `Rated HOLD — monitor closely`, positive: null })
  if (h.rating === 'SELL') reasons.push({ label: `Rated SELL on ${HORIZON_LABELS[horizon]}`, positive: false })
  if (h.score != null) reasons.push({ label: `Composite score: ${h.score.toFixed(2)} / 10`, positive: h.score >= 6 })
  if (stock.roe != null) reasons.push({ label: `ROE: ${(stock.roe * 100).toFixed(1)}%`, positive: stock.roe > 0.12 })
  if (stock.net_debt_ebitda != null) reasons.push({ label: `Net Debt/EBITDA: ${stock.net_debt_ebitda.toFixed(1)}x`, positive: stock.net_debt_ebitda < 4.0 })
  if (stock.fcf_yield != null && stock.div_yield != null) {
    reasons.push({ label: `FCF yield (${(stock.fcf_yield*100).toFixed(1)}%) ${stock.fcf_yield > stock.div_yield ? '>' : '≤'} Div yield (${(stock.div_yield*100).toFixed(1)}%)`, positive: stock.fcf_yield > stock.div_yield })
  }
  if (stock.revenue_cagr_5y != null) reasons.push({ label: `5Y Revenue CAGR: ${(stock.revenue_cagr_5y*100).toFixed(1)}%`, positive: stock.revenue_cagr_5y > 0.05 })
  if (stock.above_50ma != null)  reasons.push({ label: stock.above_50ma  ? 'Price above 50-day MA'  : 'Price below 50-day MA',  positive: !!stock.above_50ma })
  if (stock.above_200ma != null) reasons.push({ label: stock.above_200ma ? 'Price above 200-day MA' : 'Price below 200-day MA', positive: !!stock.above_200ma })
  if (stock.rsi != null) {
    const rsiLabel = stock.rsi < 30 ? 'RSI oversold (<30) — potential entry' : stock.rsi > 70 ? 'RSI overbought (>70) — caution' : `RSI neutral (${stock.rsi.toFixed(0)})`
    reasons.push({ label: rsiLabel, positive: stock.rsi < 30 ? true : stock.rsi > 70 ? false : null })
  }
  if (stock.insider_buying != null) reasons.push({ label: stock.insider_buying ? 'Open-market insider buying detected' : 'No recent insider buying', positive: !!stock.insider_buying })
  if (stock.cap_tier) {
    const capLabel = { mega: 'Mega-cap (≥$200B)', large: 'Large-cap ($10B–$200B)', mid: 'Mid-cap ($2B–$10B)', small: 'Small-cap (<$2B)' }[stock.cap_tier]
    reasons.push({ label: capLabel, positive: null })
  }
  return reasons
}

/* ── Portal dropdown ── */
function SuggestionsPortal({ anchorRef, suggestions, horizon, onSelect }) {
  const [rect, setRect] = useState(null)
  useEffect(() => {
    if (!anchorRef.current) return
    const update = () => setRect(anchorRef.current.getBoundingClientRect())
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef])
  if (!rect || suggestions.length === 0) return null
  return createPortal(
    <div style={{
      position: 'fixed',
      top: `${rect.bottom + 6}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      zIndex: 99999,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: '0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
      overflow: 'hidden',
      animation: 'fadeIn 0.15s ease',
    }}>
      {suggestions.map(s => {
        const sh = s.horizons?.[horizon]
        const rc = sh?.rating ? RATING_COLORS[sh.rating] : null
        return (
          <button key={s.ticker} onMouseDown={() => onSelect(s.ticker)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '10px 14px',
              background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-divider)',
              cursor: 'pointer', textAlign: 'left', transition: 'background 120ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.87rem', color: 'var(--color-primary)', letterSpacing: '0.05em' }}>{s.ticker}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.name || ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)' }}>{s._market}</span>
              {rc && <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '0.65rem', fontWeight: 700, background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text }}>{sh.rating}</span>}
            </div>
          </button>
        )
      })}
    </div>,
    document.body
  )
}

/* ── Result modal ── */
function ResultModal({ result, h, ratingStyle, reasons, horizon, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  if (!result || !h) return null
  return createPortal(
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.18s ease',
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 99999,
        width: 'min(720px, 94vw)', maxHeight: '88vh', overflowY: 'auto',
        borderRadius: 'var(--radius-xl)',
        border: `1px solid ${ratingStyle?.border || 'var(--color-border)'}`,
        background: 'var(--color-surface)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        animation: 'slideUp 0.22s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '12px', right: '14px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-faint)', fontSize: '1.1rem', lineHeight: 1,
          padding: '4px 6px', borderRadius: 'var(--radius-md)', transition: 'color 150ms, background 150ms', zIndex: 1,
        }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.background = 'var(--color-surface-offset)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-faint)'; e.currentTarget.style.background = 'transparent' }}
          title="Close (Esc)">✕</button>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '10px', padding: '16px 48px 16px 18px',
          background: ratingStyle ? `color-mix(in oklch,${ratingStyle.text} 5%,var(--color-surface))` : 'var(--color-surface)',
          borderBottom: '1px solid var(--color-divider)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-primary)', letterSpacing: '0.06em' }}>{result.stock.ticker}</span>
            {result.stock.name && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{result.stock.name}</span>}
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-faint)', padding: '2px 8px', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)' }}>{result.market}</span>
          </div>
          {ratingStyle && (
            <span style={{ padding: '5px 18px', borderRadius: 'var(--radius-full)', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.06em', background: ratingStyle.bg, border: `1px solid ${ratingStyle.border}`, color: ratingStyle.text }}>{h.rating}</span>
          )}
        </div>

        {/* Rank row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--color-divider)' }}>
          {[
            { label: 'Overall Rank', value: `#${result.globalRank}`, sub: `of all ${result.isCad ? 'CAD' : 'USD'} stocks` },
            { label: `${result.stock.cap_tier ? result.stock.cap_tier.charAt(0).toUpperCase() + result.stock.cap_tier.slice(1) + '-cap' : 'Cap'} Rank`, value: `#${result.tierRank}`, sub: 'within cap tier' },
            { label: 'Score', value: h.score != null ? h.score.toFixed(2) : '—', sub: 'out of 10.00' },
            { label: 'In Top 30', value: result.inTop30 ? '✓ Yes' : '✗ No', sub: 'current view', color: result.inTop30 ? 'var(--color-buy)' : 'var(--color-text-muted)' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ flex: '1 1 120px', padding: '14px 16px', borderRight: '1px solid var(--color-divider)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-faint)', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.25rem', color: color || 'var(--color-text)' }}>{value}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', marginTop: '2px' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Score bar */}
        {h.score != null && (
          <div style={{ padding: '12px 18px 8px', borderBottom: '1px solid var(--color-divider)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-faint)', whiteSpace: 'nowrap' }}>Score</span>
              <ScoreBar score={h.score} color={ratingStyle?.text || 'var(--color-primary)'} />
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color: ratingStyle?.text || 'var(--color-primary)', whiteSpace: 'nowrap' }}>{h.score.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Horizon grid */}
        {result.stock.horizons && (
          <div style={{ display: 'flex', flexWrap: 'wrap', padding: '10px 18px', borderBottom: '1px solid var(--color-divider)', background: 'color-mix(in oklch,var(--color-surface-offset) 50%,transparent)' }}>
            {Object.entries(HORIZON_LABELS).map(([hKey, hLabel]) => {
              const hData = result.stock.horizons[hKey]
              if (!hData) return null
              const rc = hData.rating ? RATING_COLORS[hData.rating] : null
              const isActive = hKey === horizon
              return (
                <div key={hKey} style={{ flex: '1 1 80px', textAlign: 'center', padding: '8px', borderRadius: 'var(--radius-md)', background: isActive ? (rc?.bg || 'transparent') : 'transparent', border: isActive ? `1px solid ${rc?.border || 'var(--color-border)'}` : '1px solid transparent' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)', marginBottom: '3px' }}>{hLabel.split(' ')[0]}<br/>{hLabel.split(' ').slice(1).join(' ')}</div>
                  {rc && <div style={{ fontWeight: 800, fontSize: '0.72rem', color: rc.text, letterSpacing: '0.04em' }}>{hData.rating}</div>}
                  {hData.score != null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.67rem', color: 'var(--color-text-muted)' }}>{hData.score.toFixed(1)}</div>}
                </div>
              )
            })}
          </div>
        )}

        {/* Reasoning */}
        <div style={{ padding: '14px 18px 18px' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-faint)', marginBottom: '8px' }}>Why this rating?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {reasons.map((r, i) => <ReasonBadge key={i} label={r.label} positive={r.positive === null ? true : r.positive} />)}
          </div>
          {h.thesis && (
            <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.6, fontStyle: 'italic' }}>
              💬 {h.thesis}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

// TickerSearchBox now accepts cadRaw/usdRaw (full unsorted universe)
export default function TickerSearchBox({ cadRaw, usdRaw, cadSorted, usdSorted, horizon }) {
  const [query,     setQuery]     = useState('')
  const [result,    setResult]    = useState(null)
  const [focused,   setFocused]   = useState(false)
  const [notFound,  setNotFound]  = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const inputRef   = useRef(null)
  const wrapperRef = useRef(null)

  // Full universe sorted by score for rank lookup — independent of tile sort direction
  const cadAllSorted = useMemo(() => sortByScore(cadRaw, horizon), [cadRaw, horizon])
  const usdAllSorted = useMemo(() => sortByScore(usdRaw, horizon), [usdRaw, horizon])

  // Flat combined list for autocomplete — searches entire universe
  const combined = useMemo(() => [
    ...cadRaw.map(s => ({ ...s, _market: 'CAD' })),
    ...usdRaw.map(s => ({ ...s, _market: 'USD' })),
  ], [cadRaw, usdRaw])

  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    // Match ticker starts-with first, then name contains, dedupe
    const startsWith = combined.filter(s => s.ticker?.toUpperCase().startsWith(q))
    const nameMatch  = combined.filter(s =>
      !s.ticker?.toUpperCase().startsWith(q) &&
      s.name?.toUpperCase().includes(q)
    )
    return [...startsWith, ...nameMatch].slice(0, 10)
  }, [query, combined])

  const handleSearch = useCallback((ticker) => {
    const q = (ticker || query).trim().toUpperCase()
    if (!q) return

    const cadIdx = cadAllSorted.findIndex(s => s.ticker?.toUpperCase() === q)
    const usdIdx = usdAllSorted.findIndex(s => s.ticker?.toUpperCase() === q)

    if (cadIdx === -1 && usdIdx === -1) {
      setResult(null); setNotFound(true); setModalOpen(false)
      return
    }

    setNotFound(false)
    const isCad     = cadIdx !== -1
    const stock     = isCad ? cadAllSorted[cadIdx] : usdAllSorted[usdIdx]
    const globalRank = isCad ? cadIdx + 1 : usdIdx + 1
    const market    = isCad ? 'CAD 🍁' : 'USD 🦅'

    const tierList  = isCad
      ? cadAllSorted.filter(s => s.cap_tier === stock.cap_tier)
      : usdAllSorted.filter(s => s.cap_tier === stock.cap_tier)
    const tierRank  = tierList.findIndex(s => s.ticker === stock.ticker) + 1

    const visibleList = isCad ? cadSorted : usdSorted
    const inTop30   = visibleList.some(s => s.ticker === stock.ticker)

    setResult({ stock, market, globalRank, tierRank, inTop30, isCad })
    setModalOpen(true)
  }, [query, cadAllSorted, usdAllSorted, cadSorted, usdSorted])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter')  handleSearch()
    if (e.key === 'Escape') { setQuery(''); setResult(null); setNotFound(false); setModalOpen(false) }
  }

  const handleSuggestionClick = (ticker) => {
    setQuery(ticker); setFocused(false)
    handleSearch(ticker)
    inputRef.current?.blur()
  }

  const closeModal = useCallback(() => { setModalOpen(false); setResult(null) }, [])

  const h           = result?.stock?.horizons?.[horizon]
  const ratingStyle = h?.rating ? RATING_COLORS[h.rating] : null
  const reasons     = result ? buildReasoning(result.stock, horizon) : []
  const showSuggestions = focused && suggestions.length > 0 && !result

  return (
    <div ref={wrapperRef} style={{ maxWidth: '720px', margin: '0 auto 32px', position: 'relative' }}>

      {/* Search input */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center',
        background: 'var(--color-surface)',
        border: `1px solid ${focused ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-xl)', padding: '10px 16px',
        boxShadow: focused ? '0 0 0 3px color-mix(in oklch,var(--color-primary) 15%,transparent)' : 'var(--shadow-sm)',
        transition: 'border-color 180ms ease, box-shadow 180ms ease',
      }}>
        <span style={{ fontSize: '1rem', opacity: 0.5 }}>🔍</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search any ticker or company… e.g. NVDA, AAPL, RY.TO, Shopify"
          value={query}
          onChange={e => { setQuery(e.target.value.toUpperCase()); setResult(null); setNotFound(false); setModalOpen(false) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 160)}
          style={{
            flex: 1, border: 'none', outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.95rem', fontWeight: 600,
            color: 'var(--color-text)', letterSpacing: '0.05em',
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResult(null); setNotFound(false); setModalOpen(false) }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-faint)', fontSize: '1rem', lineHeight: 1, padding: '0 2px' }}
            title="Clear">✕</button>
        )}
        <button onClick={() => handleSearch()}
          style={{
            padding: '5px 16px', borderRadius: 'var(--radius-full)', border: 'none',
            background: 'var(--color-primary)', color: '#fff',
            fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer',
            transition: 'opacity 160ms', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >Look up</button>
      </div>

      {/* Universe count hint */}
      {!query && (
        <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '0.68rem', color: 'var(--color-text-faint)' }}>
          Searching across <strong style={{ color: 'var(--color-text-muted)' }}>{cadRaw.length + usdRaw.length}</strong> stocks — {cadRaw.length} CAD · {usdRaw.length} USD
        </div>
      )}

      {/* Autocomplete portal */}
      {showSuggestions && (
        <SuggestionsPortal anchorRef={wrapperRef} suggestions={suggestions} horizon={horizon} onSelect={handleSuggestionClick} />
      )}

      {/* Not found */}
      {notFound && (
        <div className="fade-in" style={{
          marginTop: '10px', padding: '14px 18px',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)',
          background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontSize: '0.82rem',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span>🔎</span>
          <span><strong style={{ color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{query}</strong> was not found in the current dataset ({cadRaw.length + usdRaw.length} stocks tracked). It may not be in the universe yet — try triggering a refresh.</span>
        </div>
      )}

      {/* Result modal portal */}
      {modalOpen && result && h && (
        <ResultModal result={result} h={h} ratingStyle={ratingStyle} reasons={reasons} horizon={horizon} onClose={closeModal} />
      )}
    </div>
  )
}
