export default function RefreshButton({ onClick, loading, scanning }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-xl
                  text-sm font-bold transition-all duration-200
                  hover:scale-105 active:scale-95 disabled:opacity-60
                  disabled:cursor-not-allowed
                  ${scanning ? 'pulse-ring' : ''}`}
      style={{
        background:  scanning
          ? 'linear-gradient(135deg, rgba(0,212,170,0.15), rgba(15,163,200,0.15))'
          : 'linear-gradient(135deg, #00d4aa, #0fa3c8)',
        color:       scanning ? '#00d4aa' : '#000',
        border:      scanning
          ? '1px solid rgba(0,212,170,0.4)'
          : '1px solid transparent',
        boxShadow:   scanning
          ? '0 0 20px rgba(0,212,170,0.2)'
          : '0 2px 16px rgba(0,212,170,0.35)',
      }}
    >
      {/* Icon */}
      {scanning ? (
        /* Pulse bars — "AI thinking" indicator */
        <div className="flex items-center gap-[3px] h-4">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width:           '3px',
                borderRadius:    '2px',
                background:      '#00d4aa',
                animation:       `barPulse 1s ease-in-out ${i * 0.15}s infinite`,
                animationFillMode: 'both',
              }}
            />
          ))}
        </div>
      ) : loading ? (
        /* Spinner */
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          className="animate-spin"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      ) : (
        /* Default refresh icon */
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      )}

      {/* Label */}
      <span>
        {scanning ? 'Scanning…' : loading ? 'Refreshing…' : 'Refresh'}
      </span>

      {/* Keyframes injected inline for bar pulse */}
      <style>{`
        @keyframes barPulse {
          0%, 100% { height: 6px;  opacity: 0.4; }
          50%       { height: 16px; opacity: 1;   }
        }
      `}</style>
    </button>
  )
}
