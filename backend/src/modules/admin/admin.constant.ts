/**
 * admin.md 미결 "업로드 대상 파일 규격" — 상한은 아직 확정되지 않았다. 여기 값은 서버 보호용
 * 임시 상한이며, 규격이 확정되면 이 상수만 바꾼다.
 */
// 음질별 파일 하나하나에 적용된다(admin-api.md 4.6). 2026-10-06 KAN-141 에서 WAV 를 위해 320MB 로 올렸다가
// 무손실을 FLAC 으로 확정하며(20분 스테레오 약 45MB) 200MB 로 되돌렸다 — 업로드 경로의 본문 한도도 이 값에 맞춘다
export const MAX_AUDIO_FILE_BYTES = 200 * 1024 * 1024;
/** 음질 3종의 길이 허용 오차 — 같은 마스터에서 렌더한 파일이라 반올림 차이만 난다(domain.md 5.8) */
export const AUDIO_DURATION_TOLERANCE_SEC = 1;
export const MAX_THUMBNAIL_FILE_BYTES = 5 * 1024 * 1024;
/**
 * 시리즈 표지 경로(`PUT /admin/series/:id/cover`, KAN-234)의 multer 수신 상한 — 서버 보호용. 표지 자체의 상한은
 * `MAX_THUMBNAIL_FILE_BYTES`(콘텐츠 썸네일과 같음)이고 서비스가 400 으로 거절한다. 이보다 크면 multer 가 413 을 준다
 */
export const MAX_SERIES_COVER_RECEIVE_BYTES = 4 * MAX_THUMBNAIL_FILE_BYTES;

/** enrichment.json — 벡터 1536개 float라도 수십 KB다. 1MB면 넉넉한 보호 상한 */
export const MAX_ENRICHMENT_FILE_BYTES = 1 * 1024 * 1024;

/**
 * 대본 세그먼트 파일(`script_file`, admin-api.md 4.6) 상한. 20분 에피소드가 턴 100~200개·본문 20~40KB 라
 * 2MB면 넉넉하다. 세그먼트 수·글자 수 상한은 화면(대본 패널)이 그릴 수 있는 규모를 크게 웃도는 방어값이다.
 */
export const MAX_SCRIPT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_SCRIPT_SEGMENTS = 2000;
export const MAX_SCRIPT_TEXT_LENGTH = 2000;
export const MAX_SCRIPT_SPEAKER_LENGTH = 50;
/**
 * 구간 제목(`sections`, KAN-144) 상한. 대본 구간 4~8개 + 인트로·도입·마무리 = 한 편에 7~11개(90편 실측 중앙값 5개).
 * 30은 그 세 배다 — 넘으면 구간이 아니라 세그먼트를 보낸 것이다. 제목은 미니 플레이어 한 줄에 들어가야 한다
 */
export const MAX_SCRIPT_SECTIONS = 30;
export const MAX_SCRIPT_SECTION_TITLE_LENGTH = 60;
/** 구간 요약 한 줄(KAN-151, PM 2026-10-07 "제목 + 요약 한 줄"). 파이프라인은 공백 포함 20자 이내로 만든다 — 상한은 여유 */
export const MAX_SCRIPT_SECTION_SUMMARY_LENGTH = 40;

/** admin.md 3.1 — 압축 음질(`compressed`) mp3 / m4a */
export const AUDIO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};

/** 고음질(`aac`) — m4a AAC (admin-api.md 4.6, KAN-141). 파이프라인은 이 파트를 올리지 않는다(압축이 이미 AAC 192k) — 계약만 남겨 둔다 */
export const AAC_AUDIO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  m4a: 'audio/mp4',
};

/** 무손실(`lossless`) — FLAC (admin-api.md 4.6, 2026-10-06 확정). WAV 는 받지 않는다 — 같은 음질에 네 배 크기다 */
export const LOSSLESS_AUDIO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  flac: 'audio/flac',
};

