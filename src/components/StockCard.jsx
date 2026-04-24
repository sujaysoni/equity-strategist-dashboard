import { useState } from 'react'

/* ─── SEMANTIC PALETTE — adapts to CSS vars ─────────────────────── */
const RS_LIGHT = {
  BUY:  { bg: 'rgba(46,107,62,.12)',   border: '#2E6B3E', color: '#2E6B3E', glow: 'rgba(46,107,62,.20)'   },
  HOLD: { bg: 'rgba(122,107,80,.10)',  border: '#7A6B50', color: '#7A6B50', glow: 'rgba(122,107,80,.15)'  },
  SELL: { bg: 'rgba(163,58,42,.10)',   border: '#A33A2A', color: '#A33A2A', glow: 'rgba(163,58,42,.18)'   },
}
const RS_DARK = {
  BUY:  { bg: 'rgba(58,158,95,.15)',   border: '#3A9E5F', color: '#3A9E5F', glow: 'rgba(58,158,95,.28)'   },
  HOLD: { bg: 'rgba(156,163,175,.10)', border: '#9CA3AF', color: '#9CA3AF', glow: 'rgba(156,163,175,.16)' },
  SELL: { bg: 'rgba(255,107,107,.12)', border: '#FF6B6B', color: '#FF6B6B', glow: 'rgba(255,107,107,.22)' },
}

const HX = {
  ultra_short: {
    technical: 'RSI momentum + volume surge',
    macro:     'Earnings date / PDUFA catalyst / MOC imbalance',
    risks:     ['Earnings miss vs consensus', 'Sector rotation out of momentum names'],
  },
  short: {
    technical: 'Price vs 50-day MA + RSI trend',
    macro:     'Bank of Canada / Fed rate trajectory impact on sector',
    risks:     ['Rate hike surprise', 'Revenue growth deceleration'],
  },
  medium: {
    technical: 'Price vs 200-day MA trend integrity',
    macro:     'WCS/WTI spread (energy) or AISC cost curve (mining)',
    risks:     ['EBITDA compression from input cost inflation', 'Dividend cut signal'],
  },
  long: {
    technical: '200-day MA slope + multi-year base formation',
    macro:     'AI infrastructure moat / AISC reserve quality / Lassonde Curve',
    risks:     ['Competitive moat erosion', 'Jurisdiction/regulatory risk for resource names'],
  },
  ultra_long: {
    technical: 'Decade-scale price channel & accumulation patterns',
    macro:     'Demographics, CO₂/capita trends, energy transition, resource lifecycle',
    risks:     ['Structural demand shift (e.g. EV vs oil)', 'Population decline in core markets'],
  },
}

/* ─── HELPERS ───────────────────────────────────────────────────── */
function ExchangeBadge({ exchange, market }) {
  const label = exchange || (market === 'CAD' ? 'TSX' : 'NYSE')
  const isCAD = market === 'CAD'
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 700,
      padding: '2px 7px', borderRadius: 'var(--radius-full)',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: isCAD ? 'color-mix(in oklch,var(--color-primary) 12%,transparent)'
                        : 'color-mix(in oklch,var(--color-navy) 12%,transparent)',
      color:       isCAD ? 'var(--color-primary)' : 'var(--color-navy)',
      border: `1px solid ${isCAD ? 'color-mix(in oklch,var(--color-primary) 25%,transparent)'
                                  : 'color-mix(in oklch,var(--color-navy) 25%,transparent)'}`,
    }}>
      {label}
    </span>
  )
}

function MetricChip({ label, value, good, warn, neutral }) {
  const color = good ? 'var(--color-buy)' : warn ? 'var(--color-sell)' : 'var(--color-text-muted)'
  const bg    = good ? 'color-mix(in oklch,var(--color-buy) 10%,transparent)'
                     : warn ? 'color-mix(in oklch,var(--color-sell) 8%,transparent)'
                     : 'var(--color-surface-offset)'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                  padding:'8px 12px', borderRadius:'var(--radius-lg)',
                  background: bg,
                  border: `1px solid color-mix(in oklch,${color} 20%,transparent)` }}>
      <span style={{ fontSize:'0.7rem', fontWeight:600, marginBottom:'2px',
                     color:'var(--color-text-faint)', fontFamily:'var(--font-body)' }}>{label}</span>
      <span style={{ fontSize:'0.85rem', fontWeight:700, color,
                     fontFamily:'var(--font-body)', fontVariantNumeric:'tabular-nums' }}>{value ?? '—'}</span>
    </div>
  )
}

function RiskBadge({ text }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:'8px', fontSize:'0.75rem',
                  padding:'8px 12px', borderRadius:'var(--radius-lg)',
                  background:'color-mix(in oklch,var(--color-sell) 7%,transparent)',
                  border:'1px solid color-mix(in oklch,var(--color-sell) 20%,transparent)',
                  color:'var(--color-sell)', fontFamily:'var(--font-body)' }}>
      <span style={{ flexShrink:0, marginTop:'1px' }}>⚠</span>
      <span>{text}</span>
    </div>
  )
}

