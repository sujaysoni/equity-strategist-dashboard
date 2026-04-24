import { useState, useEffect, useCallback, useMemo } from 'react'
import HorizonToggle from './components/HorizonToggle'
import StockCard from './components/StockCard'
import RefreshButton from './components/RefreshButton'
import useLivePrices from './hooks/useLivePrices'

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
        const base = import.meta.env.BASE_URL
  const { prices, marketOpen, priceTime } = useLivePrices(base)
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
  const cadBuys = cad.filter(s => s.horizons?.[horizon]?.rating === 'BUY').length
  const usdBuys = usd.filter(s => s.horizons?.[horizon]?.rating === 'BUY').length
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px',
                            fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)',
                            fontFamily: 'var(--font-body)' }}>
                <span className="pulse-dot" />
                AI Analyzing…
              </div>
            )}
            {lastUpdated && !scanning && (
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)',
                            fontFamily: 'var(--font-body)' }}
                   className="hidden sm:block">
                {priceTime && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '0.7rem', fontFamily: 'var(--font-body)',
    padding: '3px 10px', borderRadius: 'var(--radius-full)',
    background: marketOpen
      ? 'color-mix(in oklch,var(--color-buy) 10%,transparent)'
      : 'color-mix(in oklch,var(--color-text-faint) 10%,transparent)',
    color:  marketOpen ? 'var(--color-buy)' : 'var(--color-text-faint)',
    border: `1px solid color-mix(in oklch,${marketOpen ? 'var(--color-buy)' : 'var(--color-text-faint)'} 22%,transparent)`,
  }}>
    <span style={{ width: '6px', height: '6px', borderRadius: '50%',
                   background: 'currentColor', display: 'inline-block',
                   animation: marketOpen ? 'pulseDot 1.2s ease-in-out infinite' : 'none' }} />
    {marketOpen ? 'Market Open' : 'Market Closed'}
  </div>
)}
                Last updated:&nbsp;
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {lastUpdated.toLocaleDateString()} {lastUpdated.toLocaleTimeString()}
                </span>
              </div>
            )}

            {/* Sun/Moon toggle */}
            <button
              className="btn-theme"
              onClick={() => setDarkMode(d => !d)}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {darkMode ? <SunIcon /> : <MoonIcon />}
            </button>

            <RefreshButton onClick={handleRefresh} loading={refreshing} scanning={scanning} />
          </div>
        </div>
      </header>

      {/* ── HORIZON TOGGLE ── */}
      <div className="sticky top-0 z-40"
           style={{
             borderBottom: '1px solid var(--color-divider)',
             background: 'color-mix(in oklch,var(--color-bg) 92%,transparent)',
             backdropFilter: 'blur(16px)',
             WebkitBackdropFilter: 'blur(16px)',
           }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '10px 24px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: '8px' }}>
          <HorizonToggle horizons={HORIZONS} active={horizon} onChange={handleHorizonChange} />
          {isUltraLong && (
            <span style={{
              fontSize: '0.72rem', fontWeight: 600, fontFamily: 'var(--font-body)',
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              background: 'color-mix(in oklch,var(--color-primary) 10%,transparent)',
              color: 'var(--color-primary)',
              border: '1px solid color-mix(in oklch,var(--color-primary) 25%,transparent)',
            }}>
              🏰 Moat &amp; TAM sort active
            </span>
          )}
        </div>
      </div>

      {/* ── MAIN ── */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 10 }}>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', padding: '100px 0', gap: '16px' }}>
            <div className="animate-spin" style={{
              width: '36px', height: '36px', borderRadius: '50%',
              border: '2.5px solid var(--color-primary)', borderTopColor: 'transparent',
            }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)' }}>
              Loading market data…
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            borderRadius: 'var(--radius-2xl)', padding: '32px', textAlign: 'center',
            maxWidth: '400px', margin: '0 auto',
            background: 'color-mix(in oklch,var(--color-sell) 6%,transparent)',
            border: '1px solid color-mix(in oklch,var(--color-sell) 22%,transparent)',
          }}>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem',
                        marginBottom: '8px', color: 'var(--color-sell)' }}>
              Failed to load data
            </p>
            <p style={{ fontSize: '0.82rem', opacity: 0.75, marginBottom: '16px',
                        color: 'var(--color-sell)', fontFamily: 'var(--font-body)' }}>
              {error}
            </p>
            <button onClick={fetchData} style={{
              padding: '8px 20px', borderRadius: 'var(--radius-full)', fontSize: '0.82rem',
              fontWeight: 700, fontFamily: 'var(--font-body)', cursor: 'pointer',
              background: 'color-mix(in oklch,var(--color-sell) 12%,transparent)',
              color: 'var(--color-sell)',
              border: '1px solid color-mix(in oklch,var(--color-sell) 30%,transparent)',
            }}>
              Retry
            </button>
          </div>
        )}

        {/* Content grid */}
        {!loading && !error && data && (
          <div key={fadeKey} className="fade-in"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '32px' }}>

            {/* CAD */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px',
                            marginBottom: '20px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem' }}>🍁</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700,
                               fontSize: '1rem', color: 'var(--color-text)' }}>
                  Canadian Markets
                </span>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, fontFamily: 'var(--font-body)',
                  padding: '3px 10px', borderRadius: 'var(--radius-full)', letterSpacing: '0.05em',
                  background: 'color-mix(in oklch,var(--color-primary) 10%,transparent)',
                  color: 'var(--color-primary)',
                  border: '1px solid color-mix(in oklch,var(--color-primary) 22%,transparent)',
                }}>
                  TSX / TSXV · CAD
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)',
                               marginLeft: 'auto', fontFamily: 'var(--font-body)' }}>
                  {cad.length} stocks · {cadBuys} BUY
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {cad.length === 0
                  ? <EmptyState />
                  : <>
                      {cadBuys === 0 && horizon === 'ultra_short' && <NoHighConviction timeframe="0–3m" />}
                      {cad.map((s, i) => (
                        <div key={s.ticker} className="fade-in-up" style={{ animationDelay: `${i * 55}ms` }}>
                          <StockCard stock={s} horizon={horizon} darkMode={darkMode} />
                        </div>
                      ))}
                    </>
                }
              </div>
            </section>

            {/* USD */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px',
                            marginBottom: '20px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem' }}>🦅</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700,
                               fontSize: '1rem', color: 'var(--color-text)' }}>
                  US Markets
                </span>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, fontFamily: 'var(--font-body)',
                  padding: '3px 10px', borderRadius: 'var(--radius-full)', letterSpacing: '0.05em',
                  background: 'color-mix(in oklch,var(--color-navy) 10%,transparent)',
                  color: 'var(--color-navy)',
                  border: '1px solid color-mix(in oklch,var(--color-navy) 22%,transparent)',
                }}>
                  NYSE / NASDAQ · USD
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)',
                               marginLeft: 'auto', fontFamily: 'var(--font-body)' }}>
                  {usd.length} stocks · {usdBuys} BUY
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {usd.length === 0
                  ? <EmptyState />
                  : <>
                      {usdBuys === 0 && horizon === 'ultra_short' && <NoHighConviction timeframe="0–3m" />}
                      {usd.map((s, i) => (
                        <div key={s.ticker} className="fade-in-up" style={{ animationDelay: `${i * 55}ms` }}>
                          {/* inside CAD map */}
<StockCard
  stock={s}
  horizon={horizon}
  darkMode={darkMode}
  livePrice={prices[s.ticker] || null}
/>

{/* inside USD map — same change */}
<StockCard
  stock={s}
  horizon={horizon}
  darkMode={darkMode}
  livePrice={prices[s.ticker] || null}
/>
                        </div>
                      ))}
                    </>
                }
              </div>
            </section>

          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--color-divider)', marginTop: '64px', padding: '28px 0' }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '12px',
        }}>
          {/* Left — disclaimer + attribution */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{
              fontSize: '0.75rem', color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)',
            }}>
              For informational purposes only. Not financial advice.
            </span>
            <span style={{
              fontSize: '0.72rem', color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)',
            }}>
              Designed by Claude &nbsp;·&nbsp; Owned by&nbsp;
              <a
                href="https://sujaysoni.github.io/Career-Journey-/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--color-primary)',
                  textDecoration: 'none',
                  fontWeight: 600,
                  borderBottom: '1px solid color-mix(in oklch,var(--color-primary) 35%,transparent)',
                  paddingBottom: '1px',
                  transition: 'color 180ms ease, border-color 180ms ease',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.color = 'var(--color-primary-hover)'
                  e.currentTarget.style.borderBottomColor = 'var(--color-primary)'
                }}
                onMouseOut={e => {
                  e.currentTarget.style.color = 'var(--color-primary)'
                  e.currentTarget.style.borderBottomColor = 'color-mix(in oklch,var(--color-primary) 35%,transparent)'
                }}
              >
                Sujay Soni
              </a>
            </span>
          </div>

          {/* Right — repo tag */}
          <span style={{
            fontSize: '0.7rem', color: 'var(--color-border)', fontFamily: 'var(--font-body)',
          }}>
            sujaysoni/equity-strategist-dashboard
          </span>
        </div>
      </footer>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      borderRadius: 'var(--radius-2xl)', padding: '40px', textAlign: 'center',
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📭</div>
      <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px',
                  color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
        No data available
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)', fontFamily: 'var(--font-body)' }}>
        Run the analysis workflow to populate stocks.
      </p>
    </div>
  )
}

function NoHighConviction({ timeframe }) {
  return (
    <div style={{
      borderRadius: 'var(--radius-xl)', padding: '14px 16px',
      display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '4px',
      background: 'color-mix(in oklch,var(--color-warn) 8%,transparent)',
      border: '1px solid color-mix(in oklch,var(--color-warn) 22%,transparent)',
    }}>
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🔍</span>
      <div>
        <p style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '2px',
                    color: 'var(--color-warn)', fontFamily: 'var(--font-body)' }}>
          No High-Conviction Setups Found
        </p>
        <p style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
          No BUY-rated stocks in the <strong>{timeframe}</strong> window. HOLD/SELL names shown below for reference.
        </p>
      </div>
    </div>
  )
}
