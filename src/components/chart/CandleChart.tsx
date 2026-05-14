import React, { useEffect, useRef } from 'react'
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type Time,
} from 'lightweight-charts'
import type { Candle, LiquidityMagnet, Timeframe } from '../../types'
import type { ActiveSetup } from '../../data/setup'
import type { LiqCluster } from '../../data/liqstream'
import type { ForwardZone } from '../../data/forwardliq'
import { getForwardZoneColor, getForwardZoneBorder } from '../../data/forwardliq'
import { getClusterColor, getClusterBorder } from '../../data/liqstream'
import { calculateRSI } from '../../data/rsi'
import { calculateCVD } from '../../data/cvd'
import './CandleChart.css'

interface CandleChartProps {
  candles: Candle[]
  livePrice: number | null
  isLoading: boolean
  magnets: LiquidityMagnet[]
  timeframe: Timeframe
  activeSetup?: ActiveSetup | null
  liqClusters: LiqCluster[]
  forwardZones: ForwardZone[]
}

const C = {
  bg:'#080808', grid:'#0d0d0d', crosshair:'#252525', text:'#606060', border:'#121212',
  upBody:'#c8c8c8', upWick:'#a0a0a0', downBody:'#343434', downWick:'#444444',
  upBorder:'#d8d8d8', downBorder:'#444444', rsiLine:'#707070',
}

// TF config — how many candles back for magnets + zone width
const TF_CONFIG: Record<Timeframe, { zoneWidth: number; label: string }> = {
  '1m':  { zoneWidth: 0.06, label: 'Local' },
  '5m':  { zoneWidth: 0.10, label: 'Local' },
  '15m': { zoneWidth: 0.16, label: 'Short' },
  '30m': { zoneWidth: 0.22, label: 'Short' },
  '1h':  { zoneWidth: 0.32, label: 'Mid' },
  '4h':  { zoneWidth: 0.55, label: 'Macro' },
  '1d':  { zoneWidth: 1.10, label: 'Macro' },
}

