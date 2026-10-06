import { readFile } from 'node:fs/promises';

import {
  ScriptDocument,
  ScriptSection,
  ScriptSegment,
} from '@/modules/content/content.types';

import {
  MAX_SCRIPT_FILE_BYTES,
  MAX_SCRIPT_SECTIONS,
  MAX_SCRIPT_SECTION_TITLE_LENGTH,
  MAX_SCRIPT_SEGMENTS,
  MAX_SCRIPT_SPEAKER_LENGTH,
  MAX_SCRIPT_TEXT_LENGTH,
} from './admin.constant';
import { UploadedFileInput } from './admin.types';

export type ScriptParseResult =
  | { data: ScriptDocument; rejectedReason: null }
  | { data: null; rejectedReason: string };

/** 세그먼트 경계의 허용 오차(초) — 부동소수 산술로 앞 턴의 끝이 다음 턴의 시작을 몇 ms 넘는 것은 겹침이 아니다 */
const OVERLAP_TOLERANCE_SEC = 0.05;

const KNOWN_SEGMENT_KEYS = new Set(['start_sec', 'end_sec', 'speaker', 'text']);
const KNOWN_SECTION_KEYS = new Set(['start_sec', 'title']);
const KNOWN_DOCUMENT_KEYS = new Set(['segments', 'sections']);

/**
 * `script_file`(admin-api.md 4.6·4.10) — 파이프라인이 만드는 대본 JSON을 검증한다(KAN-71·KAN-72·KAN-144).
 *
 * 두 형식을 받는다. **배열 형식**(종전) `[{ start_sec, end_sec, speaker, text }]`은 구간 없음이고,
 * **객체 형식** `{ segments, sections }`은 세그먼트에 구간 제목 `[{ start_sec, title }]`을 더한 것이다.
 * 이미 발행된 콘텐츠·파트너 콘텐츠의 배열 파일은 그대로 동작해야 하므로 배열 형식을 거두지 않는다.
 *
 * **틀린 자막보다 없는 편이 낫다**(AI 티켓의 원칙) — 하나라도 어긋나면 파일을 통째로 거부하고 사유를
 * 돌려준다. 구간이 어긋나도 세그먼트까지 거부한다 — 둘은 같은 배포본의 시각이라 한쪽만 믿을 근거가 없다.
 * 추천 메타 파일과 같은 규칙으로, 거부는 업로드를 막지 않는다(대본은 발행 요건이 아니다).
 *
 * 오디오 길이에 걸린 검증(마지막 구간 < 길이)은 길이를 알게 된 뒤 `rejectSectionsPastDuration`이 한다.
 */
export async function parseScriptFile(
  file: UploadedFileInput,
): Promise<ScriptParseResult> {
  if (file.size > MAX_SCRIPT_FILE_BYTES) {
    return reject(
      `파일이 너무 커요 (최대 ${MAX_SCRIPT_FILE_BYTES / 1024 / 1024}MB)`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file.path, 'utf8'));
  } catch {
    return reject('JSON을 읽을 수 없어요');
  }

  if (Array.isArray(raw)) {
    const segments = parseSegments(raw);
    return typeof segments === 'string'
      ? reject(segments)
      : accept({ segments, sections: [] });
  }

  if (!isPlainObject(raw)) {
    return reject(
      '최상위가 세그먼트 배열 또는 { segments, sections } 객체여야 해요',
    );
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_DOCUMENT_KEYS.has(key)) {
      return reject(`최상위에 모르는 키가 있어요: ${key}`);
    }
  }

  if (!Array.isArray(raw.segments)) {
    return reject('segments가 세그먼트 배열이어야 해요');
  }

  const segments = parseSegments(raw.segments);
  if (typeof segments === 'string') {
    return reject(segments);
  }

  // 구간을 생략한 객체 형식은 배열 형식과 같다 — 파이프라인이 구간을 못 만든 편을 막지 않는다
  if (raw.sections === undefined) {
    return accept({ segments, sections: [] });
  }

  if (!Array.isArray(raw.sections)) {
    return reject('sections가 구간 배열이어야 해요');
  }

  const sections = parseSections(raw.sections);
  return typeof sections === 'string'
    ? reject(sections)
    : accept({ segments, sections });
}

/**
 * 마지막 구간이 오디오 길이 안에서 시작하는지 — 파일만 보고는 알 수 없어 길이를 뽑은 뒤 따로 본다.
 * 어긋나면 파일 전체를 거부한 것과 같은 결과를 돌려준다(위 원칙). 통과·이미 거부·구간 없음은 그대로다.
 */
export function rejectSectionsPastDuration(
  result: ScriptParseResult,
  durationSec: number,
): ScriptParseResult {
  const last = result.data?.sections.at(-1);

  if (!last || last.start_sec < durationSec) {
    return result;
  }

  return reject(
    `마지막 구간이 오디오 길이(${durationSec}초) 안에서 시작해야 해요 (${last.start_sec}초)`,
  );
}

