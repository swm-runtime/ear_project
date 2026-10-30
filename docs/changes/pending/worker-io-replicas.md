# 한국판 워커 복제 · node 직접 실행 — spec/10 호스트·워커 절

| 항목 | 값 |
|---|---|
| 대상 문서 | `ai/spec/10-webapp.md`(2장 "호스트" 컨테이너 목록 · 워커 실행 방식) |
| 요청 파트 | AI |
| 발행 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-30 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `perf(ai)/worker-direct-node-replicas` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 수정 내용

- **워커 실행**: compose 의 `worker-io`·`worker-global` 은 `npm run worker` 대신 `node --import tsx src/index.ts`(작업 폴더 `apps/worker`, `init: true`)로 뜬다. 서버 측정(2026-10-30)에서 컨테이너마다 npm 두 겹·tsx 실행기 래퍼가 프로세스 셋을 더 띄웠다(RSS 57·57·46MB). `init` 은 PID 1 이 된 node 대신 고아 자식(ffmpeg 등)을 거둔다.
- **한국판 복제**: `worker-io` 도 `deploy.replicas: ${WORKER_IO_REPLICAS:-1}`(env.prod). 글로벌 `WORKER_GLOBAL_REPLICAS` 와 같은 방식 — 작업 집기는 `claim_job` 의 skip locked 라 안전하다.
- **복제 하나만 도는 부가 작업**: 백엔드 오류 감시(log-watch)·TTS 잔량 확인은 settings `lease.<이름>` 임대(`apps/worker/src/lease.ts`)를 쥔 복제 하나만 돈다. 오류 감시의 읽은 위치는 임대 줄에 남겨 넘겨받는 복제가 잇는다(최대 1시간 전부터). 큐 비움 요약 알림은 이미 비교 후 갱신이라 그대로.

## 사유

서버 메모리 1.8GiB(여유 629MiB, 2026-10-30)에서 단편 100편·시리즈 재제작을 한국판 워커 하나로 돌리면 며칠 줄을 선다. 래퍼를 걷어 메모리를 줄이고 한국판 복제를 연다. 복제마다 메모리에 상태를 두는 부가 작업은 겹치므로(같은 오류가 Slack 에 복제 수만큼) 임대로 하나만 돌린다.

## 완료 조건

- Given spec/10 2장 / When 다음 통합 / Then 컨테이너 목록에 워커 복제(한국판·글로벌)와 node 직접 실행·init 이 적혀 있고, 부가 작업의 임대 규칙이 한 줄 있다.
