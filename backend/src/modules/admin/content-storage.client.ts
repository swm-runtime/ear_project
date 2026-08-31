import { randomBytes } from 'node:crypto';

import { StoredObject, UploadedFileInput } from './admin.types';
import { STORAGE_KEY_RANDOM_BYTES } from './admin.constant';

/**
 * 업로드된 오디오·썸네일이 놓이는 곳. 배포 토폴로지(`AUDIO_DELIVERY`)가 구현을 고른다 —
 * `cloudfront`면 S3 + KeyValueStore, `local`이면 `AUDIO_STORAGE_ROOT`.
 *
 * 키는 무작위다(`deploy/upload-audio.sh`와 같은 규칙). URL·DB 어디에도 제목이 새지 않는다.
 */
export abstract class ContentStorageClient {
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

  protected buildKey(prefix: string, extension: string): string {
    return `${prefix}${randomBytes(STORAGE_KEY_RANDOM_BYTES).toString('hex')}.${extension}`;
  }
}
