import { useState, useEffect, useCallback, useMemo } from 'react'
import HorizonToggle from './components/HorizonToggle'
import StockCard from './components/StockCard'
import RefreshButton from './components/RefreshButton'

const HORIZONS = [
  { key: 'ultra_short', label: 'Ultra Short', sub: '0–3m'   },
  { key: 'short',       label: 'Short',       sub: '0–12m'  },
  { key: 'medium',      label: 'Medium',      sub: '0–36m'  },
  { key: 'long',        label: 'Long',        sub: '0–60m'  },
  { key: 'ultra_long',  label: 'Ultra Long',  sub: '0–360m' },
]

function sortStocks(stocks, horizon) {
  return [...stocks].sort((a, b) => {
    const ratingOrder = { BUY: 0, HOLD: 1, SELL: 2 }
    const ra = ratingOrder[a.horizons?.[horizon]?.rating] ?? 1
    const rb = ratingOrder[b.horizons?.[horizon]?.rating] ?? 1
    if (ra !== rb) return ra - rb
    if (horizon === 'ultra_long') {
      const moatA = (a.market_cap_usd || 0) * (a.roe || 0)
      const moatB = (b.market_cap_usd || 0) * (b.roe || 0)
      return moatB - moatA
    }
    return (b.horizons?.[horizon]?.score || 0) - (a.horizons?.[horizon]?.score || 0)
  })
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1"  x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1"  y1="12" x2="3"  y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

export default function App() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [horizon,     setHorizon]     = useState('short')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing,  setRefreshing]  = useState(false)
  const [scanning,    setScanning]    = useState(false)
  const [fadeKey,     setFadeKey]     = useState(0)

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const base = import.meta.env.BASE_URL
      const res  = await fetch(`${base}recommendations.json?t=${Date.now()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date(json.generated_at))
    } catch (e) { setError(e.message) }
    finally     { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleHorizonChange = (h) => { setFadeKey(k => k + 1); setHorizon(h) }

  const handleRefresh = async () => {
    setRefreshing(true); setScanning(true)
    try {
      await fetch(
        'https://api.github.com/repos/sujaysoni/equity-strategist-dashboard/dispatches',
        {
          method: 'POST',
          headers: {
            Authorization:  `token ${import.meta.env.VITE_DISPATCH_TOKEN || ''}`,
            Accept:         'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event_type: 'refresh-analysis' }),
        }
      )
    } catch (e) { console.warn('Dispatch skipped:', e.message) }
    setTimeout(() => { fetchData(); setRefreshing(false); setScanning(false) }, 4000)
  }

  const cad = useMemo(() => sortStocks(data?.cad || [], horizon), [data, horizon])
  const usd = useMemo(() => sortStocks(data?.usd || [], horizon), [data, horizon])
  const cadBuys    = cad.filter(s => s.horizons?.[horizon]?.rating === 'BUY').length
  const usdBuys    = usd.filter(s => s.horizons?.[horizon]?.rating === 'BUY').length
  const isUltraLong = horizon === 'ultra_long'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', fontFamily: 'var(--font-body)' }}>

      {/* Ambient glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 70% 45% at 50% -5%, color-mix(in oklch,var(--color-primary) 6%,transparent), transparent)',
      }} />

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 glassmorphism"
              style={{ borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '16px', flexWrap: 'wrap',
        }}>

          {/* Logo + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: 'var(--radius-xl)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--color-primary), color-mix(in oklch,var(--color-primary) 60%,var(--color-navy)))',
              boxShadow: '0 0 18px color-mix(in oklch,var(--color-primary) 35%,transparent)',
            }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <polyline points="2,14 7,8 11,11 18,4" stroke="white" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="13,4 18,4 18,9" stroke="white" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                letterSpacing: '-0.01em', color: 'var(--color-text)',
              }}>
                Equity Strategist
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)' }}>
                TSX · TSXV · NYSE · NASDAQ — Multi-Timeframe AI
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {scanning && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                fontSize: '0.75rem', fontWeight: 600,
                color: 'var(--color-primary)', fontFamily: 'var(--font-body)',
              }}>
                <div style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: 'var(--color-primary)',
                  animation: 'pulse 1.2s ease-in-out infinite',
                }} />
                Scanning markets…
              </div>
            )}

            <RefreshButton onClick={handleRefresh} refreshing={refreshing} />

            <button
              onClick={() => setDarkMode(d => !d)}
              style={{
                width: '36px', height: '36px', borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
              title="Toggle theme"
            >
              {darkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>

        {/* Horizon toggle */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 12px' }}>
          <HorizonToggle horizons={HORIZONS} active={horizon} onChange={handleHorizonChange} />
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Last updated + stats bar */}
        {lastUpdated && !loading && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '12px', marginBottom: '28px',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)' }}>
              Last updated: {lastUpdated.toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {[
                { label: 'CAD BUYs', value: cadBuys, color: 'var(--color-buy)' },
                { label: 'USD BUYs', value: usdBuys, color: 'var(--color-navy)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  fontSize: '0.75rem', fontFamily: 'var(--font-body)',
                  padding: '4px 12px', borderRadius: 'var(--radius-full)',
                  background: `color-mix(in oklch,${color} 10%,transparent)`,
                  border: `1px solid color-mix(in oklch,${color} 25%,transparent)`,
                  color,
                }}>
                  <strong>{value}</strong> {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '40vh', gap: '16px',
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              border: '3px solid var(--color-surface-offset)',
              borderTop: '3px solid var(--color-primary)',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)' }}>
              Loading recommendations…
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{
            padding: '20px 24px', borderRadius: 'var(--radius-xl)',
            background: 'color-mix(in oklch,var(--color-sell) 8%,transparent)',
            border: '1px solid color-mix(in oklch,var(--color-sell) 25%,transparent)',
            color: 'var(--color-sell)', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
            marginBottom: '24px',
          }}>
            ⚠ Failed to load recommendations: {error}
          </div>
        )}

        {/* Ultra Long notice */}
        {isUltraLong && !loading && (
          <div style={{
            padding: '12px 20px', borderRadius: 'var(--radius-xl)', marginBottom: '24px',
            background: 'color-mix(in oklch,var(--color-primary) 7%,transparent)',
            border: '1px solid color-mix(in oklch,var(--color-primary) 20%,transparent)',
            fontSize: '0.8rem', color: 'var(--color-primary)', fontFamily: 'var(--font-body)',
          }}>
            🏰 <strong>Ultra Long (0–360m):</strong> Ranked by Economic Moat × Market Cap. RSI signals de-weighted in favour of TAM, structural demand, and competitive durability.
          </div>
        )}

        {/* ── TWO COLUMN GRID ── */}
        {!loading && data && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))',
            gap: '32px',
            alignItems: 'start',
          }}>

            {/* CAD Column */}
            <section>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--color-text)', letterSpacing: '-0.01em',
                }}>
                  🍁 Canadian Markets
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
                  borderRadius: 'var(--radius-full)', letterSpacing: '0.06em',
                  background: 'color-mix(in oklch,var(--color-primary) 12%,transparent)',
                  color: 'var(--color-primary)',
                  border: '1px solid color-mix(in oklch,var(--color-primary) 25%,transparent)',
                }}>
                  TSX · TSXV
                </span>
              </div>
              <div
                key={`cad-${fadeKey}`}
                style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fadeIn 0.35s ease' }}
              >
                {cad.length === 0
                  ? <EmptyState />
                  : cad.map(s => (
                      <StockCard key={s.ticker} stock={s} horizon={horizon} darkMode={darkMode} />
                    ))
                }
              </div>
            </section>

            {/* USD Column */}
            <section>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--color-text)', letterSpacing: '-0.01em',
                }}>
                  🦅 U.S. Markets
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
                  borderRadius: 'var(--radius-full)', letterSpacing: '0.06em',
                  background: 'color-mix(in oklch,var(--color-navy) 12%,transparent)',
                  color: 'var(--color-navy)',
                  border: '1px solid color-mix(in oklch,var(--color-navy) 25%,transparent)',
                }}>
                  NYSE · NASDAQ
                </span>
              </div>
              <div
                key={`usd-${fadeKey}`}
                style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fadeIn 0.35s ease' }}
              >
                {usd.length === 0
                  ? <EmptyState />
                  : usd.map(s => (
                      <StockCard key={s.ticker} stock={s} horizon={horizon} darkMode={darkMode} />
                    ))
                }
              </div>
            </section>

          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: '1px solid var(--color-divider)',
        padding: '20px 24px',
        marginTop: '48px',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '8px',
          fontSize: '0.72rem', color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)',
        }}>
          <span>Equity Strategist Dashboard — for informational purposes only. Not financial advice.</span>
          <span>Data via yFinance · Refreshed 06:00 ET weekdays</span>
        </div>
      </footer>

    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      padding: '40px 24px', textAlign: 'center',
      borderRadius: 'var(--radius-xl)',
      border: '1px dashed var(--color-border)',
      color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
    }}>
      No data available — trigger a refresh to run the analysis.
    </div>
  )
}
