# [FE] 공유(FR-27) P1 활성화 — 다음 빌드에 반드시 반영

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/share/share.constants.ts`(플래그 기본값) · `frontend/eas.json`(빌드 env) · `spec/uiux/share-uiux.md` 6장(카피 확정) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-03 |
| 발견 시점 | 2026-09-03 App Links 인프라 완료 후 공유 기능 상태를 점검하다 — **코드·인프라는 전부 준비됐는데 빌드 타임 플래그 하나로 꺼져 있다**는 것을 확인 |
| 근거 문서 | `features/share.md` 2장(P1 활성화 조건) · `spec/uiux/share-uiux.md` 6·9장(카피 미확정) · README 결정 42 |
| 심각도 | **중** — 기능 자체는 완성돼 있어 위험은 없다. 다만 **빌드 타임 상수라 다음 빌드를 놓치면 그다음 빌드까지 못 켠다** |
| 상태 | pending — 요청 1~3 완료. 요청 4(스토어 링크)는 값 확정, **Play 게시 대기** |

## 배경 — 스위치 하나만 꺼져 있다

공유는 **코드가 이미 다 있다.** `frontend/src/features/share/`에 진입점 4곳·링크 생성·수신 게이트·테스트까지 구현돼 있고, 오늘 `assetlinks.json` 배포로 **안드로이드 App Links 인프라도 살아났다**(구글 Digital Asset Links API 검증 통과 — `tickets/backend/pending/share-universal-links-hosting.md` 2026-09-03).

막고 있는 것은 이 한 줄이다.

```ts
// share.constants.ts
export const IS_SHARE_ENABLED = process.env.EXPO_PUBLIC_SHARE_ENABLED === 'true';
```

**`eas.json`의 `preview`·`production` 어디에도 이 값이 없다.** 따라서 스토어 빌드에서 `false`이고, 다음 두 가지가 모두 동작하지 않는다.

| | 현재 |
|---|---|
| 보내기 — 진입점 4곳 | 아이콘·행 자체가 렌더되지 않는다(비활성 노출도 금지 — `share-uiux.md` 8장) |
| 받기 — `useShareLinkGate` | `if (!IS_SHARE_ENABLED) return;` — 링크로 앱이 열려도 목적지를 버리고 정상 진입만 한다 |

**이것이 이 티켓의 핵심 이유다.** `EXPO_PUBLIC_*`는 Expo가 번들에 인라인하는 **빌드 타임 상수**라, 서버 env나 콘솔 설정처럼 나중에 켤 수 없다. **켜기로 결정한 순간의 다음 빌드에 반드시 들어가야 하고, 놓치면 그다음 빌드까지 기다려야 한다.**

## 요청 내용

1. **카피를 먼저 확정한다.** 사용자에게 나가는 문자열이라 미확정인 채로 켜지 않는다(`share-uiux.md` 6장 TODO).
   - **공유 텍스트 형식** — 현재 코드는 시안 SH3의 `제목 ␤ 저자 · 출처 ␤ 링크` 세 줄을 임시로 따른다(`share.service.ts#buildShareMessage`의 TODO). 줄바꿈·구분자·순서를 확정해 `share-uiux.md` 6장 표로 옮긴다
   - **[공유] 낭독 라벨** — 현재 `SHARE_COPY.action = '공유'`. 확정 후 TODO 주석을 걷는다
2. **[공유] 아이콘 도형을 확정한다**(`share-uiux.md` 9장 미결). OS 관용 표현을 플랫폼별로 따를지, 공통 아이콘 하나로 갈지. **현재 구현은 공통 아이콘 하나**(`ShareIcon.tsx`)이며, 그대로 가기로 하면 결정만 문서에 남기면 된다.
3. **플래그를 켠다.** 둘 중 하나로 하되, 켜는 방식을 결정에 포함한다.
   - `share.constants.ts`의 기본값을 켜는 쪽 — 원 설계다(해당 파일 주석: *"P1 활성화 시 기본값을 켠다"*). env 없이도 켜져 프로필 누락 사고가 없다
   - `eas.json`의 `preview`·`production`에 `EXPO_PUBLIC_SHARE_ENABLED: "true"`를 넣는 쪽 — 프로필별로 갈 수 있으나 **넣는 것을 잊으면 조용히 꺼진 채 나간다**
