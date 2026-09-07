# 인증된 이메일은 앱에서 변경할 수 없다 — 미인증만 수정 가능 (문서 반영 요청)

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-09-07 |
| 발행자 | FE (사용자 결정 2026-09-07) |
| 대상 문서 | `features/auth.md` 4.4 · `features/profile.md` 4.3·5장·7장·8장 · `features/settings.md` 4.1·5장 · `spec/uiux/profile-uiux.md` 4.3 · `spec/uiux/settings-uiux.md` 4.2 |
| 관련 코드 | `profile/hooks/useProfileScreen.ts` · `profile/components/ProfileHeader.tsx` · `profile/screens/ProfileScreen.tsx` · `settings/components/EmailRow.tsx` · `settings/hooks/useSettingsScreen.ts` · `settings/screens/SettingsScreen.tsx` · 신규 `shared/ui/ConfirmDialog.tsx` |

## 확정 내용

이메일 상태를 세 가지로 나누고, **인증이 끝난 주소는 앱에서 변경할 수 없게 한다.**

| `email` | `is_email_verified` | 표시 | 앱에서 가능한 것 |
|---|---|---|---|
| `null` | — | "등록되지 않음" | **등록** |
| 있음 | `false` | 주소 + **⚠ 느낌표 배지** | **변경·인증** |
| 있음 | `true` | 주소만 | **없음** |

- **등록은 계속 열어 둔다.** 카카오가 이메일을 주지 않은 계정은 이 경로가 없으면 결제 자체를 못 한다(`auth.md` 4.4 — 강제 지점은 첫 결제). 잠그는 대상은 "변경"이지 "등록"이 아니다.
- **변경이 필요한 사용자는 고객센터로 보낸다.** 설정의 [문의하기](카카오톡 채널)가 그 경로다.

## 왜

이메일의 **유일한 용도는 탈퇴 후 거래기록 보존**이다(`auth.md` 4.4 — 전자상거래법 시행령 제6조,
`domain.md` 11.3의 `archived_users` 거래 주체 식별). 인증을 마친 주소를 앱에서 임의로 바꾸게 두면
보존 대상 주소가 거래 시점의 주소와 달라진다.

미인증 주소를 열어 두는 이유는 반대다 — 카카오가 준 주소는 도달이 보장되지 않고, 사용자가 직접
입력한 주소에는 오타가 있을 수 있다. **수정 가능한 경우와 코드 인증이 필요한 경우가 정확히 겹친다.**

## 무반응으로 두지 않는다

인증됨 상태에서 이메일 줄을 탭하면 **안내 다이얼로그**를 띄운다 — "인증된 이메일은 변경할 수
없어요" + [닫기] · **[문의하기]**.

같은 줄이 다른 상태에서는 눌리므로, **아무 반응이 없으면 비활성이 아니라 고장으로 읽힌다.**
다이얼로그는 안내이지 변경 수단이 아니다 — 여기서 주소를 입력받지 않는다.

## 미결 — 되돌릴 수 있는 결정이다

**인증된 주소가 도달하지 않게 되는 경로가 있다.**

- 회사 메일로 가입한 뒤 퇴사
- 구글 계정의 이메일 변경
- 애플 릴레이(`@privaterelay.appleid.com`)에서 사용자가 이메일 전달을 끔

이 경우 죽은 주소가 잠긴 채 남고, 보존 목적 자체가 달성되지 않는다. **문의 건수가 쌓이면
재인증을 조건으로 셀프 변경을 여는 것을 검토한다.** 지금은 고객센터 경유로 처리한다.

## 함께 확인할 것 — 문의 목적지가 아직 dev 값이다

`EXPO_PUBLIC_KAKAO_CHANNEL_URL`이 미지정이라 폴백 `https://pf.kakao.com/_ear_dev`가 그대로
나간다(`settings.constants.ts`). **이 결정으로 그 링크가 이메일 변경의 유일한 경로가 됐다.**
운영 채널 실값을 넣어야 한다(`tickets/frontend/pending/prod-build-env-and-eas.md` 2026-09-07 기록).

