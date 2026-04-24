import { useState, useEffect, useCallback } from 'react'
import HorizonToggle from './components/HorizonToggle'
import StockCard from './components/StockCard'
import RefreshButton from './components/RefreshButton'

const HORIZONS = [
  { key: 'ultra_short', label: 'Ultra Short', sub: '0-3m'   },
  { key: 'short',       label: 'Short',       sub: '0-12m'  },
  { key: 'medium',      label: 'Medium',      sub: '0-36m'  },
  { key: 'long',        label: 'Long',        sub: '0-60m'  },
  { key: 'ultra_long',  label: 'Ultra Long',  sub: '0-360m' },
]

export default function App() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [horizon,     setHorizon]     = useState('short')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing,  setRefreshing]  = useState(false)

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

  const handleRefresh = async () => {
    setRefreshing(true)
    setTimeout(() => {
      fetchData()
      setRefreshing(false)
    }, 3000)
  }

  const cad = data?.cad || []
  const usd = data?.usd || []

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b glassmorphism"
              style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, #00d4aa, #0fa3c8)' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <polyline points="2,14 7,8 11,11 18,4" stroke="white" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="13,4 18,4 18,9" stroke="white" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="font-bold text-base tracking-tight"
                   style={{ fontFamily: 'Cabinet Grotesk' }}>
                Equity Strategist
              </div>
              <div className="text-xs" style={{ color: 'var(--color-hold)' }}>
                TSX/TSXV · NYSE/NASDAQ · Multi-Timeframe
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs hidden sm:block" style={{ color: 'var(--color-hold)' }}>
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <RefreshButton onClick={handleRefresh} loading={refreshing} />
          </div>
        </div>
      </header>

      {/* HORIZON TOGGLE */}
      <div className="border-b"
           style={{ borderColor: 'var(--color-border)', background: 'rgba(19,22,25,0.6)' }}>
        <div className="max-w-screen-xl mx-auto px-6 py-4">
          <HorizonToggle horizons={HORIZONS} active={horizon} onChange={setHorizon} />
        </div>
      </div>

      {/* MAIN */}
      <main className="max-w-screen-xl mx-auto px-6 py-8">

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
                 style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          </div>
        )}

        {error && (
          <div className="rounded-xl border p-6 text-center"
               style={{ background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.3)',
                        color: 'var(--color-sell)' }}>
            <p className="font-bold mb-1">Failed to load data</p>
            <p className="text-sm opacity-75">{error}</p>
            <button onClick={fetchData}
                    className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: 'rgba(239,68,68,.15)', color: 'var(--color-sell)' }}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* CAD */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg font-bold"
                      style={{ fontFamily: 'Cabinet Grotesk' }}>🍁 CAD</span>
                <span className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(0,212,170,.12)', color: 'var(--color-primary)',
                               border: '1px solid rgba(0,212,170,.25)' }}>
                  TSX / TSXV
                </span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-hold)' }}>
                  {cad.length} stocks
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {cad.map(s => <StockCard key={s.ticker} stock={s} horizon={horizon} />)}
                {cad.length === 0 && (
                  <div className="rounded-xl border p-6 text-center text-sm"
                       style={{ borderColor: 'var(--color-border)', color: 'var(--color-hold)' }}>
                    No CAD data available
                  </div>
                )}
              </div>
            </div>

            {/* USD */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg font-bold"
                      style={{ fontFamily: 'Cabinet Grotesk' }}>🦅 USD</span>
                <span className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(96,165,250,.12)', color: '#60a5fa',
                               border: '1px solid rgba(96,165,250,.25)' }}>
                  NYSE / NASDAQ
                </span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-hold)' }}>
                  {usd.length} stocks
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {usd.map(s => <StockCard key={s.ticker} stock={s} horizon={horizon} />)}
                {usd.length === 0 && (
                  <div className="rounded-xl border p-6 text-center text-sm"
                       style={{ borderColor: 'var(--color-border)', color: 'var(--color-hold)' }}>
                    No USD data available
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </main>

      <footer className="border-t mt-12 py-6" style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-screen-xl mx-auto px-6 flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs" style={{ color: 'var(--color-hold)' }}>
            For informational purposes only. Not financial advice.
          </span>
          <span className="text-xs" style={{ color: '#404a54' }}>
            sujaysoni/equity-strategist-dashboard
          </span>
        </div>
      </footer>

    </div>
  )
}
