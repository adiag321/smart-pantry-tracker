"use client";

type Point = { price: number; recorded_at: string };

// Minimal inline-SVG sparkline (PRD section 3G) - no charting library needed
// for a single polyline over a handful of price points.
export function Sparkline({ history }: { history: Point[] }) {
  if (history.length < 2) {
    return <span className="text-xs text-neutral-400">not enough history</span>;
  }

  const width = 100;
  const height = 24;
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = history
    .map((h, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = height - ((h.price - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const trendColor = prices[prices.length - 1] > prices[0] ? "#b91c1c" : "#15803d";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block">
      <polyline points={points} fill="none" stroke={trendColor} strokeWidth={1.5} />
    </svg>
  );
}
