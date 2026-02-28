import { useState, useRef } from 'react';
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

const DEFAULT_ORDER = ['requests', 'latency', 'error', 'cost'];
const LS_KEY = 'loom-chart-prefs';

interface ChartPrefs {
  order: string[];
  expanded: string[];
}

function loadPrefs(): ChartPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ChartPrefs>;
      return {
        order: Array.isArray(parsed.order) ? parsed.order : DEFAULT_ORDER,
        expanded: Array.isArray(parsed.expanded) ? parsed.expanded : [],
      };
    }
  } catch {
    // ignore
  }
  return { order: DEFAULT_ORDER, expanded: [] };
}

function savePrefs(prefs: ChartPrefs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

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

function NoDataChart() {
  return (
    <div className="chart-no-data" aria-label="No data available">
      <span>No data available</span>
    </div>
  );
}

interface TimeseriesChartsProps {
  data: TimeseriesData[];
  loading: boolean;
  win: WindowHours;
}

interface ChartDef {
  id: string;
  title: string;
  render: (chartData: ReturnType<typeof buildChartData>, commonAxis: object, commonTooltip: object) => React.ReactNode;
}

type ChartDataItem = TimeseriesData & { label: string; errorPct: number };

function buildChartData(data: TimeseriesData[], win: WindowHours): ChartDataItem[] {
  return data.map(b => ({
    ...b,
    label: formatBucketLabel(b.bucket, win),
    errorPct: b.errorRate * 100,
  }));
}

const CHART_DEFS: ChartDef[] = [
  {
    id: 'requests',
    title: 'Requests over Time',
    render: (chartData, commonAxis, commonTooltip) => (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" {...commonAxis} interval="preserveStartEnd" />
          <YAxis {...commonAxis} width={40} />
          <Tooltip {...commonTooltip} />
          <Area type="monotone" dataKey="requests" stroke="#6366f1" strokeWidth={2} fill="url(#reqGradient)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    ),
  },
  {
    id: 'latency',
    title: 'Avg Latency over Time (ms)',
    render: (chartData, commonAxis, commonTooltip) => (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="latGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" {...commonAxis} interval="preserveStartEnd" />
          <YAxis {...commonAxis} width={40} />
          <Tooltip {...commonTooltip} formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(0)} ms`, 'Avg Latency']} />
          <Area type="monotone" dataKey="avgLatencyMs" stroke="#059669" strokeWidth={2} fill="url(#latGradient)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    ),
  },
  {
    id: 'error',
    title: 'Error Rate over Time (%)',
    render: (chartData, commonAxis, commonTooltip) => (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="errGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" {...commonAxis} interval="preserveStartEnd" />
          <YAxis {...commonAxis} width={40} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <Tooltip {...commonTooltip} formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`, 'Error Rate']} />
          <Area type="monotone" dataKey="errorPct" stroke="#ef4444" strokeWidth={2} fill="url(#errGradient)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    ),
  },
  {
    id: 'cost',
    title: 'Estimated Cost over Time ($)',
    render: (chartData, commonAxis, commonTooltip) => (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" {...commonAxis} interval="preserveStartEnd" />
          <YAxis {...commonAxis} width={55} tickFormatter={(v: number) => `$${v.toFixed(4)}`} />
          <Tooltip {...commonTooltip} formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(6)}`, 'Cost']} />
          <Area type="monotone" dataKey="costUSD" stroke="#f59e0b" strokeWidth={2} fill="url(#costGradient)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    ),
  },
];

function TimeseriesCharts({ data, loading, win }: TimeseriesChartsProps) {
  const [prefs, setPrefs] = useState<ChartPrefs>(loadPrefs);
  const dragSrcId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const chartData = buildChartData(data, win);

  const commonAxis = {
    tick: { fontSize: 12, fill: '#4b5563' },
    tickLine: false as const,
    axisLine: false as const,
  };
  const commonTooltip = {
    contentStyle: { fontSize: '0.8125rem', borderRadius: 6, border: '1px solid #e5e7eb' },
    labelStyle: { fontWeight: 600 },
  };

  function updatePrefs(next: ChartPrefs) {
    setPrefs(next);
    savePrefs(next);
  }

  function toggleExpand(id: string) {
    const expanded = prefs.expanded.includes(id)
      ? prefs.expanded.filter(e => e !== id)
      : [...prefs.expanded, id];
    updatePrefs({ ...prefs, expanded });
  }

  function handleDragStart(id: string) {
    dragSrcId.current = id;
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragSrcId.current && dragSrcId.current !== id) {
      setDragOverId(id);
    }
  }

  function handleDrop(targetId: string) {
    const srcId = dragSrcId.current;
    if (!srcId || srcId === targetId) return;
    const order = [...prefs.order];
    const srcIdx = order.indexOf(srcId);
    const tgtIdx = order.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    order.splice(srcIdx, 1);
    order.splice(tgtIdx, 0, srcId);
    updatePrefs({ ...prefs, order });
    dragSrcId.current = null;
    setDragOverId(null);
  }

  function handleDragEnd() {
    dragSrcId.current = null;
    setDragOverId(null);
  }

  const orderedCharts = prefs.order
    .map(id => CHART_DEFS.find(c => c.id === id))
    .filter((c): c is ChartDef => c !== undefined);

  return (
    <div className="timeseries-charts">
      {orderedCharts.map(chart => {
        const isExpanded = prefs.expanded.includes(chart.id);
        const isDragOver = dragOverId === chart.id;
        const classes = [
          'chart-block',
          isExpanded ? 'chart-expanded' : '',
          isDragOver ? 'chart-drag-over' : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={chart.id}
            className={classes}
            draggable
            onDragStart={() => handleDragStart(chart.id)}
            onDragOver={e => handleDragOver(e, chart.id)}
            onDrop={() => handleDrop(chart.id)}
            onDragEnd={handleDragEnd}
          >
            <div className="chart-header">
              <span className="chart-drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>
              <h3 className="chart-title">{chart.title}</h3>
              <button
                className="chart-expand-btn"
                onClick={() => toggleExpand(chart.id)}
                aria-label={isExpanded ? 'Collapse chart' : 'Expand chart'}
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? '⤡' : '⤢'}
              </button>
            </div>
            {loading ? <LoadingChart /> : chartData.length === 0 ? <NoDataChart /> : chart.render(chartData, commonAxis, commonTooltip)}
          </div>
        );
      })}
    </div>
  );
}

export default TimeseriesCharts;
