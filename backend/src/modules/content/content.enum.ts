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
  /** 압축(mp3) — 기본값, 전 티어 */
  COMPRESSED = 'compressed',
  /** 고음질 압축(m4a AAC) — 전 티어 */
  AAC = 'aac',
  /** 무손실(wav) — Pro */
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
