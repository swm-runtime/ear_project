import { readFile } from 'node:fs/promises';

import {
  CURRENT_ENRICHMENT_SCHEMA_VERSION,
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
  MAX_TARGET_AUDIENCES,
} from '@/modules/content/content.constant';
import {
  ContentDifficulty,
  ContentFormat,
} from '@/modules/content/content.enum';
import {
  EnrichmentInput,
  TargetAudience,
} from '@/modules/content/content.types';
import { JOB_CATEGORIES } from '@/modules/user/user.constant';
import { YearsOfExperienceRange } from '@/modules/user/user.enum';

import { MAX_ENRICHMENT_FILE_BYTES } from './admin.constant';
import { UploadedFileInput } from './admin.types';

/**
 * `enrichment.json`(`ai/metadata-pipeline.md` 4.4) 파싱·검증 — admin.md 3.1의 규칙이다:
 * enum 값·형식이 `domain.md` 5.1·5.6과 일치하는지 보고, 어긋나면 **파일만 거부**한다
 * (콘텐츠 업로드 자체는 진행 — 추천 메타는 발행 요건이 아니다).
 *
 * - 생략된 키는 결손으로 통과한다(잘못된 값보다 결손이 낫다 — 명세 4.4).
 * - 모르는 최상위 키는 거부한다 — 오타(`difficultly`)가 조용히 결손으로 둔갑하는 것을 막는다.
 *   명세가 정의한 `source`(폴백 표식)는 허용하되 저장하지 않는다.
 * - `rejectedReason`은 콘솔에 그대로 노출되는 운영자용 문구다.
 */
export type EnrichmentParseResult =
  | { data: EnrichmentInput; rejectedReason: null }
  | { data: null; rejectedReason: string };

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'difficulty',
  'format',
  'is_evergreen',
  'keywords',
  'target_audiences',
  'embedding',
  'source',
]);

const YEARS_OF_EXPERIENCE_VALUES = new Set<string>(
  Object.values(YearsOfExperienceRange),
);

const DIFFICULTY_VALUES = new Set<string>(Object.values(ContentDifficulty));
const FORMAT_VALUES = new Set<string>(Object.values(ContentFormat));

export async function parseEnrichmentFile(
  file: UploadedFileInput,
): Promise<EnrichmentParseResult> {
  if (file.size > MAX_ENRICHMENT_FILE_BYTES) {
    return reject(
      `파일이 너무 커요 (최대 ${MAX_ENRICHMENT_FILE_BYTES / 1024 / 1024}MB)`,
    );
  }

  let raw: unknown;
  try {
    // 크기 검사를 통과한 파일만 읽는다 — 상한(1MB)이라 통째로 읽어도 된다
    raw = JSON.parse(await readFile(file.path, 'utf8'));
  } catch {
    return reject('JSON을 읽을 수 없어요');
  }

  if (!isPlainObject(raw)) {
    return reject('최상위가 JSON 객체여야 해요');
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      return reject(`알 수 없는 키예요: ${key}`);
    }
  }

  const data: Omit<EnrichmentInput, 'schemaVersion'> = {};

  // 구형 파일(키 없음)은 1 — 어드민이 재부여 대상을 고르는 기준이라 값이 있어야 한다
  if (raw.schema_version !== undefined) {
    if (
      typeof raw.schema_version !== 'number' ||
      !Number.isInteger(raw.schema_version) ||
      raw.schema_version < 1 ||
      raw.schema_version > CURRENT_ENRICHMENT_SCHEMA_VERSION
    ) {
      return reject(
        `schema_version은 1~${CURRENT_ENRICHMENT_SCHEMA_VERSION} 정수여야 해요: ${describeValue(raw.schema_version)}`,
      );
    }
  }
  const schemaVersion =
    typeof raw.schema_version === 'number' ? raw.schema_version : 1;

  if (raw.difficulty !== undefined) {
    if (
      typeof raw.difficulty !== 'string' ||
      !DIFFICULTY_VALUES.has(raw.difficulty)
    ) {
      return reject(
        `difficulty 값이 domain.md 5.1과 달라요: ${describeValue(raw.difficulty)}`,
      );
    }
    data.difficulty = raw.difficulty as ContentDifficulty;
  }

  if (raw.format !== undefined) {
    if (typeof raw.format !== 'string' || !FORMAT_VALUES.has(raw.format)) {
      return reject(
        `format 값이 domain.md 5.1과 달라요: ${describeValue(raw.format)}`,
      );
    }
    data.format = raw.format as ContentFormat;
  }

  if (raw.is_evergreen !== undefined) {
    if (typeof raw.is_evergreen !== 'boolean') {
      return reject('is_evergreen은 true/false여야 해요');
    }
    data.isEvergreen = raw.is_evergreen;
  }

  if (raw.keywords !== undefined) {
    if (
      !Array.isArray(raw.keywords) ||
      raw.keywords.length === 0 ||
      raw.keywords.some(
        (keyword) => typeof keyword !== 'string' || keyword.trim().length === 0,
      )
    ) {
      return reject('keywords는 비어 있지 않은 문자열 배열이어야 해요');
    }
    data.keywords = raw.keywords as string[];
  }

  if (raw.target_audiences !== undefined) {
    const audiences = parseTargetAudiences(raw.target_audiences);
    if (typeof audiences === 'string') {
      return reject(audiences);
    }
    data.targetAudiences = audiences;
  }

  if (raw.embedding !== undefined) {
    const embedding = parseEmbedding(raw.embedding);
    if (typeof embedding === 'string') {
      return reject(embedding);
    }
    data.embedding = embedding;
  }

  if (Object.keys(data).length === 0) {
    return reject('저장할 항목이 하나도 없어요 (전 키 생략)');
  }

  return { data: { schemaVersion, ...data }, rejectedReason: null };
}

