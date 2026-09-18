import { ScriptResult } from '../services/script.service';

class ScriptSegmentDto {
  readonly start_sec: number;
  readonly end_sec: number;
  /** 화자 표시명. 1인 낭독·파트너 콘텐츠는 null */
  readonly speaker: string | null;
  readonly text: string;
}

/** `player-api.md` 4.7 — 스크립트가 없으면 `segments: []`(404 아님) */
export class GetScriptResponseDto {
  readonly segments: ScriptSegmentDto[];

  static from(result: ScriptResult): GetScriptResponseDto {
    return {
      segments: result.segments.map((segment) => ({
        start_sec: segment.start_sec,
        end_sec: segment.end_sec,
        speaker: segment.speaker,
        text: segment.text,
      })),
    };
  }
}
