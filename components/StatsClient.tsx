'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import type { CollectionStats } from '@/types/collection';
import { useTranslations } from 'next-intl';

interface StatsClientProps {
  stats: CollectionStats;
}

// Chart color constants (kept in sync with CSS custom properties)
const C = {
  border: '#d2c8b8',
  sage: '#7d8c80',
  teal: '#1b3a35',
  tealLight: '#2a5c52',
  terracotta: '#c0503e',
  gold: '#c99a2e',
} as const;

export default function StatsClient({ stats }: StatsClientProps) {
  const t = useTranslations('statistics');

  // Prepare decade data sorted
  const decadeData = Object.entries(stats.objectsByDecade)
    .map(([decade, count]) => ({
      decade,
      count,
      year: parseInt(decade.replace('s', ''), 10),
    }))
    .sort((a, b) => a.year - b.year);

  // Top types
  const typeData = Object.entries(stats.objectsByType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  return (
    <div className="space-y-12">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          value={stats.totalObjects.toLocaleString()}
          label={t('totalObjects')}
        />
        <SummaryCard
          value={stats.objectsWithImages.toLocaleString()}
          label={t('withImages')}
        />
        <SummaryCard
          value={stats.topCreators.length.toString()}
          label={t('uniqueCreators')}
        />
        <SummaryCard
          value={stats.topLocations.length.toString()}
          label={t('uniqueLocations')}
        />
      </div>

      {/* Objects by decade */}
      <ChartSection title={t('objectsByDecade')}>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={decadeData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis
              dataKey="decade"
              tick={{ fontSize: 11, fill: C.sage }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: C.sage }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'white',
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={C.terracotta}
              fill={C.terracotta}
              fillOpacity={0.1}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartSection>

      {/* Objects by type */}
      <ChartSection title={t('objectsByType')}>
        <ResponsiveContainer
          width="100%"
          height={Math.max(300, typeData.length * 32)}
        >
          <BarChart data={typeData} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={C.border}
              horizontal={false}
            />
            <XAxis type="number" tick={{ fontSize: 11, fill: C.sage }} />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fontSize: 11, fill: C.tealLight }}
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip
              contentStyle={{
                background: 'white',
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Bar dataKey="count" fill={C.teal} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>

      {/* Top creators */}
      <ChartSection title={t('topCreators')}>
        <ResponsiveContainer
          width="100%"
          height={Math.max(300, stats.topCreators.length * 32)}
        >
          <BarChart
            data={stats.topCreators.slice(0, 15)}
            layout="vertical"
            margin={{ left: 160 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={C.border}
              horizontal={false}
            />
            <XAxis type="number" tick={{ fontSize: 11, fill: C.sage }} />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fontSize: 11, fill: C.tealLight }}
              tickLine={false}
              axisLine={false}
              width={160}
            />
            <Tooltip
              contentStyle={{
                background: 'white',
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Bar dataKey="count" fill={C.gold} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>

      {/* Top locations */}
      <ChartSection title={t('topLocations')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.topLocations.map((loc) => (
            <div
              key={loc.name}
              className="flex items-center justify-between px-4 py-3 bg-(--color-cream-dark) rounded-lg"
            >
              <span className="text-sm text-(--color-charcoal) truncate">
                {loc.name}
              </span>
              <span className="text-sm font-medium text-(--color-charcoal) ml-2 shrink-0">
                {loc.count}
              </span>
            </div>
          ))}
        </div>
      </ChartSection>

      {/* Top subjects */}
      <ChartSection title={t('topSubjects')}>
        <div className="flex flex-wrap gap-2">
          {stats.topSubjects.map((sub) => (
            <span
              key={sub.name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-(--color-border) rounded-full text-sm"
            >
              <span className="text-(--color-charcoal)">{sub.name}</span>
              <span className="text-xs text-(--color-warm-gray-light)">
                {sub.count}
              </span>
            </span>
          ))}
        </div>
      </ChartSection>

      {/* Top materials */}
      <ChartSection title={t('topMaterials')}>
        <ResponsiveContainer
          width="100%"
          height={Math.max(250, stats.topMaterials.length * 32)}
        >
          <BarChart
            data={stats.topMaterials}
            layout="vertical"
            margin={{ left: 100 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={C.border}
              horizontal={false}
            />
            <XAxis type="number" tick={{ fontSize: 11, fill: C.sage }} />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fontSize: 11, fill: C.tealLight }}
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={{
                background: 'white',
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Bar dataKey="count" fill={C.sage} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>
    </div>
  );
}

function SummaryCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-(--color-card) border border-(--color-border) rounded-2xl p-6 text-center shadow-sm">
      <p className="font-serif text-3xl font-bold text-(--color-charcoal)">
        {value}
      </p>
      <p className="text-sm text-(--color-warm-gray) mt-1">{label}</p>
    </div>
  );
}

function ChartSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-(--color-card) border border-(--color-border) rounded-2xl p-7 shadow-sm">
      <h3 className="font-serif text-xl font-bold text-(--color-charcoal) mb-6">
        {title}
      </h3>
      {children}
    </div>
  );
}