/**
 * 저장소에 올릴 때 붙이는 Content-Type — **음질 3종의 확장자 전부**다. 저장 계층은 음질을 모르고 확장자만
 * 받으므로 세 표를 합쳐 둔다. 압축 음질 표만 보던 때는 무손실 확장자(`flac`)가 없어 무손실 파일이 Content-Type 없이 저장됐다
 * (2026-10-06). 음질별 "받을 수 있는 형식" 판정은 위의 세 표가 그대로 한다.
 */
export const STORED_AUDIO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ...AUDIO_CONTENT_TYPES,
  ...AAC_AUDIO_CONTENT_TYPES,
  ...LOSSLESS_AUDIO_CONTENT_TYPES,
};

export const THUMBNAIL_CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * 저장되는 썸네일의 규격(admin-api.md 4.6, 2026-09-19) — 입력 형식과 무관하게 서버가 이 규격으로 다시 쓴다.
 * 긴 변 768px 는 플레이어 아트워크(3x 약 1080px)에 무리 없고 격자 타일(약 180pt)에 넉넉한 값이다.
 * 1024px PNG 1.5MB 가 60~100KB 로 준다. `ThumbnailImage` 주석에 이유가 있다.
 */
export const THUMBNAIL_MAX_EDGE_PX = 768;
export const THUMBNAIL_WEBP_QUALITY = 82;
export const THUMBNAIL_OUTPUT_EXTENSION = 'webp';
export const THUMBNAIL_OUTPUT_CONTENT_TYPE = 'image/webp';

/** 관리자 목록 페이지 크기 (convention.md 3.3 — 기본 20 / 최대 50) */
export const ADMIN_LIST_DEFAULT_LIMIT = 20;
export const ADMIN_LIST_MAX_LIMIT = 50;

/** 저장소 키의 무작위 부분 길이(hex). 제목이 URL·DB에 새지 않게 한다(deploy/upload-audio.sh와 동일) */
export const STORAGE_KEY_RANDOM_BYTES = 16;

export const AUDIO_KEY_PREFIX = 'audio/';
export const THUMBNAIL_KEY_PREFIX = 'thumb/';

/** audit_logs.action 값 */
export const AUDIT_ACTION_CONTENT_UPLOAD = 'content.upload';
export const AUDIT_ACTION_CONTENT_REPUBLISH = 'content.republish';
/** 재발행 없이 추천 메타 파일만 반영한 경우 — 버전이 오르지 않아 republish와 구분한다 */
export const AUDIT_ACTION_CONTENT_ENRICH = 'content.enrich';
/** 대본 파일 단독 재발행 — 버전을 올리지 않는 메타 반영(enrich 와 같은 성격, KAN-71) */
export const AUDIT_ACTION_CONTENT_SCRIPT = 'content.script';
/** 기존 썸네일을 저장 규격(WebP 768px)으로 다시 써서 교체 — `scripts/reprocess-thumbnails.ts`(2026-09-19). 버전은 오르지 않는다 */
export const AUDIT_ACTION_CONTENT_THUMBNAIL_REPROCESS =
  'content.thumbnail_reprocess';
export const AUDIT_ACTION_CONTENT_WITHDRAW = 'content.withdraw';
export const AUDIT_ACTION_CONTENT_RESTORE = 'content.restore';
/**
 * 저장소 파일 회수 — **되돌릴 수 없다.** 파일이 사라진 뒤 그 콘텐츠가 왜 재생되지
 * 않는지를 이 기록으로만 설명할 수 있다
 */
