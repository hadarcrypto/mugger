import React from 'react'
import type { Timeframe } from '../../types'
import { TIMEFRAME_CONFIG } from '../../types'
import './TimeframeSelector.css'

interface TimeframeSelectorProps {
  selected: Timeframe
  onChange: (tf: Timeframe) => void
  isLoading: boolean
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']

export const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  selected, onChange, isLoading
}) => {
  return (
    <div className="tf-selector">
      <span className="tf-selector__label">Interval</span>
      <div className="tf-selector__buttons">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            className={`tf-btn ${selected === tf ? 'tf-btn--active' : ''}`}
            onClick={() => onChange(tf)}
            disabled={isLoading}
            title={TIMEFRAME_CONFIG[tf].label}
          >
            {TIMEFRAME_CONFIG[tf].label}
          </button>
        ))}
      </div>
      {isLoading && (
        <div className="tf-selector__loading">
          <span className="tf-selector__loading-dot" />
        </div>
      )}
    </div>
  )
}
