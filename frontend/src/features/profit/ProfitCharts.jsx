import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatINR, formatMonth } from '../../lib/format';

/** Validated categorical slots (dataviz reference palette, light surface). */
const SERIES = { received: '#0b5f86', finalized: '#d9a03a' };
const AXIS = { stroke: '#94a3b6', fontSize: 12 };
const GRID = '#dce5ee';

/** Compact INR for axis ticks only (values in tooltips/tables are exact). */
function compactINR(value) {
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${n}`;
}

function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-slate-800">
        {labelFormatter ? labelFormatter(label) : label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}:{' '}
          <span className="font-medium text-slate-900 tabular-nums">
            {formatINR(p.payload[`${p.dataKey}Exact`])}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Numbers for plotting; exact strings kept alongside for tooltips. */
function toPlot(rows, keys) {
  return rows.map((r) => {
    const out = { ...r };
    for (const k of keys) {
      out[`${k}Exact`] = r[k];
      out[k] = Number(r[k]);
    }
    return out;
  });
}

/** Received vs finalized driver settlements per month (grouped bars, one ₹ axis). */
export function ReceivedVsSettledChart({ months }) {
  const data = toPlot([...months].reverse(), ['receivedAmount', 'finalizedSettlements']);
  return (
    <div
      className="h-72"
      role="img"
      aria-label="Company amount received versus finalized driver settlements by month"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="settlementMonth"
            tickFormatter={formatMonth}
            tick={AXIS}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={compactINR}
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            content={<ChartTooltip labelFormatter={formatMonth} />}
            cursor={{ fill: '#e8eff5' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="receivedAmount"
            name="Company amount received"
            fill={SERIES.received}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
          <Bar
            dataKey="finalizedSettlements"
            name="Finalized driver settlements"
            fill={SERIES.finalized}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** LV profit over time (single series, so no legend box). */
export function ProfitTrendChart({ trend }) {
  const data = toPlot(trend, ['lvProfit']);
  return (
    <div className="h-64" role="img" aria-label="LV profit by month">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="settlementMonth"
            tickFormatter={formatMonth}
            tick={AXIS}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={compactINR}
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <ReferenceLine y={0} stroke="#9a9da8" />
          <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} />
          <Line
            dataKey="lvProfit"
            name="LV profit"
            stroke={SERIES.received}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** LV profit per company (single series, horizontal bars). */
export function CompanyProfitChart({ companies }) {
  const data = toPlot(
    companies.filter((c) => c.company).map((c) => ({ name: c.company.name, lvProfit: c.lvProfit })),
    ['lvProfit'],
  );
  return (
    <div
      style={{ height: Math.max(160, data.length * 44 + 40) }}
      role="img"
      aria-label="LV profit by company"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            tickFormatter={compactINR}
            tick={AXIS}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <ReferenceLine x={0} stroke="#9a9da8" />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#e8eff5' }} />
          <Bar
            dataKey="lvProfit"
            name="LV profit"
            fill={SERIES.received}
            radius={4}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
