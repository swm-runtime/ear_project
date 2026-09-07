import { randomBytes } from 'node:crypto';

import { StoredObject, UploadedFileInput } from './admin.types';
import {
  AUDIO_KEY_PREFIX,
  STORAGE_KEY_RANDOM_BYTES,
  THUMBNAIL_KEY_PREFIX,
} from './admin.constant';

/**
 * 업로드된 오디오·썸네일이 놓이는 곳. 배포 토폴로지(`AUDIO_DELIVERY`)가 구현을 고른다 —
 * `cloudfront`면 S3 + KeyValueStore, `local`이면 `AUDIO_STORAGE_ROOT`.
 *
 * 키는 무작위다(`deploy/upload-audio.sh`와 같은 규칙). URL·DB 어디에도 제목이 새지 않는다.
 */
export abstract class ContentStorageClient {
  /** 공개 URL의 접두어. 끝 슬래시는 떼고 받는다 */
  protected constructor(protected readonly publicBaseUrl: string) {}

  /** 오디오를 올리고 `contents.audio_path`에 넣을 키를 돌려준다 */
  abstract putAudio(
    file: UploadedFileInput,
    extension: string,
  ): Promise<string>;

  /** 썸네일을 올리고 `contents.thumbnail_url`에 넣을 공개 URL을 돌려준다 */
  abstract putThumbnail(
    file: UploadedFileInput,
    extension: string,
  ): Promise<StoredObject>;

  /** 실패한 업로드의 부분 결과 정리(admin.md 4.2 — 원자성). 없는 키는 무시한다 */
  abstract remove(keys: string[]): Promise<void>;

  /**
   * 공개 URL → 저장소 키. 재발행(admin-api.md 4.10)이 **이전 썸네일을 지우려면** 필요하다 —
   * `contents`에는 URL만 있고 키가 없다(domain.md 5.1).
   *
   * URL을 만든 쪽이 되짚기도 해야 한다. 호출부에서 경로를 파싱하면 `AUDIO_URL_BASE_URL`이
   * 경로 접두어를 갖는 배포(local 모드의 `/api/v1/audio`)에서 조용히 어긋난다.
   *
   * 우리가 만든 URL이 아니면 `null`이다 — 남의 URL을 지우러 가지 않는다.
   */
  resolveKey(url: string): string | null {
    const prefix = `${this.publicBaseUrl}/`;
    if (!url.startsWith(prefix)) {
      return null;
    }

    const key = url.slice(prefix.length);

    return key.startsWith(AUDIO_KEY_PREFIX) ||
      key.startsWith(THUMBNAIL_KEY_PREFIX)
      ? key
      : null;
  }

  protected buildKey(prefix: string, extension: string): string {
    return `${prefix}${randomBytes(STORAGE_KEY_RANDOM_BYTES).toString('hex')}.${extension}`;
  }
}
