/**
 * domain.md 5.1 — `status`는 **3값만** 갖는다(A-6).
 * 파이프라인 상태(`draft` / `partner_review` / `qa_failed` 등)는 존재하지 않는다.
 * 업로드 = 발행이며, **노출 조건은 어디서나 `published` 하나로 통일한다.**
 */
export enum ContentStatus {
  PUBLISHED = 'published',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
}

export enum ContentOrigin {
  PARTNER = 'partner',
  AI_GENERATED = 'ai_generated',
}

/**
 * domain.md 5.1 — 추천 메타(NULL 허용). 부여는 메타데이터 부여 파이프라인이 하고
 * (`ai/metadata-pipeline.md`) 서버는 저장·소비만 한다. NULL이면 스코어링에서
 * 해당 항목을 중립 처리한다(`drip-scheduling.md` 4.2 — 발행 요건이 아니다).
 */
export enum ContentDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

/** domain.md 5.1 — 값 집합은 초기값이며 조정은 마이그레이션이 아니라 varchar라 값 추가만으로 된다 */
export enum ContentFormat {
  NEWS_ANALYSIS = 'news_analysis',
  HOWTO = 'howto',
  INTERVIEW = 'interview',
  OPINION = 'opinion',
  CASE_STUDY = 'case_study',
  OVERVIEW = 'overview',
}

/** domain.md 5.4 */
export enum StatsPeriodType {
  WEEK = 'week',
  MONTH = 'month',
  ALL = 'all',
}

/** `period_type = all`의 `period_start` 고정값. NULL로 두면 유니크가 중복을 막지 못한다 */
export const ALL_TIME_PERIOD_START = '1970-01-01';

/**
 * 음질(domain.md 1.3-1 — KAN-141, 2026-10-06). 순서가 있다: compressed < aac < lossless.
 * `content_audio_renditions.quality` · `plans.max_audio_quality` · `user_settings.preferred_audio_quality`가 같은 값을 쓴다.
 * 허용 판정은 이 순서로 비교하고 **티어명으로 하지 않는다**(player.md 4.9).
 */
export enum AudioQuality {
  /** 압축 — 전 티어. 지금 렌더는 m4a AAC 192k(종전 배포본은 mp3) */
  COMPRESSED = 'compressed',
  /** 고음질 압축 — 값은 예약. 압축이 이미 AAC 192k 라 파이프라인이 따로 렌더하지 않는다(2026-10-06) — 선택지에서 숨긴다 */
  AAC = 'aac',
  /** 무손실(FLAC 16bit/44.1kHz) — Pro */
  LOSSLESS = 'lossless',
}

/** 낮은 것부터 높은 것 순 — 판정·응답의 `available_qualities`·설정의 선택지 모두 이 순서다 */
export const AUDIO_QUALITY_ORDER: readonly AudioQuality[] = [
  AudioQuality.COMPRESSED,
  AudioQuality.AAC,
  AudioQuality.LOSSLESS,
];

export function audioQualityRank(quality: AudioQuality): number {
  return AUDIO_QUALITY_ORDER.indexOf(quality);
}

/**
 * 사용자에게 **선택지로 내놓는** 음질(settings-api.md 4.1 `audio_qualities`) — 파이프라인이 실제로 렌더하는 것만.
 * `aac`는 파일이 없어 고를 수 있게 해도 늘 압축으로 깎이므로(not_available) 내놓지 않는다. 판정(`resolveAudioQuality`)은
 * 여전히 세 값 모두 받는다 — 옛 클라이언트·저장값이 보내도 깨지지 않게.
 */
export const OFFERED_AUDIO_QUALITIES: readonly AudioQuality[] = [
  AudioQuality.COMPRESSED,
  AudioQuality.LOSSLESS,
];

/**
 * 고른 적 없는 사용자의 기본 음질 = **티어가 허용하는 가장 높은 선택지**(player.md 4.9, 2026-10-06 확정).
 * `maxAllowed`가 `aac`인 티어는 `aac`가 선택지에 없으므로 `compressed`다 — 늘 `not_available`로 깎이는 요청을 기본으로
 * 만들지 않는다.
 */
export function defaultAudioQualityFor(maxAllowed: AudioQuality): AudioQuality {
  const maxRank = audioQualityRank(maxAllowed);
  const offered = OFFERED_AUDIO_QUALITIES.filter(
    (quality) => audioQualityRank(quality) <= maxRank,
  );

  return offered.at(-1) ?? AudioQuality.COMPRESSED;
}
