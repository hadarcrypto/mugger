import React, { useEffect } from 'react'
import type { AlertItem } from '../../types'
import { playAlertSound, getAlertIntensity } from '../../data/alerts'
import './AlertBanner.css'

interface AlertBannerProps {
  alerts: AlertItem[]
  onDismiss: (id: string) => void
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alerts, onDismiss }) => {
  const active = alerts.filter(a => !a.acknowledged).slice(0, 3)

  useEffect(() => {
    if (active.length > 0) {
      const top = active[0]
      playAlertSound(getAlertIntensity(top.score))
    }
  }, [active.length])

  if (active.length === 0) return null

  return (
    <div className="alert-banner">
      {active.map(a => (
        <div key={a.id} className={`alert-item alert-item--${getAlertIntensity(a.score)}`}>
          <div className="alert-item__dot" />
          <div className="alert-item__content">
            <span className="alert-item__symbol">{a.symbol.replace('USDT', '')}</span>
            <span className="alert-item__score">Score {a.score}</span>
            <span className="alert-item__msg">{a.message}</span>
          </div>
          <button className="alert-item__close" onClick={() => onDismiss(a.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
