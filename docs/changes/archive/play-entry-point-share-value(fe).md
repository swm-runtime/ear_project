# library-api.md — 재생 entry_point enum에 `share` 신설 협의

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/library-api.md` 4.4(재생 시작 — `entry_point` enum) · `docs/spec/api/content-detail-api.md` 9장 미결("[재생]의 entry_point 값") |
| 발행 날짜 | 2026-08-25 |
| 발견 시점 | 공유 기능(FR-27, P1) FE 구현 — 공유 링크 수신 상세의 [재생] |
| 요청 파트 | 프론트엔드 (**백엔드 확인 필요** — enum 소유는 library-api.md) |

## 수정 내용

`library-api.md` 4.4의 `entry_point` enum(`library` / `explore` / `miniplayer` / `push` / `player`)에 **`share`를 추가한다** — 공유 링크 수신으로 진입한 콘텐츠 상세의 [재생]이 보내는 값이다(`share.md` 4.3 · `content-detail.md` 2장 "공유 링크 수신" 진입, P1).

- 기존 값 중 대체 후보가 없다: `push`는 푸시 딥링크 유입이라 공유 유입과 분석 축이 다르고, `library`·`explore`는 원 화면이 실재할 때의 값이다(content-detail-api.md 4.2 — 원 화면 값 유지 전달).
- `content-detail-api.md` 9장 미결("상세 경유 전환을 분석 축으로 구분하려면 `content_detail` 값 신설이 필요하다 — 협의 대상")과 같은 협의 건이다 — 함께 결정하는 것을 제안한다.

## FE 선행 (가정 계약)

FE는 `PlayEntryPoint` / `ContentDetailEntryPoint` 타입에 `'share'`를 추가해 선행했다(mock 통과 — `frontend/src/features/player/player.types.ts` · `content-detail/content-detail.types.ts`, 가정 계약 주석 명시). 서버 enum이 다른 값으로 확정되면 FE 매핑만 바꾼다.

- entry_point는 전환 분석용이며 판정에 쓰이지 않는다(library-api.md 4.4) — 값 신설이 재생 판정·차감 로직에 영향을 주지 않는다.

## 완료 조건

- Given `library-api.md` 4.4를 읽는다 / When `entry_point` enum을 확인한다 / Then 공유 링크 수신 진입의 값(`share` 또는 협의 확정값)이 포함되어 있다
- Given 확정된 enum 값 / When FE `PlayEntryPoint`·`ContentDetailEntryPoint`와 대조한다 / Then 같은 값을 쓴다(다르면 FE 티켓으로 후속 수정)
- Given 공유 링크로 진입한 상세에서 [재생]한다 / When 서버가 play 요청을 받는다 / Then `entry_point` 검증(400)에 걸리지 않는다

---

## 처리 기록 (반영 날짜: 2026-08-25 — 브랜치 `feat(be)/share-entry-point`)

- **`share` 신설로 확정** (협의 2026-08-25) — `PlayEntryPoint` enum(`backend/src/modules/playback/playback.enum.ts`)에 `SHARE = 'share'` 추가. FE 가정 계약과 동일 값이라 FE 매핑 수정 불요.
- 문서 반영: `library-api.md` 4.4(enum + 비고) · `content-detail-api.md` 4.2(공유 진입 예외)·9장(부분 확정 표기).
- **`content_detail` 값 신설은 미결 유지** (협의 2026-08-25) — 상세 경유 분석 요구가 생길 때 추가한다. entry_point는 판정에 쓰이지 않아 후행 추가로 깨지는 것이 없다(`content-detail-api.md` 9장이 계속 관리).
