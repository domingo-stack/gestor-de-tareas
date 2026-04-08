'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CrmLead, CrmPipelineStage, CrmLostReason, CrmUser } from '@/lib/crm-types';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#dc2626', '#6b7280'];

function fmtUSD(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat('en-US').format(v || 0);
}

export default function CrmReports() {
  const { supabase } = useAuth();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [lostReasons, setLostReasons] = useState<CrmLostReason[]>([]);
  const [members, setMembers] = useState<CrmUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [leadsRes, stagesRes, reasonsRes, membersRes] = await Promise.all([
      supabase.from('crm_leads').select('*'),
      supabase.from('crm_pipeline_stages').select('*').eq('is_active', true).order('display_order'),
      supabase.from('crm_lost_reasons').select('*'),
      supabase.rpc('get_all_members'),
    ]);
    setLeads(leadsRes.data ?? []);
    setStages(stagesRes.data ?? []);
    setLostReasons(reasonsRes.data ?? []);
    setMembers(membersRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ===== Cálculos client-side =====

  // 1. Funnel: leads por stage actual
  const funnelData = useMemo(() => {
    return stages.map(s => ({
      name: s.name,
      count: leads.filter(l => l.stage_id === s.id).length,
      color: s.color,
    }));
  }, [stages, leads]);

  // 2. Won/Lost ratio
  const wonLostStats = useMemo(() => {
    const wonStage = stages.find(s => s.is_won);
    const lostStages = stages.filter(s => s.is_lost);
    const won = wonStage ? leads.filter(l => l.stage_id === wonStage.id) : [];
    const lost = lostStages.length > 0 ? leads.filter(l => lostStages.some(s => s.id === l.stage_id)) : [];
    const wonValue = won.reduce((sum, l) => sum + (l.won_value_usd ?? l.estimated_value_usd ?? 0), 0);
    const lostValue = lost.reduce((sum, l) => sum + (l.estimated_value_usd ?? 0), 0);
    const total = won.length + lost.length;
    const winRate = total > 0 ? (won.length / total) * 100 : 0;
    return {
      won_count: won.length,
      lost_count: lost.length,
      won_value: wonValue,
      lost_value: lostValue,
      win_rate_pct: winRate,
    };
  }, [stages, leads]);

  // 3. Leads por owner
  const leadsByOwner = useMemo(() => {
    const map = new Map<string, { user: CrmUser | null; active: number; won: number; lost: number; value: number }>();
    const wonStageId = stages.find(s => s.is_won)?.id;
    const lostStageIds = new Set(stages.filter(s => s.is_lost).map(s => s.id));
    for (const lead of leads) {
      const key = lead.assigned_to ?? 'unassigned';
      if (!map.has(key)) {
        const user = lead.assigned_to ? members.find(m => m.user_id === lead.assigned_to) : null;
        map.set(key, { user: user ?? null, active: 0, won: 0, lost: 0, value: 0 });
      }
      const entry = map.get(key)!;
      if (lead.stage_id === wonStageId) entry.won++;
      else if (lostStageIds.has(lead.stage_id)) entry.lost++;
      else entry.active++;
      entry.value += lead.estimated_value_usd ?? 0;
    }
    return Array.from(map.entries()).map(([key, v]) => ({
      name: v.user?.email ?? 'Sin asignar',
      active: v.active,
      won: v.won,
      lost: v.lost,
      value: v.value,
    })).sort((a, b) => (b.active + b.won + b.lost) - (a.active + a.won + a.lost));
  }, [leads, members, stages]);

  // 4. Revenue pipeline (sum estimated por stage abierto)
  const revenuePipeline = useMemo(() => {
    return stages
      .filter(s => !s.is_won && !s.is_lost)
      .map(s => ({
        name: s.name,
        value: leads
          .filter(l => l.stage_id === s.id)
          .reduce((sum, l) => sum + (l.estimated_value_usd ?? 0), 0),
        count: leads.filter(l => l.stage_id === s.id).length,
      }));
  }, [stages, leads]);

  // 5. Lost reasons breakdown
  const lostBreakdown = useMemo(() => {
    const lostStageIds = new Set(stages.filter(s => s.is_lost).map(s => s.id));
    const lostLeads = leads.filter(l => lostStageIds.has(l.stage_id));
    const map = new Map<string, number>();
    for (const lead of lostLeads) {
      if (lead.lost_reason_id) {
        const reason = lostReasons.find(r => r.id === lead.lost_reason_id);
        const name = reason?.name ?? 'Sin razón';
        map.set(name, (map.get(name) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [stages, leads, lostReasons]);

  // 6. Time-in-stage (días promedio en cada stage para leads abiertos)
  const timeInStage = useMemo(() => {
    return stages
      .filter(s => !s.is_won && !s.is_lost)
      .map(s => {
        const stageLeads = leads.filter(l => l.stage_id === s.id);
        if (stageLeads.length === 0) return { name: s.name, avg_days: 0 };
        const now = Date.now();
        const totalDays = stageLeads.reduce((sum, l) => {
          const days = Math.floor((now - new Date(l.stage_updated_at).getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0);
        return { name: s.name, avg_days: Math.round(totalDays / stageLeads.length) };
      });
  }, [stages, leads]);

  // 7. New leads trend (últimas 12 semanas Dom-Sáb)
  const newLeadsTrend = useMemo(() => {
    // Calcular el domingo de hace 11 semanas + las 12 semanas siguientes
    const today = new Date();
    const utc5 = new Date(today.getTime() - 5 * 60 * 60 * 1000);
    const dow = utc5.getUTCDay();
    utc5.setUTCDate(utc5.getUTCDate() - dow);
    utc5.setUTCHours(0, 0, 0, 0);
    const todaySunday = new Date(utc5.getUTCFullYear(), utc5.getUTCMonth(), utc5.getUTCDate());

    const weeks: { label: string; count: number; weekStart: Date; weekEnd: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(todaySunday);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      weeks.push({ label, count: 0, weekStart, weekEnd });
    }
    for (const lead of leads) {
      const created = lead.original_created_at ? new Date(lead.original_created_at) : new Date(lead.created_at);
      const week = weeks.find(w => created >= w.weekStart && created < w.weekEnd);
      if (week) week.count++;
    }
    return weeks.map(w => ({ label: w.label, count: w.count }));
  }, [leads]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
        <p className="text-sm text-blue-700">
          Aún no hay leads para reportar. Una vez que el sync traiga leads, los reportes se llenarán automáticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Leads totales" value={fmtNum(leads.length)} color="#3c527a" />
        <KpiCard label="Pipeline activo" value={fmtUSD(revenuePipeline.reduce((s, r) => s + r.value, 0))} color="#3b82f6" />
        <KpiCard label="Win rate" value={`${wonLostStats.win_rate_pct.toFixed(1)}%`} color={wonLostStats.win_rate_pct >= 25 ? '#10b981' : '#dc2626'} />
        <KpiCard label="Cerrados ganados" value={fmtNum(wonLostStats.won_count)} sublabel={fmtUSD(wonLostStats.won_value)} color="#10b981" />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Funnel: leads por stage */}
        <ChartCard title="Pipeline por Stage">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnelData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} />
              <YAxis stroke="#9CA3AF" fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. New leads trend */}
        <ChartCard title="Nuevos leads por semana (12 sem)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={newLeadsTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="label" stroke="#9CA3AF" fontSize={11} />
              <YAxis stroke="#9CA3AF" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Revenue pipeline */}
        <ChartCard title="Revenue pipeline (forecast por stage)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenuePipeline} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={11} tickFormatter={fmtUSD} />
              <YAxis type="category" dataKey="name" stroke="#9CA3AF" fontSize={11} width={80} />
              <Tooltip formatter={(value) => fmtUSD(Number(value))} />
              <Bar dataKey="value" fill="#10b981" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Time in stage */}
        <ChartCard title="Días promedio en cada stage">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={timeInStage}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} />
              <YAxis stroke="#9CA3AF" fontSize={11} />
              <Tooltip formatter={(value) => `${value} días`} />
              <Bar dataKey="avg_days" fill="#a855f7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 5. Leads por owner */}
        <ChartCard title="Leads por owner">
          {leadsByOwner.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={leadsByOwner}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" stroke="#9CA3AF" fontSize={10} angle={-15} textAnchor="end" height={60} />
                <YAxis stroke="#9CA3AF" fontSize={11} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="active" stackId="a" fill="#3b82f6" name="Activos" />
                <Bar dataKey="won" stackId="a" fill="#10b981" name="Ganados" />
                <Bar dataKey="lost" stackId="a" fill="#dc2626" name="Perdidos" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">Sin datos</p>
          )}
        </ChartCard>

        {/* 6. Lost reasons breakdown */}
        <ChartCard title="Razones de pérdida">
          {lostBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={lostBreakdown}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry: { name?: string; value?: number }) => `${entry.name}: ${entry.value}`}
                  labelLine={false}
                >
                  {lostBreakdown.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">
              Sin leads perdidos todavía
            </p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sublabel, color }: { label: string; value: string; sublabel?: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
      {sublabel && <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  );
}
