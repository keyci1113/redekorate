import { Router } from "express";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { ACC_CTE } from "../lib/access.js";

export const dashboard = Router();
dashboard.use(requireAuth);

dashboard.get("/", async (req, res) => {
  const uid = req.user!.id;
  const totalsQ = one(
    `with ${ACC_CTE}
     select
       (select count(*)::int from projects where id in (select id from acc) and not archived) as projects,
       (select count(*)::int from studies where project_id in (select id from acc)) as studies,
       (select count(*)::int from studies where project_id in (select id from acc) and status = 'live') as live,
       (select count(distinct project_id)::int from studies where project_id in (select id from acc) and status = 'live') as projects_live,
       (select count(*)::int from sessions se join studies s on s.id = se.study_id where s.project_id in (select id from acc) and se.completed_at is not null) as responses,
       (select count(*)::int from sessions se join studies s on s.id = se.study_id where s.project_id in (select id from acc) and se.completed_at > now() - interval '7 days') as responses_week,
       (select count(*)::int from insights i join projects p on p.id = i.project_id where p.id in (select id from acc)) as insights,
       (select count(*)::int from studies where project_id in (select id from acc) and published_at is not null) as published,
       (select count(*)::int from report_shares rs left join studies s on s.id = rs.study_id
          where rs.revoked_at is null and coalesce(rs.project_id, s.project_id) in (select id from acc)) as shares`,
    [uid]);
  const trendQ = query(
    `with ${ACC_CTE}
     select to_char(d, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as n
     from generate_series(current_date - 13, current_date, interval '1 day') d
     left join (select date_trunc('day', se.completed_at)::date as day, count(*) n
                from sessions se join studies s on s.id = se.study_id
                where s.project_id in (select id from acc) and se.completed_at > current_date - 14 group by 1) c on c.day = d::date
     order by d`, [uid]);
  const study_trendQ = query(
    `with ${ACC_CTE}
     select se.study_id, to_char(date_trunc('day', se.completed_at), 'YYYY-MM-DD') as day, count(*)::int as n
     from sessions se join studies s on s.id = se.study_id
     where s.project_id in (select id from acc) and s.status = 'live' and se.completed_at > current_date - 14
     group by 1, 2`, [uid]);
  const liveQ = query(
    `with ${ACC_CTE}
     select s.id, s.project_id, s.title, s.method, s.public_slug, s.published_at, p.name as project_name, p.color as project_color,
       (select count(*)::int from sessions se where se.study_id = s.id and se.completed_at is not null) as responses,
       (select count(*)::int from sessions se where se.study_id = s.id) as started,
       (select max(se.completed_at) from sessions se where se.study_id = s.id) as last_response_at
     from studies s join projects p on p.id = s.project_id
     where s.project_id in (select id from acc) and s.status = 'live' order by last_response_at desc nulls last`, [uid]);
  const draftsQ = query(
    `with ${ACC_CTE}
     select s.id, s.title, s.method, s.updated_at, p.name as project_name, p.color as project_color
     from studies s join projects p on p.id = s.project_id
     where s.project_id in (select id from acc) and s.status = 'draft' order by s.updated_at desc limit 5`, [uid]);
  // Proyectos propios y compartidos (acc). Respuestas de los últimos 7 días; el front las agrupa por estudio
  const activityQ = query(
    `with ${ACC_CTE}
     select se.completed_at as at, s.id as study_id, s.title as study_title, s.method
     from sessions se join studies s on s.id = se.study_id
     where s.project_id in (select id from acc) and se.completed_at > now() - interval '7 days' order by se.completed_at desc limit 300`, [uid]);
  // Más graves primero y, dentro de cada severidad, los más recientes
  const insightsQ = query(
    `with ${ACC_CTE}
     select i.id, i.title, i.severity, i.created_at, i.reviewed_at, i.project_id, i.study_id, p.name as project_name, s.method
     from insights i join projects p on p.id = i.project_id left join studies s on s.id = i.study_id
     where p.id in (select id from acc)
     order by array_position(array['critical','high','medium','low']::text[], i.severity), i.created_at desc limit 6`, [uid]);
  // Último estudio abierto por esta persona (solo si todavía tiene acceso al proyecto)
  const recentQ = one(
    `with ${ACC_CTE}
     select s.id, s.title, s.method, s.status, s.project_id, p.name as project_name, p.color as project_color, o.opened_at, o.where_ as "where"
     from study_opens o join studies s on s.id = o.study_id join projects p on p.id = s.project_id
     where o.user_id = $1 and s.project_id in (select id from acc) order by o.opened_at desc limit 1`, [uid]);
  const insight_countsQ = one(
    `with ${ACC_CTE}
     select count(*)::int as total,
       count(*) filter (where severity = 'critical')::int as critical,
       count(*) filter (where severity = 'high')::int as high,
       count(*) filter (where severity = 'critical' and reviewed_at is null)::int as critical_pending,
       count(*) filter (where reviewed_at is null)::int as pending
     from insights i join projects p on p.id = i.project_id where p.id in (select id from acc)`, [uid]);
  const [totals, trend, study_trend, live, drafts, activity, insights, insight_counts, recent] = await Promise.all([totalsQ, trendQ, study_trendQ, liveQ, draftsQ, activityQ, insightsQ, insight_countsQ, recentQ]);
  res.json({ totals, trend, study_trend, live, drafts, activity, insights, insight_counts, recent });
});