export const AUDIT_ACTION_CONTENT_PURGE_STORAGE = 'content.purge_storage';
export const AUDIT_ACTION_TOPIC_CREATE = 'topic.create';
export const AUDIT_ACTION_TOPIC_UPDATE = 'topic.update';
export const AUDIT_ACTION_TOPIC_DELETE = 'topic.delete';
/** 공지 관리(admin-api.md 4.12~4.15, KAN-67) — 누가 언제 무엇을 게시·수정·삭제했는지는 이 기록만 안다(작성자 컬럼 없음) */
export const AUDIT_ACTION_NOTICE_CREATE = 'notice.create';
export const AUDIT_ACTION_NOTICE_UPDATE = 'notice.update';
export const AUDIT_ACTION_NOTICE_DELETE = 'notice.delete';
/** 초대 코드 관리(admin-api.md 4.23, 2026-10-10) — 코드 테이블에 작성자 컬럼이 없어 누가 만들고 고쳤는지는 감사 로그만 안다 */
export const AUDIT_ACTION_INVITE_CODE_CREATE = 'invite_code.create';
export const AUDIT_ACTION_INVITE_CODE_UPDATE = 'invite_code.update';
/** 시리즈 관리(KAN-134) — `series`에 작성자 컬럼이 없어 누가 만들고 고쳤는지는 감사 로그만 안다 */
export const AUDIT_ACTION_SERIES_CREATE = 'series.create';
export const AUDIT_ACTION_SERIES_UPDATE = 'series.update';
/** 시리즈 표지 교체(KAN-234, 2026-10-21) — 제목·편수 수정(`series.update`)과 따로 남긴다. 파일 업로드라 경로·실패 양상이 다르다 */
export const AUDIT_ACTION_SERIES_COVER = 'series.cover';
/**
 * 노출 가능 콘텐츠가 0건이 된 주제의 자동 숨김(admin.md 4.5, KAN-58).
 *
 * 관리자 토글(`topic.update`)과 **다른 액션으로 남긴다.** 시스템이 바꾼 경우를 구분하지 못하면
 * "누가 이 주제를 숨겼나"에 답할 수 없다.
 */
export const AUDIT_ACTION_TOPIC_AUTO_HIDE = 'topic.auto_hide';
/**
 * 서비스 지표 "추천 검증" — 관리자가 한 사용자의 청취·편성·추천 계산을 열람했다(`GET /admin/insights/recommendations/users/:userId`,
 * 2026-10-22). 쓰기가 없는 조회지만 **개인 단위 행동 기록의 열람**이라 남긴다 — target `user:<user_id>`. 누가 언제 누구를 봤는지는
 * 이 기록만 안다(개인정보 보호법 — 처리 목적 "콘텐츠 편성과 추천 · 서비스 개선" 안의 열람인지 사후에 확인할 근거).
 */
export const AUDIT_ACTION_INSIGHTS_RECOMMENDATION_VIEW =
  'insights.recommendation_view';
/**
 * 편성 미리보기 — 관리자가 한 사용자의 지금 시점 편성 계산(관심 주제·취향·신호·후보 점수)을 열람했다(`GET /admin/drip/preview`,
 * 2026-10-22). 추천 검증(`insights.recommendation_view`)과 같은 이유로 남긴다 — target `user:<user_id>`.
 */
export const AUDIT_ACTION_DRIP_PREVIEW_VIEW = 'drip.preview_view';
/** 자동 숨김을 배치가 수행했을 때의 감사 로그 actor — 사람이 아닌 실행 주체를 명시한다 */
export const SYSTEM_AUDIT_ACTOR = 'system';

/**
 * 서비스 지표 요약(`admin-api.md` 4.22 — 로그 콘솔 "서비스 지표" 탭). 추이 창(일)의 기본·상한과 순위 길이.
 * 순위 15 — 화면 한 표에 스크롤 없이 들어가는 길이이고, 그 아래는 개별 사용자·콘텐츠를 들여다보는 일이라
 * 집계 대시보드의 몫이 아니다(2026-10-08 사용자 요청 "top 10~15").
 */
export const INSIGHTS_SUMMARY_DEFAULT_DAYS = 14;
export const INSIGHTS_SUMMARY_MAX_DAYS = 90;
export const INSIGHTS_RANK_LIMIT = 15;
/**
 * "최근 하루 인기 콘텐츠" 창(시간) — 지금부터 24시간 전까지 굴러가는 창이다(달력일이 아니다). 자정 직후에 열어도 비지 않고,
 * "어제 무엇이 잘 나갔나"를 언제 열든 같은 길이로 본다(2026-10-18 FE 요청 "최근 하루 어떤 콘텐츠가 인기 있었는지").
 */
