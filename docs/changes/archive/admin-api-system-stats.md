# admin-api.md — `GET /admin/system-stats` 등재 (자원·DB 부하 스냅샷)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/admin-api.md` |
| 발행 날짜 | 2026-09-06 |
| 발견 시점 | 어드민 로그 콘솔 서버 상태 탭에 CPU/메모리·DB 부하 추가 — 구현이 먼저 확정됨 |
| 요청 파트 | 백엔드 |

## 수정 내용

관리자 API에 다음 라우트를 등재한다 (다른 `/admin/*`과 동일하게 `role == 'admin'` 서버 검증).

### `GET /admin/system-stats`

서버 자원과 DB 부하의 읽기 전용 스냅샷. 어드민 로그 콘솔 서버 상태 탭이 15초 폴링한다.

**Response 200**

```json
{
  "host": {
    "load_1m": 0.42, "load_5m": 0.31, "load_15m": 0.28,
    "cpu_count": 2, "cpu_used_percent": 23.5,
    "mem_total_bytes": 4294967296, "mem_available_bytes": 1717986918,
    "uptime_sec": 1036800
  },
  "db": {
    "connections": { "total": 12, "active": 2, "idle": 9, "idle_in_transaction": 1, "waiting": 0, "longest_active_sec": 0.8, "max": 100 },
    "slow_queries": [ { "pid": 4211, "state": "active", "duration_sec": 0.8, "query": "SELECT ... $1" } ],
    "cache_hit_ratio": 0.997,
    "xact_commit": 182340, "xact_rollback": 214, "deadlocks": 0, "size_bytes": 327155712
  },
  "measured_at": "2026-09-06T06:00:00.000Z"
}
```

- `host.*`는 `/proc` 기준 **호스트 전체** 값(컨테이너가 커널을 공유) — API·DB가 같은 EC2인 현 구성에서 서버 자원 그 자체다. `cpu_used_percent`는 300ms 구간 샘플이며 못 읽는 환경이면 null.
- `db.*`는 pg 통계 뷰(current_database 한정) 읽기 전용. `slow_queries.query`는 150자 제한 + 바인딩 파라미터($1) 형태라 사용자 데이터 원문이 없다. `cache_hit_ratio`는 통계 누적 기준(집계 전이면 null).

## 사유

모니터링 콘솔(backend-logs)에 로그·에러·트래픽은 있는데 자원·DB 부하가 없었다. CloudWatch 지표는 IAM 확장·CW 에이전트 설치(인프라 작업)가 필요해, 같은 호스트에 있는 백엔드가 직접 읽어 내려주는 쪽을 택했다.

## 처리 기록 (반영 날짜: 2026-09-06)

사용자 지시로 통합 대기 없이 즉시 반영 — admin-api.md 3장·4.9에 수정 내용 그대로 적용했다.
