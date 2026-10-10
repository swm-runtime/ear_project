# [FE] 공유(FR-27) P1 활성화 — 다음 빌드에 반드시 반영

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/share/share.constants.ts`(플래그 기본값) · `frontend/eas.json`(빌드 env) · `spec/uiux/share-uiux.md` 6장(카피 확정) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-03 |
| 시작 날짜 | 2026-09-03 |
| 기한 | 2026-09-03 (Jira 중요도 High — 발행 당일. 티켓이 아닌 선행인 스토어 게시에 막혀 지났다 — 아래 진행 기록) |
| 선행 | 없음 (선행 티켓 없음. 티켓이 아닌 선행이던 양 스토어 게시는 2026-10-05 확인 — 완료) |
| 반영 날짜 | 2026-10-05 (PR #1134) |
| 발견 시점 | 2026-09-03 App Links 인프라 완료 후 공유 기능 상태를 점검하다 — **코드·인프라는 전부 준비됐는데 빌드 타임 플래그 하나로 꺼져 있다**는 것을 확인 |
| 근거 문서 | `features/share.md` 2장(P1 활성화 조건) · `spec/uiux/share-uiux.md` 6·9장(카피 미확정) · README 결정 42 |
| 심각도 | **중** — 기능 자체는 완성돼 있어 위험은 없다. 다만 **빌드 타임 상수라 다음 빌드를 놓치면 그다음 빌드까지 못 켠다** |
| 상태 | **완료** — 요청 1~4 전부 반영(2026-10-05, PR #1134). 남은 것은 사람 손 실기기 확인뿐 — 맨 아래 처리 기록 |
| Jira | [KAN-34](https://runtime364.atlassian.net/browse/KAN-34) |

## 배경 — 스위치 하나만 꺼져 있다

공유는 **코드가 이미 다 있다.** `frontend/src/features/share/`에 진입점 4곳·링크 생성·수신 게이트·테스트까지 구현돼 있고, 오늘 `assetlinks.json` 배포로 **안드로이드 App Links 인프라도 살아났다**(구글 Digital Asset Links API 검증 통과 — `tickets/backend/archive/share-universal-links-hosting.md` 2026-09-03).

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
4. **스토어 링크 확정값을 확인한다.** 앱 미설치 수신자의 폴백 목적지다 — 랜딩의 `StoreRedirect` 상수가 아직 `null`이면 안내 문구만 뜬다(`tickets/backend/archive/share-universal-links-hosting.md` 요청 2). **보내기를 켜기 전에 이 경로가 실제 스토어로 가는지 확인한다** — 받는 사람 대부분이 미설치 상태다.
5. **범위 밖** — 공유 집계·유입 어트리뷰션은 도입하지 않는다(`share.md` 4.4 — `domain.md` 개정이 선행 사안이다).

## 완료 조건

> 2026-10-05 정정 — 인앱 브라우저·미설치 조건을 현행 설계(2026-10-02 랜딩 수신 화면: 자동 이동 대신 [앱에서 열기]·양 스토어 버튼)에 맞추고, 콜드 스타트 조건을 더했다. 종전 "브라우저가 아니라 앱이 열린다"·"스토어로 이동한다(안내 페이지가 아니라)"는 카카오톡 인앱 브라우저가 유니버설 링크·App Links 를 타지 않는다는 사실과 맞지 않았다.

- Given 카피가 확정된 상태 / When `share-uiux.md` 6장을 연다 / Then 공유 텍스트 형식과 낭독 라벨이 제안값이 아니라 확정값으로 적혀 있고, `share.service.ts`·`share.copy.ts`의 TODO 주석이 없다
- Given 플래그를 켠 빌드 / When 콘텐츠 상세(CD1·CD2) 상단 바를 본다 / Then [공유] 아이콘이 보이고, 탭하면 OS 공유 시트가 열린다
- Given 같은 빌드 / When 라이브러리·탐색·플레이어 더보기 시트를 연다 / Then 세 곳 모두 [공유] 행이 담기/제거류 아래에 보인다
- Given 앱이 설치되고 온보딩을 마친 기기 / When 인앱 브라우저 앱(카카오톡)에서 `https://earcast.co.kr/contents/<발행 콘텐츠 id>`를 탭한다 / Then 인앱 브라우저에 랜딩 수신 페이지가 뜨고, [앱에서 열기]를 누르면 앱이 열려 그 콘텐츠 상세에 도착한다
- Given 같은 기기 / When 일반 앱(메모·메시지)에서 같은 링크를 탭한다 / Then 브라우저를 거치지 않고 앱이 바로 열려 그 콘텐츠 상세에 도착한다
- Given 앱이 **완전히 종료된**(콜드 스타트) 같은 기기 / When 위 두 경로로 링크를 연다 / Then 스플래시(실행 관문)를 거친 뒤 그 콘텐츠 상세에 도착한다 — 상세는 복원한 탭 위에 얹히고 뒤로가기는 탭으로 간다
- Given 미로그인·온보딩 미완 기기 / When 콜드 스타트로 링크를 연다 / Then 정상 진입 분기(시작 화면·온보딩)만 따르고, 로그인·온보딩을 마친 뒤에도 상세로 복원되지 않는다
- Given 앱이 설치되지 않은 기기 / When 같은 링크를 연다 / Then 랜딩 수신 페이지의 App Store·Google Play 버튼이 게시된 스토어 앱 페이지로 간다(자동 이동이 아니라 버튼이다)
- Given 공유 시트를 취소한다 / When 앱으로 돌아온다 / Then 아무 동작·토스트도 없고 `user_signals`에 기록이 남지 않는다

