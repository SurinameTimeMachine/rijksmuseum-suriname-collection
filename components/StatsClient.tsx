'use client';

import type {
  CollectionStats,
  CurationStats,
  RawCollectionStats,
} from '@/types/collection';
import { useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface StatsClientProps {
  stats: CollectionStats;
  rawStats: RawCollectionStats;
  curation: CurationStats;
}

const C = {
  border: '#c5dad5',
  axis: '#54726b',
  ink: '#0b3c34',
  teal: '#006d5b',
  bright: '#34d1b3',
  deep: '#003c34',
  mutedBar: '#7da69d',
  mutedAxis: '#7c9b94',
} as const;

export default function StatsClient({
  stats,
  rawStats,
  curation,
}: StatsClientProps) {
  const t = useTranslations('statistics');

  const rawDecadeData = Object.entries(rawStats.objectsByDecade)
    .map(([decade, count]) => ({
      decade,
      count,
      year: parseInt(decade.replace('s', ''), 10),
    }))
    .sort((a, b) => a.year - b.year);

  const rawTypeData = Object.entries(rawStats.objectsByType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  const decadeData = Object.entries(stats.objectsByDecade)
    .map(([decade, count]) => ({
      decade,
      count,
      year: parseInt(decade.replace('s', ''), 10),
    }))
    .sort((a, b) => a.year - b.year);

  const typeData = Object.entries(stats.objectsByType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));
  const topCreatorsData = stats.topCreators.slice(0, 15);

  const funnel = [
    { label: t('funnel.total'), count: curation.totalObjects },
    {
      label: t('funnel.withGeographicKeyword'),
      count: curation.withGeographicKeyword,
    },
    {
      label: t('funnel.withResolvedLocation'),
      count: curation.withResolvedLocation,
    },
    {
      label: t('funnel.withSurinameLocation'),
      count: curation.withSurinameLocation,
    },
    {
      label: t('funnel.withSurinameSpecificLocation'),
      count: curation.withSurinameSpecificLocation,
    },
    { label: t('funnel.withWikidata'), count: curation.withWikidata },
    { label: t('funnel.withCommons'), count: curation.withCommons },
    { label: t('funnel.publicDomain'), count: curation.publicDomain },
    { label: t('funnel.showable'), count: curation.showable },
  ];
  const funnelMax = Math.max(...funnel.map((f) => f.count), 1);
  const stillUnresolved =
    curation.totalObjects - curation.withSurinameSpecificLocation;

  return (
    <div className="space-y-14">
      {/* A. THE SOURCE */}
      <NarrativeSection
        eyebrow={t('eyebrows.source')}
        title={t('sectionSource.title')}
      >
        <div className="max-w-3xl space-y-4 text-ink/80 leading-relaxed">
          <p>{t('sectionSource.lead')}</p>
          <p>{t('sectionSource.body')}</p>
        </div>
      </NarrativeSection>

      {/* B. RAW DATASET */}
      <NarrativeSection
        eyebrow={t('eyebrows.raw')}
        title={t('sectionRaw.title')}
        subtitle={t('sectionRaw.subtitle')}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            value={rawStats.totalObjects.toLocaleString()}
            label={t('totalObjects')}
            muted
          />
          <SummaryCard
            value={rawStats.uniqueCreators.toLocaleString()}
            label={t('namedCreators')}
            muted
          />
          <SummaryCard
            value={rawStats.anonymousCount.toLocaleString()}
            label={t('anonymousObjects')}
            muted
          />
          <SummaryCard
            value={rawStats.uniqueGeographicKeywords.toLocaleString()}
            label={t('rawGeoKeywords')}
            muted
          />
        </div>

        <ChartSection title={t('rawObjectsByDecade')} muted>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={rawDecadeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="decade"
                tick={{ fontSize: 11, fill: C.mutedAxis }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: C.mutedAxis }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'white',
                  border: `1px solid ${C.border}`,
                  fontSize: '13px',
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={C.mutedBar}
                fill={C.mutedBar}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartSection>

        <div className="grid md:grid-cols-2 gap-6">
          <ChartSection title={t('rawObjectsByType')} muted>
            <ResponsiveContainer
              width="100%"
              height={Math.max(220, rawTypeData.length * 26)}
            >
              <BarChart
                data={rawTypeData}
                layout="vertical"
                margin={{ left: 110 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={C.border}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: C.mutedAxis }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11, fill: C.mutedAxis }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: `1px solid ${C.border}`,
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="count" fill={C.mutedBar} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          <ChartSection title={t('rawTopGeographicKeywords')} muted>
            <ul className="divide-y divide-slate-200/70 text-sm">
              {rawStats.topGeographicKeywords.slice(0, 12).map((item) => (
                <li
                  key={item.name}
                  className="flex items-center justify-between py-2"
                >
                  <span className="truncate text-ink/80">{item.name}</span>
                  <span className="ml-2 shrink-0 tabular-nums text-ink/55">
                    {item.count}
                  </span>
                </li>
              ))}
            </ul>
          </ChartSection>
        </div>
      </NarrativeSection>

      {/* C. CURATION DELTAS */}
      <NarrativeSection
        eyebrow={t('eyebrows.deltas')}
        title={t('sectionDeltas.title')}
        subtitle={t('sectionDeltas.subtitle')}
      >
        <div className="mb-6 max-w-3xl text-ink/80 leading-relaxed">
          <p>{t('sectionDeltas.body')}</p>
        </div>

        <div className="corner-fold border border-slate-200 bg-white p-6 shadow-[0_15px_35px_rgba(0,30,24,0.08)]">
          <div className="space-y-2">
            {funnel.map((step) => {
              const pct = (step.count / funnelMax) * 100;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <span className="w-64 shrink-0 text-sm text-ink/80">
                    {step.label}
                  </span>
                  <div className="relative h-7 flex-1 overflow-hidden bg-slate-100">
                    <div
                      className="absolute inset-y-0 left-0 bg-teal-strong/85"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-semibold text-ink tabular-nums">
                    {step.count.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <SummaryCard
            value={curation.locationEditsApplied.toLocaleString()}
            label={t('locationEditsApplied')}
          />
          <SummaryCard
            value={curation.termDefaultsApplied.toLocaleString()}
            label={t('termDefaultsApplied')}
          />
          <SummaryCard
            value={curation.withWikidata.toLocaleString()}
            label={t('withWikidata')}
          />
          <SummaryCard
            value={curation.showable.toLocaleString()}
            label={t('showable')}
          />
        </div>
      </NarrativeSection>

      {/* D. CURATED DATASET */}
      <NarrativeSection
        eyebrow={t('eyebrows.curated')}
        title={t('sectionCurated.title')}
        subtitle={t('sectionCurated.subtitle')}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

        <ChartSection title={t('objectsByDecade')}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={decadeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="decade"
                tick={{ fontSize: 11, fill: C.axis }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: C.axis }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'white',
                  border: `1px solid ${C.border}`,
                  fontSize: '13px',
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={C.teal}
                fill={C.teal}
                fillOpacity={0.16}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartSection>

        <div className="grid md:grid-cols-2 gap-6">
          <ChartSection title={t('objectsByType')}>
            <ResponsiveContainer
              width="100%"
              height={Math.max(280, typeData.length * 26)}
            >
              <BarChart
                data={typeData}
                layout="vertical"
                margin={{ left: 120 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={C.border}
                  horizontal={false}
                />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.axis }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11, fill: C.ink }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: `1px solid ${C.border}`,
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="count" fill={C.deep} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          <ChartSection title={t('topCreators')}>
            <ResponsiveContainer
              width="100%"
              height={Math.max(280, topCreatorsData.length * 26)}
            >
              <BarChart
                data={topCreatorsData}
                layout="vertical"
                margin={{ left: 150 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={C.border}
                  horizontal={false}
                />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.axis }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11, fill: C.ink }}
                  tickLine={false}
                  axisLine={false}
                  width={150}
                />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: `1px solid ${C.border}`,
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="count" fill={C.bright} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>

        <ChartSection title={t('topLocations')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.topLocations.map((loc) => (
              <div
                key={loc.name}
                className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2"
              >
                <span className="truncate text-sm text-ink">{loc.name}</span>
                <span className="ml-2 shrink-0 tabular-nums text-sm font-medium text-ink">
                  {loc.count}
                </span>
              </div>
            ))}
          </div>
        </ChartSection>
      </NarrativeSection>

      {/* E. WHAT IS MISSING */}
      <NarrativeSection
        eyebrow={t('eyebrows.missing')}
        title={t('sectionMissing.title')}
      >
        <div className="max-w-3xl text-ink/80 leading-relaxed">
          <p>{t('sectionMissing.body')}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-teal-strong">
            <li>
              {t('sectionMissing.bullet1', {
                count: rawStats.anonymousCount.toLocaleString(),
              })}
            </li>
            <li>
              {t('sectionMissing.bullet2', {
                count: stillUnresolved.toLocaleString(),
              })}
            </li>
            <li>
              {t('sectionMissing.bullet3', {
                count: (
                  curation.totalObjects - curation.publicDomain
                ).toLocaleString(),
              })}
            </li>
            <li>{t('sectionMissing.bullet4')}</li>
          </ul>
        </div>
      </NarrativeSection>
    </div>
  );
}

function NarrativeSection({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-ink/60">
          {eyebrow}
        </p>
        <h2 className="text-3xl font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function SummaryCard({
  value,
  label,
  muted = false,
}: {
  value: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`corner-fold border p-5 text-center shadow-[0_15px_35px_rgba(0,30,24,0.08)] ${
        muted ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p
        className={`text-2xl font-bold md:text-3xl ${
          muted ? 'text-ink/70' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink/55 leading-snug">
        {label}
      </p>
    </div>
  );
}

function ChartSection({
  title,
  muted = false,
  children,
}: {
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`corner-fold border p-6 shadow-[0_15px_35px_rgba(0,30,24,0.08)] ${
        muted ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
    >
      <h3 className="mb-5 text-lg font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}