function parseSegments(raw: unknown[]): ScriptSegment[] | string {
  if (raw.length === 0) {
    return '세그먼트가 하나도 없어요';
  }

  if (raw.length > MAX_SCRIPT_SEGMENTS) {
    return `세그먼트가 너무 많아요 (최대 ${MAX_SCRIPT_SEGMENTS}개)`;
  }

  const segments: ScriptSegment[] = [];

  for (const [index, entry] of raw.entries()) {
    const parsed = parseSegment(entry, index);

    if (typeof parsed === 'string') {
      return parsed;
    }

    const previous = segments.at(-1);

    if (previous && parsed.start_sec < previous.start_sec) {
      return `${index + 1}번째 세그먼트가 앞 세그먼트보다 먼저 시작해요 — start_sec 오름차순이어야 해요`;
    }

    if (
      previous &&
      parsed.start_sec < previous.end_sec - OVERLAP_TOLERANCE_SEC
    ) {
      return `${index + 1}번째 세그먼트가 앞 세그먼트와 겹쳐요`;
    }

    segments.push(parsed);
  }

  return segments;
}

function parseSegment(entry: unknown, index: number): ScriptSegment | string {
  const label = `${index + 1}번째 세그먼트`;

  if (!isPlainObject(entry)) {
    return `${label}가 객체가 아니에요`;
  }

  for (const key of Object.keys(entry)) {
    if (!KNOWN_SEGMENT_KEYS.has(key)) {
      return `${label}에 모르는 키가 있어요: ${key}`;
    }
  }

  const { start_sec: startSec, end_sec: endSec, speaker, text } = entry;

  if (!isFiniteNonNegative(startSec)) {
    return `${label}의 start_sec은 0 이상의 숫자여야 해요`;
  }

  if (!isFiniteNonNegative(endSec) || endSec <= startSec) {
    return `${label}의 end_sec은 start_sec보다 커야 해요`;
  }

  if (speaker !== undefined && speaker !== null) {
    if (typeof speaker !== 'string' || speaker.trim().length === 0) {
      return `${label}의 speaker는 문자열 또는 null이어야 해요`;
    }

    if (speaker.length > MAX_SCRIPT_SPEAKER_LENGTH) {
      return `${label}의 speaker가 너무 길어요 (최대 ${MAX_SCRIPT_SPEAKER_LENGTH}자)`;
    }
  }

  if (typeof text !== 'string' || text.trim().length === 0) {
    return `${label}의 text가 비어 있어요`;
  }

  if (text.length > MAX_SCRIPT_TEXT_LENGTH) {
    return `${label}의 text가 너무 길어요 (최대 ${MAX_SCRIPT_TEXT_LENGTH}자)`;
  }

  return {
    start_sec: startSec,
    end_sec: endSec,
    speaker: speaker === undefined ? null : speaker,
    text,
  };
}

/**
 * 구간 제목(KAN-144) — 0~30개, `start_sec` **엄격한** 오름차순(같은 값 금지 — 같은 초에 두 구간이 시작하면
 * "현재 구간"이 둘이 된다), 제목은 비어 있지 않은 문자열 ≤60자. 세그먼트와 달리 겹침 개념이 없다(끝 시각이 없다).
 */
function parseSections(raw: unknown[]): ScriptSection[] | string {
  if (raw.length > MAX_SCRIPT_SECTIONS) {
    return `구간이 너무 많아요 (최대 ${MAX_SCRIPT_SECTIONS}개)`;
  }

  const sections: ScriptSection[] = [];

  for (const [index, entry] of raw.entries()) {
    const parsed = parseSection(entry, index);

    if (typeof parsed === 'string') {
      return parsed;
    }

    const previous = sections.at(-1);

    if (previous && parsed.start_sec <= previous.start_sec) {
      return `${index + 1}번째 구간이 앞 구간보다 뒤에서 시작해야 해요 — start_sec 엄격한 오름차순이어야 해요`;
    }

    sections.push(parsed);
  }

  return sections;
}

function parseSection(entry: unknown, index: number): ScriptSection | string {
  const label = `${index + 1}번째 구간`;

  if (!isPlainObject(entry)) {
    return `${label}이 객체가 아니에요`;
  }

  for (const key of Object.keys(entry)) {
    if (!KNOWN_SECTION_KEYS.has(key)) {
      return `${label}에 모르는 키가 있어요: ${key}`;
    }
  }

  const { start_sec: startSec, title } = entry;

  if (!isFiniteNonNegative(startSec)) {
    return `${label}의 start_sec은 0 이상의 숫자여야 해요`;
  }

  if (typeof title !== 'string' || title.trim().length === 0) {
    return `${label}의 title이 비어 있어요`;
  }

  if (title.length > MAX_SCRIPT_SECTION_TITLE_LENGTH) {
    return `${label}의 title이 너무 길어요 (최대 ${MAX_SCRIPT_SECTION_TITLE_LENGTH}자)`;
  }

  return { start_sec: startSec, title };
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function accept(data: ScriptDocument): ScriptParseResult {
  return { data, rejectedReason: null };
}

function reject(reason: string): ScriptParseResult {
  return { data: null, rejectedReason: reason };
}