## 보류·미결

- **켜는 시점 자체는 제품 결정이다.** 이 티켓은 "켜기로 하면 반드시 다음 빌드에 넣는다"와 그 선행 조건(카피·아이콘·스토어 링크)을 정리한 것이지, 켤 시점을 정하지 않는다.
- 다크 모드 대응 범위는 `share-uiux.md` 9장 미결로 남아 있다 — 공유 진입점만의 문제가 아니라 이 티켓에서 다루지 않는다.

## 처리 기록 (2026-09-04)

- **요청 1(카피 확정)·2(아이콘 확정) 완료** — 현행 구현 그대로 확정: 텍스트 = SH3 세 줄,
  낭독 라벨 `공유`, 아이콘 = 공통 `ShareIcon` 하나. 코드 TODO 주석 제거, 문서 반영 요청은
  `changes/archive/share-p1-copy-decisions.md` 발행.
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

## 정정·재확인 (2026-09-10)

**공유 텍스트 형식 결정이 대체됐다.** 위 진행 기록의 "텍스트 = SH3 세 줄(제목/저자·출처/링크)"은
2026-09-09 공유 회의 결정으로 **제목 / 링크 두 줄**이 됐다(티켓
`archive/share-message-final-copy.md`, 문서 반영 요청 `changes/archive/share-message-drops-byline.md`).
이 티켓의 요청 1은 그대로 닫힌 상태이며, 확정값만 바뀐 것이다.

**pending 유지 사유는 그대로다** — Play 게시 하나뿐이다. 2026-09-10 재확인 시점에도 미게시라
랜딩 `StoreRedirect.tsx`의 두 상수는 `null`로 둔다(게시 전에 채우면 방문자가 안내 페이지 대신
Play "찾을 수 없음" 오류를 본다). 게시되면 ① 위에 적힌 두 줄 교체 ② 미설치 기기에서 링크 탭 —
두 단계로 닫힌다. **조사할 것은 없다.**

## 진행 기록 (2026-09-20 — iOS 심사 통과. 그런데 **아직 게시되지 않았다**)

