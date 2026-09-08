# player-api.md·partner-control.md — 회수 동기화 계약 등재 (`GET /contents/withdrawn` + 4.3 `content_status`)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/player-api.md`(등재 위치 제안 — 아래) · `docs/features/partner-control.md` 4.3 |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | `tickets/backend/pending/withdrawn-sync-stops-playback.md` 구현 — 계약이 `partner-control.md` 본문 언급뿐이라 확정 등재가 필요하고, 재생 중단 신호 채널이 새로 정해졌다 |
| 요청 파트 | 백엔드 |

## 수정 내용

### 1. `GET /contents/withdrawn?since=<ISO8601>` 등재 (구현 확정 형상 — 2026-09-08)

- 인증 필수. `since` 없거나 형식 오류면 400 `VALIDATION_FAILED`.
- 응답 200: `{ "content_ids": ["<uuid>", ...] }` — 그 시각 이후 회수된 콘텐츠, `withdrawn_at` 오름차순.
- 호출 시점: 앱 실행·포그라운드 복귀(partner-control.md 4.3 처리 순서 5). 클라이언트는 목록의
  콘텐츠를 로컬 캐시·재생 세션에서 걷어낸다.
- **등재 위치 제안: `player-api.md`** — 주 목적이 재생 세션 정리이고, 아래 2의 4.3 신호와 한
  문서에서 읽혀야 클라이언트가 두 채널의 관계(주 채널 = 4.3, 보완 = 이 목록)를 놓치지 않는다.
  다른 위치가 낫다고 판단되면 등재 시 이 문서에 기록만 남기면 된다.

### 2. `player-api.md` 4.3(위치 저장) 응답에 `content_status` 추가

```json
{ "position_sec": 10, "max_reached_sec": 10, "content_version": 3,
  "content_status": "published", "library_item": null }
```

- `withdrawn`이면 클라이언트는 **재생을 즉시 멈추고** "제공이 종료된 콘텐츠예요"를 안내한다.
- 위치 저장은 재생 중 주기적으로 도는 왕복이라, 파일이 통째로 버퍼링돼도 이 신호가 닿는다 —
  회수 반영의 실질 지연 상한이 저장 주기(5초)로 줄어든다.
- 재발행 감지는 기존 `content_version` 필드로 한다(별도 필드 불요) — 응답 버전이 세션이 아는
  버전과 다르면 로컬 위치를 폐기한다. **오디오 URL 갱신 시 세션 버전을 조용히 올리지 말 것**
  (2026-09-08 실증 — `refreshAudioUrl()`이 새 버전을 받아들여 지운 위치가 되살아났다).

### 3. `partner-control.md` 4.3 — "버퍼 소진 시 중단" 서술 현행화

현재 "진행 중 재생은 버퍼 소진 시 중단"은 클라이언트가 파일 전체를 버퍼링하는 경우를 덮지
못한다(2026-09-08 실기기 — 회수 후 5분 넘게 재생됨). 다음으로 바꾼다:

> 진행 중 재생은 **위치 저장(player-api.md 4.3) 응답의 `content_status = withdrawn` 신호로
> 중단**된다(지연 상한 = 저장 주기). 서명 URL 신규 발급 차단·버퍼 소진은 보조 방어다.

## 사유

- 회수(재생 미중단)·재발행(위치 되살아남) 두 실증 사례의 공통 원인이 "진행 중 세션에 서버
  상태 변경을 전달할 채널 부재"였다. 서버 구현(목록 + 4.3 신호)은 2026-09-08 완료·검증됐고,
  클라이언트 연결은 FE 티켓으로 진행한다.

## 완료 조건

- Given `spec/api/` / When 회수 동기화를 찾는다 / Then `GET /contents/withdrawn`의 요청·응답·호출 시점이 확정 계약으로 적혀 있다
- Given `player-api.md` 4.3 / When 응답 필드를 읽는다 / Then `content_status`와 그때의 클라이언트 동작(중단·안내)이 적혀 있다
- Given `partner-control.md` 4.3 / When 재생 중 세션 항목을 읽는다 / Then 중단 채널이 4.3 신호로 적혀 있고 "버퍼 소진" 단독 서술이 없다