## 완료 조건 (Given/When/Then)

- Given `auth.md` 4.4를 열었을 때 / When 진입 경로 표를 읽는다 / Then 설정·프로필 경로가 "등록·변경 모두 가능"이 아니라 상태별로 갈린다고 적혀 있다
- Given 인증된 이메일을 가진 사용자 / When 프로필의 이메일 줄을 탭한다 / Then 인증 화면으로 이동하지 않고 안내 다이얼로그가 뜬다
- Given 그 다이얼로그 / When [문의하기]를 탭한다 / Then 설정의 [문의하기]와 같은 목적지가 열린다
- Given 미인증 이메일을 가진 사용자 / When 설정 계정 섹션을 본다 / Then ⚠ 느낌표 배지와 [인증하기]가 있고 [변경] 버튼은 값 탭으로 대체돼 있다
- Given 이메일이 없는 사용자 / When 설정·프로필을 본다 / Then [등록] 진입이 그대로 있다(잠그지 않는다)

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-07 (발행과 같은 날 — 결정 즉시 반영) |
| 반영 문서 | `features/auth.md` 4.4 · `features/profile.md` 4.3·상태 표·예외·완료 조건 · `features/settings.md` 4.1·상태 표 · `spec/uiux/profile-uiux.md` 4.3 · `spec/uiux/settings-uiux.md` 4.2 |
| 반영 코드 | 위 "관련 코드" 전부 |

- `auth.md` 4.4에 **상태 3종 표**를 새로 넣고 진입 경로 표의 "등록·변경 모두 가능"을 상태별
  서술로 바꿨다. 잠그는 이유(거래기록 보존 식별자)와 되돌릴 조건을 함께 적었다.
- 배지를 **"인증되지 않음" → "⚠ 느낌표 + 인증되지 않음"** 으로 바꿨다. 글리프만 쓰지 않는다 —
  색·기호만으로 구분하지 않는다는 규칙(uiux 7장)이 있어 텍스트를 유지했다.
- `shared/ui/ConfirmDialog.tsx`를 새로 만들었다. 프로필과 설정이 **같은 안내**를 보여야 해서
  어느 한쪽 feature에 두면 반대쪽이 내부 파일을 import하게 된다(architecture.md 4.3 위반).
  도메인 지식이 없는 컴포넌트라 shared가 맞다.
  - `settings/components/SettingsDialog.tsx`와 겹치지만 **합치지 않았다.** 그쪽은 본문 슬롯
    (`ReactNode`)을 받는 별개 형태이고 사용처가 3곳이라, 이번 변경에 묶으면 범위가 커진다.
    나중에 정리 대상이다.
- 프로필의 [문의하기]는 `features/settings`의 **공개 API로 `KAKAO_CHANNEL_URL`을 내보내** 쓴다.
  feature 간 의존은 index.ts만 허용된다(architecture.md 4.3).
  - **폴백 차이 하나** — 설정 화면은 링크 열기에 실패하면 링크 복사 다이얼로그로 폴백하는데
    (`settings.md` 7장), 프로필에서는 로그만 남긴다. 폴백 UI가 설정 화면 소유라서다.
    실패는 카카오톡 미설치 등 드문 경우이고, 그때도 설정의 [문의하기]가 남아 있다.

`tsc --noEmit` · `eslint` · `jest`(10 suites / 74 tests) 통과.

### 남긴 것

- **와이어프레임 미반영** — `wireframe/profile.html`·`settings.html`의 [변경] 버튼과 배지는
  그대로다. 시각 참조 동기화는 각 uiux 문서의 미결 목록이 관리한다.
- **문의 목적지가 dev 값**이라는 위 "함께 확인할 것"은 해소되지 않았다. 운영 채널 URL을
  받으면 `eas.json`과 폴백을 함께 고친다.