- iOS 심사 통과 소식에 요청 4(스토어 링크)를 닫을 수 있는지 확인했다. **아직 아니다.**

  | 확인 | 결과 |
  |---|---|
  | `https://apps.apple.com/kr/app/id6807708636` (운영) | **404** |
  | `https://apps.apple.com/kr/app/id6813738593` (개발계) | 404 |
  | `https://apps.apple.com/kr/app/id284882215` (대조군) | 301 — 조회 경로 자체는 정상 |
  | iTunes Lookup API `id=6807708636` | `resultCount: 0` |

  심사 통과와 게시는 다르다 — App Store Connect 에서 **출시 버튼**(출시 대기 상태) 또는 자동 출시 처리가 아직 끝나지 않았다.

- 따라서 랜딩 `contents/StoreRedirect.tsx` 의 `IOS_STORE_URL` 은 **계속 `null` 로 둔다.** 지금 채우면 미설치 방문자가 안내 문구 대신 "찾을 수 없음" 페이지를 본다 — 지금 설계가 의도적으로 피하는 상태다. 게시가 확인되면 그때 채운다.

- **대신 앱 쪽은 고쳤다**(`fix(fe)/store-url-per-platform`). `settings.constants.ts` 의 `STORE_URL` 이 플랫폼과 무관하게 Play 고정이라, iOS 가 게시되는 순간 iOS 사용자의 [업데이트] 가 Play 로 떨어진다. `Platform.OS` 로 갈라 두었다 — 게시 전에 미리 고쳐 두는 쪽이 맞다(이 버튼은 서버가 강제 업데이트를 지시할 때만 뜨고, 그 시점은 게시 이후다).

- 공유 플래그 자체는 이미 켜져 있다 — `IS_SHARE_ENABLED` 의 기본값이 켬이고 `eas.json` 에 `EXPO_PUBLIC_SHARE_ENABLED` 가 없다. **이번 빌드에 공유가 들어가 나갔다**(요청 3 의 의도대로).

## 진행 기록 (2026-10-02 — 최신 dev의 공유 수신 화면 재확인)

- `landing-page/src/content/site.ts`에 양 스토어 URL이 있고 `contents/page.tsx`의 App Store·Google Play 버튼이 이를 사용한다. 따라서 "스토어로 갈 링크가 없다"는 기존 보류 사유는 최신 dev 코드에 해당하지 않는다.
- `StoreRedirect`의 null 상수를 그대로 둔 것은 카카오톡 인앱 브라우저에서 앱 설치자도 웹 페이지로 도착하기 때문이다. 최신 수신 화면은 자동 이동 대신 [앱에서 열기]와 양 스토어 버튼을 제공하도록 변경돼 있다. 이 후속 동작을 무시하고 상수를 채우면 앱 설치자가 [앱에서 열기]를 누르기 전에 스토어로 이동한다.
- 남은 확인: 실제 운영 공유 링크에서 미설치 기기의 스토어 버튼을 눌러 게시된 앱 페이지로 도착하는지, 설치된 기기의 앱 열기가 작동하는지. 완료 조건의 "자동 스토어 이동" 표현도 후속 수신 화면 결정과 함께 정합화해야 하므로 pending을 유지한다.

## 처리 기록 (반영 2026-10-05 — PR #1134)

### 요청 4(스토어 링크) — 게시 확인, 닫는다

2026-10-05 확인:

| 확인 | 방법 | 결과 |
|---|---|---|
| App Store `https://apps.apple.com/kr/app/id6807708636` | HTTP 요청 | 200 |
| iTunes Lookup `id=6807708636` | API 조회 | `resultCount: 1` |
| Google Play `https://play.google.com/store/apps/details?id=com.runtime.ear` | HTTP 요청 | 200 |
| 랜딩 `/contents/<id>` 수신 페이지 | 페이지 본문 | 양 스토어 URL 둘 다 포함 |
| `/.well-known/apple-app-site-association`(`/contents/*`) · `/.well-known/assetlinks.json` | HTTP 요청 | 둘 다 200 |

