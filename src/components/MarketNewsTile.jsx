import { useState, useEffect, useRef, useCallback } from 'react'

// ─── RSS feed definitions ──────────────────────────────────────────────────
const FEEDS = {
  commodities: [
    {
      label: 'Reuters Commodities',
      url: 'https://feeds.reuters.com/reuters/businessNews',
      filter: ['oil','gold','silver','copper','wheat','corn','commodity','commodities','crude','metal','grain','natural gas','lumber','palladium','platinum'],
    },
    {
      label: 'Mining.com',
      url: 'https://www.mining.com/feed/',
      filter: [],
    },
  ],
  digital: [
    {
      label: 'CoinDesk',
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      filter: [],
    },
    {
      label: 'CoinTelegraph',
      url: 'https://cointelegraph.com/rss',
      filter: [],
    },
  ],
  alts: [
    {
      label: 'ETF.com News',
      url: 'https://www.etf.com/rss/news',
      filter: [],
    },
    {
      label: 'Seeking Alpha – Alts',
      url: 'https://seekingalpha.com/tag/alternative-investments.xml',
      filter: [],
    },
  ],
}

const TAB_META = [
  { key: 'commodities', label: 'Commodities', icon: '⚡', color: 'var(--color-orange)' },
  { key: 'digital',     label: 'Digital Assets', icon: '₿', color: 'var(--color-primary)' },
  { key: 'alts',        label: 'Alternatives', icon: '◈', color: 'var(--color-purple)' },
]

const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url='
const MAX_ITEMS = 12
const REFRESH_MS = 5 * 60 * 1000

// ─── helpers ──────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

