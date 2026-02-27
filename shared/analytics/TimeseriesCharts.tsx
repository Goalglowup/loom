import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { TimeseriesData, WindowHours } from './types';
import './TimeseriesCharts.css';

function formatBucketLabel(isoStr: string, win: WindowHours): string {
  const d = new Date(isoStr);
  if (win <= 24) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', hour12: false });
}

function LoadingChart() {
  return (
    <div className="chart-loading" aria-label="Loading chart data">
      <div className="chart-skeleton" aria-hidden="true" />
    </div>
  );
}

interface TimeseriesChartsProps {
  data: TimeseriesData[];
  loading: boolean;
  win: WindowHours;
}

function TimeseriesCharts({ data, loading, win }: TimeseriesChartsProps) {
  const chartData = data.map(b => ({
    ...b,
    label: formatBucketLabel(b.bucket, win),
  }));

  return (
    <div className="timeseries-charts">
      <div className="chart-block">
        <h3 className="chart-title">Requests over Time</h3>
        {loading ? (
          <LoadingChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ fontSize: '0.8125rem', borderRadius: 6, border: '1px solid #e5e7eb' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#reqGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="chart-block">
        <h3 className="chart-title">Avg Latency over Time (ms)</h3>
        {loading ? (
          <LoadingChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="latGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ fontSize: '0.8125rem', borderRadius: 6, border: '1px solid #e5e7eb' }}
                labelStyle={{ fontWeight: 600 }}
                formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(0)} ms`, 'Avg Latency']}
              />
              <Area
                type="monotone"
                dataKey="avgLatencyMs"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#latGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default TimeseriesCharts;