/**
 * target_audiences 검증 — 값 집합은 **온보딩 커리어 입력과 같아야** 사용자 프로필과 대조된다
 * (직군 `JOB_CATEGORIES`, 연차 `YearsOfExperienceRange`). 통과하면 중복 제거한 세트, 실패하면 사유.
 */
function parseTargetAudiences(raw: unknown): TargetAudience[] | string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return 'target_audiences는 비어 있지 않은 배열이어야 해요 (없으면 키를 생략)';
  }
  if (raw.length > MAX_TARGET_AUDIENCES) {
    return `target_audiences는 최대 ${MAX_TARGET_AUDIENCES}세트예요: ${raw.length}세트`;
  }

  const seen = new Set<string>();
  const audiences: TargetAudience[] = [];

  for (const entry of raw) {
    if (!isPlainObject(entry)) {
      return 'target_audiences의 각 항목은 { job_category, years_of_experience } 객체여야 해요';
    }
    for (const key of Object.keys(entry)) {
      if (!['job_category', 'years_of_experience'].includes(key)) {
        return `target_audiences 항목에 알 수 없는 키예요: ${key}`;
      }
    }
    const jobCategory = entry.job_category;
    const years = entry.years_of_experience;

    if (
      typeof jobCategory !== 'string' ||
      !JOB_CATEGORIES.includes(jobCategory)
    ) {
      return `job_category가 직군 목록(GET /job-categories)에 없어요: ${describeValue(jobCategory)}`;
    }
    if (typeof years !== 'string' || !YEARS_OF_EXPERIENCE_VALUES.has(years)) {
      return `years_of_experience는 ${[...YEARS_OF_EXPERIENCE_VALUES].join(' | ')} 중 하나여야 해요: ${describeValue(years)}`;
    }

    const key = `${jobCategory}|${years}`;
    if (seen.has(key)) {
      continue; // 같은 세트가 두 번 — 거부할 일은 아니고 하나로 접는다
    }
    seen.add(key);
    audiences.push({
      jobCategory,
      yearsOfExperience: years as YearsOfExperienceRange,
    });
  }

  return audiences;
}

/** embedding 키 검증 — 통과하면 값, 실패하면 사유 문자열 */
function parseEmbedding(
  raw: unknown,
): { model: string; vector: number[] } | string {
  if (!isPlainObject(raw)) {
    return 'embedding은 { model, vector } 객체여야 해요';
  }

  // 명세 4.3 — AI 서버 응답 { model, dim, vector }를 그대로 담으므로 `dim`을 허용한다
  for (const key of Object.keys(raw)) {
    if (!['model', 'vector', 'dim'].includes(key)) {
      return `embedding에 알 수 없는 키예요: ${key}`;
    }
  }

  if (raw.model !== EMBEDDING_MODEL_ID) {
    // 다른 모델의 벡터는 저장해도 스코어링이 읽지 않는다(모델 혼용 금지 — domain.md 5.6).
    // 조용히 무효 데이터가 쌓이는 것보다 거부가 낫다
    return `embedding.model이 현재 모델(${EMBEDDING_MODEL_ID})과 달라요: ${describeValue(raw.model)}`;
  }

  if (raw.dim !== undefined && raw.dim !== EMBEDDING_DIM) {
    return `embedding.dim이 ${EMBEDDING_DIM}이 아니에요: ${describeValue(raw.dim)}`;
  }

  const vector = raw.vector;
  if (
    !Array.isArray(vector) ||
    vector.length !== EMBEDDING_DIM ||
    vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    return `embedding.vector는 유한한 숫자 ${EMBEDDING_DIM}개 배열이어야 해요`;
  }

  return { model: raw.model, vector: vector as number[] };
}

/** 거부 사유에 실을 값 표기 — 객체가 '[object Object]'로 뭉개지지 않게 한다 */
function describeValue(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '?');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reject(reason: string): EnrichmentParseResult {
  return { data: null, rejectedReason: reason };
}