export const CandleChart: React.FC<CandleChartProps> = ({
  candles, livePrice, isLoading, magnets, timeframe, activeSetup, liqClusters, forwardZones
}) => {
  const wrapperRef  = useRef<HTMLDivElement>(null)
  const candleRef   = useRef<HTMLDivElement>(null)
  const rsiRef      = useRef<HTMLDivElement>(null)
  const cvdRef      = useRef<HTMLDivElement>(null)
  const ccApi       = useRef<IChartApi|null>(null)
  const rcApi       = useRef<IChartApi|null>(null)
  const cvdApi      = useRef<IChartApi|null>(null)
  const cSeries     = useRef<ISeriesApi<'Candlestick'>|null>(null)
  const rSeries     = useRef<ISeriesApi<'Line'>|null>(null)
  const cvdSeries   = useRef<ISeriesApi<'Line'>|null>(null)
  const cvdZero     = useRef<ISeriesApi<'Line'>|null>(null)
  const ob70        = useRef<ISeriesApi<'Line'>|null>(null)
  const ob30        = useRef<ISeriesApi<'Line'>|null>(null)
  const zoneRefs    = useRef<ISeriesApi<'Line'>[]>([])
  const setupRefs   = useRef<ISeriesApi<'Line'>[]>([])
  const liqRefs     = useRef<ISeriesApi<'Line'>[]>([])
  const fwdRefs     = useRef<ISeriesApi<'Line'>[]>([])
  const resizeRef   = useRef<ResizeObserver|null>(null)
  const initDone    = useRef(false)

  const CANDLE_H = 0.62
  const RSI_H    = 0.20

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current||!rsiRef.current||!cvdRef.current||!wrapperRef.current) return
    const H = wrapperRef.current.clientHeight||600
    const W = wrapperRef.current.clientWidth||800
    const cH = Math.floor(H*CANDLE_H)
    const rH = Math.floor(H*RSI_H)
    const vH = H-cH-rH

    const base = {
      layout: { background:{type:ColorType.Solid as const,color:C.bg}, textColor:C.text, fontFamily:"'IBM Plex Mono',monospace", fontSize:10 },
      grid: { vertLines:{color:C.grid,style:1 as const}, horzLines:{color:C.grid,style:1 as const} },
      crosshair: { mode:CrosshairMode.Normal, vertLine:{color:C.crosshair,width:1 as const,style:1 as const,labelBackgroundColor:'#181818'}, horzLine:{color:C.crosshair,width:1 as const,style:1 as const,labelBackgroundColor:'#181818'} },
      // ПРАВКА 1: pan 360° — pressedMouseMove enables click+drag anywhere
      // ПРАВКА 2: price axis wheel zoom — axisPressedMouseMove.price + mouseWheel on price scale
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,   // click+drag = pan
        horzTouchDrag: true,
        vertTouchDrag: true,      // vertical drag also allowed
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,            // drag on price axis = vertical zoom
        },
        axisDoubleClickReset: true,
      },
    }

    // Candle chart
    const cc = createChart(candleRef.current, { ...base, height:cH, width:W,
      rightPriceScale: {
        borderColor:C.border, textColor:C.text,
        scaleMargins:{top:0.06,bottom:0.04},
        mode: 0,                  // normal mode allows wheel zoom on price axis
      },
      timeScale: { borderColor:C.border, timeVisible:false, secondsVisible:false, rightOffset:8, barSpacing:8, minBarSpacing:0.5 },
    })
    const cs = cc.addCandlestickSeries({upColor:C.upBody,downColor:C.downBody,borderUpColor:C.upBorder,borderDownColor:C.downBorder,wickUpColor:C.upWick,wickDownColor:C.downWick})

    // RSI chart
    const rc = createChart(rsiRef.current, { ...base, height:rH, width:W,
      rightPriceScale: { borderColor:C.border, textColor:C.text, scaleMargins:{top:0.08,bottom:0.08} },
      timeScale: { borderColor:C.border, timeVisible:false, secondsVisible:false, rightOffset:8, barSpacing:8, minBarSpacing:0.5 },
    })
    const rs = rc.addLineSeries({color:C.rsiLine,lineWidth:1,lastValueVisible:true,priceLineVisible:false})
    const o7 = rc.addLineSeries({color:'#2a1515',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
    const o3 = rc.addLineSeries({color:'#152030',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})

    // CVD chart
    const vc = createChart(cvdRef.current, { ...base, height:vH, width:W,
      rightPriceScale: { borderColor:C.border, textColor:C.text, scaleMargins:{top:0.1,bottom:0.1} },
      timeScale: { borderColor:C.border, timeVisible:true, secondsVisible:false, rightOffset:8, barSpacing:8, minBarSpacing:0.5 },
    })
    const cvdL = vc.addLineSeries({color:'#505050',lineWidth:1,lastValueVisible:true,priceLineVisible:false})
    const cvdZ = vc.addLineSeries({color:'#1a1a1a',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})

    ccApi.current=cc; rcApi.current=rc; cvdApi.current=vc
    cSeries.current=cs; rSeries.current=rs
    cvdSeries.current=cvdL; cvdZero.current=cvdZ
    ob70.current=o7; ob30.current=o3

    // Sync crosshair
    cc.subscribeCrosshairMove(p=>{ if(p.time){rc.setCrosshairPosition(p.logical as number,p.time as Time,rs);vc.setCrosshairPosition(p.logical as number,p.time as Time,cvdL)} })
    rc.subscribeCrosshairMove(p=>{ if(p.time){cc.setCrosshairPosition(p.logical as number,p.time as Time,cs);vc.setCrosshairPosition(p.logical as number,p.time as Time,cvdL)} })
    vc.subscribeCrosshairMove(p=>{ if(p.time){cc.setCrosshairPosition(p.logical as number,p.time as Time,cs);rc.setCrosshairPosition(p.logical as number,p.time as Time,rs)} })

    // Sync scroll/zoom
    let sync=false
    const sr=(src:IChartApi,tgts:IChartApi[])=>{
      src.timeScale().subscribeVisibleLogicalRangeChange(r=>{ if(sync||!r)return;sync=true;tgts.forEach(t=>t.timeScale().setVisibleLogicalRange(r));sync=false })
    }
    sr(cc,[rc,vc]); sr(rc,[cc,vc]); sr(vc,[cc,rc])

    resizeRef.current=new ResizeObserver(()=>{
      if(!wrapperRef.current)return
      const h=wrapperRef.current.clientHeight,w=wrapperRef.current.clientWidth
      const ch=Math.floor(h*CANDLE_H),rh=Math.floor(h*RSI_H),vh=h-ch-rh
      cc.applyOptions({height:ch,width:w});rc.applyOptions({height:rh,width:w});vc.applyOptions({height:vh,width:w})
    })
    resizeRef.current.observe(wrapperRef.current)

    return ()=>{ resizeRef.current?.disconnect();cc.remove();rc.remove();vc.remove();ccApi.current=null;rcApi.current=null;cvdApi.current=null;cSeries.current=null;rSeries.current=null;cvdSeries.current=null }
  },[])

  // ── Data update ───────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!cSeries.current||!rSeries.current||!cvdSeries.current||candles.length===0)return
    cSeries.current.setData(candles.map(c=>({time:c.time as Time,open:c.open,high:c.high,low:c.low,close:c.close})))
    if(!initDone.current){ccApi.current?.timeScale().fitContent();initDone.current=true}

    const rsiData=calculateRSI(candles,14)
    rSeries.current.setData(rsiData.map(r=>({time:r.time as Time,value:r.value})))
    if(rsiData.length>=2){
      const t0=rsiData[0].time as Time,t1=rsiData[rsiData.length-1].time as Time
      ob70.current?.setData([{time:t0,value:70},{time:t1,value:70}])
      ob30.current?.setData([{time:t0,value:30},{time:t1,value:30}])
    }

    const cvdData=calculateCVD(candles)
    cvdSeries.current.setData(cvdData.map(d=>({time:d.time as Time,value:d.value})))
    if(cvdData.length>=2){
      const t0=cvdData[0].time as Time,t1=cvdData[cvdData.length-1].time as Time
      cvdZero.current?.setData([{time:t0,value:0},{time:t1,value:0}])
      const last=cvdData[cvdData.length-1].value
      cvdSeries.current.applyOptions({color:last>=0?'#686868':'#404040'})
    }
  },[candles])

  useEffect(()=>{initDone.current=false},[timeframe])

  // ── Live price ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!cSeries.current||!livePrice||candles.length===0)return
    const last=candles[candles.length-1]
    cSeries.current.update({time:last.time as Time,open:last.open,high:Math.max(last.high,livePrice),low:Math.min(last.low,livePrice),close:livePrice})
  },[livePrice,candles])

  // ── Draw magnet zones ─────────────────────────────────────────────────────
  // ПРАВКА 3: filled zone rectangles (multiple lines = fill effect)
  // ПРАВКА 5: zone width from TF_CONFIG — different per timeframe
  useEffect(()=>{
    if(!ccApi.current||candles.length===0)return
    zoneRefs.current.forEach(s=>{try{ccApi.current?.removeSeries(s)}catch{}})
    zoneRefs.current=[]
    if(magnets.length===0)return

    const t0=candles[Math.max(0,candles.length-300)].time as Time
    const t1=candles[candles.length-1].time as Time
    const cfg=TF_CONFIG[timeframe]

    magnets.forEach(m=>{
      if(!ccApi.current||m.finished)return

      const isUpper = m.side==='upper'
      // Zone colors — solid fill simulation with multiple lines
      const borderColor = isUpper
        ? 'rgba(160,45,45,0.80)'
        : 'rgba(35,120,55,0.80)'
      const fillColor = isUpper
        ? 'rgba(100,22,22,0.38)'
        : 'rgba(14,80,35,0.38)'

      // Top border
      const topL=ccApi.current.addLineSeries({
        color:borderColor, lineWidth:1, lineStyle:LineStyle.Solid,
        lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
        title:`${isUpper?'↑':'↓'} ${m.label} ${m.distancePct>0?'+':''}${m.distancePct.toFixed(2)}%`,
      })
      topL.setData([{time:t0,value:m.priceHigh},{time:t1,value:m.priceHigh}])
      zoneRefs.current.push(topL)

      // Bottom border
      const botL=ccApi.current.addLineSeries({
        color:borderColor, lineWidth:1, lineStyle:LineStyle.Solid,
        lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
      })
      botL.setData([{time:t0,value:m.priceLow},{time:t1,value:m.priceLow}])
      zoneRefs.current.push(botL)

      // Fill — 12 lines between top and bottom
      const steps=12
      const step=(m.priceHigh-m.priceLow)/steps
      for(let i=1;i<steps;i++){
        const fl=ccApi.current?.addLineSeries({
          color:fillColor, lineWidth:1, lineStyle:LineStyle.Solid,
          lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
        })
        if(fl){
          fl.setData([{time:t0,value:m.priceLow+step*i},{time:t1,value:m.priceLow+step*i}])
          zoneRefs.current.push(fl)
        }
      }
    })
  },[magnets,candles,timeframe])



  // ── Draw real liquidation clusters ───────────────────────────────────────
  useEffect(()=>{
    if(!ccApi.current||candles.length===0)return
    liqRefs.current.forEach(s=>{try{ccApi.current?.removeSeries(s)}catch{}})
    liqRefs.current=[]
    if(liqClusters.length===0)return

    const t0=candles[Math.max(0,candles.length-300)].time as Time
    const t1=candles[candles.length-1].time as Time

    liqClusters.forEach((cl: LiqCluster)=>{
      if(!ccApi.current)return
      const fillColor   = getClusterColor(cl)
      const borderColor = getClusterBorder(cl)
      const label = `⚡ ${cl.side==='upper'||cl.buyUSD>=cl.sellUSD?'Short':'Long'} liq $${cl.totalUSD>=1e6?(cl.totalUSD/1e6).toFixed(1)+'M':(cl.totalUSD/1e3).toFixed(0)+'K'} (${cl.count} hits)`

      // Top border
      const topL=ccApi.current.addLineSeries({
        color:borderColor, lineWidth:1, lineStyle:LineStyle.Solid,
        lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
        title:label,
      })
      topL.setData([{time:t0,value:cl.priceHigh},{time:t1,value:cl.priceHigh}])
      liqRefs.current.push(topL)

      // Bottom border
      const botL=ccApi.current.addLineSeries({
        color:borderColor, lineWidth:1, lineStyle:LineStyle.Solid,
        lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
      })
      botL.setData([{time:t0,value:cl.priceLow},{time:t1,value:cl.priceLow}])
      liqRefs.current.push(botL)

      // Fill
      const steps=10
      const step=(cl.priceHigh-cl.priceLow)/steps
      for(let i=1;i<steps;i++){
        const fl=ccApi.current?.addLineSeries({
          color:fillColor, lineWidth:1, lineStyle:LineStyle.Solid,
          lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
        })
        if(fl){
          fl.setData([{time:t0,value:cl.priceLow+step*i},{time:t1,value:cl.priceLow+step*i}])
          liqRefs.current.push(fl)
        }
      }
    })
  },[liqClusters,candles])


  // ── Draw forward liquidation prediction zones ─────────────────────────────
  useEffect(()=>{
    if(!ccApi.current||candles.length===0)return
    fwdRefs.current.forEach(s=>{try{ccApi.current?.removeSeries(s)}catch{}})
    fwdRefs.current=[]
    if(forwardZones.length===0)return

    const t0=candles[Math.max(0,candles.length-100)].time as Time
    // Extend forward in time
    const secPerCandle=candles.length>1?candles[candles.length-1].time-candles[candles.length-2].time:3600
    const tFwd=(candles[candles.length-1].time+secPerCandle*80) as Time

    forwardZones.forEach((z: ForwardZone)=>{
      if(!ccApi.current)return
      const fillColor   = getForwardZoneColor(z)
      const borderColor = getForwardZoneBorder(z)
      const conf        = z.confidence
      const label       = `${z.type==='short_liq'?'▲ Short':'▼ Long'} liq · ${z.label}`

      // Top border — dotted to differentiate from real clusters
      const topL=ccApi.current.addLineSeries({
        color:borderColor, lineWidth:1,
        lineStyle: conf>=70 ? LineStyle.Solid : LineStyle.Dashed,
        lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
        title:label,
      })
      topL.setData([{time:t0,value:z.priceHigh},{time:tFwd,value:z.priceHigh}])
      fwdRefs.current.push(topL)

      const botL=ccApi.current.addLineSeries({
        color:borderColor, lineWidth:1,
        lineStyle: conf>=70 ? LineStyle.Solid : LineStyle.Dashed,
        lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
      })
      botL.setData([{time:t0,value:z.priceLow},{time:tFwd,value:z.priceLow}])
      fwdRefs.current.push(botL)

      // Fill — lighter for predicted zones vs real
      const steps=8
      const step=(z.priceHigh-z.priceLow)/steps
      for(let i=1;i<steps;i++){
        const fl=ccApi.current?.addLineSeries({
          color:fillColor, lineWidth:1, lineStyle:LineStyle.Solid,
          lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
        })
        if(fl){
          fl.setData([{time:t0,value:z.priceLow+step*i},{time:tFwd,value:z.priceLow+step*i}])
          fwdRefs.current.push(fl)
        }
      }
    })
  },[forwardZones,candles])

  // ── Draw setup lines ─────────────────────────────────────────────────────
  useEffect(()=>{
    if(!ccApi.current||candles.length===0)return
    setupRefs.current.forEach(s=>{try{ccApi.current?.removeSeries(s)}catch{}})
    setupRefs.current=[]
    if(!activeSetup||activeSetup.status==='stopped'||activeSetup.status==='tp3_hit')return

    const t0=candles[Math.max(0,candles.length-300)].time as Time
    const t1=candles[candles.length-1].time as Time

    activeSetup.levels.forEach(lv=>{
      if(!ccApi.current)return
      const ls = lv.lineStyle==='dashed'?LineStyle.Dashed:lv.lineStyle==='dotted'?LineStyle.Dotted:LineStyle.Solid
      const line=ccApi.current.addLineSeries({
        color:lv.color, lineWidth: lv.type==='entry'?2:1,
        lineStyle:ls,
        lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
        title:lv.label,
      })
      line.setData([{time:t0,value:lv.price},{time:t1,value:lv.price}])
      setupRefs.current.push(line)
    })
  },[activeSetup,candles])

  // ПРАВКА 4: Dominant magnet indicator — price pull arrow on price axis area
  const currentPrice = livePrice ?? candles[candles.length-1]?.close ?? 0
  const dominantMagnet = magnets.length > 0
    ? magnets
        .filter(m=>!m.finished)
        .reduce((a,b)=> {
          const sA = a.liquidityUSD/(Math.abs(a.distancePct)+0.1)
          const sB = b.liquidityUSD/(Math.abs(b.distancePct)+0.1)
          return sA>sB?a:b
        }, magnets.filter(m=>!m.finished)[0])
    : null

  return(
    <div className="candle-chart-wrapper" ref={wrapperRef}>
      {isLoading&&<div className="candle-chart-loading"><span className="state-dot state-dot--watching"/><span>Loading</span></div>}

      {/* ПРАВКА 4: Pull indicator — minimal overlay showing dominant direction */}
      {dominantMagnet&&(
        <div className={`pull-indicator pull-indicator--${dominantMagnet.side}`}>
          <span className="pull-indicator__arrow">{dominantMagnet.side==='upper'?'▲':'▼'}</span>
          <span className="pull-indicator__label">
            {dominantMagnet.side==='upper'?'Short liq pull':'Long liq pull'} · {dominantMagnet.label} · {Math.abs(dominantMagnet.distancePct).toFixed(2)}%
          </span>
        </div>
      )}

      <div style={{position:'relative',flex:`0 0 ${CANDLE_H*100}%`,minHeight:0}}>
        <div ref={candleRef} style={{width:'100%',height:'100%'}}/>
      </div>

      <div className="chart-divider"><span className="chart-divider__label">RSI 14 · Wilder SMMA</span></div>
      <div ref={rsiRef} style={{flex:`0 0 ${RSI_H*100}%`,minHeight:0,width:'100%'}}/>
      <div className="chart-divider"><span className="chart-divider__label">CVD · Cumulative Volume Delta</span></div>
      <div ref={cvdRef} style={{flex:'1',minHeight:0,width:'100%'}}/>
    </div>
  )
}
