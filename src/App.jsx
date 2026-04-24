import { useState, useEffect, useCallback } from 'react'
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

export default function App() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [horizon,     setHorizon]     = useState('short')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing,  setRefreshing]  = useState(false)
  const [scanning,    setScanning]    = useState(false)
  const [fadeKey,     setFadeKey]     = useState(0)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const base = import.meta.env.BASE_URL
      const res  = await fetch(`${base}recommendations.json?t=${Date.now()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date(json.generated_at))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Trigger fade animation on horizon change
  const handleHorizonChange = (h) => {
    setFadeKey(k => k + 1)
    setHorizon(h)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setScanning(true)
    try {
      await fetch(
        'https://api.github.com/repos/sujaysoni/equity-strategist-dashboard/dispatches',
        {
          method:  'POST',
          headers: {
            Authorization:  `token ${import.meta.env.VITE_DISPATCH_TOKEN || ''}`,
            Accept:         'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event_type: 'refresh-analysis' }),
        }
      )
    } catch (e) {
      console.warn('Dispatch skipped:', e.message)
    }
    setTimeout(() => {
      fetchData()
      setRefreshing(false)
      setScanning(false)
    }, 4000)
  }

  const cad = data?.cad || []
  const usd = data?.usd || []

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>

      {/* Radial background glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,212,170,0.07) 0%, transparent 70%)',
        zIndex: 0,
      }} />

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 glassmorphism border-b"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, #00d4aa, #0fa3c8)',
                          boxShadow: '0 0 20px rgba(0,212,170,0.4)' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <polyline points="2,14 7,8 11,11 18,4" stroke="white" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="13,4 18,4 18,9" stroke="white" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="font-bold text-base tracking-tight"
                   style={{ fontFamily: 'Cabinet Grotesk, Inter, sans-serif' }}>
                Equity Strategist
              </div>
              <div className="text-xs" style={{ color: '#4b5563' }}>
                TSX · TSXV · NYSE · NASDAQ — Multi-Timeframe
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {scanning && (
              <div className="hidden sm:flex items-center gap-2 text-xs font-medium"
                   style={{ color: '#00d4aa' }}>
                <span className="pulse-dot" />
                Scanning markets…
              </div>
            )}
            {lastUpdated && !scanning && (
              <span className="text-xs hidden sm:block" style={{ color: '#4b5563' }}>
                Data as of {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <RefreshButton onClick={handleRefresh} loading={refreshing} scanning={scanning} />
          </div>
        </div>
      </header>

      {/* ── HORIZON TOGGLE ── */}
      <div className="sticky top-[73px] z-40 border-b"
           style={{ borderColor: 'rgba(255,255,255,0.05)',
                    background: 'rgba(13,15,17,0.85)',
                    backdropFilter: 'blur(20px)' }}>
        <div className="max-w-screen-xl mx-auto px-6 py-3">
          <HorizonToggle horizons={HORIZONS} active={horizon} onChange={handleHorizonChange} />
        </div>
      </div>

      {/* ── MAIN ── */}
      <main className="max-w-screen-xl mx-auto px-6 py-8 relative z-10">

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-10 h-10 rounded-full border-2 animate-spin"
                 style={{ borderColor: '#00d4aa', borderTopColor: 'transparent' }} />
            <span className="text-sm" style={{ color: '#4b5563' }}>Loading market data…</span>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border p-8 text-center max-w-md mx-auto"
               style={{ background: 'rgba(255,0,0,.06)', borderColor: 'rgba(255,0,0,.2)',
                        color: '#FF0000' }}>
            <p className="font-bold text-lg mb-2">Failed to load data</p>
            <p className="text-sm opacity-75 mb-4">{error}</p>
            <button onClick={fetchData}
                    className="px-5 py-2 rounded-xl text-sm font-bold"
                    style={{ background: 'rgba(255,0,0,.12)', color: '#FF0000',
                             border: '1px solid rgba(255,0,0,.3)' }}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div key={fadeKey} className="fade-in grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── CAD PANEL ── */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-xl">🍁</span>
                <span className="text-base font-bold"
                      style={{ fontFamily: 'Cabinet Grotesk, Inter, sans-serif' }}>
                  Canadian Markets
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(0,212,170,.1)', color: '#00d4aa',
                               border: '1px solid rgba(0,212,170,.2)' }}>
                  TSX / TSXV
                </span>
                <span className="text-xs ml-auto" style={{ color: '#4b5563' }}>
                  {cad.length} stocks
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {cad.map((s, i) => (
                  <div key={s.ticker}
                       className="fade-in-up"
                       style={{ animationDelay: `${i * 60}ms` }}>
                    <StockCard stock={s} horizon={horizon} />
                  </div>
                ))}
                {cad.length === 0 && <EmptyState label="No CAD data" />}
              </div>
            </div>

            {/* ── USD PANEL ── */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-xl">🦅</span>
                <span className="text-base font-bold"
                      style={{ fontFamily: 'Cabinet Grotesk, Inter, sans-serif' }}>
                  US Markets
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(96,165,250,.1)', color: '#60a5fa',
                               border: '1px solid rgba(96,165,250,.2)' }}>
                  NYSE / NASDAQ
                </span>
                <span className="text-xs ml-auto" style={{ color: '#4b5563' }}>
                  {usd.length} stocks
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {usd.map((s, i) => (
                  <div key={s.ticker}
                       className="fade-in-up"
                       style={{ animationDelay: `${i * 60}ms` }}>
                    <StockCard stock={s} horizon={horizon} />
                  </div>
                ))}
                {usd.length === 0 && <EmptyState label="No USD data" />}
              </div>
            </div>

          </div>
        )}
      </main>

      <footer className="border-t mt-16 py-6 relative z-10"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="max-w-screen-xl mx-auto px-6 flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs" style={{ color: '#374151' }}>
            For informational purposes only. Not financial advice.
          </span>
          <span className="text-xs" style={{ color: '#1f2937' }}>
            sujaysoni/equity-strategist-dashboard
          </span>
        </div>
      </footer>
    </div>
  )
}

function EmptyState({ label }) {
  return (
    <div className="rounded-2xl border p-8 text-center text-sm"
         style={{ borderColor: 'rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                  color: '#4b5563' }}>
      {label}
    </div>
  )
}
