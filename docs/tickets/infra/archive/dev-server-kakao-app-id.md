# [INFRA] 개발계 서버의 `KAKAO_APP_ID` 를 개발계 카카오 앱 ID 로

| 항목 | 값 |
|---|---|
| 대상 | 개발계 API(`api-dev.earcast.co.kr`) 환경변수 `KAKAO_APP_ID` — 서버 `/opt/ear/backend/.env.prod` · Secrets Manager `ear/dev/api` |
| 요청 파트 | 인프라 |
| 요청자 | 이주호(FE) |
| 발행 날짜 | 2026-09-20 |
| Jira | [KAN-82](https://runtime364.atlassian.net/browse/KAN-82) |
| 발견 시점 | KAN-80 실기기 확인(2026-09-20 03:36 KST) — 개발계 앱의 카카오 로그인이 iOS·Android 모두 실패. 구글(iOS)·네이버(Android)는 성공 |
| 근거 문서 | `backend/src/modules/auth/providers/kakao.client.ts`(`assertIssuedForOurApp`) · `backend/src/config/env.validation.ts`(`KAKAO_APP_ID`) · `infra/inventory.md` 3장("소셜 앱 ID는 운영과 동일") · `tickets/infra/archive/dev-server-apple-client-id.md`(KAN-77 — 같은 절차) |
| 중요도 | **High**(오늘 안) — 카카오는 가입 비중이 가장 큰 경로다. 이게 막혀 있으면 개발계 앱으로 카카오 계정 흐름을 검증할 수 없고, KAN-80 을 닫지 못한다 |
| 상태 | **완료**(2026-09-20) — PM 실기기 확인 |

## 문제 — 로그로 확정했다

개발계 API 로그(CloudWatch `/ear-dev/api`)에 로그인 시도마다 찍힌다.

```
WARN [KakaoClient] kakao access token was issued for another app { app_id: 1533429 }
```

서버는 카카오 액세스 토큰의 `app_id` 를 `KAKAO_APP_ID` 와 대조한다 — 카카오 토큰에는 대상 앱 정보가 없어서, 이 대조가 구글·애플의 `aud` 검증에 해당하는 자리다. KAN-80 으로 개발계 앱에 심은 네이티브 키(`a67198ac…`)는 **별도 카카오 앱(app_id `1533429`)** 에 속한다. 개발계 서버의 `KAKAO_APP_ID` 는 운영 앱 값 그대로라 거부된다.

**앱은 원인이 아니다** — 네이티브 URL 스킴(APK 매니페스트·iOS Info.plist), preview 채널 OTA 매니페스트의 `extra.socialAuth.kakaoNativeAppKey`, JS 초기화 경로(`Constants.expoConfig`)가 전부 개발계 키로 일치한다. 카카오 동의까지는 통과하고, 서버가 토큰을 거부한다. 재빌드할 일이 아니다.

## 요청 — KAN-77 과 같은 절차

1. 개발계 서버 `/opt/ear/backend/.env.prod` 의 `KAKAO_APP_ID` 를 **`1533429`** 로 바꾼다. 백업을 남긴다(`.env.prod.bak-<날짜>-kakao`).
2. api 컨테이너를 같은 이미지로 재생성한다 — `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-build api`.
3. Secrets Manager `ear/dev/api` 에 같은 키가 있으면 함께 맞춘다 — 다음 배포에서 값이 되돌아가지 않게. `inventory.md` 의 "소셜 앱 ID는 운영과 동일" 문장도 고친다(`changes/`).
4. **운영 서버는 건드리지 않는다.**

## 범위 밖

- 앱 재빌드 — 필요 없다.
- 카카오 콘솔 — 개발계 키의 플랫폼 등록은 끝나 있다(동의 화면까지 통과한다).

## 완료 조건

- Given 개발계 앱(iOS·Android, runtime 4) / When 카카오로 로그인한다 / Then 로그인·가입이 완료되고 API 로그에 `issued for another app` 이 찍히지 않는다
- Given 운영 서버 / When `KAKAO_APP_ID` 를 확인한다 / Then 종전 값 그대로다
- Given 개발계에 다음 배포가 나간 뒤 / When 카카오로 로그인한다 / Then 여전히 성공한다(값이 되돌아가지 않았다)

## 처리 기록

- 2026-09-20 발행. FE 세션에서 서버 값까지 바꾸려 했으나 개발계 키페어(`ear-dev-isb.pem`)가 이 PC 에 없고 인스턴스가 SSM 관리 대상이 아니라 접속 수단이 없었다 — 우회(EC2 Instance Connect 로 임시 키 밀어 넣기)는 하지 않았다.
- 2026-09-20 **완료 — archive 로 옮긴다. 반영 날짜: 2026-09-20.** 인프라 개편 작업에서 개발계 서버의 `KAKAO_APP_ID` 가 개발계 카카오 앱 값으로 맞춰졌다. **PM 이 개발계 앱에서 카카오 로그인 성공을 확인했다**(완료 조건 1). 운영 서버는 건드리지 않았다.
