import { Injectable } from '@nestjs/common';
import { parseBuffer } from 'music-metadata';

import { UploadedFileInput } from './admin.types';

/**
 * admin.md 3.1 — `duration_sec`은 업로드된 오디오에서 **서버가 추출**한다. 수동 입력을 받지
 * 않는다(불일치 시 완청 판정이 깨진다). 추출 실패·0초는 `null`로 알리고 판정은 Service가 한다.
 */
@Injectable()
export class AudioProbe {
  async readDurationSec(file: UploadedFileInput): Promise<number | null> {
    try {
      const metadata = await parseBuffer(
        file.buffer,
        { mimeType: file.mimeType, size: file.size },
        { duration: true },
      );
      const duration = metadata.format.duration;

      if (!duration || !Number.isFinite(duration) || duration <= 0) {
        return null;
      }

      return Math.round(duration);
    } catch {
      return null;
    }
  }
}
