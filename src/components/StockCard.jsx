import { useState } from 'react'

/* ─── SEMANTIC PALETTE ─────────────────────────────────────────── */
const RS = {
  BUY:  { bg: 'rgba(46,134,95,.18)',   border: '#2E865F', color: '#2E865F', glow: 'rgba(46,134,95,.30)'  },
  HOLD: { bg: 'rgba(156,163,175,.12)', border: '#9CA3AF', color: '#9CA3AF', glow: 'rgba(156,163,175,.18)'},
  SELL: { bg: 'rgba(255,0,0,.12)',     border: '#FF0000', color: '#FF0000', glow: 'rgba(255,0,0,.25)'    },
}

/* ─── HORIZON CONTEXT ──────────────────────────────────────────── */
const HX = {
  ultra_short: {
    fundamental: ['ROE', 'FCF Yield'],
    technical:   'RSI momentum + volume surge',
    macro:       'Earnings date / PDUFA catalyst / MOC imbalance',
    risks:       ['Earnings miss vs consensus', 'Sector rotation out of momentum names'],
    sortNote:    'Ranked by RSI momentum & volume surge',
  },
  short: {
    fundamental: ['ROE', 'ND/EBITDA', 'Revenue CAGR'],
    technical:   'Price vs 50-day MA + RSI trend',
    macro:       'Bank of Canada / Fed rate trajectory impact on sector',
    risks:       ['Rate hike surprise', 'Revenue growth deceleration'],
    sortNote:    'Ranked by short-term price momentum & fundamentals',
  },
  medium: {
    fundamental: ['ROE vs 12% threshold', 'ND/EBITDA vs 4x cap', 'FCF Yield vs Div Yield'],
    technical:   'Price vs 200-day MA trend integrity',
    macro:       'WCS/WTI spread (energy) or AISC cost curve (mining)',
    risks:       ['EBITDA compression from input cost inflation', 'Dividend cut signal'],
    sortNote:    'Ranked by quality screen: ROE + FCF sustainability',
  },
  long: {
    fundamental: ['ROE compounding', 'ND/EBITDA deleveraging path', 'FCF reinvestment rate'],
    technical:   '200-day MA slope + multi-year base formation',
    macro:       'AI infrastructure moat / AISC reserve quality / Lassonde Curve',
    risks:       ['Competitive moat erosion', 'Jurisdiction/regulatory risk for resource names'],
    sortNote:    'Ranked by earnings compounding & balance sheet strength',
  },
  ultra_long: {
    fundamental: ['Economic Moat width', 'TAM expansion rate', 'FCF margin trajectory', 'ROE sustainability'],
    technical:   'Decade-scale price channel & accumulation patterns',
    macro:       'Demographics, CO₂/capita trends, energy transition, resource lifecycle',
    risks:       ['Structural demand shift (e.g. EV vs oil)', 'Population decline in core markets'],
    sortNote:    'Re-ranked by Economic Moat & Total Addressable Market (TAM)',
  },
}

/* ─── EXCHANGE BADGE ───────────────────────────────────────────── */
function ExchangeBadge({ exchange, market }) {
  const label = exchange || (market === 'CAD' ? 'TSX' : 'NYSE')
  const isCAD = market === 'CAD'
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-md"
          style={{
            background: isCAD ? 'rgba(0,212,170,.10)' : 'rgba(96,165,250,.10)',
            color:       isCAD ? '#00d4aa'             : '#60a5fa',
            border:      `1px solid ${isCAD ? 'rgba(0,212,170,.20)' : 'rgba(96,165,250,.20)'}`,
            fontFamily:  'Inter, sans-serif',
            letterSpacing: '0.05em',
          }}>
      {label}
    </span>
  )
}

