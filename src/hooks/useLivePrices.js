import { useState, useEffect, useRef } from 'react'

const POLL_INTERVAL = 60_000   // re-fetch prices.json every 60 seconds

export default function useLivePrices(base) {
  const [prices,     setPrices]     = useState({})
  const [marketOpen, setMarketOpen] = useState(false)
  const [priceTime,  setPriceTime]  = useState(null)
  const timerRef = useRef(null)

  const load = async () => {
    try {
      const res  = await fetch(`${base}prices.json?t=${Date.now()}`)
      if (!res.ok) return
      const data = await res.json()
      setPrices(data.prices     || {})
      setMarketOpen(data.market_open || false)
      setPriceTime(data.updated_at ? new Date(data.updated_at) : null)
    } catch (_) {}
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [base])

  return { prices, marketOpen, priceTime }
}