export const INSIGHTS_RECENT_CONTENT_HOURS = 24;
/** 리텐션을 재는 가입 뒤 일수 — D1·D7·D30(앱 업계 관행) */
export const INSIGHTS_RETENTION_DAYS: readonly number[] = [1, 7, 30];
/**
 * 코호트 리텐션 표 — 일별은 최근 14일 가입자의 D1·D7, 주별은 최근 8주(이번 주 포함) 가입자의 W1~W4. 광고로 유입을 늘리는
 * 구간에 "들어온 사람이 남는가"를 묶음별로 보려는 표다(2026-10-18 멘토 조언 — 절대수치와 비율을 같이). W4 는 가입 28~34일 뒤라
 * 8주면 성숙한 행이 3~4개 생긴다.
 */
export const INSIGHTS_COHORT_DAILY = {
  count: 14,
  span: 1,
  offsets: [1, 7],
} as const;
export const INSIGHTS_COHORT_WEEKLY = {
  count: 8,
  span: 7,
  offsets: [1, 2, 3, 4],
} as const;
/**
 * 일별 접속자를 세션에서 바로 셀 수 있는 날 수 — 오늘 포함 최근 이 일수의 KST 달력일(오늘 - 29일 ~ 오늘).
 * 세션 행은 만료·폐기 30일 뒤 지워지므로(`SessionPurgeScheduler`) "지금 - 30일" 이후 발급분은 모두 남아 있고, 그 시각이 걸친
 * 날(오늘 - 30일)은 일부가 지워졌다. 저장 표(`daily_active_users`)에 없는 날 중 이 범위만 바로 세고, 그 앞은 `null`(기록 없음)이다.
 * 마이그레이션 `1790800000000` 백필이 같은 경계(실행일 - 29일)를 쓴다.
 */
export const INSIGHTS_LIVE_ACTIVE_DAYS = 29;
/** 요일 라벨 — ISO 요일(1 = 월 … 7 = 일) 순 */
export const INSIGHTS_WEEKDAY_LABELS: readonly string[] = [
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
  '일',
];

/**
 * 가입 퍼널(`GET /admin/insights/funnel`, 로그 콘솔 "실험 지표" 탭, 2026-10-28) 의 정의값 — "가입한 사람은 어느 단계에서 가장 많이
 * 빠지나". 정의를 바꾸려면 여기 한 곳만 고친다 — 화면은 응답의 `habit_min_play_days`를 그대로 읽는다.
 */
/** 가입 주 묶음 수 — 기본 8주(이번 주 포함), 4~12 */
export const FUNNEL_DEFAULT_WEEKS = 8;
export const FUNNEL_MIN_WEEKS = 4;
export const FUNNEL_MAX_WEEKS = 12;
/** "가입 뒤 첫 재생"의 빠른 창(시간) */
export const FUNNEL_FIRST_PLAY_HOURS = 24;
/** "첫 14일 습관" — 가입 뒤 이 일수(×24시간) 안에 서로 다른 서비스 날짜 `FUNNEL_HABIT_MIN_PLAY_DAYS`일 이상 들었다 */
export const FUNNEL_HABIT_WINDOW_DAYS = 14;
export const FUNNEL_HABIT_MIN_PLAY_DAYS = 3;

/**
 * 길이별 완청률(`GET /admin/insights/completion-by-length`, 로그 콘솔 "실험 지표" 탭, 2026-10-28) — "길수록 진짜 덜 끝까지 듣나".
 * 편마다 시작한 사람이 적어(11분짜리 한 편에 2명이 시작해 0명 완청 → 0%) 날것의 비율은 흔들린다. 그래서 추세는 로지스틱 회귀로,
 * 편별 점은 경험적 베이즈 축소로 보인다.
 */
