import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { SectionHeader } from '@/pages/ReportsPage';

const BRAND_BLUE = '#0077B6';

interface ChartDatum {
  name:  string;
  value: number;
  color: string;
}

interface BarDatum {
  name:      string;
  fullName:  string;
  rate:      number;
  assigned:  number;
  completed: number;
}

interface ReportsChartsProps {
  totalTaskCount:    number;
  reportLoading:     boolean;
  pieData:           ChartDatum[];
  barData:           BarDatum[];
  pipelineStageData: ChartDatum[];
}

export function ReportsCharts({
  totalTaskCount, reportLoading, pieData, barData, pipelineStageData,
}: ReportsChartsProps) {
  return (
    <>
      {/* ── Section 1: Status pie ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <SectionHeader title="Tasks by Status" />
        {reportLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : pieData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No tasks yet.</p>
        ) : (
          <div className="relative" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} tasks`, '']} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Total in centre */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{totalTaskCount}</p>
                <p className="text-xs text-gray-400">total</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Engineer bar chart ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <SectionHeader title="Completion Rate by Engineer" />
        {barData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No assignments yet.</p>
        ) : (
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: number, _name: unknown, props: any) => [
                    `${value}% (${props.payload.completed}/${props.payload.assigned})`,
                    'Completion rate',
                  ]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labelFormatter={(label: string, payload: any[]) =>
                    payload?.[0]?.payload?.fullName ?? label
                  }
                  cursor={{ fill: 'rgba(0,119,182,0.06)' }}
                />
                <Bar dataKey="rate" fill={BRAND_BLUE} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Section 3: Pipeline Stage Distribution ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <SectionHeader title="Pipeline Stage Distribution" />
        {pipelineStageData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No pipeline data yet.</p>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineStageData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(v: number) => [`${v} tasks`, 'Count']} cursor={{ fill: 'rgba(0,119,182,0.06)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {pipelineStageData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </>
  );
}
