-- 0015 (2026-09-09): 에피소드 삭제 — 콘솔에서 사람이 잘못 만들어진·다시 만들 에피소드를 지운다 (박수헌 요청).
-- 조건은 DB 가 강제한다: 회귀 세트(regression) 행과 발행된(backlog.status = 'published') 후보의 에피소드는 지울 수 없다.
-- 삭제 후 후보는 콘솔이 proposed(재승인 대기) 또는 rejected 로 되돌리고 사유를 dedup_note 앞에 🗑 로 남긴다. S3 산출물은 콘솔이 best-effort 로 지운다.

drop policy if exists team_delete on public.episodes;
create policy team_delete on public.episodes for delete to authenticated
  using (
    not coalesce(regression, false)
    and not exists (select 1 from public.backlog b where b.id = episodes.backlog_id and b.status = 'published')
  );
