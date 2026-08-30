import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { StoredObject, UploadedFileInput } from './admin.types';
import { AUDIO_KEY_PREFIX, THUMBNAIL_KEY_PREFIX } from './admin.constant';
import { ContentStorageClient } from './content-storage.client';

/**
 * `AUDIO_DELIVERY=local` — 개발·단일 서버용. `AUDIO_STORAGE_ROOT` 아래에 파일을 쓴다.
 * 오디오는 우리 스트리밍 라우트(`GET /audio/:contentId`)가 `audio_path`로 읽으므로 그대로
 * 재생된다. **썸네일은 정적 서빙 경로가 없어 URL만 만들어 둔다** — 로컬 모드의 알려진 한계다.
 */
@Injectable()
export class LocalContentStorageClient extends ContentStorageClient {
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    super();
    this.root = configService.get('AUDIO_STORAGE_ROOT', { infer: true });
    this.publicBaseUrl = configService
      .get('AUDIO_URL_BASE_URL', { infer: true })
      .replace(/\/$/, '');
  }

  async putAudio(file: UploadedFileInput, extension: string): Promise<string> {
    const key = this.buildKey(AUDIO_KEY_PREFIX, extension);
    await this.write(key, file.buffer);
    return key;
  }

  async putThumbnail(
    file: UploadedFileInput,
    extension: string,
  ): Promise<StoredObject> {
    const key = this.buildKey(THUMBNAIL_KEY_PREFIX, extension);
    await this.write(key, file.buffer);
    return { key, url: `${this.publicBaseUrl}/${key}` };
  }

  /** 로컬 스트리밍 라우트는 DB의 `audio_path`를 직접 읽는다 — 별도 매핑이 없다 */
  registerPlayback(): Promise<void> {
    return Promise.resolve();
  }

  async remove(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map((key) => rm(join(this.root, key), { force: true })),
    );
  }

  private async write(key: string, buffer: Buffer): Promise<void> {
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
  }
}
