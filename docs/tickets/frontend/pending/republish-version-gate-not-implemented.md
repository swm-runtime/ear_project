# [FE] `content_version` 재발행 폐기가 구현되어 있지 않다 — 죽은 분기와 사실이 아닌 주석

| 항목 | 값 |
|---|---|
| 대상 | `features/player/services/playback.service.ts` · `features/player/player.types.ts` |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | 2026-09-07 재발행 엔드포인트 구현(`tickets/backend/archive/content-republish-audio.md`)의 "프론트 확인 항목"을 확인하다가 |
| 근거 문서 | `features/player.md` 7 · `spec/api/player-api.md` 4.1·4.3 · `features/offline-download.md` |
| 심각도 | **하(코드 위생) / 중(오해 유발)** — 동작 버그는 아니다. 다만 **코드가 "하고 있다"고 주장하는 일을 하지 않고 있어서** 다음 사람이 구멍을 못 본다 |
| 상태 | pending — 주석 정리 완료(PR #159), **BE 안 A 반영됨**(2026-09-07). 실기기 확인 1회만 남음 |
| 연관 | `tickets/backend/pending/republish-stale-playback-position.md` — **실제 해결은 그쪽이다** |

## 문제

`player.md` 7과 `player-api.md` 4.1은 이렇게 정한다.

> 클라이언트는 버전이 달라지면 **저장된 재생 위치와 오프라인 파일을 폐기한다.**
> `content.content_version` — 클라이언트가 **보관한 값**보다 크면 저장된 위치를 폐기하고 0부터 재생한다.

**앱에는 보관한 값이 없다.** 재생 위치를 로컬에 저장하지 않기 때문이다.

- `player/store/playback.store.ts` — persist 미들웨어가 없는 순수 Zustand 스토어다. 저장소 전체에 `persist(` · `AsyncStorage` · `MMKV` 사용처가 없다
- `shared/storage/storage-keys.ts` — 키가 5개뿐이다(토큰 2종 · 기기 ID · 재생 확인 억제 날짜 · 최근 검색어). **위치도 버전도 없다**
- 위치는 **매 진입마다** 4.1 응답의 `progress.position_sec`에서 받는다(`playback.service.ts:219`)

즉 이 규칙은 클라이언트가 수행할 수 있는 형태가 아니다. 그런데 코드는 수행하는 것처럼 보인다.

### ① 죽은 분기 — `playback.service.ts:566`

```ts
if (result.contentVersion !== ctx.contentVersion) {
  // 재발행 감지 — 저장은 서버가 버렸다. 다음 진입에서 새 버전으로 0부터 재생한다(player.md 7)
  logger.debug('[player] content version changed', ctx.contentVersion, result.contentVersion);
  ctx.contentVersion = result.contentVersion;
}
```

- `ctx.contentVersion`은 **보관값이 아니다.** 몇 초 전 같은 서버의 4.1 응답에서 받아 넣은 값이다(`:215`).
  세션 안의 서버 값 둘을 비교하는 것이라 "보관값 대비 판정"이 아니다.
- 분기 내용이 **로그와 재대입뿐이다.** 0으로 시크하지도, 위치를 지우지도, 오디오 URL을 다시 받지도, UI에 알리지도 않는다.
- 주석 "다음 진입에서 새 버전으로 0부터 재생한다"는 **사실이 아니다.** 서버는 `playback_progresses` 행을 남기고
  다음 진입의 4.1이 재발행 이전 위치를 그대로 내려준다.
- 목 API(`player.mock.ts:216`)는 요청 버전을 그대로 되돌려주므로 목 모드에서는 **도달조차 하지 않는다.**

### ② 사실이 아닌 타입 주석 — `player.types.ts:58`

`PlayerContentMeta.contentVersion`에 "보관값보다 크면 저장 위치를 폐기하고 0부터 재생한다(player.md 7)"라고
적혀 있다. 구현이 없다. 게다가 `PlaybackStartMeta`(`:108-114`)에는 `contentVersion`이 아예 없어
**목록 화면이 들고 있는 버전이 플레이어로 전달되지도 않는다** — 보관값 역할을 할 후보조차 없다.

### 지금 유일하게 동작하는 방어

`playback.service.ts:221`의 길이 초과 폴백뿐이다.

```ts
if (issue.content.durationSec > 0 && startPositionSec >= issue.content.durationSec) {
  startPositionSec = 0;
}
```

**길이가 짧아진 재발행만** 걸린다. 이번 TTS 규격 변경(콜드오픈 폐지 · 앞뒤 무음 2초 · 1.2배속)은
길이가 늘 수도 줄 수도 있고, 늘어난 쪽은 통과한다. 더구나 **콜드오픈이 사라지면 같은 초가 다른
내용을 가리킨다** — 길이가 같아도 위치는 의미를 잃는다.

오프라인 파일은 해당 없다. 기능 자체가 없다(P1 이연 확정 — `offline-download.md`).

## 요청 내용

**FE에 로컬 위치 저장을 새로 넣지 않는다.** 위치의 단일 진실은 서버 `playback_progresses`이고
(`domain.md` 14장), 판정은 서버가 하고 클라이언트는 표시만 한다(공통 원칙). 같은 규칙을 두 곳에
두면 어긋난다. **실제 해결은 `tickets/backend/pending/republish-stale-playback-position.md`다.**

이 티켓이 요청하는 것은 **코드가 거짓말하지 않게 만드는 것**이다.

1. **`playback.service.ts:566` 분기의 주석을 사실로 고친다.** "저장은 서버가 버렸다"는 저장 경로(4.3)에
   한해 맞다 — 읽기 경로는 그렇지 않다. 분기 자체는 `ctx`를 서버 값에 맞추는 동기화로 유지해도 되지만,
   **재발행 폐기를 수행한다고 적지 않는다.** BE 티켓을 참조로 남긴다.
2. **`player.types.ts:58` 주석에서 "폐기하고 0부터 재생한다"를 걷어낸다.** 서버가 내려주는 현재
   버전이라는 사실만 적고, 폐기 주체가 서버로 정리되는 중임을 BE 티켓 링크로 남긴다.
3. **BE 티켓이 안 A(재발행 시 위치 삭제)로 확정되면 확인만 한다** — 4.1이 `progress: null`을 내려주면
   기존 코드(`issue.progress?.positionSec ?? 0`)가 이미 0부터 재생한다. **FE 코드 변경 없이 동작한다.**
   안 B로 가면 그때 다시 본다.
4. `playback.service.ts:221`의 길이 초과 폴백은 **그대로 둔다.** 서버가 고쳐져도 다기기·경합 상황의
   안전망으로 값이 있다.

## 완료 조건

- Given `playback.service.ts`의 버전 비교 분기 / When 주석을 읽는다 / Then 그 분기가 실제로 하는 일만 적혀 있고, 재발행 폐기를 수행한다고 주장하지 않는다
- Given `player.types.ts`의 `contentVersion` 필드 / When 주석을 읽는다 / Then 구현되지 않은 폐기 동작이 적혀 있지 않고 담당 티켓을 가리킨다
- Given BE 티켓이 안 A로 반영된 빌드 / When 재발행된 콘텐츠에 다시 진입한다 / Then 0부터 재생된다(FE 코드 변경 없이)
- Given 재발행되지 않은 콘텐츠 / When 진입한다 / Then 저장된 위치가 그대로 복원된다(회귀 없음)

## 처리 기록

| 항목 | 값 |
|---|---|
| 처리 날짜 | 2026-09-07 |
| 처리 범위 | 요청 내용 1·2 반영. 3·4는 **보류** |
| 상태 | **부분 반영 후 보류** — `pending/`에 남긴다 |

### 반영한 것

- `playback.service.ts`의 버전 비교 분기 주석을 사실로 고쳤다. "저장은 서버가 버렸다 / 다음 진입에서
  0부터 재생한다"를 걷어내고, **이 분기가 하는 일은 세션이 든 버전을 서버 값에 맞추는 동기화뿐**임을
  적었다. 폐기 주체가 서버임을 BE 티켓 경로로 남겼다. 분기 자체는 요청대로 유지했다.
- `playback.service.ts`의 길이 초과 폴백 주석에 **길이가 늘어난 재발행은 걸리지 않는다**는 한계를
  덧붙였다. 폴백 코드는 요청 4대로 그대로 뒀다.
- `player.types.ts`의 `PlayerContentMeta.contentVersion` 주석에서 "보관값보다 크면 저장 위치를 폐기하고
  0부터 재생한다"를 걷어냈다. 서버가 내려주는 현재 버전이고 4.3 저장 요청에 실어 보낸다는 사실만 남기고,
  폐기 판단 주체는 BE 티켓을 가리키게 했다.

동작 변경은 없다. 주석만 고쳤다. `tsc --noEmit` · `eslint` 통과.

### 보류하는 것과 사유

요청 3·4(= 완료 조건 3번)는 **`tickets/backend/pending/republish-stale-playback-position.md`가
안 A/안 B 중 무엇으로 확정되는지에 달려 있다.** 그 티켓은 2026-09-07 기준 `상태: 대기`이고 선택이
아직 안 됐다. 안이 갈리면 FE가 할 일도 갈린다.

| BE 결정 | FE가 할 일 |
|---|---|
| 안 A(재발행 시 `playback_progresses` 삭제) | **코드 변경 없음.** 4.1이 `progress: null`을 주면 `issue.progress?.positionSec ?? 0`이 이미 0을 쓴다. 재발행 콘텐츠 재진입이 0부터인지 **확인만** 하면 완료 조건 3·4가 닫힌다 |
| 안 B(`playback_progresses.content_version` 추가 후 4.1이 낡은 행 무시) | 마찬가지로 FE 코드 변경 없음. 다만 4.1 응답에서 `progress`가 어떤 모양으로 오는지(`null`인지 위치 0인지) `player-api.md` 4.1 확정본을 보고 재확인해야 한다 |

**남은 결정 항목**: BE의 안 A/B 선택. 그 전까지 FE에서 더 할 일은 없다.

### 함께 확인한 것 (이 티켓 범위 밖)

`player.types.ts`와 `playback.service.ts` 두 파일 모두 **이 변경 이전부터** `prettier --check`에
걸려 있다(`git stash` 후 확인). 이번 수정이 만든 문제가 아니고, 전체 포맷을 돌리면 diff가 주석
수정을 덮어버려 손대지 않았다. 별도로 정리할 사안이다.

## 진행 기록 (2026-09-07 저녁 — BE가 안 A로 확정·구현. 코드 변경 없이 조건이 닫힌다)

짝 티켓 `tickets/backend/archive/republish-stale-playback-position.md`가 **안 A(재발행 트랜잭션 안에서
`playback_progresses` 삭제)** 로 반영됐다(PR #165 · `7d74a45 fix(playback): discard stale progress on
republish`). 보류 사유였던 "BE 안 A/B 미확정"이 해소됐다.

### FE는 이미 안 A에 맞게 동작한다 — 손댈 것이 없다

```ts
// playback.service.ts:219
let startPositionSec = request.restartFromBeginning ? 0 : (issue.progress?.positionSec ?? 0);
// playback.service.ts:226
this.ctx.tracking = createTrackingState(issue.progress?.maxReachedSec ?? 0);
```

재발행된 콘텐츠는 서버가 행을 지웠으므로 4.1이 `progress: null`을 내려주고, 두 줄의 `?? 0`이
그대로 0을 쓴다. **이 티켓이 발행 시점에 예측한 그대로다**(요청 3 — "안 A면 FE 코드 변경 없음").

### 완료 조건 판정

| 조건 | 상태 |
|---|---|
| 1. 버전 비교 분기 주석이 실제 동작만 말한다 | ✅ PR #159 |
| 2. `contentVersion` 타입 주석에 미구현 폐기 동작이 없다 | ✅ PR #159 |
| 3. 재발행된 콘텐츠 재진입이 0부터 (FE 코드 변경 없이) | 🟡 **코드 경로는 확인됨. 실기기 확인만 남음** |
| 4. 재발행되지 않은 콘텐츠는 위치 복원(회귀 없음) | 🟡 위와 같은 확인으로 함께 판정 |

조건 3·4는 **관리자 웹에서 콘텐츠를 재발행한 뒤 앱에서 그 콘텐츠에 다시 들어가 보면** 끝난다.
이제 막는 것이 없다 — 서버·클라이언트 양쪽이 준비됐다.

**다음에 집는 사람이 조사할 것은 없다.** 재발행 1회 + 재진입 1회로 닫는다.

### 함께 갱신할 문서

`changes/pending/player-republish-progress-discard-owner.md`가 같은 내용의 문서 개정을 요청하고
있다(`player.md` 7 · `player-api.md` 4.1의 "클라이언트가 보관값과 비교해 폐기한다" → 서버 소유).
그 문서가 반영되면 이 티켓의 근거 문서도 정합해진다.
