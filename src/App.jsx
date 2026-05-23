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

const TOP_N = 30

// Ticker tape items — static market labels
const TICKER_ITEMS = [
  { label: 'TSX Composite', tag: 'TSX' },
  { label: 'S&P 500', tag: 'SPX' },
  { label: 'NASDAQ 100', tag: 'NDX' },
  { label: 'TSXV', tag: 'TSXV' },
  { label: 'NYSE Comp.', tag: 'NYA' },
  { label: 'TSX Financials', tag: 'TFI' },
  { label: 'S&P/TSX 60', tag: 'TX60' },
  { label: 'Russell 2000', tag: 'RUT' },
  { label: 'Dow Jones', tag: 'DJIA' },
  { label: 'TSX Energy', tag: 'TTEN' },
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-label="Equity Strategist logo">
      <rect width="24" height="24" rx="6" fill="var(--color-primary)" opacity="0.15"/>
      <polyline points="3,16 8,9 12,12 19,5" stroke="var(--color-primary)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="15,5 19,5 19,9" stroke="var(--color-primary)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function TickerBand() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS] // duplicate for seamless loop
  return (
    <div className="ticker-band" role="marquee" aria-label="Market index ticker">
      <div className="ticker-band-inner">
        {items.map((item, i) => (
          <span key={i} className="ticker-item">
            <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>{item.label}</span>
            <span style={{
              color: 'var(--color-primary)',
              background: 'color-mix(in oklch, var(--color-primary) 10%, transparent)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.65rem',
              letterSpacing: '0.06em',
            }}>{item.tag}</span>
          </span>
        ))}
      </div>
    </div>
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
    try {
      const saved = localStorage.getItem('theme')
      if (saved) return saved === 'dark'
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    try { localStorage.setItem('theme', darkMode ? 'dark' : 'light') } catch {}
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

  const cad = useMemo(() => sortStocks(data?.cad || [], horizon).slice(0, TOP_N), [data, horizon])
  const usd = useMemo(() => sortStocks(data?.usd || [], horizon).slice(0, TOP_N), [data, horizon])

  const cadBuys  = cad.filter(s => s.horizons?.[horizon]?.rating === 'BUY').length
  const usdBuys  = usd.filter(s => s.horizons?.[horizon]?.rating === 'BUY').length
  const cadTotal = data?.cad?.length || 0
  const usdTotal = data?.usd?.length || 0
  const isUltraLong = horizon === 'ultra_long'

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="bg-ambient" style={{ minHeight: '100vh', fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 glassmorphism" style={{ borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto',
          padding: '12px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '16px', flexWrap: 'wrap',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LogoMark />
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '1.05rem',
                letterSpacing: '-0.01em',
                color: 'var(--color-text)',
                lineHeight: 1.1,
              }}>
                Equity Strategist
              </div>
              <div style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-faint)',
              }}>
                TSX · TSXV · NYSE · NASDAQ
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {scanning && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '0.72rem', fontWeight: 600,
                color: 'var(--color-primary)',
              }}>
                <span className="pulse-dot" />
                Scanning markets…
              </div>
            )}
            <RefreshButton onClick={handleRefresh} refreshing={refreshing} />
            <button
              className="btn-theme"
              onClick={() => setDarkMode(d => !d)}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>

        {/* Horizon toggle strip */}
        <div style={{ borderTop: '1px solid var(--color-divider)', background: 'color-mix(in oklch, var(--color-surface-2) 70%, transparent)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
            <HorizonToggle horizons={HORIZONS} active={horizon} onChange={handleHorizonChange} />
          </div>
        </div>
      </header>

      {/* ── TICKER BAND ── */}
      <TickerBand />

      {/* ── HERO SECTION ── */}
      <div className="hero-section">
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="fade-in-up" style={{ animationDelay: '0.05s' }}>
            <span className="hero-eyebrow">
              <span className="pulse-dot" style={{ width: '6px', height: '6px' }} />
              AI-Powered · Multi-Timeframe Analysis
            </span>
          </div>
          <h1 className="hero-title fade-in-up" style={{ animationDelay: '0.12s' }}>
            North American <em>Equity Intelligence</em>
          </h1>
          <p className="hero-subtitle fade-in-up" style={{ animationDelay: '0.2s' }}>
            BUY · HOLD · SELL signals across TSX, TSXV, NYSE, and NASDAQ — ranked by fundamental
            strength, technical momentum, and macro context across five time horizons.
          </p>

          {/* Hero stats row */}
          {!loading && data && (
            <div className="hero-stat-row fade-in-up" style={{ animationDelay: '0.28s' }}>
              <div className="hero-stat">
                <span className="hero-stat-value tabular">{cadBuys}</span>
                <span className="hero-stat-label">CAD BUYs</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value tabular">{usdBuys}</span>
                <span className="hero-stat-label">USD BUYs</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value tabular">{cadTotal + usdTotal}</span>
                <span className="hero-stat-label">Stocks Tracked</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value" style={{ fontSize: '1.1rem', color: 'var(--color-text-muted)' }}>5</span>
                <span className="hero-stat-label">Time Horizons</span>
              </div>
            </div>
          )}

          {loading && (
            <div className="hero-stat-row fade-in-up">
              {[80, 80, 100, 70].map((w, i) => (
                <div key={i} className="skeleton" style={{ width: `${w}px`, height: '44px', borderRadius: 'var(--radius-md)' }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 24px 0' }}>

        {/* Meta bar */}
        {lastUpdated && !loading && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '10px', marginBottom: '24px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)' }}>
              <span style={{ marginRight: '4px' }}>📅</span>
              {dateStr} · Last refreshed: <strong style={{ color: 'var(--color-text-muted)' }}>{lastUpdated.toLocaleTimeString()}</strong>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { label: `${cadBuys} BUYs of ${cadTotal} CAD`, color: 'var(--color-buy)' },
                { label: `${usdBuys} BUYs of ${usdTotal} USD`, color: 'var(--color-navy)' },
              ].map(({ label, color }) => (
                <span key={label} className="stat-pill" style={{
                  background: `color-mix(in oklch,${color} 10%,transparent)`,
                  border: `1px solid color-mix(in oklch,${color} 25%,transparent)`,
                  color,
                }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="info-banner info-banner-error fade-in" style={{ marginBottom: '20px' }}>
            <span>⚠</span>
            <span>Failed to load recommendations: <strong>{error}</strong></span>
          </div>
        )}

        {/* Ultra Long notice */}
        {isUltraLong && !loading && (
          <div className="info-banner info-banner-primary fade-in" style={{ marginBottom: '20px' }}>
            <span>🏰</span>
            <div>
              <strong style={{ color: 'var(--color-primary)' }}>Ultra Long (0–360m):</strong>{' '}
              Ranked by Economic Moat × Market Cap. RSI signals de-weighted in favour of TAM,
              structural demand, and competitive durability.
            </div>
          </div>
        )}

        {/* Loading state — skeleton */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,520px),1fr))', gap: '28px' }}>
            {[0, 1].map(col => (
              <div key={col}>
                <div className="skeleton" style={{ height: '52px', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', marginBottom: '1px' }} />
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton" style={{
                    height: '72px', marginBottom: '8px',
                    borderRadius: i === 5 ? '0 0 var(--radius-xl) var(--radius-xl)' : 'var(--radius-md)',
                    animationDelay: `${i * 0.08}s`,
                  }} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── TWO COLUMN GRID ── */}
        {!loading && data && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))',
            gap: '28px',
            alignItems: 'start',
          }}>

            {/* CAD Column */}
            <section>
              <div className="market-section-header">
                <span style={{ fontSize: '1rem' }}>🍁</span>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400, fontSize: '1rem',
                  color: 'var(--color-text)', letterSpacing: '-0.01em',
                }}>Canadian Markets</span>
                <span className="stat-pill" style={{
                  background: 'color-mix(in oklch,var(--color-primary) 10%,transparent)',
                  border: '1px solid color-mix(in oklch,var(--color-primary) 22%,transparent)',
                  color: 'var(--color-primary)',
                }}>TSX · TSXV</span>
                <span className="stat-pill" style={{
                  marginLeft: 'auto',
                  background: 'var(--color-surface-offset)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}>
                  Top {Math.min(TOP_N, cad.length)} of {cadTotal}
                </span>
              </div>
              <div className="market-section-body">
                <div key={`cad-${fadeKey}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px', animation: 'fadeIn 0.35s ease' }}>
                  {cad.length === 0 ? <EmptyState /> : cad.map((s, i) => (
                    <StockCard key={s.ticker} stock={s} horizon={horizon} darkMode={darkMode} rank={i + 1} />
                  ))}
                </div>
              </div>
            </section>

            {/* USD Column */}
            <section>
              <div className="market-section-header">
                <span style={{ fontSize: '1rem' }}>🦅</span>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400, fontSize: '1rem',
                  color: 'var(--color-text)', letterSpacing: '-0.01em',
                }}>U.S. Markets</span>
                <span className="stat-pill" style={{
                  background: 'color-mix(in oklch,var(--color-navy) 10%,transparent)',
                  border: '1px solid color-mix(in oklch,var(--color-navy) 22%,transparent)',
                  color: 'var(--color-navy)',
                }}>NYSE · NASDAQ</span>
                <span className="stat-pill" style={{
                  marginLeft: 'auto',
                  background: 'var(--color-surface-offset)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}>
                  Top {Math.min(TOP_N, usd.length)} of {usdTotal}
                </span>
              </div>
              <div className="market-section-body">
                <div key={`usd-${fadeKey}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px', animation: 'fadeIn 0.35s ease' }}>
                  {usd.length === 0 ? <EmptyState /> : usd.map((s, i) => (
                    <StockCard key={s.ticker} stock={s} horizon={horizon} darkMode={darkMode} rank={i + 1} />
                  ))}
                </div>
              </div>
            </section>

          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-top">
            <div className="site-footer-logo">
              <LogoMark />
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.95rem',
                color: 'var(--color-text)',
              }}>Equity Strategist</span>
            </div>
            <nav className="site-footer-links" aria-label="Footer navigation">
              <a href="#">TSX Markets</a>
              <a href="#">US Markets</a>
              <a href="#">Methodology</a>
              <a href="https://github.com/sujaysoni/equity-strategist-dashboard" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </nav>
          </div>
          <div className="site-footer-bottom">
            <span>For informational purposes only. Not financial advice. Always do your own research.</span>
            <span>Data via yFinance · Refreshed 06:00 ET weekdays · © {new Date().getFullYear()} Equity Strategist</span>
          </div>
        </div>
      </footer>

    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center',
      borderRadius: 'var(--radius-xl)',
      border: '1px dashed var(--color-border)',
      color: 'var(--color-text-faint)', fontSize: '0.85rem',
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '8px', opacity: 0.5 }}>📊</div>
      No data available — trigger a refresh to run the analysis.
    </div>
  )
}