4. **스토어 링크 확정값을 확인한다.** 앱 미설치 수신자의 폴백 목적지다 — 랜딩의 `StoreRedirect` 상수가 아직 `null`이면 안내 문구만 뜬다(`tickets/backend/pending/share-universal-links-hosting.md` 요청 2). **보내기를 켜기 전에 이 경로가 실제 스토어로 가는지 확인한다** — 받는 사람 대부분이 미설치 상태다.
5. **범위 밖** — 공유 집계·유입 어트리뷰션은 도입하지 않는다(`share.md` 4.4 — `domain.md` 개정이 선행 사안이다).

## 완료 조건

- Given 카피가 확정된 상태 / When `share-uiux.md` 6장을 연다 / Then 공유 텍스트 형식과 낭독 라벨이 제안값이 아니라 확정값으로 적혀 있고, `share.service.ts`·`share.copy.ts`의 TODO 주석이 없다
- Given 플래그를 켠 빌드 / When 콘텐츠 상세(CD1·CD2) 상단 바를 본다 / Then [공유] 아이콘이 보이고, 탭하면 OS 공유 시트가 열린다
- Given 같은 빌드 / When 라이브러리·탐색·플레이어 더보기 시트를 연다 / Then 세 곳 모두 [공유] 행이 담기/제거류 아래에 보인다
- Given 같은 빌드가 설치된 기기 / When 다른 앱에서 `https://earcast.co.kr/contents/<발행 콘텐츠 id>`를 탭한다 / Then 브라우저가 아니라 앱이 열리고 그 콘텐츠 상세에 도착한다
- Given 앱이 설치되지 않은 기기 / When 같은 링크를 연다 / Then 스토어로 이동한다(안내 페이지가 아니라)
- Given 공유 시트를 취소한다 / When 앱으로 돌아온다 / Then 아무 동작·토스트도 없고 `user_signals`에 기록이 남지 않는다

## 보류·미결

- **켜는 시점 자체는 제품 결정이다.** 이 티켓은 "켜기로 하면 반드시 다음 빌드에 넣는다"와 그 선행 조건(카피·아이콘·스토어 링크)을 정리한 것이지, 켤 시점을 정하지 않는다.
- 다크 모드 대응 범위는 `share-uiux.md` 9장 미결로 남아 있다 — 공유 진입점만의 문제가 아니라 이 티켓에서 다루지 않는다.

## 처리 기록 (2026-09-04)

- **요청 1(카피 확정)·2(아이콘 확정) 완료** — 현행 구현 그대로 확정: 텍스트 = SH3 세 줄,
  낭독 라벨 `공유`, 아이콘 = 공통 `ShareIcon` 하나. 코드 TODO 주석 제거, 문서 반영 요청은
  `changes/pending/share-p1-copy-decisions.md` 발행.
- **요청 3(플래그)·4(스토어 링크) 보류** — 앱이 아직 스토어 미출시라 미설치 수신자 폴백이
  갈 곳이 없다(요청 4의 선행 미충족). 켜는 방식은 **기본값 켜기(원 설계)**로 결정만 기록 —
  스토어 등록·`StoreRedirect` 확정 후 `share.constants.ts` 기본값을 켠다.
- pending 유지 사유: 남은 것 = 스토어 링크 확정 → 플래그 켜기 → 완료 조건의 빌드 검증.

## 진행 기록

