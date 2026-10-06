import { Injectable } from '@nestjs/common';
import { parseFile } from 'music-metadata';

import { UploadedFileInput } from './admin.types';

/** 파일에서 읽은 오디오 메타(domain.md 5.8). 길이 말고는 모르면 null — 기록용이지 검증 입력이 아니다 */
export interface AudioMetadata {
  durationSec: number;
  /** mp3 | aac | pcm | <원값 소문자> */
  codec: string;
  bitrateKbps: number | null;
  channels: number | null;
  sampleRateHz: number | null;
}

/**
 * admin.md 3.1 — `duration_sec`은 업로드된 오디오에서 **서버가 추출**한다. 수동 입력을 받지
 * 않는다(불일치 시 완청 판정이 깨진다). 추출 실패·0초는 `null`로 알리고 판정은 Service가 한다.
 */
@Injectable()
export class AudioProbe {
  async readDurationSec(file: UploadedFileInput): Promise<number | null> {
    return (await this.readMetadata(file))?.durationSec ?? null;
  }

  /** 음질 3종의 코덱·비트레이트·채널·샘플레이트도 함께 읽는다(KAN-141). 길이를 못 읽으면 전체가 `null` */
  async readMetadata(file: UploadedFileInput): Promise<AudioMetadata | null> {
    try {
      // 파일에서 직접 읽는다 — 버퍼로 받으면 오디오 전량이 램에 한 벌 더 올라간다
      const { format } = await parseFile(file.path, { duration: true });
      const duration = format.duration;

      if (!duration || !Number.isFinite(duration) || duration <= 0) {
        return null;
      }

      return {
        durationSec: Math.round(duration),
        codec: normalizeCodec(format.codec, format.container),
        bitrateKbps: format.bitrate ? Math.round(format.bitrate / 1000) : null,
        channels: format.numberOfChannels ?? null,
        sampleRateHz: format.sampleRate ?? null,
      };
    } catch {
      return null;
    }
  }
}

/** music-metadata의 코덱 표기("MPEG 1 Layer 3" · "AAC" · "PCM")를 짧은 이름으로 — 표시·진단용이라 모르면 원값 */
export function normalizeCodec(codec?: string, container?: string): string {
  const value = `${codec ?? ''} ${container ?? ''}`.toLowerCase();
  if (value.includes('mpeg') || value.includes('mp3')) return 'mp3';
  if (value.includes('aac')) return 'aac';
  if (value.includes('pcm') || value.includes('wav')) return 'pcm';
  return (codec ?? container ?? 'unknown').toLowerCase();
}
