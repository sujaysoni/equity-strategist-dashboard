import { useState } from 'react'

const RATING_COLORS = {
  BUY:  { bg: 'color-mix(in oklch,#22c55e 15%,transparent)', border: 'color-mix(in oklch,#22c55e 35%,transparent)', text: '#16a34a' },
  HOLD: { bg: 'color-mix(in oklch,#f59e0b 15%,transparent)', border: 'color-mix(in oklch,#f59e0b 35%,transparent)', text: '#d97706' },
  SELL: { bg: 'color-mix(in oklch,#ef4444 15%,transparent)', border: 'color-mix(in oklch,#ef4444 35%,transparent)', text: '#dc2626' },
}

const CAP_COLORS = {
  mega:    { bg: 'color-mix(in oklch,#8b5cf6 12%,transparent)', text: '#7c3aed', label: 'MEGA' },
  large:   { bg: 'color-mix(in oklch,#3b82f6 12%,transparent)', text: '#2563eb', label: 'LARGE' },
  mid:     { bg: 'color-mix(in oklch,#f59e0b 12%,transparent)', text: '#d97706', label: 'MID'   },
  small:   { bg: 'color-mix(in oklch,#6b7280 12%,transparent)', text: '#4b5563', label: 'SMALL' },
  unknown: { bg: 'color-mix(in oklch,#6b7280 10%,transparent)', text: '#6b7280', label: '—'     },
}

function fmt(n, decimals = 1, suffix = '') {
  if (n == null) return '—'
  return `${(n * 100).toFixed(decimals)}${suffix}`
}

function fmtCap(n) {
  if (n == null) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toFixed(0)}`
}

export default function StockCard({ stock, horizon, rank }) {
  const [expanded, setExpanded] = useState(false)

  const hz   = stock.horizons?.[horizon] || {}
  const rc   = RATING_COLORS[hz.rating] || RATING_COLORS.HOLD
  const tier = stock.cap_tier || 'unknown'
  const cc   = CAP_COLORS[tier] || CAP_COLORS.unknown

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background:    'var(--color-surface)',
        border:        '1px solid var(--color-border)',
        borderRadius:  'var(--radius-lg)',
        padding:       '12px 14px',
        cursor:        'pointer',
        transition:    'box-shadow 180ms ease, background 180ms ease',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* ── Top row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

        {/* Rank */}
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', minWidth: '18px', textAlign: 'right' }}>
          {rank}
        </span>

        {/* Rating badge */}
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
          padding: '2px 7px', borderRadius: 'var(--radius-full)',
          background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
        }}>
          {hz.rating || '—'}
        </span>

        {/* Cap tier badge */}
        <span style={{
          fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.07em',
          padding: '2px 6px', borderRadius: 'var(--radius-full)',
          background: cc.bg, color: cc.text,
        }}>
          {cc.label}
        </span>

        {/* Ticker */}
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)', letterSpacing: '0.01em' }}>
          {stock.ticker?.replace('.TO','').replace('.V','')}
        </span>

        {/* Name */}
        <span style={{
          fontSize: '0.75rem', color: 'var(--color-text-muted)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {stock.name}
        </span>

        {/* Score */}
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {hz.score != null ? hz.score.toFixed(0) : '—'}
          <span style={{ fontSize: '0.6rem', fontWeight: 400, color: 'var(--color-text-faint)', marginLeft: '1px' }}>/100</span>
        </span>

        {/* Expand chevron */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid var(--color-divider)', paddingTop: '12px' }}>

          {/* Key metrics row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
            {[
              { label: 'Market Cap',  value: fmtCap(stock.market_cap_usd) },
              { label: 'Cap Tier',    value: cc.label },
              { label: 'ROE',         value: fmt(stock.roe, 1, '%') },
              { label: 'FCF Yield',   value: fmt(stock.fcf_yield, 1, '%') },
              { label: 'Div Yield',   value: fmt(stock.div_yield, 1, '%') },
              { label: 'D/E',         value: stock.debt_ebitda != null ? stock.debt_ebitda.toFixed(0) : '—' },
              { label: 'RSI-14',      value: stock.rsi_14 != null ? stock.rsi_14.toFixed(0) : '—' },
              { label: 'Fwd P/E',     value: stock.pe_fwd != null ? `${stock.pe_fwd.toFixed(0)}x` : '—' },
              { label: 'Gross Margin',value: fmt(stock.gross_margin, 0, '%') },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Signals row */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {stock.above_50ma  && <Pill text="▲ 50-DMA"  green />}
            {stock.above_200ma && <Pill text="▲ 200-DMA" green />}
            {stock.insider_buy_signal && <Pill text="🏦 Insider Buy" green />}
            {stock.shenanigan_flag    && <Pill text="⚠ Earnings Flag" red   />}
            {!stock.above_50ma  && stock.above_50ma  !== null && <Pill text="▼ 50-DMA"  red />}
            {!stock.above_200ma && stock.above_200ma !== null && <Pill text="▼ 200-DMA" red />}
          </div>

          {/* All 5 horizon ratings */}
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>All Time Horizons</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              {[
                { key: 'ultra_short', label: '0-3m'   },
                { key: 'short',       label: '0-12m'  },
                { key: 'medium',      label: '0-36m'  },
                { key: 'long',        label: '0-60m'  },
                { key: 'ultra_long',  label: '0-360m' },
              ].map(({ key, label }) => {
                const h = stock.horizons?.[key] || {}
                const hc = RATING_COLORS[h.rating] || RATING_COLORS.HOLD
                return (
                  <div key={key} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '2px', padding: '6px 10px', borderRadius: 'var(--radius-md)',
                    background: hc.bg, border: `1px solid ${hc.border}`,
                    minWidth: '62px',
                  }}>
                    <span style={{ fontSize: '0.58rem', color: 'var(--color-text-faint)' }}>{label}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: hc.text }}>{h.rating || '—'}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{h.score != null ? h.score.toFixed(0) : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Thesis & Risk */}
          <InfoRow label="Thesis" value={hz.thesis} />
          <InfoRow label="Key Risk" value={hz.risk} />

          {/* Sector */}
          <InfoRow label="Sector / Exchange" value={`${stock.sector || '—'}  ·  ${stock.exchange || '—'}`} />
        </div>
      )}
    </div>
  )
}

function Pill({ text, green, red }) {
  const color = green ? '#16a34a' : red ? '#dc2626' : '#6b7280'
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 600, padding: '2px 7px',
      borderRadius: 'var(--radius-full)',
      background: `color-mix(in oklch,${color} 10%,transparent)`,
      border:     `1px solid color-mix(in oklch,${color} 25%,transparent)`,
      color,
    }}>
      {text}
    </span>
  )
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.62rem', color: 'var(--color-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, paddingTop: '1px' }}>{label}:</span>
      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', flex: 1 }}>{value}</span>
    </div>
  )
}