랜딩 `StoreRedirect`의 null 상수는 채우지 않는다 — 2026-10-02 기록대로 수신 화면이 자동 이동 대신 [앱에서 열기]·스토어 버튼을 쓰는 설계라, 채우면 인앱 브라우저의 앱 설치자가 [앱에서 열기]를 누르기 전에 스토어로 튕긴다. 완료 조건의 미설치 조건도 이 설계에 맞춰 "버튼이 게시된 스토어 페이지로 간다"로 정정했다.

### PM 실기기 확인 (2026-10-05)

- 카카오톡: 인앱 브라우저에 랜딩이 뜨고 [앱에서 열기]로 앱이 열린다 — 기대 동작(인앱 브라우저는 유니버설 링크·App Links 를 무시한다).
- 앱이 백그라운드: 콘텐츠 상세 도착 ✅
- 앱이 종료된 상태(콜드 스타트): **앱만 열리고 상세로 가지 않았다** → 이 PR 에서 수정.

### 콜드 스타트 수정 (PR #1134 — `useShareLinkGate`의 `TODO(SplashGate)` 해소)

- 원인: 수신 게이트가 마운트 직후 `Linking.getInitialURL()`을 그 자리에서 평가했다. 그 시점은 세션 복원(`restoring`)·버전 관문·로고 모션·마지막 탭 읽기 전이라 로그인 사용자도 미로그인으로 읽혀 목적지가 버려졌다.
- 수정: RootNavigator 의 화면 분기를 `app/navigation/root-route.ts`(`selectRootRoute`)로 뽑고, 공유 게이트가 같은 판정에서 관문 상태(스플래시 = 대기 · Main = 통과 · 그 밖 = 폐기)를 받는다. 판정 중 도착한 링크(콜드 스타트·스플래시 도중 `url` 이벤트)는 기다렸다가 판정이 끝나는 순간 **한 번** 평가한다. 통과한 목적지는 Main 안(`useShareLinkLanding`)에서 상세로 보낸다 — `Main` 라우트가 생긴 뒤에만 이동하고 복원한 탭 위에 얹힌다. 디퍼드 딥링크 금지(share.md 4.3)는 그대로다.
- 검증: `tsc --noEmit` · `eslint src` · jest 전체 통과. 신규 `share-link-cold-start.test.tsx`(콜드 스타트 대기 → 통과 시 이동 / 미로그인·온보딩 미완·재동의 폐기 / 1회 평가 / 실행 중 `url` 이벤트 / `share_receive` 1회)·`root-route.test.ts`.
- JS 만 바뀌어 OTA 로 나간다(runtimeVersion·네이티브 변경 없음).

### 남은 사람 손 확인

- [x] OTA 수신 후 실기기 콜드 스타트 — 앱 완전 종료 → 카카오톡 링크 → [앱에서 열기] → 스플래시 뒤 상세 도착
- [ ] 메모/메시지 앱에서 링크 직접 탭 → 브라우저 없이 앱이 열려 상세 도착(콜드·백그라운드)
- [ ] 앱 미설치 기기에서 랜딩의 App Store·Google Play 버튼 → 게시된 스토어 페이지 도착

### 실기기 확인 (2026-10-05 17:45)

- 운영 릴리즈 #1135(dev → main) → 운영 OTA `01a10b39`(production, runtime 31)에서 PM 이 실기기로 확인하고 **"잘 된다 — 끝났다"로 종료 판정**했다.
- 위 체크리스트 중 콜드 스타트는 확인됨. 메모/메시지 직접 열기·미설치 기기 스토어 버튼은 PM 종료 판정에 포함됐으나 항목별 확인 기록은 따로 남지 않았다 — 문제가 보이면 새 티켓으로 연다.
