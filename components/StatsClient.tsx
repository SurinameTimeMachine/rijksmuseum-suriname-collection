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
  border: '#d2c8b8',
  sage: '#7d8c80',
  teal: '#1b3a35',
  tealLight: '#2a5c52',
  terracotta: '#c0503e',
  gold: '#c99a2e',
  mutedBar: '#9a8e7a',
  mutedAxis: '#a89c88',
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
    <div className="space-y-16">
      {/* A. THE SOURCE */}
      <NarrativeSection
        eyebrow={t('eyebrows.source')}
        title={t('sectionSource.title')}
      >
        <div className="prose prose-stone max-w-3xl text-(--color-charcoal-light) leading-relaxed">
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
            <ul className="text-sm divide-y divide-(--color-border)/60">
              {rawStats.topGeographicKeywords.slice(0, 12).map((item) => (
                <li
                  key={item.name}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-(--color-charcoal-light) truncate">
                    {item.name}
                  </span>
                  <span className="text-(--color-warm-gray) tabular-nums ml-2 shrink-0">
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
        <div className="prose prose-stone max-w-3xl text-(--color-charcoal-light) leading-relaxed mb-6">
          <p>{t('sectionDeltas.body')}</p>
        </div>

        <div className="bg-(--color-card) border border-(--color-border) p-6 corner-fold">
          <div className="space-y-2">
            {funnel.map((step) => {
              const pct = (step.count / funnelMax) * 100;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <span className="w-64 shrink-0 text-sm text-(--color-charcoal-light)">
                    {step.label}
                  </span>
                  <div className="flex-1 h-7 bg-(--color-cream-dark) relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-(--color-rijks-red)/80"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-semibold text-(--color-charcoal) tabular-nums">
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
                  fontSize: '13px',
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={C.terracotta}
                fill={C.terracotta}
                fillOpacity={0.12}
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
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="count" fill={C.teal} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          <ChartSection title={t('topCreators')}>
            <ResponsiveContainer
              width="100%"
              height={Math.max(280, stats.topCreators.length * 26)}
            >
              <BarChart
                data={stats.topCreators.slice(0, 15)}
                layout="vertical"
                margin={{ left: 150 }}
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
                  width={150}
                />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: `1px solid ${C.border}`,
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="count" fill={C.gold} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>

        <ChartSection title={t('topLocations')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.topLocations.map((loc) => (
              <div
                key={loc.name}
                className="flex items-center justify-between px-3 py-2 bg-(--color-cream-dark)"
              >
                <span className="text-sm text-(--color-charcoal) truncate">
                  {loc.name}
                </span>
                <span className="text-sm font-medium text-(--color-charcoal) ml-2 shrink-0 tabular-nums">
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
        <div className="prose prose-stone max-w-3xl text-(--color-charcoal-light) leading-relaxed">
          <p>{t('sectionMissing.body')}</p>
          <ul>
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
        <p className="text-xs uppercase tracking-[0.2em] font-semibold text-(--color-rijks-red) mb-2">
          {eyebrow}
        </p>
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-(--color-charcoal)">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-(--color-warm-gray)">{subtitle}</p>
        )}
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
      className={`border p-5 text-center shadow-sm corner-fold ${
        muted
          ? 'bg-(--color-cream-dark) border-(--color-border)/70'
          : 'bg-(--color-card) border-(--color-border)'
      }`}
    >
      <p
        className={`font-serif text-2xl md:text-3xl font-bold ${
          muted ? 'text-(--color-warm-gray)' : 'text-(--color-charcoal)'
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-(--color-warm-gray) mt-1 leading-snug">
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
      className={`border p-6 shadow-sm corner-fold ${
        muted
          ? 'bg-(--color-cream-dark) border-(--color-border)/70'
          : 'bg-(--color-card) border-(--color-border)'
      }`}
    >
      <h3 className="font-serif text-lg font-bold text-(--color-charcoal) mb-5">
        {title}
      </h3>
      {children}
    </div>
  );
}
