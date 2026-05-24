import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import type { SeriesPoint } from '../data/types';

interface Props {
  series: SeriesPoint[];
  betterIs: 'lower' | 'higher';
}

export function BeforeAfterChart({ series, betterIs: _ }: Props) {
  return (
    <div className="rounded-tile p-4 bg-cream-soft ring-1 ring-inset ring-ink-100">
      <div className="label-mono mb-3 px-2">Per-component breakdown</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EAF1" vertical={false} />
          <XAxis dataKey="label" stroke="#6C7387" fontSize={12} tickLine={false} axisLine={{ stroke: '#E7EAF1' }} />
          <YAxis stroke="#6C7387" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1B2030',
              border: 'none',
              borderRadius: '12px',
              fontSize: '13px',
              color: '#F6F4EE',
              boxShadow: '0 8px 24px rgba(20, 27, 50, 0.18)',
            }}
            labelStyle={{ color: '#A8AFC2' }}
            cursor={{ fill: 'rgba(255, 110, 82, 0.06)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: '#6C7387', paddingTop: '8px' }}
            iconType="circle"
          />
          <Bar dataKey="before" name="Before" fill="#A8AFC2" radius={[6, 6, 0, 0]} maxBarSize={40} />
          <Bar dataKey="after" name="After" fill="#1B2030" radius={[6, 6, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