/** 한국 콘텐츠만 본다 — 글로벌 콘텐츠는 듣는 사람·길이 규칙이 달라 섞으면 추세가 흐려진다 */
export const COMPLETION_LENGTH_CONTENT_MARKET = 'kr';
/** 시작한 지 이만큼 지난 (사용자, 편)만 센다 — 방금 시작한 사람은 아직 끝까지 들을 시간이 없었다 */
export const COMPLETION_LENGTH_MIN_AGE_HOURS = 24;
/** 추세 기울기를 읽는 단위(분) — "이 분만큼 길어지면 완청 오즈가 몇 배" */
export const COMPLETION_LENGTH_SLOPE_STEP_MIN = 5;
/** 추세를 낼 최소 편 수 — 이보다 적으면 선을 긋지 않는다 */
export const COMPLETION_LENGTH_MIN_CONTENTS = 5;

/**
 * 시리즈 편별 완청·이탈(`GET /admin/insights/series-episodes`, KAN-293, 2026-10-29) — "몇 편에서 빠지는가".
 * 시작·완청 정의는 길이별 완청률과 같다(0초가 아닌 재생 = 시작 · 완청 공용 정의). 다음 편 진행은 시작 시점을 따지지 않는다 —
 * 다음 편을 방금 시작한 사람도 "넘어간 사람"이다.
 */
/** 이 편을 시작한 지 이만큼 지난 (사용자, 편)만 센다 — 길이별 완청률과 같은 값(방금 시작한 사람은 끝까지 들을 시간이 없었다) */
export const SERIES_EPISODES_MIN_AGE_HOURS = COMPLETION_LENGTH_MIN_AGE_HOURS;

/**
 * 짧은 판·도입부 실험(`GET /admin/insights/short-variant`, KAN-298 · KAN-296, 2026-10-29) — 기존 판 vs 짧은 판 완청률,
 * 기존 도입부 vs 바뀐 도입부의 초반 이탈. 시작·완청 정의는 길이별 완청률과 같다.
 */
/** 시작한 지 이만큼 지난 (사용자, 편)만 센다 — 길이별 완청률과 같은 값 */
export const SHORT_VARIANT_MIN_AGE_HOURS = COMPLETION_LENGTH_MIN_AGE_HOURS;
/** 초반 이탈 기준(초) — 그 (사용자, 편)의 청취 합이 이 값 이하면 이탈. "첫 편 1분 안 이탈 54%" 분석과 같은 정의 */
export const SHORT_VARIANT_DROP_10_SEC = 10;
export const SHORT_VARIANT_DROP_30_SEC = 30;
export const SHORT_VARIANT_DROP_60_SEC = 60;
/** 시작자가 이보다 적은 행은 콘솔이 "표본 작음"으로 표시한다 */
export const SHORT_VARIANT_MIN_SAMPLE = 20;

/**
 * 도착 알림 시각 실험(`GET /admin/insights/drip-arrival-time`, KAN-289, 2026-10-30) — 07:00 기준선 · 07:30(A) · 08:00(B)의
 * 재생률. 2시간 반응 정의는 알림 반응(`pushReactions`)과 같은 쿼리 조각을 쓴다.
 */
export const DRIP_ARRIVAL_TIME_DEFAULT_DAYS = 14;
export const DRIP_ARRIVAL_TIME_MAX_DAYS = 90;
/** 반응 창(시간) — 알림 반응과 같은 값. 표시용(쿼리는 `playedBetween` 조각의 창을 쓴다) */
export const DRIP_ARRIVAL_TIME_REACTION_HOURS = 2;
/** 보낸 알림이 이보다 적은 행은 콘솔이 "표본 작음"으로 표시한다 — 기준선 재생률이 10% 안팎이라 20건이면 1~2건이 5~10%p를 움직인다 */
export const DRIP_ARRIVAL_TIME_MIN_SAMPLE = 100;
