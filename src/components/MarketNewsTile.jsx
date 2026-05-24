import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Feed strategy ────────────────────────────────────────────────────────
// Primary proxy: allorigins.win (free, reliable, no rate limit for public RSS)
// Fallback proxy: rss2json.com (free tier, 10k req/day)
// All source URLs are verified public RSS/Atom feeds as of 2026.

const FEEDS = {
  commodities: [
    {
      label: 'Yahoo Finance · Commodities',
      url: 'https://finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,GC%3DF,CL%3DF,SI%3DF,HG%3DF,ZW%3DF&region=US&lang=en-US',
      filter: [],
    },
    {
      label: 'Globe & Mail · Markets',
      url: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/markets/',
      filter: ['oil','gold','silver','copper','commodity','crude','metal','grain','gas','energy','mining','wheat','lumber'],
    },
    {
      label: 'Yahoo Finance · Energy',
      url: 'https://finance.yahoo.com/rss/2.0/headline?s=XLE,XOM,CVX,SU.TO,CNQ.TO&region=US&lang=en-US',
      filter: [],
    },
  ],
  digital: [
    {
      label: 'Yahoo Finance · Crypto',
      url: 'https://finance.yahoo.com/rss/2.0/headline?s=BTC-USD,ETH-USD,SOL-USD,XRP-USD,BNB-USD&region=US&lang=en-US',
      filter: [],
    },
    {
      label: 'CoinDesk',
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml',
      filter: [],
    },
    {
      label: 'Yahoo Finance · DeFi & Web3',
      url: 'https://finance.yahoo.com/rss/2.0/headline?s=COIN,MSTR,CLSK,RIOT,HUT&region=US&lang=en-US',
      filter: [],
    },
  ],
  alts: [
    {
      label: 'Yahoo Finance · ETFs',
      url: 'https://finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,GLD,VNQ,PDBC,BTAL&region=US&lang=en-US',
      filter: [],
    },
    {
      label: 'Morningstar · News',
      url: 'https://feeds.morningstar.com/rss/news',
      filter: ['etf','reit','alternative','fund','private','hedge','infrastructure','commodity'],
    },
    {
      label: 'Globe & Mail · Investing',
      url: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/investing/',
      filter: [],
    },
  ],
}

const TAB_META = [
  { key: 'commodities', label: 'Commodities',   icon: '⚡', color: 'var(--color-orange)'  },
  { key: 'digital',     label: 'Digital Assets', icon: '₿', color: 'var(--color-primary)' },
  { key: 'alts',        label: 'Alternatives',   icon: '◈', color: 'var(--color-purple)'  },
]

const MAX_ITEMS  = 15
const REFRESH_MS = 5 * 60 * 1000

// ─── CORS proxy helpers ───────────────────────────────────────────────────
// allorigins returns { contents: "<xml>..." } — parse manually
async function fetchViaAllOrigins(url) {
  const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
  const res   = await fetch(proxy, { signal: AbortSignal.timeout(10000) })
  const data  = await res.json()
  if (!data?.contents) throw new Error('Empty response from proxy')
  return parseRSSXML(data.contents, url)
}

