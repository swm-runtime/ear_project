# 이어 인스타 릴스 자동화

매일 08:00(KST) 앱에 발행된 편 하나로 30~60초 릴스를 만들고, 사람이 승인하면 인스타그램에 올린다.
인스타 팔로워를 늘리는 마케팅 도구다 — 제품 코드(`frontend/`·`backend/`)·콘텐츠 파이프라인(`pipeline/`)과 섞지 않는다.

```
GitHub Actions(reels-daily, 매일 08:00)
  build ─ 발행된 편 고르기(파이프라인 Supabase: backlog.status=published, 안 쓴 편 중 최근 발행)
        ─ 재료 받기(파이프라인 S3 episodes/<id>/: script-segments.json · script-sections.json · audio/dist.m4a · thumbnail.png)
        ─ 구간·문구 고르기(OpenAI 텍스트 모델 — 인트로·마무리 제외, 앞 맥락 없이 이해되는 25~60초)
        ─ 그림 3장(OpenAI 이미지 모델, 브랜드 색·글자 없음) — 실패하면 편 원본 그림(thumbnail-raw.png, 없으면 thumbnail.png)
        ─ 합성(ffmpeg: 천천히 확대되는 그림 + 제목 + 화자별 자막 + 파형 + 끝 카드)
        ─ S3 marketing/reels/<날짜>/ 업로드 → Slack 미리보기(12시간 링크 + 승인 링크)
  publish ─ 환경 reels-publish 승인 대기 → 인스타 릴스 게시 → Slack 에 게시 주소
```

- **같은 편은 다시 쓰지 않는다.** 게시한 편은 영영, 제안만 하고 게시 안 한 편은 30일 동안 건너뛴다(`marketing/reels/state.json`).
- **인트로를 쓰지 않는다.** 첫 재생의 45%가 30초 안에 끄는데, 그 30초가 고정 인사말이다(2026-10-28 운영 DB 집계).
- 글로벌판(`G…` 편)은 영어라 건너뛴다.

## 처음 한 번 설정 (사람 손)

1. **인스타 계정을 프로페셔널(비즈니스 또는 크리에이터)로 바꾼다.** 인스타 앱 → 설정 → 계정 유형.
2. **Meta 앱과 토큰.** [developers.facebook.com](https://developers.facebook.com) → 앱 만들기 → 제품 "Instagram" →
   "Instagram API with Instagram login". 권한 `instagram_business_basic` · `instagram_business_content_publish`.
   앱 역할(Instagram 테스터)에 우리 계정을 넣고 토큰을 만든다 — **장기 토큰(60일)** 과 **Instagram 사용자 ID** 가 나온다.
   자기 계정에만 올리므로 앱 검수 없이 개발 모드로 쓴다.
3. **토큰을 AWS SSM 에 넣는다.** 채팅·Slack·커밋에 붙이지 않는다.
   ```
   aws ssm put-parameter --name /earcast/reels/ig-token --type SecureString --value '<장기 토큰>'
   ```
   이후 갱신은 게시할 때 자동이다(7일 넘으면 새 토큰으로 덮어쓴다). 60일 넘게 한 번도 게시하지 않으면 만료되니 다시 넣는다.
4. **GitHub 설정** (Settings → Secrets and variables → Actions)
   | 종류 | 이름 | 값 |
   |---|---|---|
   | secret | `PIPELINE_SUPABASE_URL` | 파이프라인 Supabase 주소 |
   | secret | `PIPELINE_SUPABASE_SERVICE_ROLE_KEY` | 파이프라인 Supabase 서비스 키(읽기만 쓴다) |
   | secret | `OPENAI_API_KEY` | OpenAI 키 |
   | secret | `REELS_SLACK_WEBHOOK_URL` | 미리보기를 받을 채널의 Incoming Webhook |
   | variable | `IG_USER_ID` | 2번의 Instagram 사용자 ID |
   | variable | `REELS_ENABLED` | `true` — 이게 있어야 매일 예약 실행한다 |
5. **승인 환경.** Settings → Environments → `reels-publish` 만들기 → Required reviewers 에 승인할 사람.
6. **AWS 역할 `ear-ci-reels`** (OIDC — dev 브랜치와 환경 reels-publish 만 신뢰). 권한은 아래 셋뿐이다.
   - 파이프라인 버킷 `episodes/*` 읽기, `marketing/reels/*` 읽기·쓰기
   - SSM 파라미터 `/earcast/reels/ig-token` 읽기·쓰기

## 수동 실행

- GitHub → Actions → reels-daily → Run workflow. 편 ID 를 넣으면 그 편으로, `no_images` 를 켜면 그림 없이 썸네일로.
- 로컬에서 영상만 확인 (AWS SSO 로그인, ffmpeg 필요):
  ```
  pip install -r requirements.txt
  python main.py build --local --episode X260919-001 --no-ai     # 모델 없이 첫 본문 단락, 썸네일 배경
  OPENAI_API_KEY=... python main.py build --local --episode X260919-001   # 모델이 구간·문구·그림
  python main.py build --local --episode S261003-012 --pick pick.json   # 사람이 고른 구간·문구
  ```
  `pick.json` 은 `{start_idx, end_idx, title, caption, reason}` — 줄 번호는 `script-segments.json` 순서다.
  결과는 `out/<날짜>/reel.mp4` (커밋하지 않는다).

## 조절 값 (환경 변수)

| 변수 | 기본 | 뜻 |
|---|---|---|
| `REELS_CLIP_MIN_SEC` · `REELS_CLIP_MAX_SEC` | 25 · 60 | 구간 길이(끝 카드 2.8초 별도) |
| `REELS_IMAGE_COUNT` | 3 | 그림 수 |
| `REELS_TEXT_MODEL` · `REELS_IMAGE_MODEL` · `REELS_IMAGE_QUALITY` | gpt-6.1-sol · gpt-image-2 · medium | 파이프라인과 같은 모델 |
| `REELS_REPROPOSE_AFTER_DAYS` | 30 | 게시 안 한 후보를 다시 제안하기까지 |
| `IG_API_VERSION` | v23.0 | Graph API 버전 |
