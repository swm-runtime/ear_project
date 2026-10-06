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
| 상태 | 백엔드 구현 완료(2026-10-06) · 같은 날 AI 파트 확정(FLAC·기본 음질) 반영 · 인프라 항목 일부 남음(아래) |

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

## 처리 기록

### 2026-10-06 — 결정(착수 때 확정하기로 한 것들)

| 항목 | 결정 | 근거 |
|---|---|---|
| 스키마 | 별도 테이블 `content_audio_renditions`(콘텐츠 × 음질 행). `contents.audio_path`는 압축 음질 경로를 복제해 유지 | 음질이 늘 때 컬럼이 아니라 행이 는다. 기존 코드·"압축은 반드시 있다" 불변식 유지(`domain.md` 5.1-1 · 5.8) |
| 허용 음질 | `plans.max_audio_quality` — light·daily·**trial** = aac, pro = lossless | 티어명 하드코딩 금지. 가입 체험은 재생 한도만 풀고 음질은 무료와 같다(`domain.md` 8.1) |
| 미허용 요청 | **거절하지 않고 깎는다** — 허용 최대 → 보유 최고. 응답에 `quality`·`requested_quality`·`fallback_reason`(`not_allowed`/`not_available`)·`available_qualities` | 음질 때문에 재생이 멈추지 않는다. 잠금·구독 안내는 `not_allowed`로 FE가 그린다(`player.md` 4.9) |
| 선택값 저장 | **서버** `user_settings.preferred_audio_quality`(기본 compressed). PATCH `/users/me/settings`로 바꾸고 허용 밖 값도 저장 | 기기 간 일관성, 구독 뒤 그대로 적용. 재생은 서버가 깎으므로 저장은 자유 |
| 선택지 노출 | 설정 응답 `settings.audio_qualities[{quality, allowed}]` + `preferred_audio_quality`. `entitlements.max_audio_quality` | `settings-api.md` 4.1 · `subscription-api.md` 2장 |
| 업로드 | 파트 `audio`(압축, 필수) · `audio_aac`(m4a) · `audio_lossless`(wav), 파일당 ≤320MB, 길이 ±1초 대조, 메타(코덱·비트레이트·채널·샘플레이트·크기)는 서버가 파일에서 읽어 기록 | `admin-api.md` 4.6·4.10. 재발행은 3종을 한 세트로 — `audio` 없이 다른 음질만 오면 400 |
| 기존 발행분 | 마이그레이션이 `compressed` 행을 백필(코덱은 확장자로, 나머지 NULL). AAC·WAV 요청은 `not_available`로 압축 재생 | 재렌더는 KAN-142 |
| 재생 중 갱신 | 갱신 호출이 처음 응답의 `quality`를 되돌려 보낸다 — 중간에 음질이 바뀌지 않는다 | 파일이 바뀌면 위치가 어긋난다 |

### 2026-10-06 — 백엔드 구현

- 마이그레이션 `1788700000000-AddAudioQualityTiers`(테이블 + 백필 + `plans`·`user_settings` 컬럼). 로컬 적용·되돌리기 확인.
- 판정 `playback/audio-quality.policy.ts`(순수 함수) · 발급 `AudioUrlService`(설정 선택값 → 저장 티어 허용 최대 → 보유 음질) · 설정 PATCH/GET · 관리자 업로드 3종(검증·업로드·행 교체·재발행 시 옛 파일 전부 삭제·회수 정리에 포함).
- 검증: 단위 전체 1,337건 통과. 로컬 API 실측 — 무료 계정이 무손실을 고르면 `not_allowed`로 압축 발급 · pro 계정은 파일이 없으면 `not_available`, 있으면 무손실 URL 발급 · 설정에 잘못된 값은 400.
- **로컬 모드(`AUDIO_DELIVERY=local`, 개발용)**는 음질과 무관하게 `contents.audio_path`(압축)를 스트리밍한다 — 운영(CloudFront)에는 해당 없음.

### 인프라 항목 — 확인한 것 / 남은 것

- **업로드 경로 본문 한도**: Caddy는 기본값에 요청 본문 상한이 없다(`request_body max_size` 미설정) — 320MB 통과. multer `fileSize`를 320MB로 올렸다. **파이프라인 웹 `/api/ear` 프록시(Next.js)의 본문 한도는 AI 파트 확인 필요**(KAN-142에서 3종을 보내게 될 경로).
- **메모리**: 업로드는 디스크 임시 파일 → S3 스트림 업로드라 파일 크기와 무관하게 약 20MB. 임시 디스크는 파일 크기만큼(운영 여유 16GB).
- **S3·CloudFront 비용 추정**(2026-10-06): 발행분 40편 × 3종 ≈ 40 × 280MB = 11GB 저장(월 약 $0.3). 전송은 Pro 비율에 좌우 — 완청 1회 WAV 약 150MB(13분)로, 무료 구간 1TB를 다 쓰는 데 WAV 완청 약 7,000회. 현재 하루 청취 20편 수준에서는 전원이 WAV를 들어도 월 90GB라 무료 구간 안이다. **Budgets 임계값 조정은 AWS 콘솔 작업으로 남음**(현재 임계는 inventory.md).
- **남은 것**: WAV 재생 시작 지연 LTE 실측(실기기·KAN-143 뒤) · 스테레오 WAV 212MB 종단 업로드(실파일, KAN-142 산출물로) · Budgets 임계 재설정.