// rss2json as fallback
async function fetchViaRss2Json(url) {
  const proxy = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=20`
  const res   = await fetch(proxy, { signal: AbortSignal.timeout(10000) })
  const data  = await res.json()
  if (data.status !== 'ok') throw new Error(data.message || 'rss2json error')
  return (data.items || []).map(it => ({
    title:   cleanText(it.title),
    link:    it.link || '#',
    pubDate: it.pubDate,
  }))
}

function parseRSSXML(xml, sourceUrl) {
  const doc   = new DOMParser().parseFromString(xml, 'application/xml')
  const items = [...doc.querySelectorAll('item, entry')]
  return items.map(el => {
    const title   = el.querySelector('title')?.textContent || 'Untitled'
    const link    = el.querySelector('link')?.textContent
                 || el.querySelector('link')?.getAttribute('href')
                 || '#'
    const pubDate = el.querySelector('pubDate')?.textContent
                 || el.querySelector('published')?.textContent
                 || el.querySelector('updated')?.textContent
                 || ''
    return { title: cleanText(title), link: link.trim(), pubDate }
  })
}

function cleanText(str) {
  if (!str) return ''
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim()
}

async function fetchFeed(feedDef) {
  let items = []
  // Try allorigins first, fall back to rss2json
  try {
    items = await fetchViaAllOrigins(feedDef.url)
  } catch {
    try {
      items = await fetchViaRss2Json(feedDef.url)
    } catch {
      return []   // both failed — silently skip this feed
    }
  }

  // keyword filter (only when filter list is non-empty)
  if (feedDef.filter?.length > 0) {
    const kw = feedDef.filter
    items = items.filter(it => {
      const text = it.title.toLowerCase()
      return kw.some(k => text.includes(k))
    })
  }

  return items.slice(0, MAX_ITEMS).map(it => ({
    ...it,
    source: feedDef.label,
  }))
}

// ─── helpers ──────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (isNaN(diff) || diff < 0) return ''
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── component ────────────────────────────────────────────────────────────
export default function MarketNewsTile({ darkMode }) {
  const [open,      setOpen]      = useState(false)
  const [activeTab, setActiveTab] = useState('commodities')
  const [articles,  setArticles]  = useState({ commodities: [], digital: [], alts: [] })
  const [loading,   setLoading]   = useState({ commodities: false, digital: false, alts: false })
  const [fetchedAt, setFetchedAt] = useState({ commodities: null,  digital: null,  alts: null  })
  const [error,     setError]     = useState({ commodities: null,  digital: null,  alts: null  })

  // dragging
  const panelRef  = useRef(null)
  const dragging  = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, top: 0, right: 0 })
  const [pos, setPos] = useState({ bottom: 88, right: 24 })

  const loadTab = useCallback(async (tab) => {
    setLoading(p => ({ ...p, [tab]: true }))
    setError(p   => ({ ...p, [tab]: null }))
    try {
      // fetch all feeds in parallel; partial failures are silently skipped
      const results = await Promise.all(FEEDS[tab].map(fetchFeed))
      const flat = results
        .flat()
        .filter(it => it.title && it.title !== 'Untitled')
        .sort((a, b) => {
          const ta = a.pubDate ? new Date(a.pubDate) : 0
          const tb = b.pubDate ? new Date(b.pubDate) : 0
          return tb - ta
        })

      // dedupe by title prefix (first 60 chars)
      const seen = new Set()
      const deduped = flat.filter(it => {
        const key = it.title.slice(0, 60).toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      if (deduped.length === 0) throw new Error('No articles available right now — try again shortly')
      setArticles(p => ({ ...p, [tab]: deduped.slice(0, MAX_ITEMS) }))
      setFetchedAt(p => ({ ...p, [tab]: new Date() }))
    } catch (e) {
      setError(p => ({ ...p, [tab]: e.message || 'Failed to load news' }))
    } finally {
      setLoading(p => ({ ...p, [tab]: false }))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (!articles[activeTab].length && !loading[activeTab]) loadTab(activeTab)
  }, [open, activeTab])

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => loadTab(activeTab), REFRESH_MS)
    return () => clearInterval(id)
  }, [open, activeTab, loadTab])

  const switchTab = (tab) => {
    setActiveTab(tab)
    if (!articles[tab].length && !loading[tab]) loadTab(tab)
  }

  // drag
  const onMouseDown = (e) => {
    if (e.target.closest('button,a')) return
    dragging.current = true
    const rect = panelRef.current.getBoundingClientRect()
    dragStart.current = {
      x: e.clientX, y: e.clientY,
      right: window.innerWidth - rect.right,
      top: rect.top,
    }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      const newRight  = Math.max(8, Math.min(window.innerWidth  - 300, dragStart.current.right  - dx))
      const newBottom = Math.max(8, Math.min(window.innerHeight - 80,
        window.innerHeight - dragStart.current.top - dy - (panelRef.current?.offsetHeight || 500)))
      setPos({ bottom: newBottom, right: newRight })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  const tabMeta  = TAB_META.find(t => t.key === activeTab)
  const items    = articles[activeTab]
  const isLoad   = loading[activeTab]
  const err      = error[activeTab]
  const stamp    = fetchedAt[activeTab]

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close market news' : 'Open market news'}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          width: '52px', height: '52px', borderRadius: '50%',
          border: 'none', cursor: 'pointer',
          background: open
            ? 'var(--color-surface-offset)'
            : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))',
          color: open ? 'var(--color-text-muted)' : '#fff',
          boxShadow: open
            ? '0 2px 12px oklch(0 0 0 / 0.25)'
            : '0 4px 20px oklch(from var(--color-primary) l c h / 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 200ms cubic-bezier(0.16,1,0.3,1)',
          transform: open ? 'rotate(45deg) scale(0.92)' : 'rotate(0deg) scale(1)',
        }}
      >
        {open ? <XIcon /> : <NewsIcon />}
      </button>

      {/* ── floating panel ── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            bottom: `${pos.bottom}px`, right: `${pos.right}px`,
            zIndex: 9998,
            width: 'clamp(320px, 92vw, 430px)',
            maxHeight: 'min(580px, 82vh)',
            display: 'flex', flexDirection: 'column',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            boxShadow: '0 8px 40px oklch(0 0 0 / 0.32), 0 2px 8px oklch(0 0 0 / 0.18)',
            overflow: 'hidden',
            animation: 'newsFloatIn 0.28s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {/* title bar */}
          <div
            onMouseDown={onMouseDown}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 14px 10px',
              borderBottom: '1px solid var(--color-divider)',
              background: 'color-mix(in oklch, var(--color-surface-2) 80%, transparent)',
              cursor: 'grab', userSelect: 'none', flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem' }}>📰</span>
              <span style={{
                fontFamily: 'var(--font-display)', fontSize: '0.85rem',
                fontWeight: 500, color: 'var(--color-text)', letterSpacing: '-0.01em',
              }}>Market Intelligence</span>
              {stamp && (
                <span style={{
                  fontSize: '0.58rem', color: 'var(--color-text-faint)',
                  background: 'var(--color-surface-offset)', padding: '1px 6px',
                  borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)',
                }}>
                  {stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <button
              onClick={() => loadTab(activeTab)}
              title="Refresh news"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-faint)', padding: '4px',
                borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
                transition: 'color 180ms',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-faint)'}
            >
              <RefreshIcon spin={isLoad} />
            </button>
          </div>

          {/* source pills row */}
          <div style={{
            padding: '7px 12px 0',
            display: 'flex', gap: '5px', flexWrap: 'wrap',
            background: 'color-mix(in oklch, var(--color-bg) 50%, transparent)',
            flexShrink: 0,
          }}>
            {FEEDS[activeTab].map(f => (
              <span key={f.label} style={{
                fontSize: '0.57rem', fontWeight: 600,
                letterSpacing: '0.03em', textTransform: 'uppercase',
                color: 'var(--color-text-faint)',
                background: 'var(--color-surface-offset)',
                border: '1px solid var(--color-border)',
                padding: '1px 6px', borderRadius: 'var(--radius-full)',
              }}>{f.label.split('·')[0].trim()}</span>
            ))}
          </div>

          {/* tab bar */}
          <div style={{
            display: 'flex', marginTop: '7px',
            borderBottom: '1px solid var(--color-divider)',
            background: 'color-mix(in oklch, var(--color-bg) 40%, transparent)',
            flexShrink: 0,
          }}>
            {TAB_META.map(tab => (
              <button
                key={tab.key}
                onClick={() => switchTab(tab.key)}
                style={{
                  flex: 1, padding: '8px 4px', border: 'none',
                  borderBottom: activeTab === tab.key
                    ? `2px solid ${tab.color}` : '2px solid transparent',
                  background: activeTab === tab.key
                    ? `color-mix(in oklch, ${tab.color} 8%, transparent)` : 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.68rem',
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  color: activeTab === tab.key ? tab.color : 'var(--color-text-faint)',
                  letterSpacing: '0.02em',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  transition: 'all 160ms ease', lineHeight: 1.2,
                }}
              >
                <span style={{ fontSize: '0.95rem' }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* article list */}
          <div style={{
            overflowY: 'auto', flex: 1, padding: '4px 0',
            scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border) transparent',
          }}>

            {/* loading skeleton */}
            {isLoad && (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div className="skeleton" style={{ height: '13px', width: `${70 + (i % 3) * 10}%`, borderRadius: '4px' }} />
                    <div className="skeleton" style={{ height: '11px', width: '38%', borderRadius: '4px', animationDelay: `${i * 0.06}s` }} />
                  </div>
                ))}
              </div>
            )}

            {/* error state */}
            {!isLoad && err && (
              <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: '0.75rem', lineHeight: 1.55 }}>
                <div style={{ fontSize: '1.6rem', marginBottom: '8px', opacity: 0.45 }}>📡</div>
                <div style={{ color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                  Couldn't reach news sources
                </div>
                <div style={{ color: 'var(--color-text-faint)', fontSize: '0.63rem', marginBottom: '14px' }}>
                  {err}
                </div>
                <button
                  onClick={() => loadTab(activeTab)}
                  style={{
                    fontSize: '0.7rem', padding: '5px 14px',
                    borderRadius: 'var(--radius-full)',
                    border: `1px solid ${tabMeta?.color}`,
                    background: 'transparent', color: tabMeta?.color, cursor: 'pointer',
                  }}
                >Retry</button>
              </div>
            )}

            {/* empty */}
            {!isLoad && !err && items.length === 0 && (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--color-text-faint)', fontSize: '0.75rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '8px', opacity: 0.4 }}>📭</div>
                No articles found
              </div>
            )}

            {/* article rows */}
            {!isLoad && !err && items.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', padding: '10px 14px', textDecoration: 'none',
                  borderBottom: i < items.length - 1
                    ? '1px solid color-mix(in oklch, var(--color-divider) 55%, transparent)' : 'none',
                  transition: 'background 160ms ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in oklch, var(--color-primary) 5%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  fontSize: '0.78rem', fontWeight: 500, color: 'var(--color-text)',
                  lineHeight: 1.42, marginBottom: '5px',
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {item.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.04em',
                    color: tabMeta?.color,
                    background: `color-mix(in oklch, ${tabMeta?.color} 10%, transparent)`,
                    padding: '1px 6px', borderRadius: 'var(--radius-full)',
                    border: `1px solid color-mix(in oklch, ${tabMeta?.color} 25%, transparent)`,
                    textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    {/* shorten source label */}
                    {item.source.split('·')[1]?.trim() || item.source.split('·')[0].trim()}
                  </span>
                  {item.pubDate && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)' }}>
                      {timeAgo(item.pubDate)}
                    </span>
                  )}
                  <ExternalLinkIcon color="var(--color-text-faint)" />
                </div>
              </a>
            ))}
          </div>

          {/* footer */}
          <div style={{
            padding: '7px 14px', borderTop: '1px solid var(--color-divider)',
            background: 'color-mix(in oklch, var(--color-surface-2) 80%, transparent)',
            fontSize: '0.58rem', color: 'var(--color-text-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span>Yahoo Finance · Globe & Mail · Morningstar · CoinDesk</span>
            <span style={{ opacity: 0.7 }}>Not financial advice</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes newsFloatIn {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </>
  )
}

// ─── icons ────────────────────────────────────────────────────────────────
function NewsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function RefreshIcon({ spin }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         style={{ animation: spin ? 'spin 1s linear infinite' : 'none' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  )
}

function ExternalLinkIcon({ color }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
         stroke={color || 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0, marginLeft: 'auto' }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}
