import { useState } from 'react'

const RATING_STYLES = {
  BUY:  { bg: 'rgba(46,134,95,.18)',   border: '#2E865F', color: '#2E865F', glow: 'rgba(46,134,95,.35)'   },
  HOLD: { bg: 'rgba(156,163,175,.12)', border: '#9CA3AF', color: '#9CA3AF', glow: 'rgba(156,163,175,.2)'  },
  SELL: { bg: 'rgba(255,0,0,.12)',     border: '#FF0000', color: '#FF0000', glow: 'rgba(255,0,0,.3)'      },
}

const HORIZON_CONTEXT = {
  ultra_short: {
    fundamental: ['ROE', 'FCF Yield'],
    technical:   'RSI momentum + volume surge',
    macro:       'Earnings date / PDUFA catalyst / MOC imbalance',
    risks:       ['Earnings miss vs consensus', 'Sector rotation out of momentum names'],
  },
  short: {
    fundamental: ['ROE', 'ND/EBITDA', 'Revenue CAGR'],
    technical:   'Price vs 50-day MA + RSI trend',
    macro:       'Bank of Canada / Fed rate trajectory impact on sector',
    risks:       ['Rate hike surprise', 'Revenue growth deceleration'],
  },
  medium: {
    fundamental: ['ROE vs 12% threshold', 'ND/EBITDA vs 4x cap', 'FCF Yield vs Div Yield'],
    technical:   'Price vs 200-day MA trend integrity',
    macro:       'WCS/WTI spread (energy) or AISC cost curve (mining)',
    risks:       ['EBITDA compression from input cost inflation', 'Dividend cut signal'],
  },
  long: {
    fundamental: ['ROE compounding', 'ND/EBITDA deleveraging path', 'FCF reinvestment rate'],
    technical:   '200-day MA slope + multi-year base formation',
    macro:       'AI infrastructure moat / AISC reserve quality / Lassonde Curve positioning',
    risks:       ['Competitive moat erosion', 'Jurisdiction/regulatory risk for resource names'],
  },
  ultra_long: {
    fundamental: ['TAM expansion rate', 'FCF margin trajectory', 'ROE sustainability'],
    technical:   'Decade-scale price channel and accumulation patterns',
    macro:       'Demographics, CO2/capita trends, energy transition, resource lifecycle',
    risks:       ['Structural demand shift (e.g. EV vs oil)', 'Population decline in core markets'],
  },
}

function MetricChip({ label, value, good, warn, neutral }) {
  const color = good ? '#2E865F' : warn ? '#FF0000' : neutral ? '#9CA3AF' : '#7a8796'
  const bg    = good ? 'rgba(46,134,95,.1)' : warn ? 'rgba(255,0,0,.08)' : 'rgba(255,255,255,.05)'
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg"
         style={{ background: bg, border: `1px solid ${color}22` }}>
      <span className="text-xs font-medium mb-0.5" style={{ color: '#6b7280' }}>{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{value ?? '—'}</span>
    </div>
  )
}

function RiskBadge({ text }) {
  return (
    <div className="flex items-start gap-2 text-xs py-1.5 px-3 rounded-lg"
         style={{ background: 'rgba(255,0,0,.06)', border: '1px solid rgba(255,0,0,.15)', color: '#f87171' }}>
      <span className="mt-0.5 flex-shrink-0">⚠</span>
      <span>{text}</span>
    </div>
  )
}

/* ── Yahoo Finance URL builder ── */
function yahooUrl(ticker) {
  // If stock.yahoo_url exists (from backend), use it directly.
  // Otherwise build it: TSX tickers end in .TO → ca.finance.yahoo.com
  return `https://ca.finance.yahoo.com/quote/${encodeURIComponent(ticker)}`
}

