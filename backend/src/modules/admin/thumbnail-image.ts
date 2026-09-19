import { stat } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

import {
  THUMBNAIL_MAX_EDGE_PX,
  THUMBNAIL_OUTPUT_CONTENT_TYPE,
  THUMBNAIL_OUTPUT_EXTENSION,
  THUMBNAIL_WEBP_QUALITY,
} from './admin.constant';
import { UploadedFileInput } from './admin.types';

export interface NormalizedThumbnail {
  /** 변환된 파일 — 원본 임시 파일 옆(`<원본>.webp`)에 쓴다. 호출부가 올린 뒤 지운다 */
  file: UploadedFileInput;
  extension: typeof THUMBNAIL_OUTPUT_EXTENSION;
  width: number;
  height: number;
}

/**
 * 업로드된 썸네일을 **앱이 쓰는 크기로 줄여 WebP 로 다시 쓴다**(admin-api.md 4.6, 2026-09-19).
 *
 * 파이프라인이 만드는 썸네일은 1024×1024 PNG 로 장당 1.5MB 안팎이다. 앱은 그것을 폭 절반짜리
 * 격자 타일(약 180pt)에 그대로 내려받아, 첫 화면 20장이면 30MB 를 넘는다 — iOS 는 PNG 를 하드웨어
 * 디코드하지 못하고 동시 디코드도 2장뿐이라 순서대로 뜨는 게 보였다. 저장 시점에 한 번 줄이면 출처
 * (파이프라인·파트너 업로드)와 무관하게 전부 잡히고, 앱은 바꿀 것이 없다.
 *
 * - 긴 변 768px 로 줄인다(`fit: inside` — 자르지 않는다). 플레이어 아트워크(3x 기준 약 1080px)에도
 *   무리 없고 타일에는 넉넉한 값이다. 그보다 작은 원본은 키우지 않는다.
 * - EXIF 회전을 픽셀에 굽는다(`rotate()`) — 폰 사진은 메타로만 돌아가 있어 그대로 두면 눕는다.
 * - 원본 형식(jpg/png/webp)과 무관하게 항상 WebP 다. `thumbnail_url` 은 `.webp` 로 끝난다.
 *
 * `AudioProbe` 와 같은 자리 — 파일을 읽지 못하면 `null` 을 돌려주고 판정은 서비스가 한다.
 */
@Injectable()
export class ThumbnailImage {
  async normalize(
    file: UploadedFileInput,
  ): Promise<NormalizedThumbnail | null> {
    const outputPath = `${file.path}.${THUMBNAIL_OUTPUT_EXTENSION}`;

    try {
      const info = await sharp(file.path, { failOn: 'error' })
        .rotate()
        .resize(THUMBNAIL_MAX_EDGE_PX, THUMBNAIL_MAX_EDGE_PX, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: THUMBNAIL_WEBP_QUALITY })
        .toFile(outputPath);

      const { size } = await stat(outputPath);

      return {
        file: {
          path: outputPath,
          originalName: `${file.originalName}.${THUMBNAIL_OUTPUT_EXTENSION}`,
          mimeType: THUMBNAIL_OUTPUT_CONTENT_TYPE,
          size,
        },
        extension: THUMBNAIL_OUTPUT_EXTENSION,
        width: info.width,
        height: info.height,
      };
    } catch {
      // 깨진 파일·이미지가 아닌 파일 — 형식 판정(확장자·크기)은 통과했어도 여기서 걸린다
      return null;
    }
  }
}
