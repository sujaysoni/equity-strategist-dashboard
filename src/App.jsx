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
                            fontSize: '0.75rem', fontWeight: 600, color: 
