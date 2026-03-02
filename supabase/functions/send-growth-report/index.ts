import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'https://esm.sh/resend'

function fmtNum(v: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v || 0)
}
function fmtUSD(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v || 0)
}
function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  }

  try {
    // Auth: CRON_SECRET o test mode
    const cronSecret = Deno.env.get('CRON_SECRET')
    const url = new URL(req.url)
    const querySecret = url.searchParams.get('secret') || ''
    const headerSecret = req.headers.get('x-cron-secret') || ''

    let isTest = false
    try {
      const body = await req.clone().json()
      isTest = body?.test === true
    } catch { /* no body */ }

    // Allow test mode from authenticated users or cron secret
    if (!isTest && cronSecret && headerSecret !== cronSecret && querySecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) throw new Error('RESEND_API_KEY not configured')
    const resend = new Resend(resendApiKey)

    // 1. Get active recipients
    const { data: recipients, error: recError } = await supabaseAdmin
      .from('growth_report_config')
      .select('recipient_email, recipient_name')
      .eq('is_active', true)

    if (recError) throw recError
    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'No hay destinatarios activos' }), { status: 400 })
    }

    // 2. Compute week range
    const now = new Date()
    const weekStart = getMonday(now)
    weekStart.setDate(weekStart.getDate() - 7) // Last completed week
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevWeekEnd = new Date(weekStart)
    prevWeekEnd.setMilliseconds(-1)

    // 3. Fetch data
    const [revRes, prevRevRes, usersRes] = await Promise.all([
      supabaseAdmin.from('rev_orders').select('amount_usd, plan_type, client_type')
        .gte('created_at', weekStart.toISOString()).lte('created_at', weekEnd.toISOString()),
      supabaseAdmin.from('rev_orders').select('amount_usd')
        .gte('created_at', prevWeekStart.toISOString()).lte('created_at', prevWeekEnd.toISOString()),
      supabaseAdmin.from('growth_users').select('created_date, plan_paid, cancelled, eventos_valor, subscription_end'),
    ])

    const orders = revRes.data || []
    const prevOrders = prevRevRes.data || []
    const users = usersRes.data || []

    // 4. Compute metrics
    const revenue = orders.reduce((s: number, o: any) => s + (o.amount_usd || 0), 0)
    const prevRevenue = prevOrders.reduce((s: number, o: any) => s + (o.amount_usd || 0), 0)
    const revenueGrowth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0
    const transactions = orders.length

    const newOrders = orders.filter((o: any) => (o.client_type || o.plan_type || '').toLowerCase().includes('nuevo'))
    const revenueNew = newOrders.reduce((s: number, o: any) => s + (o.amount_usd || 0), 0)
    const revenueRecurring = revenue - revenueNew

    const totalUsers = users.length
    const paidUsers = users.filter((u: any) => u.plan_paid).length
    const activatedUsers = users.filter((u: any) => (u.eventos_valor || 0) >= 1).length

    const weekUsers = users.filter((u: any) => {
      const created = new Date(u.created_date)
      return created >= weekStart && created <= weekEnd
    })
    const newRegistrations = weekUsers.length

    const activationPct = totalUsers > 0 ? (activatedUsers / totalUsers) * 100 : 0
    const conversionPct = totalUsers > 0 ? (paidUsers / totalUsers) * 100 : 0
    const arpu = paidUsers > 0 ? revenue / paidUsers : 0

    // Churn: subscriptions ending this week
    const churned = users.filter((u: any) => {
      const subEnd = new Date(u.subscription_end)
      return subEnd >= weekStart && subEnd <= weekEnd && (u.cancelled || !u.plan_paid)
    }).length
    const startingPaid = users.filter((u: any) =>
      u.plan_paid && new Date(u.subscription_end) >= weekStart && !u.cancelled
    ).length
    const churnRate = startingPaid > 0 ? (churned / startingPaid) * 100 : 0

    // Upcoming renewals (next 7 days from now)
    const next7 = new Date()
    next7.setDate(next7.getDate() + 7)
    const upcomingRenewals = users.filter((u: any) => {
      if (!u.subscription_end || u.cancelled) return false
      const subEnd = new Date(u.subscription_end)
      return subEnd >= now && subEnd <= next7 && u.plan_paid
    }).length

    // 5. Format dates for display
    const weekLabel = `${weekStart.getDate()}/${weekStart.getMonth() + 1} - ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}/${weekEnd.getFullYear()}`

    // 6. Build HTML email
    const growthArrow = revenueGrowth >= 0
      ? `<span style="color: #16a34a;">▲ ${fmtPct(Math.abs(revenueGrowth))}</span>`
      : `<span style="color: #dc2626;">▼ ${fmtPct(Math.abs(revenueGrowth))}</span>`

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#3c527a,#ff8080);border-radius:12px 12px 0 0;padding:32px 24px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:24px;">Growth Report</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Semana ${weekLabel}</p>
  </div>

  <!-- Body -->
  <div style="background:white;padding:24px;border-radius:0 0 12px 12px;">

    <!-- Revenue Section -->
    <h2 style="color:#1f2937;font-size:16px;margin:0 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Revenue</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Revenue Total</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;font-size:15px;color:#111827;">${fmtUSD(revenue)} ${growthArrow}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Revenue Nuevo</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#3b82f6;">${fmtUSD(revenueNew)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Revenue Recurrente</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#10b981;">${fmtUSD(revenueRecurring)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Transacciones</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;">${fmtNum(transactions)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">ARPU</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;">${fmtUSD(arpu)}</td>
      </tr>
    </table>

    <!-- Users Section -->
    <h2 style="color:#1f2937;font-size:16px;margin:0 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Usuarios</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Nuevos Registros (semana)</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;font-size:15px;color:#111827;">${fmtNum(newRegistrations)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Total Registrados</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;">${fmtNum(totalUsers)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Usuarios Pagados</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#10b981;">${fmtNum(paidUsers)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">% Activacion</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;">${fmtPct(activationPct)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">% Conversion</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;">${fmtPct(conversionPct)}</td>
      </tr>
    </table>

    <!-- Health Section -->
    <h2 style="color:#1f2937;font-size:16px;margin:0 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Salud</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Churn Rate</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:${churnRate > 5 ? '#dc2626' : churnRate > 2 ? '#d97706' : '#16a34a'};">${fmtPct(churnRate)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Churned esta semana</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;color:#dc2626;">${fmtNum(churned)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;">Renovaciones proximos 7 dias</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:#d97706;">${fmtNum(upcomingRenewals)}</td>
      </tr>
    </table>

    <!-- Footer -->
    <div style="text-align:center;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">
        Generado automaticamente por Califica Growth Dashboard
      </p>
    </div>

  </div>
</div>
</body>
</html>`

    // 7. Send emails
    const emailResults = await Promise.allSettled(
      recipients.map((r: any) =>
        resend.emails.send({
          from: 'tareas@califica.ai',
          to: r.recipient_email,
          subject: `Growth Report - Semana ${weekLabel}`,
          html,
        })
      )
    )

    const successCount = emailResults.filter(r => r.status === 'fulfilled').length
    const failCount = emailResults.filter(r => r.status === 'rejected').length
    const errorMsg = failCount > 0
      ? emailResults.filter(r => r.status === 'rejected').map((r: any) => r.reason?.message).join('; ')
      : null

    // 8. Log the send
    await supabaseAdmin.from('growth_report_log').insert({
      week_start: weekStart.toISOString().split('T')[0],
      sent_at: new Date().toISOString(),
      recipients_count: successCount,
      status: failCount === 0 ? 'sent' : 'partial',
      error_message: errorMsg,
    })

    // 9. Save snapshot
    await supabaseAdmin.from('growth_weekly_snapshots').upsert({
      week_start: weekStart.toISOString().split('T')[0],
      week_end: weekEnd.toISOString().split('T')[0],
      new_users: newRegistrations,
      total_registrations: totalUsers,
      activated_users: activatedUsers,
      activation_pct: Math.round(activationPct * 100) / 100,
      paid_users: paidUsers,
      conversion_pct: Math.round(conversionPct * 100) / 100,
      revenue_total: Math.round(revenue * 100) / 100,
      revenue_new: Math.round(revenueNew * 100) / 100,
      revenue_recurring: Math.round(revenueRecurring * 100) / 100,
      arpu: Math.round(arpu * 100) / 100,
      churned_users: churned,
      churn_rate: Math.round(churnRate * 100) / 100,
      revenue_growth_wow: Math.round(revenueGrowth * 100) / 100,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'week_start' })

    return new Response(
      JSON.stringify({
        message: 'OK',
        week: weekLabel,
        recipients_count: successCount,
        failed: failCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (error: any) {
    // Log error
    try {
      const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      await supabaseAdmin.from('growth_report_log').insert({
        week_start: new Date().toISOString().split('T')[0],
        sent_at: new Date().toISOString(),
        recipients_count: 0,
        status: 'error',
        error_message: error.message,
      })
    } catch { /* ignore logging errors */ }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
