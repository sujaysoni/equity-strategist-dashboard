const RATING_STYLES = {
  BUY:  { bg: 'rgba(34,197,94,.12)',   border: 'rgba(34,197,94,.3)',   color: '#22c55e' },
  HOLD: { bg: 'rgba(148,163,184,.1)',  border: 'rgba(148,163,184,.25)', color: '#94a3b8' },
  SELL: { bg: 'rgba(239,68,68,.12)',   border: 'rgba(239,68,68,.3)',   color: '#ef4444' },
}

export default function StockCard({ stock, horizon }) {
  const h      = stock.horizons?.[horizon]
  const rating = h?.rating || 'HOLD'
  const thesis = h?.thesis  || 'No thesis available.'
  const score  = h?.score   || 50
  const rs     = RATING_STYLES[rating] || RATING_STYLES.HOLD
  const isUp   = stock.change_pct >= 0

  return (
    <div className="rounded-xl border transition-all duration-200 hover:scale-[1.01]"
         style={{ background: 'var(--color-surface)', borderColor: rs.border }}>

      {/* Shenanigan banner */}
      {stock.shenanigan_flag && (
        <div className="rounded-t-xl px-4 py-2 text-xs font-semibold flex items-center gap-2"
             style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b',
                      borderBottom: '1px solid rgba(245,158,11,.3)' }}>
          🚩 Forensic Flag · {stock.shenanigan_detail}
        </div>
      )}

      <div className="p-4">

        {/* Row 1: ticker + rating badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="font-bold text-base tracking-tight"
                 style={{ fontFamily: 'Cabinet Grotesk' }}>
              {stock.ticker}
            </div>
            <div className="text-xs mt-0.5 truncate max-w-[180px]"
                 style={{ color: 'var(--color-hold)' }}>
              {stock.name}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="text-xs font-bold px-3 py-1 rounded-full border"
                  style={{ background: rs.bg, borderColor: rs.border, color: rs.color }}>
              {rating}
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--color-hold)' }}>
              Score {score}/100
            </span>
          </div>
        </div>

        {/* Row 2: price + change */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xl font-bold tabular-nums"
                style={{ fontFamily: 'Cabinet Grotesk' }}>
            {stock.currency === 'USD' ? '$' : 'C$'}{stock.price?.toLocaleString()}
          </span>
          <span className="text-sm font-semibold px-2 py-0.5 rounded-md"
                style={{
                  background: isUp ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                  color:      isUp ? '#22c55e' : '#ef4444',
                }}>
            {isUp ? '▲' : '▼'} {Math.abs(stock.change_pct)}%
          </span>
        </div>

        {/* Row 3: metric chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {stock.rsi != null && (
            <Chip label="RSI" value={stock.rsi?.toFixed(0)}
                  warn={stock.rsi > 70 || stock.rsi < 30} />
          )}
          {stock.roe != null && stock.roe !== 0 && (
            <Chip label="ROE" value={`${stock.roe?.toFixed(1)}%`}
                  good={stock.roe > 12} />
          )}
          {stock.nd_ebitda != null && stock.nd_ebitda < 90 && (
            <Chip label="ND/EBITDA" value={`${stock.nd_ebitda?.toFixed(1)}x`}
                  warn={stock.nd_ebitda > 4} />
          )}
          {stock.div_yield != null && stock.div_yield > 0 && (
            <Chip label="Div" value={`${stock.div_yield?.toFixed(1)}%`} />
          )}
          {stock.revenue_cagr != null && stock.revenue_cagr !== 0 && (
            <Chip label="CAGR" value={`${stock.revenue_cagr?.toFixed(1)}%`}
                  good={stock.revenue_cagr > 10} />
          )}
        </div>

        {/* Row 4: thesis */}
        <div className="rounded-lg p-3 text-xs leading-relaxed"
             style={{ background: 'rgba(255,255,255,.03)', color: '#9ba8b4' }}>
          {thesis}
        </div>

        {/* Score bar */}
        <div className="mt-3 h-1.5 rounded-full overflow-hidden"
             style={{ background: 'rgba(255,255,255,.06)' }}>
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${score}%`, background: rs.color }} />
        </div>

      </div>
    </div>
  )
}

function Chip({ label, value, good, warn }) {
  const color = good ? '#22c55e' : warn ? '#f59e0b' : '#7a8796'
  const bg    = good ? 'rgba(34,197,94,.08)' : warn ? 'rgba(245,158,11,.08)' : 'rgba(255,255,255,.04)'
  return (
    <span className="text-xs px-2 py-0.5 rounded-md font-medium"
          style={{ background: bg, color }}>
      {label} {value}
    </span>
  )
}
