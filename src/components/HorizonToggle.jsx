export default function HorizonToggle({ horizons, active, onChange }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl overflow-x-auto"
         style={{ background: 'rgba(255,255,255,.04)',
                  border: '1px solid var(--color-border)' }}>
      {horizons.map(h => {
        const isActive = h.key === active
        return (
          <button
            key={h.key}
            onClick={() => onChange(h.key)}
            className="flex flex-col items-center px-4 py-2 rounded-lg
                       transition-all duration-200 flex-shrink-0"
            style={{
              background: isActive ? 'var(--color-primary)' : 'transparent',
              color:      isActive ? '#000'                  : '#7a8796',
              fontWeight: isActive ? '700'                   : '500',
              boxShadow:  isActive ? '0 2px 8px rgba(0,212,170,.3)' : 'none',
            }}
          >
            <span className="text-xs font-semibold tracking-tight">{h.label}</span>
            <span className="text-xs opacity-75 mt-0.5">{h.sub}</span>
          </button>
        )
      })}
    </div>
  )
}
