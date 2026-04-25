import { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi, type CandlestickData } from 'lightweight-charts';
import { request } from '../lib/api';
import { ws } from '../lib/ws';

interface Props {
  symbol: string;
  interval: '1min' | '5min' | '15min' | '30min' | '60min' | '1day';
  height?: number;
}

export function KlineChart({ symbol, interval, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor: '#a1a1aa' },
      grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#3f3f46' },
      rightPriceScale: { borderColor: '#3f3f46' },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#16c784',
      downColor: '#ea3943',
      borderUpColor: '#16c784',
      borderDownColor: '#ea3943',
      wickUpColor: '#16c784',
      wickDownColor: '#ea3943',
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    let cancelled = false;
    (async () => {
      try {
        const data = await request<Array<{ time: number; open: number; high: number; low: number; close: number }>>({
          url: '/trade/kline',
          params: { symbol, interval, limit: 200 },
        });
        if (cancelled) return;
        const candles: CandlestickData[] = data.map((d) => ({
          time: d.time as any,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));
        series.setData(candles);
        chart.timeScale().fitContent();
      } catch {
        // ignore
      }
    })();

    const channel = `kline:${symbol}:${interval}`;
    ws.subscribe([channel]);
    const off = ws.on((event, data) => {
      if (event !== 'price.kline' || !data) return;
      if (data.symbol !== symbol || data.interval !== interval) return;
      seriesRef.current?.update({
        time: data.time,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
      });
    });

    return () => {
      cancelled = true;
      off();
      ws.unsubscribe([channel]);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [symbol, interval, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
