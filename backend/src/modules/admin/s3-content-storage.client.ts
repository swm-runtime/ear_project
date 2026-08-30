import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  PutKeyCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SignatureV4MultiRegion } from '@aws-sdk/signature-v4-multi-region';
// side-effect import — JS SigV4a 구현을 multi-region signer 컨테이너에 등록한다(CRT 없이 동작)
import '@aws-sdk/signature-v4a';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { StoredObject, UploadedFileInput } from './admin.types';
import {
  AUDIO_CONTENT_TYPES,
  AUDIO_KEY_PREFIX,
  THUMBNAIL_CONTENT_TYPES,
  THUMBNAIL_KEY_PREFIX,
} from './admin.constant';
import { ContentStorageClient } from './content-storage.client';

/**
 * `deploy/aws/README.md`의 구성 — 비공개 S3 + CloudFront(서명 URL) + KeyValueStore.
 *
 * - 오디오: `audio/<random>.<ext>`, 1년 immutable 캐시(재발행은 새 키를 만든다)
 * - 썸네일: `thumb/<random>.<ext>` — CloudFront `/thumb/*` 동작이 서명 없이 내보낸다
 * - KVS: `contentId → audio 키`. 뷰어 요청 단계의 Function이 `/play/<id>`를 재작성한다
 *
 * 자격증명은 SDK 기본 체인(EC2 인스턴스 롤)이 준다. env에 키를 두지 않는다.
 */
@Injectable()
export class S3ContentStorageClient extends ContentStorageClient {
  private readonly logger = new Logger(S3ContentStorageClient.name);
  private readonly s3: S3Client;
  private readonly kvs: CloudFrontKeyValueStoreClient;
  private readonly bucket: string;
  private readonly kvsArn: string;
  private readonly publicBaseUrl: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    super();
    const region = configService.get('AWS_REGION', { infer: true });
    this.bucket = configService.get('AUDIO_BUCKET', { infer: true });
    this.kvsArn = configService.get('AUDIO_KVS_ARN', { infer: true });
    this.publicBaseUrl = configService
      .get('AUDIO_URL_BASE_URL', { infer: true })
      .replace(/\/$/, '');

    this.s3 = new S3Client({ region });
    // KVS 데이터 플레인은 SigV4A(멀티 리전 서명)를 요구한다
    this.kvs = new CloudFrontKeyValueStoreClient({
      region,
      signerConstructor: SignatureV4MultiRegion,
    });
  }

  async putAudio(file: UploadedFileInput, extension: string): Promise<string> {
    const key = this.buildKey(AUDIO_KEY_PREFIX, extension);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: AUDIO_CONTENT_TYPES[extension],
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return key;
  }

  async putThumbnail(
    file: UploadedFileInput,
    extension: string,
  ): Promise<StoredObject> {
    const key = this.buildKey(THUMBNAIL_KEY_PREFIX, extension);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: THUMBNAIL_CONTENT_TYPES[extension],
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return { key, url: `${this.publicBaseUrl}/${key}` };
  }

  /** KVS 쓰기는 낙관적 잠금이다 — 현재 ETag를 받아서 함께 보낸다 */
  async registerPlayback(contentId: string, audioPath: string): Promise<void> {
    const { ETag } = await this.kvs.send(
      new DescribeKeyValueStoreCommand({ KvsARN: this.kvsArn }),
    );
    await this.kvs.send(
      new PutKeyCommand({
        KvsARN: this.kvsArn,
        IfMatch: ETag,
        Key: contentId,
        Value: audioPath,
      }),
    );
  }

  async remove(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        try {
          await this.s3.send(
            new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
          );
        } catch (error) {
          // 정리 실패는 업로드 실패 위에 얹히는 부수 문제다 — 남은 오브젝트는 운영이 지운다
          this.logger.error('failed to clean up uploaded object', {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }
}