- **2026-09-06 — 플래그 활성화 (두 번째 TestFlight 빌드에 반영, 사용자 결정)**: 요청 3을 원 설계(기본값 켬 — `share.constants.ts`의 판정을 `!== 'false'`로 반전)로 반영했다. env 누락으로 조용히 꺼진 빌드가 나가는 사고가 없는 쪽이다.
  - **요청 1·2(카피·아이콘)는 "현재 제안값을 확정으로 채택"으로 결정됐다** — 공유 텍스트 3줄 형식(제목/저자·출처/링크), 낭독 라벨 '공유', 공통 아이콘 유지. `share-uiux.md` 6·9장 확정 반영과 코드 TODO 주석 정리는 FE 몫으로 남긴다(동작 무변경 문서·주석 작업).
  - **요청 4(스토어 링크)는 보류** — 앱이 스토어 미등록이라 확정값이 없다. 미설치 수신자는 안내 페이지를 본다(TestFlight 검증에는 지장 없음). 완료 조건 중 "스토어로 이동" 1건은 스토어 등록 후에만 판정 가능 — 그때 랜딩 `StoreRedirect` 상수 교체(`share-universal-links-hosting.md` 공유 미결)와 함께 닫는다.

## 진행 기록 (2026-09-07 — 요청 4의 값을 확정했다. 채우는 시점만 남았다)

### 요청 1·2는 완전히 닫혔다

- 코드 TODO 없음 — `grep -rn TODO src/features/share/`가 남긴 것은 `useShareLinkGate.ts`의
  `TODO(SplashGate)` 하나뿐이고, 이것은 카피가 아니라 **실행 관문 구현 대기** 건이라 별개다
- 문서 반영도 끝났다 — `changes/archive/share-p1-copy-decisions.md`(반영 완료)

### 요청 3도 닫혔다

`share.constants.ts`가 `!== 'false'`(기본 켬)이다. 2026-09-06 결정대로다.

### 요청 4 — 스토어 URL 확정값

두 곳이 이 값을 쓰는데 **성격이 달라 처리를 나눴다.**

| 위치 | 용도 | 이번 처리 |
|---|---|---|
| 앱 `settings.constants.ts`의 `STORE_URL` | 설정 [업데이트] 버튼 | **채웠다** — `https://play.google.com/store/apps/details?id=com.runtime.ear` |
| 랜딩 `contents/StoreRedirect.tsx` | 공유 링크 수신자 중 **앱 미설치자** | **채우지 않았다** |

앱 쪽을 채운 이유: [업데이트]는 서버가 강제 업데이트를 지시할 때만 뜨고, 그 시점은 **게시 이후**다.
게다가 기존 값이 `ear.example.com/store`(죽은 도메인)라 그대로 두는 쪽이 더 나빴다
(`prod-build-env-and-eas.md` 2026-09-07 기록).

랜딩 쪽을 채우지 않은 이유: **게시 전에는 Play URL이 "찾을 수 없음"을 띄운다.** 지금 채우면
방문자가 안내 페이지 대신 오류 화면을 본다 — 컴포넌트 주석이 정한 "null인 동안 안내 문구"가
게시 전에는 더 맞다. **게시 즉시 아래 두 줄로 바꾼다**(값은 확정, 조사 불필요).

```ts
const IOS_STORE_URL: string | null = "https://apps.apple.com/app/id6807708636";
const ANDROID_STORE_URL: string | null = "https://play.google.com/store/apps/details?id=com.runtime.ear";
```

iOS 값의 출처는 `frontend/eas.json`의 `submit.production.ios.ascAppId = 6807708636`이다.

### pending 유지 사유 — Play 게시 하나에 걸려 있다

남은 완료 조건은 **"앱이 설치되지 않은 기기에서 링크를 열면 스토어로 이동한다"** 1건이고,
게시 전에는 판정 자체가 불가능하다. 게시되면 ① 위 두 줄 교체 ② 미설치 기기에서 링크 탭 —
이 두 단계로 닫힌다. **다음에 집는 사람이 조사할 것은 없다.**
