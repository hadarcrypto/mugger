/**
 * Liquidity Magnet Engine — Mugger v0.003
 * Cluster ZONES with timeframe scope + cross-exchange liquidity estimate
 */
import type { Candle, LiquidityMagnet, MagnetStrength, Timeframe } from '../types'

interface SwingCluster {
  priceHigh: number; priceLow: number; midPrice: number
  volume: number; index: number; type: 'high'|'low'; touches: number
}

const EXCHANGE_MULT = 9.5

const TF_LOOKBACK: Record<Timeframe,number> = {
  '1m':8,'5m':8,'15m':6,'30m':5,'1h':5,'4h':4,'1d':3
}
const TF_MIN_CANDLES: Record<Timeframe,number> = {
  '1m':0,'5m':0,'15m':0,'30m':50,'1h':100,'4h':200,'1d':400
}
const ZONE_PCT: Record<Timeframe,number> = {
  '1m':0.08,'5m':0.12,'15m':0.18,'30m':0.25,'1h':0.35,'4h':0.60,'1d':1.20
}

function findSwingClusters(candles: Candle[], lookback: number): SwingCluster[] {
  const clusters: SwingCluster[] = []
  const n = candles.length
  for (let i = lookback; i < n - lookback; i++) {
    const c = candles[i]
    const lH = candles.slice(i-lookback,i).map(x=>x.high)
    const rH = candles.slice(i+1,i+lookback+1).map(x=>x.high)
    const lL = candles.slice(i-lookback,i).map(x=>x.low)
    const rL = candles.slice(i+1,i+lookback+1).map(x=>x.low)
    const isHigh = c.high>Math.max(...lH)&&c.high>Math.max(...rH)
    const isLow  = c.low <Math.min(...lL)&&c.low <Math.min(...rL)
    const win = candles.slice(Math.max(0,i-lookback*2),i+lookback*2)
    if (isHigh) {
      const touches = win.filter(tc=>Math.abs(tc.high-c.high)/c.high<0.003).length
      clusters.push({priceHigh:c.high,priceLow:c.high*0.998,midPrice:c.high,volume:c.volume,index:i,type:'high',touches})
    }
    if (isLow) {
      const touches = win.filter(tc=>Math.abs(tc.low-c.low)/c.low<0.003).length
      clusters.push({priceHigh:c.low*1.002,priceLow:c.low,midPrice:c.low,volume:c.volume,index:i,type:'low',touches})
    }
  }
  return clusters
}

function estLiq(cl: SwingCluster, price: number, avgVol: number, total: number): number {
  const vr = cl.volume/Math.max(avgVol,1)
  const base = price*vr*80000
  const rec = 0.4+(cl.index/total)*1.8
  const touch = 1+(cl.touches-1)*0.3
  const s = Math.round(cl.midPrice).toString()
  const round = s.endsWith('000')?2.8:s.endsWith('500')?2.0:s.endsWith('00')?1.6:s.endsWith('50')?1.2:1.0
  return base*rec*touch*round*EXCHANGE_MULT
}

function strength(liq: number, price: number): MagnetStrength {
  const r=liq/price
  if(r>300000)return'extreme'
  if(r>100000)return'strong'
  if(r>30000)return'medium'
  return'weak'
}

function swept(cl: SwingCluster, candles: Candle[]): boolean {
  const after=candles.slice(cl.index+1)
  if(!after.length)return false
  if(cl.type==='high')return after.some(c=>c.close>cl.midPrice*1.002)
  return after.some(c=>c.close<cl.midPrice*0.998)
}

function fmtLiq(usd: number): string {
  if(usd>=1e9)return`$${(usd/1e9).toFixed(1)}B`
  if(usd>=1e6)return`$${(usd/1e6).toFixed(1)}M`
  if(usd>=1e3)return`$${(usd/1e3).toFixed(0)}K`
  return`$${usd.toFixed(0)}`
}

export function generateMagnets(candles: Candle[], currentPrice: number, timeframe: Timeframe, max=6): LiquidityMagnet[] {
  if(candles.length<30||currentPrice===0)return[]
  const lookback=TF_LOOKBACK[timeframe]
  const zonePct=ZONE_PCT[timeframe]
  const minScope=TF_MIN_CANDLES[timeframe]
  const cls=findSwingClusters(candles,lookback)
  const avgVol=candles.reduce((s,c)=>s+c.volume,0)/candles.length

  const upper=cls.filter(c=>c.type==='high'&&c.midPrice>currentPrice).sort((a,b)=>a.midPrice-b.midPrice).slice(0,Math.ceil(max/2))
  const lower=cls.filter(c=>c.type==='low' &&c.midPrice<currentPrice).sort((a,b)=>b.midPrice-a.midPrice).slice(0,Math.floor(max/2))

  const result: LiquidityMagnet[]=[]

  for(const cl of upper){
    const liq=estLiq(cl,currentPrice,avgVol,candles.length)
    const half=cl.midPrice*(zonePct/100)/2
    result.push({
      priceHigh:cl.midPrice+half, priceLow:cl.midPrice-half, price:cl.midPrice,
      side:'upper', strength:strength(liq,currentPrice), liquidityUSD:liq,
      distancePct:((cl.midPrice-currentPrice)/currentPrice)*100,
      label:fmtLiq(liq), finished:swept(cl,candles), tfScope:minScope
    })
  }
  for(const cl of lower){
    const liq=estLiq(cl,currentPrice,avgVol,candles.length)
    const half=cl.midPrice*(zonePct/100)/2
    result.push({
      priceHigh:cl.midPrice+half, priceLow:cl.midPrice-half, price:cl.midPrice,
      side:'lower', strength:strength(liq,currentPrice), liquidityUSD:liq,
      distancePct:((cl.midPrice-currentPrice)/currentPrice)*100,
      label:fmtLiq(liq), finished:swept(cl,candles), tfScope:minScope
    })
  }
  return result.sort((a,b)=>Math.abs(a.distancePct)-Math.abs(b.distancePct))
}

export function getMagnetColor(side:'upper'|'lower', finished: boolean): string {
  if(finished)return'rgba(40,40,40,0.25)'
  return side==='upper'?'rgba(110,25,25,0.50)':'rgba(15,70,35,0.50)'
}

export function getMagnetBorderColor(side:'upper'|'lower', finished: boolean): string {
  if(finished)return'rgba(60,60,60,0.35)'
  return side==='upper'?'rgba(180,50,50,0.75)':'rgba(40,140,65,0.75)'
}

export function getMagnetLineWidth(_s: string): number { return 1 }