export default function StockCard({ stock, horizon }) {
  const [expanded, setExpanded] = useState(false)

  const h      = stock.horizons?.[horizon]
  const rating = h?.rating || 'HOLD'
  const thesis = h?.thesis  || 'No thesis available.'
  const score  = h?.score   || 50
  const rs     = RATING_STYLES[rating] || RATING_STYLES.HOLD
  const ctx    = HORIZON_CONTEXT[horizon] || HORIZON_CONTEXT.short
  const isUp   = stock.change_pct >= 0
  const above200 = stock.price > stock.ma200

  const sectorMatch = thesis.match(/\[.*?·\s*(.*?)\]/)
  const sector = sectorMatch ? sectorMatch[1] : stock.market

  // Use backend-provided URL if available, else build it
  const yUrl = stock.yahoo_url || yahooUrl(stock.ticker)

  return (
    <div
      className="rounded-2xl transition-all duration-300 cursor-pointer select-none"
      style={{
        background:           'rgba(255,255,255,0.04)',
        backdropFilter:       'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border:               `1px solid ${expanded ? rs.border : 'rgba(255,255,255,0.08)'}`,
        boxShadow:            expanded
          ? `0 0 24px ${rs.glow}, 0 4px 32px rgba(0,0,0,0.4)`
          : '0 2px 12px rgba(0,0,0,0.3)',
        transform: 'translateZ(0)',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* ── FORENSIC BANNER ── */}
      {stock.shenanigan_flag && (
        <div className="rounded-t-2xl px-4 py-2 text-xs font-semibold flex items-center gap-2"
             style={{ background: 'rgba(245,158,11,.12)', color: '#f59e0b',
                      borderBottom: '1px solid rgba(245,158,11,.2)' }}>
          🚩 Forensic Flag · {stock.shenanigan_detail}
        </div>
      )}

      {/* ── COLLAPSED VIEW ── */}
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">

          {/* Left: ticker + name + sector + Yahoo link */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xs"
                 style={{ background: rs.bg, color: rs.color, border: `1px solid ${rs.border}44` }}>
              {stock.ticker.replace('.TO','').slice(0,3)}
            </div>
            <div className="min-w-0">

              {/* Ticker — clickable Yahoo Finance link */}
              <a
                href={yUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-sm tracking-tight leading-tight flex items-center gap-1 hover:underline"
                style={{ fontFamily: 'Cabinet Grotesk, Inter, sans-serif', color: 'inherit' }}
                onClick={e => e.stopPropagation()}
              >
                {stock.ticker}
                {/* External link icon */}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                     style={{ opacity: 0.45, flexShrink: 0 }}>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>

              <div className="text-xs truncate" style={{ color: '#6b7280', maxWidth: '140px' }}>
                {stock.name}
              </div>
              <div className="text-xs mt-0.5" style={{ color: '#4b5563' }}>{sector}</div>
            </div>
          </div>

          {/* Center: price */}
          <div className="text-center flex-shrink-0">
            <div className="font-bold text-lg tabular-nums leading-tight"
                 style={{ fontFamily: 'Cabinet Grotesk, Inter, sans-serif' }}>
              {stock.currency === 'USD' ? '$' : 'C$'}{stock.price?.toLocaleString()}
            </div>
            <div className="text-xs font-semibold mt-0.5"
                 style={{ color: isUp ? '#2E865F' : '#FF0000' }}>
              {isUp ? '▲' : '▼'} {Math.abs(stock.change_pct)}%
            </div>
          </div>

          {/* Right: rating badge + score + caret */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold px-3 py-1.5 rounded-full"
                    style={{ background: rs.bg, color: rs.color,
                             border: `1px solid ${rs.border}`,
                             boxShadow: `0 0 8px ${rs.glow}` }}>
                {rating}
              </span>
              <span className="text-xs mt-1" style={{ color: '#4b5563' }}>{score}/100</span>
            </div>
            <div className="transition-transform duration-300 ml-1"
                 style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', color: '#6b7280' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

        </div>

        {/* Score bar */}
        <div className="mt-3 h-1 rounded-full overflow-hidden"
             style={{ background: 'rgba(255,255,255,.06)' }}>
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${score}%`,
                        background: `linear-gradient(90deg, ${rs.border}88, ${rs.border})` }} />
        </div>
      </div>

      {/* ── EXPANDED VIEW ── */}
      {expanded && (
        <div className="px-4 pb-4 pt-1"
             style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
             onClick={e => e.stopPropagation()}>

          {/* Section A: The Why */}
          <div className="mb-4">
            <div className="text-xs font-bold uppercase tracking-widest mb-2"
                 style={{ color: rs.color }}>
              § The Why
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>
              {thesis.replace(/\[.*?\]\s*/, '').replace(/\s*\|.*$/, '')}
            </p>
          </div>

          {/* Section B: Multi-Layer Analysis */}
          <div className="mb-4">
            <div className="text-xs font-bold uppercase tracking-widest mb-3"
                 style={{ color: rs.color }}>
              § Multi-Layer Analysis
            </div>

            <div className="text-xs font-semibold mb-2" style={{ color: '#6b7280' }}>FUNDAMENTAL</div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {stock.roe != null && stock.roe !== 0 && (
                <MetricChip label="ROE" value={`${stock.roe?.toFixed(1)}%`}
                            good={stock.roe > 12} warn={stock.roe < 8} />
              )}
              {stock.nd_ebitda != null && stock.nd_ebitda < 90 && (
                <MetricChip label="ND/EBITDA" value={`${stock.nd_ebitda?.toFixed(1)}x`}
                            good={stock.nd_ebitda < 2} warn={stock.nd_ebitda > 4} />
              )}
              {stock.fcf_yield != null && (
                <MetricChip label="FCF Yield" value={`${stock.fcf_yield?.toFixed(1)}%`}
                            good={stock.fcf_yield > stock.div_yield && stock.fcf_yield > 0}
                            warn={stock.fcf_yield < stock.div_yield} />
              )}
              {stock.div_yield != null && stock.div_yield > 0 && (
                <MetricChip label="Div Yield" value={`${stock.div_yield?.toFixed(1)}%`} neutral />
              )}
              {stock.revenue_cagr != null && stock.revenue_cagr !== 0 && (
                <MetricChip label="Rev CAGR" value={`${stock.revenue_cagr?.toFixed(1)}%`}
                            good={stock.revenue_cagr > 10} warn={stock.revenue_cagr < 0} />
              )}
            </div>

            <div className="text-xs font-semibold mb-2" style={{ color: '#6b7280' }}>TECHNICAL</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <MetricChip label="RSI (14)" value={stock.rsi?.toFixed(0)}
                          good={stock.rsi < 40} warn={stock.rsi > 70}
                          neutral={stock.rsi >= 40 && stock.rsi <= 70} />
              <MetricChip label="vs 200-MA" value={above200 ? 'Above ✓' : 'Below ✗'}
                          good={above200} warn={!above200} />
            </div>
            <div className="text-xs rounded-lg px-3 py-2 mb-3"
                 style={{ background: 'rgba(255,255,255,.03)', color: '#9ba8b4',
                          border: '1px solid rgba(255,255,255,.06)' }}>
              <span className="font-semibold" style={{ color: '#6b7280' }}>Signal: </span>
              {ctx.technical}
            </div>

            <div className="text-xs font-semibold mb-2" style={{ color: '#6b7280' }}>MACRO / MICRO CATALYST</div>
            <div className="text-xs rounded-lg px-3 py-2"
                 style={{ background: 'rgba(255,255,255,.03)', color: '#9ba8b4',
                          border: '1px solid rgba(255,255,255,.06)' }}>
              {ctx.macro}
            </div>
          </div>

          {/* Section C: Risk Factors */}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-2"
                 style={{ color: '#FF0000' }}>
              § Risk Factors
            </div>
            <div className="flex flex-col gap-2">
              {ctx.risks.map((r, i) => <RiskBadge key={i} text={r} />)}
            </div>
          </div>

          {/* Footer: View on Yahoo Finance */}
          <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <a
              href={yUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full
                         transition-all duration-200 hover:opacity-90"
              style={{ background: 'rgba(100,160,255,0.10)', color: '#6fa8ff',
                       border: '1px solid rgba(100,160,255,0.25)' }}
              onClick={e => e.stopPropagation()}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 7L12 14.59 6.41 9H11V7H3v8h2v-4.59l7 7L21 9.41V14h2V6h-3.41z"/>
              </svg>
              View on Yahoo Finance →
            </a>
          </div>

        </div>
      )}
    </div>
  )
}