### 2026-10-06 — AI 파트 확정 반영(Jira 댓글 "[AI → BE] 음질 확정 반영 요청", PR `fix(be)/audio-quality-flac-default`)

박수헌의 결정: **Light·Daily = AAC 192k, Pro = FLAC(무손실)**. 파이프라인은 무손실 마스터에서 `audio`(m4a AAC 192k)와 `audio_lossless`(FLAC)만 렌더하고 `audio_aac`는 올리지 않는다. 요청 4건을 이렇게 반영했다.

| 요청 | 반영 | 판단 |
|---|---|---|
| 1. `lossless`에 flac 추가, wav 유지 여부 | `LOSSLESS_AUDIO_CONTENT_TYPES = { flac: 'audio/flac' }` — **wav 제거**. `MAX_AUDIO_FILE_BYTES` **320MB → 200MB 복귀** | 한 포맷만 받아야 운영이 단순하고, WAV 는 같은 음질에 네 배 크기라 받을 이유가 없다. 20분 스테레오 FLAC ≈45MB 라 200MB 로 넉넉하다. 프록시 본문 한도 걱정(아래 인프라 항목)도 함께 사라진다 |
| 2. 문서 | `domain.md` 1.3-1(형식 열: compressed = m4a AAC 192k · aac = 렌더 안 함 · lossless = FLAC) · 3.5 · `admin-api.md` 4.6 · `settings-api.md` 4.1·4.2 · `player-api.md` 4.1 · `player.md` 4.9 · `subscription.md` 4.1 | — |
| 3. FE 선택지 두 가지 | 설정 응답 `audio_qualities`가 **렌더되는 음질만**(`compressed` · `lossless`) 내려준다 — `OFFERED_AUDIO_QUALITIES`. `aac`는 enum 값으로 남기되(판정·저장값 호환) 선택지에서 숨긴다 | FE 가 "aac 숨기기"를 하드코딩하지 않게 서버가 목록을 좁힌다 |
| 4. 기본 음질 = 허용 최고, "고른 적 없음" 구분 | `user_settings.preferred_audio_quality`를 **NULL 허용**으로 바꾸고(마이그레이션 `MakePreferredAudioQualityNullable` — 기존 행 전부 NULL. 앱에 선택 UI 가 없어 고른 값이 있을 수 없다) NULL = 고른 적 없음. 발급·설정 응답은 `preferredAudioQuality ?? defaultAudioQualityFor(maxAllowed)` — **허용하는 가장 높은 선택지**(Pro → lossless, 허용 최대 `aac`인 티어 → compressed. `aac`는 선택지가 아니라 늘 `not_available`로 깎일 요청을 기본으로 만들지 않는다). 설정 PATCH 에 `null`을 보내면 자동으로 되돌린다. 응답 `preferred_audio_quality`는 늘 구체 값(적용 중인 음질)이고 PATCH 응답에도 실린다 | 컬럼을 하나 더 두는 대신 NULL 로 구분 — "고른 적 없음"은 값이 없는 상태다 |

**확인** — 단위: `admin-content.service.spec`(flac 수신·wav 거부), `settings.orchestrator.spec`(선택지 2개, 고른 적 없음 → 티어별 기본, null 되돌리기), `audio-url.service.spec`(설정 null → Pro 는 lossless 발급), `audio-quality.policy.spec`(`defaultAudioQualityFor`). 43 스위트 374건 통과.

**인프라 항목 갱신** — WAV 가 빠져 "212MB 종단 업로드"·"320MB 프록시 한도" 확인은 **불필요**해졌다. 남은 것은 ① FLAC 포함 3종(실제로는 2종) 종단 업로드 확인(KAN-142 산출물로) ② FLAC 재생 시작 지연 LTE 실측(KAN-143 뒤) ③ Budgets 임계 — FLAC 은 WAV 의 22%라 지금 규모에서는 더 급하지 않다.

**다른 파트** — KAN-142(박수헌): flac 허용이 **운영에 배포된 뒤** FLAC 전송을 켠다(댓글의 일정 그대로). KAN-143(이주호): 선택지는 설정 응답의 두 개 그대로 그린다, `preferred_audio_quality`는 늘 구체 값, "자동으로 되돌리기"가 필요하면 PATCH `null`.