/* ─── METRIC CHIP ──────────────────────────────────────────────── */
function MetricChip({ label, value, good, warn, neutral }) {
  const color = good ? '#2E865F' : warn ? '#FF0000' : neutral ? '#9CA3AF' : '#6b7280'
  const bg    = good ? 'rgba(46,134,95,.10)' : warn ? 'rgba(255,0,0,.08)' : 'rgba(255,255,255,.04)'
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg"
         style={{ background: bg, border: `1px solid ${color}28` }}>
      <span className="text-xs font-medium mb-0.5" style={{ color: '#6b7280' }}>{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{value ?? '—'}</span>
    </div>
  )
}

/* ─── RISK BADGE ───────────────────────────────────────────────── */
function RiskBadge({ text }) {
  return (
    <div className="flex items-start gap-2 text-xs py-1.5 px-3 rounded-lg"
         style={{ background: 'rgba(255,0,0,.06)', border: '1px solid rgba(255,0,0,.15)', color: '#f87171' }}>
      <span className="mt-0.5 flex-shrink-0">⚠</span>
      <span>{text}</span>
    </div>
  )
}

/* ─── YAHOO FINANCE URL ────────────────────────────────────────── */
function yahooUrl(ticker) {
  return `https://ca.finance.yahoo.com/quote/${encodeURIComponent(ticker)}`
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function StockCard({ stock, horizon }) {
  const [expanded, setExpanded] = useState(false)

  const h      = stock.horizons?.[horizon]
  const rating = h?.rating || 'HOLD'
  const thesis = h?.thesis  || 'No thesis available.'
  const score  = h?.score   || 50
  const rs     = RS[rating] || RS.HOLD
  const ctx    = HX[horizon] || HX.short
  const isUp   = stock.change_pct >= 0
  const above200 = stock.price > stock.ma200

  const sectorMatch = thesis.match(/\[.*?·\s*(.*?)\]/)
  const sector = sectorMatch ? sectorMatch[1] : stock.market

  const yUrl  = stock.yahoo_url || yahooUrl(stock.ticker)
  const currency = stock.currency === 'USD' ? '$' : 'C$'

  /* Ultra-long moat note */
  const isUltraLong = horizon === 'ultra_long'
  const capB = stock.market_cap_usd ? (stock.market_cap_usd / 1e9).toFixed(0) : null

  return (
    <div
      className="rounded-2xl transition-all duration-300 select-none"
      style={{
        background:           'rgba(10,12,16,0.75)',
        backdropFilter:       'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border:               `1px solid ${expanded ? rs.border + '80' : 'rgba(255,255,255,0.08)'}`,
        boxShadow:            expanded
          ? `0 0 28px ${rs.glow}, 0 4px 40px rgba(0,0,0,0.5)`
          : '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* ── FORENSIC BANNER ── */}
      {stock.shenanigan_flag && (
        <div className="rounded-t-2xl px-4 py-2 text-xs font-semibold flex items-center gap-2"
             style={{ background: 'rgba(245,158,11,.12)', color: '#f59e0b',
                      borderBottom: '1px solid rgba(245,158,11,.20)' }}>
          🚩 Forensic Flag · {stock.shenanigan_detail}
        </div>
      )}

      {/* ══ COLLAPSED VIEW ══════════════════════════════════════ */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center justify-between gap-3">

          {/* LEFT — Avatar + Ticker + Name + Exchange */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Monogram avatar */}
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0
                            font-black text-sm"
                 style={{ background: rs.bg, color: rs.color,
                          border: `1.5px solid ${rs.border}44`,
                          fontFamily: 'Inter, sans-serif',
                          letterSpacing: '-0.02em' }}>
              {stock.ticker.replace('.TO','').replace('-','').slice(0,3)}
            </div>

            <div className="min-w-0">
              {/* Ticker — 20% larger, bold, Yahoo link */}
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={yUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-black hover:underline flex items-center gap-1"
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.05rem',
                           color: 'inherit', letterSpacing: '-0.01em' }}
                  onClick={e => e.stopPropagation()}
                >
                  {stock.ticker}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                       style={{ opacity: 0.35, flexShrink: 0 }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
                <ExchangeBadge exchange={stock.exchange} market={stock.market} />
              </div>

              {/* Company name */}
              <div className="text-xs truncate mt-0.5"
                   style={{ color: '#6b7280', maxWidth: '160px', fontFamily: 'Inter, sans-serif' }}>
                {stock.name}
              </div>

              {/* Sector */}
              <div className="text-xs mt-0.5" style={{ color: '#374151', fontFamily: 'Inter, sans-serif' }}>
                {sector}
              </div>
            </div>
          </div>

          {/* CENTER — Price + Change */}
          <div className="text-right flex-shrink-0">
            <div className="font-black text-lg tabular-nums leading-tight"
                 style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }}>
              {currency}{stock.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs font-bold mt-0.5 tabular-nums"
                 style={{ color: isUp ? '#2E865F' : '#FF0000' }}>
              {isUp ? '▲' : '▼'} {Math.abs(stock.change_pct).toFixed(2)}%
            </div>
          </div>

          {/* RIGHT — Rating + Score + Caret */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-black px-3 py-1.5 rounded-full"
                    style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '0.06em',
                             background: rs.bg, color: rs.color,
                             border: `1px solid ${rs.border}`,
                             boxShadow: `0 0 10px ${rs.glow}` }}>
                {rating}
              </span>
              <span className="text-xs tabular-nums" style={{ color: '#4b5563' }}>
                {score}/100
              </span>
            </div>

            {/* Caret */}
            <div style={{ transition: 'transform 300ms ease',
                          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          color: '#4b5563' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

        </div>

        {/* Score bar */}
        <div className="mt-3 h-1 rounded-full overflow-hidden"
             style={{ background: 'rgba(255,255,255,.06)' }}>
          <div className="h-full rounded-full"
               style={{ width: `${score}%`, transition: 'width 700ms ease',
                        background: `linear-gradient(90deg, ${rs.border}66, ${rs.border})` }} />
        </div>
      </div>

      {/* ══ EXPANDED — DEEP DIVE ════════════════════════════════ */}
      {expanded && (
        <div className="px-4 pb-5 pt-1"
             style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
             onClick={e => e.stopPropagation()}>

          {/* Ultra-long moat notice */}
          {isUltraLong && (
            <div className="mt-3 mb-4 flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(165,124,34,.10)', border: '1px solid rgba(165,124,34,.25)',
                          color: '#d4aa3a' }}>
              <span>🏰</span>
              <span><strong>Ultra Long view:</strong> ranked by Economic Moat & TAM — RSI momentum de-weighted</span>
            </div>
          )}

          {/* ── A: THE WHY ── */}
          <div className="mt-4 mb-4">
            <div className="text-xs font-black uppercase tracking-widest mb-2"
                 style={{ color: rs.color, fontFamily: 'Inter, sans-serif' }}>
              § The Why
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1', fontFamily: 'Inter, sans-serif' }}>
              {thesis.replace(/\[.*?\]\s*/, '').split(' | ')[0]}
            </p>
            {thesis.split(' | ')[1] && (
              <p className="text-sm leading-relaxed mt-1" style={{ color: '#9ba8b4', fontFamily: 'Inter, sans-serif' }}>
                {thesis.split(' | ').slice(1).join(' | ')}
              </p>
            )}
          </div>

          {/* ── B: DATA MATRIX ── */}
          <div className="mb-4">
            <div className="text-xs font-black uppercase tracking-widest mb-3"
                 style={{ color: rs.color, fontFamily: 'Inter, sans-serif' }}>
              § Data Matrix
            </div>

            {/* Fundamentals row */}
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider"
                 style={{ color: '#4b5563', fontFamily: 'Inter, sans-serif' }}>
              Fundamentals
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
              {stock.roe != null && stock.roe !== 0 && (
                <MetricChip label="ROE" value={`${stock.roe.toFixed(1)}%`}
                            good={stock.roe > 12} warn={stock.roe < 8} />
              )}
              {stock.nd_ebitda != null && stock.nd_ebitda < 90 && (
                <MetricChip label="ND/EBITDA" value={`${stock.nd_ebitda.toFixed(1)}x`}
                            good={stock.nd_ebitda < 2} warn={stock.nd_ebitda > 4} />
              )}
              {stock.fcf_yield != null && (
                <MetricChip label="FCF Yield" value={`${stock.fcf_yield.toFixed(1)}%`}
                            good={stock.fcf_yield > stock.div_yield && stock.fcf_yield > 0}
                            warn={stock.fcf_yield < stock.div_yield} />
              )}
              {stock.div_yield != null && stock.div_yield > 0 && (
                <MetricChip label="Div Yield" value={`${stock.div_yield.toFixed(1)}%`} neutral />
              )}
              {stock.revenue_cagr != null && stock.revenue_cagr !== 0 && (
                <MetricChip label="Rev CAGR" value={`${stock.revenue_cagr.toFixed(1)}%`}
                            good={stock.revenue_cagr > 10} warn={stock.revenue_cagr < 0} />
              )}
              {isUltraLong && capB && (
                <MetricChip label="Mkt Cap" value={`$${capB}B`}
                            good={stock.market_cap_usd > 100e9} neutral={stock.market_cap_usd <= 100e9} />
              )}
            </div>

            {/* Technicals row */}
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider"
                 style={{ color: '#4b5563', fontFamily: 'Inter, sans-serif' }}>
              Technicals
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <MetricChip label="RSI (14)" value={stock.rsi?.toFixed(0)}
                          good={stock.rsi < 40} warn={stock.rsi > 70}
                          neutral={stock.rsi >= 40 && stock.rsi <= 70} />
              <MetricChip label="vs 200-MA"
                          value={above200 ? 'Above ✓' : 'Below ✗'}
                          good={above200} warn={!above200} />
            </div>

            {/* MA distance */}
            {stock.ma200 > 0 && (
              <div className="text-xs px-3 py-2 rounded-lg mb-3"
                   style={{ background: 'rgba(255,255,255,.03)',
                            border: '1px solid rgba(255,255,255,.06)',
                            color: '#9ba8b4', fontFamily: 'Inter, sans-serif' }}>
                <span className="font-semibold" style={{ color: '#6b7280' }}>200-MA distance: </span>
                {(((stock.price - stock.ma200) / stock.ma200) * 100).toFixed(1)}%
                &nbsp;·&nbsp;
                <span className="font-semibold" style={{ color: '#6b7280' }}>Signal: </span>
                {ctx.technical}
              </div>
            )}

            {/* Macro catalyst */}
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider"
                 style={{ color: '#4b5563', fontFamily: 'Inter, sans-serif' }}>
              Macro / Micro Catalyst
            </div>
            <div className="text-xs px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(255,255,255,.03)',
                          border: '1px solid rgba(255,255,255,.06)',
                          color: '#9ba8b4', fontFamily: 'Inter, sans-serif' }}>
              {ctx.macro}
            </div>
          </div>

          {/* ── C: RISK FACTOR ── */}
          <div className="mb-4">
            <div className="text-xs font-black uppercase tracking-widest mb-2"
                 style={{ color: '#FF0000', fontFamily: 'Inter, sans-serif' }}>
              § Primary Risk Factor
            </div>
            <div className="flex flex-col gap-2">
              {ctx.risks.map((r, i) => <RiskBadge key={i} text={r} />)}
            </div>
          </div>

          {/* ── FOOTER: Yahoo Finance CTA ── */}
          <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <a
              href={yUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full
                         transition-opacity duration-200 hover:opacity-80"
              style={{ background: 'rgba(100,160,255,.10)', color: '#6fa8ff',
                       border: '1px solid rgba(100,160,255,.25)',
                       fontFamily: 'Inter, sans-serif' }}
              onClick={e => e.stopPropagation()}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              View on Yahoo Finance →
            </a>
          </div>

        </div>
      )}
    </div>
  )
}