function yahooUrl(ticker) {
  return `https://ca.finance.yahoo.com/quote/${encodeURIComponent(ticker)}`
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function StockCard({ stock, horizon, darkMode }) {
  const [expanded, setExpanded] = useState(false)

  const h      = stock.horizons?.[horizon]
  const rating = h?.rating || 'HOLD'
  const thesis = h?.thesis  || 'No thesis available.'
  const score  = h?.score   || 50
  const RS     = darkMode ? RS_DARK : RS_LIGHT
  const rs     = RS[rating] || RS.HOLD
  const ctx    = HX[horizon] || HX.short
  const isUp   = stock.change_pct >= 0
  const above200 = stock.price > stock.ma200
  const sectorMatch = thesis.match(/\[.*?·\s*(.*?)\]/)
  const sector = sectorMatch ? sectorMatch[1] : stock.market
  const yUrl   = stock.yahoo_url || yahooUrl(stock.ticker)
  const currency = stock.currency === 'USD' ? '$' : 'C$'
  const isUltraLong = horizon === 'ultra_long'
  const capB = stock.market_cap_usd ? (stock.market_cap_usd / 1e9).toFixed(0) : null
  const maDist = stock.ma200 > 0
    ? (((stock.price - stock.ma200) / stock.ma200) * 100).toFixed(1)
    : null

  return (
    <div
      className="stock-card"
      style={{
        borderColor: expanded ? `color-mix(in oklch,${rs.border} 60%,var(--color-border))` : undefined,
        boxShadow:   expanded ? `var(--shadow-md), 0 0 20px ${rs.glow}` : undefined,
      }}
    >
      {/* Forensic banner */}
      {stock.shenanigan_flag && (
        <div style={{
          borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
          padding: '6px 16px', fontSize: '0.72rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'color-mix(in oklch,var(--color-warn) 12%,transparent)',
          color: 'var(--color-warn)',
          borderBottom: '1px solid color-mix(in oklch,var(--color-warn) 22%,transparent)',
          fontFamily: 'var(--font-body)',
        }}>
          🚩 Forensic Flag · {stock.shenanigan_detail}
        </div>
      )}

      {/* ══ COLLAPSED ══ */}
      <div style={{ padding: '16px', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

          {/* Avatar */}
          <div style={{
            width: '44px', height: '44px', borderRadius: 'var(--radius-xl)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: '0.8rem', letterSpacing: '-0.01em',
            background: rs.bg, color: rs.color,
            border: `1.5px solid color-mix(in oklch,${rs.border} 35%,transparent)`,
          }}>
            {stock.ticker.replace('.TO','').replace('-','').slice(0,3)}
          </div>

          {/* Name block */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <a
                href={yUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: '1.05rem', letterSpacing: '-0.01em',
                  color: 'var(--color-text)', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                }}
                onMouseOver={e => e.currentTarget.style.color = 'var(--color-primary)'}
                onMouseOut={e  => e.currentTarget.style.color = 'var(--color-text)'}
              >
                {stock.ticker}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                     style={{ opacity: 0.4, flexShrink: 0 }}>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
              <ExchangeBadge exchange={stock.exchange} market={stock.market} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)',
                          fontFamily: 'var(--font-body)', marginTop: '2px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          maxWidth: '170px' }}>
              {stock.name}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)',
                          fontFamily: 'var(--font-body)', marginTop: '2px' }}>
              {sector}
            </div>
          </div>

          {/* Price */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem',
                          letterSpacing: '-0.02em', color: 'var(--color-text)',
                          fontVariantNumeric: 'tabular-nums' }}>
              {currency}{stock.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '2px',
                          fontFamily: 'var(--font-body)', fontVariantNumeric: 'tabular-nums',
                          color: isUp ? 'var(--color-buy)' : 'var(--color-sell)' }}>
              {isUp ? '▲' : '▼'} {Math.abs(stock.change_pct).toFixed(2)}%
            </div>
          </div>

          {/* Rating + caret */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 800,
                padding: '5px 12px', borderRadius: 'var(--radius-full)',
                letterSpacing: '0.07em', textTransform: 'uppercase',
                background: rs.bg, color: rs.color,
                border: `1.5px solid ${rs.border}`,
                boxShadow: `0 0 10px ${rs.glow}`,
              }}>
                {rating}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-faint)',
                             fontFamily: 'var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>
                {score}/100
              </span>
            </div>
            {/* Caret */}
            <div style={{ transition: 'transform 280ms ease',
                          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          color: 'var(--color-text-faint)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Score bar */}
        <div style={{ marginTop: '12px', height: '3px', borderRadius: 'var(--radius-full)',
                      background: 'var(--color-surface-offset)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 'var(--radius-full)',
                        width: `${score}%`, transition: 'width 700ms ease',
                        background: `linear-gradient(90deg,color-mix(in oklch,${rs.border} 50%,transparent),${rs.border})` }} />
        </div>
      </div>

      {/* ══ EXPANDED DEEP DIVE ══ */}
      {expanded && (
        <div style={{ padding: '0 16px 20px',
                      borderTop: '1px solid var(--color-divider)' }}
             onClick={e => e.stopPropagation()}>

          {/* Ultra-long notice */}
          {isUltraLong && (
            <div style={{ margin: '12px 0', display:'flex', alignItems:'center', gap:'8px',
                          padding:'8px 12px', borderRadius:'var(--radius-lg)',
                          background:'color-mix(in oklch,var(--color-primary) 8%,transparent)',
                          border:'1px solid color-mix(in oklch,var(--color-primary) 22%,transparent)',
                          fontSize:'0.75rem', color:'var(--color-primary)',
                          fontFamily:'var(--font-body)' }}>
              🏰 <span><strong>Ultra Long:</strong> ranked by Economic Moat & TAM — RSI de-weighted</span>
            </div>
          )}

          {/* § THE WHY */}
          <div style={{ marginTop: '16px', marginBottom: '16px' }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'0.7rem', fontWeight:700,
                          letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'8px',
                          color: rs.color }}>
              § The Why
            </div>
            <p style={{ fontFamily:'var(--font-body)', fontSize:'0.875rem', lineHeight:1.7,
                        color:'var(--color-text-muted)' }}>
              {thesis.replace(/\[.*?\]\s*/, '').split(' | ')[0]}
            </p>
            {thesis.split(' | ')[1] && (
              <p style={{ fontFamily:'var(--font-body)', fontSize:'0.85rem', lineHeight:1.65,
                          marginTop:'6px', color:'var(--color-text-faint)' }}>
                {thesis.split(' | ').slice(1).join(' | ')}
              </p>
            )}
          </div>

          {/* § DATA MATRIX */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'0.7rem', fontWeight:700,
                          letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'12px',
                          color: rs.color }}>
              § Data Matrix
            </div>

            {/* Fundamentals */}
            <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase',
                          letterSpacing:'0.08em', color:'var(--color-text-faint)',
                          fontFamily:'var(--font-body)', marginBottom:'8px' }}>
              Fundamentals
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginBottom:'12px' }}>
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
                            good={stock.market_cap_usd > 100e9} neutral />
              )}
            </div>

            {/* Technicals */}
            <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase',
                          letterSpacing:'0.08em', color:'var(--color-text-faint)',
                          fontFamily:'var(--font-body)', marginBottom:'8px' }}>
              Technicals
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
              <MetricChip label="RSI (14)" value={stock.rsi?.toFixed(0)}
                          good={stock.rsi < 40} warn={stock.rsi > 70}
                          neutral={stock.rsi >= 40 && stock.rsi <= 70} />
              <MetricChip label="vs 200-MA" value={above200 ? 'Above ✓' : 'Below ✗'}
                          good={above200} warn={!above200} />
            </div>
            {maDist && (
              <div style={{ fontSize:'0.75rem', padding:'8px 12px', borderRadius:'var(--radius-lg)',
                            background:'var(--color-surface-2)',
                            border:'1px solid var(--color-border)',
                            color:'var(--color-text-muted)', marginBottom:'10px',
                            fontFamily:'var(--font-body)' }}>
                <span style={{ fontWeight:700, color:'var(--color-text-faint)' }}>200-MA distance: </span>
                {maDist}% &nbsp;·&nbsp;
                <span style={{ fontWeight:700, color:'var(--color-text-faint)' }}>Signal: </span>
                {ctx.technical}
              </div>
            )}

            {/* Macro */}
            <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase',
                          letterSpacing:'0.08em', color:'var(--color-text-faint)',
                          fontFamily:'var(--font-body)', marginBottom:'8px' }}>
              Macro / Micro Catalyst
            </div>
            <div style={{ fontSize:'0.75rem', padding:'8px 12px', borderRadius:'var(--radius-lg)',
                          background:'var(--color-surface-2)', border:'1px solid var(--color-border)',
                          color:'var(--color-text-muted)', fontFamily:'var(--font-body)' }}>
              {ctx.macro}
            </div>
          </div>

          {/* § RISK FACTOR */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'0.7rem', fontWeight:700,
                          letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'8px',
                          color:'var(--color-sell)' }}>
              § Primary Risk Factor
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {ctx.risks.map((r, i) => <RiskBadge key={i} text={r} />)}
            </div>
          </div>

          {/* Yahoo Finance CTA */}
          <div style={{ paddingTop:'12px', borderTop:'1px solid var(--color-divider)' }}>
            <a href={yUrl} target="_blank" rel="noopener noreferrer"
               onClick={e => e.stopPropagation()}
               style={{
                 display:'inline-flex', alignItems:'center', gap:'6px',
                 fontSize:'0.75rem', fontWeight:700, fontFamily:'var(--font-body)',
                 padding:'7px 16px', borderRadius:'var(--radius-full)',
                 background:'color-mix(in oklch,var(--color-primary) 10%,transparent)',
                 color:'var(--color-primary)',
                 border:'1px solid color-mix(in oklch,var(--color-primary) 28%,transparent)',
                 textDecoration:'none', transition:'opacity 0.2s ease',
               }}
               onMouseOver={e => e.currentTarget.style.opacity = '0.75'}
               onMouseOut={e  => e.currentTarget.style.opacity = '1'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              View on Yahoo Finance →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
