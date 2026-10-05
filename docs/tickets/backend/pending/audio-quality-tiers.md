# [BE] 음질 3단계(압축·AAC·WAV) 배포 — 콘텐츠별 오디오 3종 저장·티어별 허용 판정·업로드/인프라 확장

| 항목 | 값 |
|---|---|
| 대상 | `backend/domain.md`(오디오 3종 스키마 · `plans` 허용 음질) · 재생 URL 발급(`modules/playback`) · 관리자 업로드(`modules/admin` — `admin.constant.ts` `AUDIO_CONTENT_TYPES`·`MAX_AUDIO_FILE_BYTES`) · 프로필·설정 응답 · `spec/api/`(player·admin·profile·settings) · 인프라(S3·CloudFront·Caddy·파이프라인 웹 프록시·Budgets) |
| 요청 파트 | 백엔드 · 인프라 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-141](https://runtime364.atlassian.net/browse/KAN-141) |
| 발행 날짜 | 2026-10-06 |
| 시작 날짜 | 2026-10-06 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음(티켓). 동작 규칙 문서화(`features/` — 음질 단계·티어별 허용·기본값·미허용 처리)는 이 티켓 착수 때 함께 정한다 |
| 근거 문서 | `features/subscription.md`(티어 정책) · `features/player.md` · `ai/spec/06-audio.md` 7장("Pro 이상 pcm 이면 배포 포맷(wav·AAC)을 다시 정한다") · `tickets/ai/pending/jingle-mono-loudnorm-degradation.md`(KAN-122 — 배포본 스테레오화) |
| 중요도 | Low — PM 발행(2026-10-06). 중요도 미지정이라 이번 주 마감으로 잡았다 — 바꾸려면 Jira·이 표를 함께 고친다. 범위가 커서 이번 주에 스키마·계약 확정까지 가고 구현이 넘어가면 사유를 처리 기록에 적는다 |
| 상태 | 대기 |

## 배경

ElevenLabs Pro 결제로 TTS 원본을 **무손실(PCM → WAV)**로 받을 수 있게 됐다. 지금 배포본은 ElevenLabs mp3 128k를 디코드해 mp3 192k로 다시 인코딩한 것이라 손실을 두 번 거친다(`ai/spec/06-audio.md` 7장 · 2026-10-05 음질 실측 — 16kHz 위 대역이 원본 단계에서 잘려 있다).

**PM 결정(2026-10-06)** — 사용자가 음질을 고른다.

| 음질 | 형식(제안 — 착수 때 확정) | 대략 크기(20분) | Light | Daily | Pro |
|---|---|---|---|---|---|
| 압축 | mp3(지금 형식 — 비트레이트는 확정 필요) | 약 26MB(192k) | ✅ | ✅ | ✅ |
| AAC | m4a AAC 256k 안팎 | 약 40MB | ✅ | ✅ | ✅ |
| WAV | 무손실 PCM 16bit 44.1kHz | 모노 약 106MB · 스테레오 약 212MB | — | — | ✅ |

세 형식 모두 **무손실 마스터에서 한 번씩만** 만든다(파이프라인 몫 — 짝 AI 티켓). 배포본 채널(모노/스테레오)은 KAN-122(징글 스테레오화) 결론을 따른다.

## 무엇을 한다 — 백엔드

1. **스키마** — 콘텐츠당 오디오 3종을 저장한다. 음질별 경로·코덱·비트레이트·바이트 크기·길이. 지금 `contents.audio_path` 하나 구조를 어떻게 넓힐지(별도 테이블 vs 컬럼) `domain.md`에 먼저 적는다. 재발행(`content_version`)은 3종이 함께 바뀐다.
2. **허용 음질 판정 — 서버가 한다**(CLAUDE.md "판정은 서버") — 티어별 허용 음질은 `plans`에서 조립한다(티어명 하드코딩 금지). 재생 URL 발급 때 요청 음질을 판정하고, 허용되지 않으면 계약된 동작(허용 최상위로 대체 vs 에러 코드)을 `spec/api/`에 정해 따른다. 구독 만료로 티어가 내려가면 다음 발급부터 바로 반영된다.
3. **노출** — 프로필·설정(또는 재생 발급) 응답에 **허용 음질 목록과 현재 선택값**을 싣는다. 앱은 선택지 표시만 한다. 선택값 저장 위치(서버 사용자 설정 vs 기기 로컬)를 정한다 — 기기 간 일관성을 원하면 서버.
4. **관리자 업로드** — 3종을 한 번에 받는다. `AUDIO_CONTENT_TYPES`에 wav(`audio/wav`) 추가, `MAX_AUDIO_FILE_BYTES`(현 200MB) 상향 — 스테레오 WAV 212MB 이상 + 여유. 길이 검증(`audio-probe`)은 3종이 같은 길이인지 대조한다. `admin-api.md` 갱신.
5. **기존 발행분** — 3종이 없는 콘텐츠(지금 40편)의 처리: 압축만 있는 콘텐츠는 AAC·WAV 요청 시 압축으로 대체 · 재렌더 계획은 AI 파트와 맞춘다.

## 무엇을 한다 — 인프라

1. **S3** — 편당 저장량이 26MB → 약 170~280MB(3종)로 는다. 백업 버킷·EBS 스냅샷·`sync-content-*` 스크립트 영향 확인.
2. **CloudFront** — WAV 재생은 전송량이 지금의 4~8배다. Pro 비율 가정으로 월 전송량·비용을 추정하고 Budgets 임계값을 다시 잡는다. 압축은 계속 끈다(`Compress: false`), Range 요청 확인.
3. **업로드 경로 본문 한도** — Caddy(`deploy/caddy`) · 파이프라인 웹 `/api/ear` 프록시(Next.js 본문 한도) · multipart 타임아웃이 200MB 이상을 통과하는지.
4. **재생 시작 지연** — WAV 첫 바이트·버퍼링 시간을 LTE 기준으로 실측해 처리 기록에 남긴다.

## 짝 티켓

- **AI(파이프라인) — KAN-142**(`tickets/ai/pending/lossless-master-three-renditions.md`, 박수헌) — 무손실 마스터(PCM 요청 — 지금 화자별 배속 경로는 `synthDialogueWithTimestamps`가 mp3 를 강제한다 `elevenlabs.ts`)에서 3종 렌더·업로드 패키지 확장
- **FE — KAN-143**(`tickets/frontend/pending/audio-quality-selection-ui.md`, 이주호 — 이 티켓에 blocked) — 음질 선택 UI(설정/플레이어), 허용 안 된 음질 표시(잠금·업셀), 재생 URL 요청에 음질 전달

## 완료 조건

- Given `domain.md`·`spec/api/` / When 읽는다 / Then 오디오 3종 스키마, 티어별 허용 음질(`plans`), 미허용 요청 동작, 응답 필드가 적혀 있다
- Given Light·Daily 계정 / When WAV 재생 URL 을 요청한다 / Then 서버가 계약대로 대체하거나 거절하고, 압축·AAC 는 정상 발급된다
- Given Pro 계정 / When 세 음질을 각각 요청한다 / Then 각 음질의 서명 URL 이 발급되고 재생된다
- Given Pro 구독 만료로 Daily 가 된 계정 / When 다음 재생 URL 을 요청한다 / Then WAV 가 더는 발급되지 않는다
- Given 관리자 업로드 / When 스테레오 WAV(약 212MB)를 포함한 3종을 올린다 / Then 업로드·저장·길이 검증이 통과한다(Caddy·프록시 포함 종단)
- Given 인프라 / When 처리 기록을 본다 / Then S3·CloudFront 월 비용 추정과 갱신한 Budgets 임계값, WAV 재생 시작 지연 실측이 있다
