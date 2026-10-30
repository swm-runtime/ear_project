"""릴스 파이프라인 설정 — 전부 환경 변수. 값이 없으면 그 단계를 쓰는 명령만 실패한다."""
import os

AWS_REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
# 원본(대본·자막·오디오·썸네일)은 콘텐츠 파이프라인 S3 에 있다(docs/ai/spec/07-publish.md)
PIPELINE_BUCKET = os.environ.get("PIPELINE_BUCKET", "earcast-pipeline-prod")
# 운영 오디오 버킷 — Supabase 자격이 없을 때 발행 여부를 여기 올라간 파일 크기로 가린다(source._published_by_audio)
AUDIO_BUCKET = os.environ.get("AUDIO_BUCKET", "earcast-audio-prod")
# 산출물(영상·메타·상태)은 같은 버킷의 이 접두사 아래에만 쓴다
REELS_PREFIX = os.environ.get("REELS_PREFIX", "marketing/reels").strip("/")

# 발행 여부의 원본 — 파이프라인 Supabase backlog.status = 'published'
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
# 파이프라인과 같은 모델을 기본값으로 둔다(pipeline/apps/worker/src/config.ts)
TEXT_MODEL = os.environ.get("REELS_TEXT_MODEL", "gpt-6.1-sol")
IMAGE_MODEL = os.environ.get("REELS_IMAGE_MODEL", "gpt-image-2")
IMAGE_QUALITY = os.environ.get("REELS_IMAGE_QUALITY", "medium")
IMAGE_SIZE = os.environ.get("REELS_IMAGE_SIZE", "1024x1536")
IMAGE_COUNT = int(os.environ.get("REELS_IMAGE_COUNT", "3"))

# 구간 길이(초) — 릴스는 짧을수록 끝까지 본다
CLIP_MIN_SEC = float(os.environ.get("REELS_CLIP_MIN_SEC", "25"))
CLIP_MAX_SEC = float(os.environ.get("REELS_CLIP_MAX_SEC", "60"))
# 같은 편을 다시 제안하지 않는 기간(일)
REPROPOSE_AFTER_DAYS = int(os.environ.get("REELS_REPROPOSE_AFTER_DAYS", "30"))

SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")
# 승인 화면 주소(Actions 실행 페이지). 로컬 실행이면 비어 있다
RUN_URL = os.environ.get("RUN_URL", "")

# Instagram API with Instagram Login — 프로페셔널 계정의 장기 토큰은 SSM SecureString 에 둔다(60일, 자동 갱신)
IG_USER_ID = os.environ.get("IG_USER_ID", "")
IG_TOKEN_PARAM = os.environ.get("IG_TOKEN_PARAM", "/earcast/reels/ig-token")
IG_GRAPH_HOST = os.environ.get("IG_GRAPH_HOST", "graph.instagram.com")
IG_API_VERSION = os.environ.get("IG_API_VERSION", "v23.0")
# 토큰은 발급 24시간 뒤부터 갱신할 수 있다 — 이 일수보다 오래됐으면 게시 전에 갱신한다
IG_TOKEN_REFRESH_DAYS = int(os.environ.get("IG_TOKEN_REFRESH_DAYS", "7"))

WIDTH, HEIGHT, FPS = 1080, 1920, 30
# 브랜드 색 — 쇼츠 첫 제작(2026-09)과 같은 다크 네이비·오프화이트·코랄
NAVY = (16, 22, 38)
IVORY = (246, 241, 232)
CORAL = (255, 122, 89)
# 화자별 자막 색
SPEAKER_COLORS = {"이음": CORAL, "윤아": IVORY}
