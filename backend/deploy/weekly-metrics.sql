-- 주간 지표(runbook.md 4-1 "주간 지표" — KAN-132). 매주 월요일, 지난주 월~일(KST) 기준.
-- 집계만 낸다 — 이름·이메일·user_id 를 출력하지 않는다(CLAUDE.md 2026-10-04).
--
-- 서버에서(월요일 날짜가 아니라 **지난주 월요일**을 넣는다):
--   cd /opt/ear/backend && docker compose -f docker-compose.prod.yml --env-file .env.prod \
--     exec -T postgres psql -U ear -d ear -At -v week_start=2026-09-29 -f - < deploy/weekly-metrics.sql
--
-- 테스트 계정 제외 규칙은 runbook 4-1 과 같다: role = 'admin' 또는 수동 pro(tier = 'pro' 인데 subscriptions 행이 없음).


with bounds as (
  select (:'week_start'::date)::timestamp at time zone 'Asia/Seoul' as start_at,
         (:'week_start'::date + 7)::timestamp at time zone 'Asia/Seoul' as end_at
),
real_users as (
  select u.id, u.created_at
    from users u
   where u.role <> 'admin'
     and not (u.tier = 'pro' and not exists (select 1 from subscriptions s where s.user_id = u.id))
)
select '기간', :'week_start' || ' ~ ' || (:'week_start'::date + 6)::text
union all
select '가입(주간)', count(*)::text from real_users, bounds where created_at >= start_at and created_at < end_at
union all
(select '가입(일별 ' || to_char(d, 'MM-DD') || ')', count(*)::text
   from (select (created_at at time zone 'Asia/Seoul')::date as d from real_users, bounds
          where created_at >= start_at and created_at < end_at) t
  group by d order by d)
union all
select '누적 가입자(주말 기준)', count(*)::text from real_users, bounds where created_at < end_at
union all
select '활성(재생 URL 발급 1회 이상)', count(distinct a.user_id)::text
  from audio_access_logs a join real_users u on u.id = a.user_id, bounds
 where a.issued_at >= start_at and a.issued_at < end_at
union all
select '재생 시작', count(*)::text
  from play_records p join real_users u on u.id = p.user_id, bounds
 where p.played_at >= start_at and p.played_at < end_at
union all
select '완청(라이브러리 completed 전이)', count(*)::text
  from library_items l join real_users u on u.id = l.user_id, bounds
 where l.status = 'completed' and l.updated_at >= start_at and l.updated_at < end_at
union all
select '탈퇴', count(*)::text from withdrawal_logs, bounds where withdrawn_at >= start_at and withdrawn_at < end_at
union all
select '탈퇴 사유 ' || coalesce(reason_code, '(미선택)'), count(*)::text
  from withdrawal_logs, bounds where withdrawn_at >= start_at and withdrawn_at < end_at group by reason_code
union all
select '푸시 토큰 무효화(앱 삭제 추정 원천)', count(*)::text
  from device_tokens, bounds where invalidated_at >= start_at and invalidated_at < end_at
union all
select '구독 활성(주말 기준)', count(*)::text from subscriptions where status in ('active', 'grace', 'cancelled')
union all
select '구독 신규', count(*)::text from subscriptions, bounds where created_at >= start_at and created_at < end_at
union all
select '구독 환불', count(*)::text from subscriptions, bounds where status = 'refunded' and updated_at >= start_at and updated_at < end_at;