async function fetchFeed(feedDef) {
  try {
    const res = await fetch(`${RSS2JSON}${encodeURIComponent(feedDef.url)}&count=20`, {
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json()
    if (json.status !== 'ok') return []
    let items = json.items || []
    if (feedDef.filter && feedDef.filter.length > 0) {
      const kw = feedDef.filter
      items = items.filter(it => {
        const text = `${it.title} ${it.description}`.toLowerCase()
        return kw.some(k => text.includes(k))
      })
    }
    return items.slice(0, MAX_ITEMS).map(it => ({
      title:   it.title?.trim()  || 'Untitled',
      link:    it.link  || '#',
      pubDate: it.pubDate,
      source:  feedDef.label,
    }))
  } catch { return [] }
}

// ─── component ────────────────────────────────────────────────────────────
export default function MarketNewsTile({ darkMode }) {
  const [open,       setOpen]       = useState(false)
  const [activeTab,  setActiveTab]  = useState('commodities')
  const [articles,   setArticles]   = useState({ commodities: [], digital: [], alts: [] })
  const [loading,    setLoading]    = useState({ commodities: false, digital: false, alts: false })
  const [fetchedAt,  setFetchedAt]  = useState({ commodities: null,  digital: null,  alts: null  })
  const [error,      setError]      = useState({ commodities: null,  digital: null,  alts: null  })

  // dragging
  const panelRef  = useRef(null)
  const dragging  = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, top: 0, right: 0 })
  const [pos,     setPos] = useState({ bottom: 88, right: 24 })
  const posRef    = useRef(pos)
  useEffect(() => { posRef.current = pos }, [pos])

  const loadTab = useCallback(async (tab) => {
    setLoading(p => ({ ...p, [tab]: true }))
    setError(p   => ({ ...p, [tab]: null }))
    try {
      const all = await Promise.all(FEEDS[tab].map(fetchFeed))
      const flat = all.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      if (flat.length === 0) throw new Error('No articles returned')
      setArticles(p => ({ ...p, [tab]: flat.slice(0, MAX_ITEMS) }))
      setFetchedAt(p => ({ ...p, [tab]: new Date() }))
    } catch (e) {
      setError(p => ({ ...p, [tab]: e.message || 'Failed to load' }))
    } finally {
      setLoading(p => ({ ...p, [tab]: false }))
    }
  }, [])

  // initial load of active tab when tile opens
  useEffect(() => {
    if (!open) return
    if (!articles[activeTab].length && !loading[activeTab]) {
      loadTab(activeTab)
    }
  }, [open, activeTab])

  // auto-refresh
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => loadTab(activeTab), REFRESH_MS)
    return () => clearInterval(id)
  }, [open, activeTab, loadTab])

  // switch tab → load if empty
  const switchTab = (tab) => {
    setActiveTab(tab)
    if (!articles[tab].length && !loading[tab]) loadTab(tab)
  }

  // drag handlers
  const onMouseDown = (e) => {
    if (e.target.closest('button,a')) return
    dragging.current = true
    const rect = panelRef.current.getBoundingClientRect()
    dragStart.current = {
      x:     e.clientX,
      y:     e.clientY,
      right: window.innerWidth - rect.right,
      top:   rect.top,
    }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      const newRight  = Math.max(8, Math.min(window.innerWidth  - 300, dragStart.current.right  - dx))
      const newBottom = Math.max(8, Math.min(window.innerHeight - 80,  window.innerHeight - dragStart.current.top - dy - panelRef.current.offsetHeight))
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

  const activeTabMeta = TAB_META.find(t => t.key === activeTab)
  const items  = articles[activeTab]
  const isLoad = loading[activeTab]
  const err    = error[activeTab]
  const stamp  = fetchedAt[activeTab]

  return (
    <>
      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close market news' : 'Open market news'}
        style={{
          position:     'fixed',
          bottom:       '24px',
          right:        '24px',
          zIndex:       9999,
          width:        '52px',
          height:       '52px',
          borderRadius: '50%',
          border:       'none',
          cursor:       'pointer',
          background:   open
            ? 'var(--color-surface-offset)'
            : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))',
          color:        open ? 'var(--color-text-muted)' : '#fff',
          boxShadow:    open
            ? '0 2px 12px oklch(0 0 0 / 0.25)'
            : '0 4px 20px oklch(from var(--color-primary) l c h / 0.45)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          transition:   'all 200ms cubic-bezier(0.16,1,0.3,1)',
          transform:    open ? 'rotate(45deg) scale(0.92)' : 'rotate(0deg) scale(1)',
        }}
      >
        {open
          ? <XIcon />
          : <NewsIcon />}
      </button>

      {/* ── Floating panel ── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position:     'fixed',
            bottom:       `${pos.bottom}px`,
            right:        `${pos.right}px`,
            zIndex:       9998,
            width:        'clamp(320px, 92vw, 420px)',
            maxHeight:    'min(560px, 80vh)',
            display:      'flex',
            flexDirection:'column',
            borderRadius: 'var(--radius-xl)',
            border:       '1px solid var(--color-border)',
            background:   'var(--color-surface)',
            boxShadow:    '0 8px 40px oklch(0 0 0 / 0.32), 0 2px 8px oklch(0 0 0 / 0.18)',
            overflow:     'hidden',
            animation:    'newsFloatIn 0.28s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {/* title bar — drag handle */}
          <div
            onMouseDown={onMouseDown}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '11px 14px 10px',
              borderBottom:   '1px solid var(--color-divider)',
              background:     'color-mix(in oklch, var(--color-surface-2) 80%, transparent)',
              cursor:         'grab',
              userSelect:     'none',
              flexShrink:     0,
            }}
          >
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'0.8rem' }}>📰</span>
              <span style={{
                fontFamily:    'var(--font-display)',
                fontSize:      '0.85rem',
                fontWeight:    500,
                color:         'var(--color-text)',
                letterSpacing: '-0.01em',
              }}>Market Intelligence</span>
              {stamp && (
                <span style={{
                  fontSize:   '0.6rem',
                  color:      'var(--color-text-faint)',
                  background: 'var(--color-surface-offset)',
                  padding:    '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  border:     '1px solid var(--color-border)',
                }}>Updated {stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
            <button
              onClick={() => loadTab(activeTab)}
              title="Refresh news"
              style={{
                background:   'transparent',
                border:       'none',
                cursor:       'pointer',
                color:        'var(--color-text-faint)',
                padding:      '4px',
                borderRadius: 'var(--radius-sm)',
                display:      'flex',
                alignItems:   'center',
                transition:   'color 180ms',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-faint)'}
            >
              <RefreshIcon spin={isLoad} />
            </button>
          </div>

          {/* tab bar */}
          <div style={{
            display:      'flex',
            borderBottom: '1px solid var(--color-divider)',
            background:   'color-mix(in oklch, var(--color-bg) 40%, transparent)',
            flexShrink:   0,
          }}>
            {TAB_META.map(tab => (
              <button
                key={tab.key}
                onClick={() => switchTab(tab.key)}
                style={{
                  flex:          1,
                  padding:       '8px 4px',
                  border:        'none',
                  borderBottom:  activeTab === tab.key
                    ? `2px solid ${tab.color}`
                    : '2px solid transparent',
                  background:    activeTab === tab.key
                    ? `color-mix(in oklch, ${tab.color} 8%, transparent)`
                    : 'transparent',
                  cursor:        'pointer',
                  fontSize:      '0.68rem',
                  fontWeight:    activeTab === tab.key ? 700 : 500,
                  color:         activeTab === tab.key ? tab.color : 'var(--color-text-faint)',
                  letterSpacing: '0.02em',
                  display:       'flex',
                  flexDirection: 'column',
                  alignItems:    'center',
                  gap:           '2px',
                  transition:    'all 160ms ease',
                  lineHeight:    1.2,
                }}
              >
                <span style={{ fontSize: '0.95rem' }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* article list */}
          <div style={{
            overflowY:  'auto',
            flex:       1,
            padding:    '6px 0',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--color-border) transparent',
          }}>
            {isLoad && (
              <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                    <div className="skeleton" style={{ height:'13px', width: `${75 + (i % 3)*10}%`, borderRadius:'4px' }} />
                    <div className="skeleton" style={{ height:'11px', width:'40%', borderRadius:'4px', animationDelay:`${i*0.05}s` }} />
                  </div>
                ))}
              </div>
            )}

            {!isLoad && err && (
              <div style={{
                padding:    '28px 20px',
                textAlign:  'center',
                color:      'var(--color-text-faint)',
                fontSize:   '0.75rem',
                lineHeight: 1.5,
              }}>
                <div style={{ fontSize:'1.4rem', marginBottom:'8px', opacity:0.5 }}>⚠️</div>
                <div style={{ marginBottom:'4px', color:'var(--color-text-muted)' }}>Couldn't load {activeTabMeta?.label} news</div>
                <div style={{ fontSize:'0.65rem', opacity:0.7, marginBottom:'12px' }}>{err}</div>
                <button
                  onClick={() => loadTab(activeTab)}
                  style={{
                    fontSize:     '0.7rem',
                    padding:      '5px 12px',
                    borderRadius: 'var(--radius-full)',
                    border:       `1px solid ${activeTabMeta?.color}`,
                    background:   'transparent',
                    color:        activeTabMeta?.color,
                    cursor:       'pointer',
                  }}
                >Retry</button>
              </div>
            )}

            {!isLoad && !err && items.length === 0 && (
              <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--color-text-faint)', fontSize:'0.75rem' }}>
                <div style={{ fontSize:'1.4rem', marginBottom:'8px', opacity:0.4 }}>📭</div>
                No articles found
              </div>
            )}

            {!isLoad && !err && items.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display:       'block',
                  padding:       '10px 14px',
                  textDecoration:'none',
                  borderBottom:  i < items.length - 1 ? '1px solid color-mix(in oklch, var(--color-divider) 60%, transparent)' : 'none',
                  transition:    'background 160ms ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in oklch, var(--color-primary) 5%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  fontSize:   '0.78rem',
                  fontWeight: 500,
                  color:      'var(--color-text)',
                  lineHeight: 1.4,
                  marginBottom: '5px',
                  display:    '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow:   'hidden',
                }}>
                  {item.title}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                  <span style={{
                    fontSize:     '0.6rem',
                    fontWeight:   600,
                    letterSpacing:'0.04em',
                    color:        activeTabMeta?.color,
                    background:   `color-mix(in oklch, ${activeTabMeta?.color} 10%, transparent)`,
                    padding:      '1px 6px',
                    borderRadius: 'var(--radius-full)',
                    border:       `1px solid color-mix(in oklch, ${activeTabMeta?.color} 25%, transparent)`,
                    textTransform:'uppercase',
                    flexShrink:   0,
                  }}>{item.source}</span>
                  <span style={{ fontSize:'0.6rem', color:'var(--color-text-faint)' }}>
                    {timeAgo(item.pubDate)}
                  </span>
                  <ExternalLinkIcon color="var(--color-text-faint)" />
                </div>
              </a>
            ))}
          </div>

          {/* footer bar */}
          <div style={{
            padding:      '7px 14px',
            borderTop:    '1px solid var(--color-divider)',
            background:   'color-mix(in oklch, var(--color-surface-2) 80%, transparent)',
            fontSize:     '0.6rem',
            color:        'var(--color-text-faint)',
            display:      'flex',
            alignItems:   'center',
            justifyContent:'space-between',
            flexShrink:   0,
          }}>
            <span>Auto-refreshes every 5 min · Drag title bar to move</span>
            <span style={{ color: 'var(--color-text-faint)', opacity:0.7 }}>Not financial advice</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes newsFloatIn {
          from { opacity:0; transform: translateY(18px) scale(0.96); }
          to   { opacity:1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </>
  )
}

// ─── micro icons ──────────────────────────────────────────────────────────
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
