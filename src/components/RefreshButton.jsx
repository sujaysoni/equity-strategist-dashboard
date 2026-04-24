export default function RefreshButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold
                 transition-all duration-200 hover:scale-105 active:scale-95
                 disabled:opacity-50"
      style={{
        background: 'linear-gradient(135deg, #00d4aa, #0fa3c8)',
        color:      '#000',
        boxShadow:  '0 2px 12px rgba(0,212,170,.35)',
      }}
    >
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        className={loading ? 'animate-spin' : ''}
      >
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      {loading ? 'Refreshing…' : 'Refresh Analysis'}
    </button>
  )
}
