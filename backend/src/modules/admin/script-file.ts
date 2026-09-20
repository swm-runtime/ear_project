import { readFile } from 'node:fs/promises';

import { ScriptSegment } from '@/modules/content/content.types';

import {
  MAX_SCRIPT_FILE_BYTES,
  MAX_SCRIPT_SEGMENTS,
  MAX_SCRIPT_SPEAKER_LENGTH,
  MAX_SCRIPT_TEXT_LENGTH,
} from './admin.constant';
import { UploadedFileInput } from './admin.types';

export type ScriptParseResult =
  | { data: ScriptSegment[]; rejectedReason: null }
  | { data: null; rejectedReason: string };

/** 세그먼트 경계의 허용 오차(초) — 부동소수 산술로 앞 턴의 끝이 다음 턴의 시작을 몇 ms 넘는 것은 겹침이 아니다 */
const OVERLAP_TOLERANCE_SEC = 0.05;

const KNOWN_KEYS = new Set(['start_sec', 'end_sec', 'speaker', 'text']);

/**
 * `script_file`(admin-api.md 4.6·4.10) — 파이프라인이 만드는 세그먼트 JSON 배열을 검증한다(KAN-71·KAN-72).
 *
 * 형식은 조회 응답(`player-api.md` 4.7)과 같다: `[{ start_sec, end_sec, speaker, text }]`, `start_sec` 오름차순,
 * 겹침 없음. **틀린 자막보다 없는 편이 낫다**(AI 티켓의 원칙) — 하나라도 어긋나면 파일을 통째로 거부하고
 * 사유를 돌려준다. 추천 메타 파일과 같은 규칙으로, 거부는 업로드를 막지 않는다(대본은 발행 요건이 아니다).
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

  if (!Array.isArray(raw)) {
    return reject('최상위가 세그먼트 배열이어야 해요');
  }

  if (raw.length === 0) {
    return reject('세그먼트가 하나도 없어요');
  }

  if (raw.length > MAX_SCRIPT_SEGMENTS) {
    return reject(`세그먼트가 너무 많아요 (최대 ${MAX_SCRIPT_SEGMENTS}개)`);
  }

  const segments: ScriptSegment[] = [];

  for (const [index, entry] of raw.entries()) {
    const parsed = parseSegment(entry, index);

    if (typeof parsed === 'string') {
      return reject(parsed);
    }

    const previous = segments.at(-1);

    if (previous && parsed.start_sec < previous.start_sec) {
      return reject(
        `${index + 1}번째 세그먼트가 앞 세그먼트보다 먼저 시작해요 — start_sec 오름차순이어야 해요`,
      );
    }

    if (
      previous &&
      parsed.start_sec < previous.end_sec - OVERLAP_TOLERANCE_SEC
    ) {
      return reject(`${index + 1}번째 세그먼트가 앞 세그먼트와 겹쳐요`);
    }

    segments.push(parsed);
  }

  return { data: segments, rejectedReason: null };
}

function parseSegment(entry: unknown, index: number): ScriptSegment | string {
  const label = `${index + 1}번째 세그먼트`;

  if (!isPlainObject(entry)) {
    return `${label}가 객체가 아니에요`;
  }

  for (const key of Object.keys(entry)) {
    if (!KNOWN_KEYS.has(key)) {
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

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reject(reason: string): ScriptParseResult {
  return { data: null, rejectedReason: reason };
}
