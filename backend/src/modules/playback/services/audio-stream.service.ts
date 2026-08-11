import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, ReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';

import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { EnvironmentVariables } from '@/config/env.validation';
import { ContentService } from '@/modules/content/services/content.service';

import { AudioUrlSigner } from '../audio-url.signer';

/** 오디오 스트리밍 응답 한 건. Range 요청이면 206 + 부분 구간이다 */
export interface AudioStream {
  stream: ReadStream;
  contentLength: number;
  /** 전체 응답이면 `null`, 부분 응답이면 `bytes <start>-<end>/<total>` */
  contentRange: string | null;
  totalSize: number;
}

/**
 * 서명 URL이 가리키는 **스트리밍 경로**(`architecture.md` 9.4 · `player.md` 4.8).
 *
 * 우리가 서명하고 우리가 검증해 내보낸다. **오브젝트 스토리지가 확정되면 이 클래스와
 * 라우트가 통째로 CDN 서명 URL로 대체된다** — 그때 클라이언트 계약(`player-api.md` 4.1)은
 * 바뀌지 않는다. `audio.url`이 우리 주소에서 CDN 주소로 바뀔 뿐이다.
 *
 * **JWT를 요구하지 않는다.** 재생기(네이티브 미디어 플레이어)는 우리 인증 헤더를 붙이지
 * 않고 URL만 받아 요청하기 때문이다. 대신 **서명 자체가 인증**이며, 서명 대상에 `user_id`가
 * 들어 있어 남의 URL을 가져다 써도 통과하지 못한다.
 */
@Injectable()
export class AudioStreamService {
  constructor(
    private readonly audioUrlSigner: AudioUrlSigner,
    private readonly contentService: ContentService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async open(
    contentId: string,
    userId: string,
    expiresAtSec: number,
    signature: string,
    rangeHeader: string | undefined,
    now: Date,
  ): Promise<AudioStream> {
    if (
      !this.audioUrlSigner.verify(
        contentId,
        userId,
        expiresAtSec,
        signature,
        now,
      )
    ) {
      /**
       * **만료와 위조를 같은 코드로 응답한다.** 둘을 가르면 서명을 대입하는 쪽에 "형식은
       * 맞고 만료만 지났다"는 힌트를 주게 된다. 클라이언트는 어차피 같은 동작을 한다 —
       * 갱신을 재요청한다.
       *
       * 코드는 범용 `FORBIDDEN`이다(`common-error-handling.md` 9.1 — "상황별 안내").
       * `CONTENT_WITHDRAWN`을 쓰면 안 된다 — 그 코드의 계약은 **"목록에서 제거 +
       * 미니플레이어 내림"**이라, 5분마다 일어나는 일상적 URL 만료가 멀쩡한 라이브러리
       * 항목을 지우게 된다. 회수는 아래 `getPublishedById`가 진짜 회수일 때만 낸다.
       */
      throw new BusinessForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: '재생 권한이 만료됐어요',
        logLevel: 'warn',
      });
    }

    // 발급 이후 회수됐을 수 있다. 이미 발급된 URL의 유효 상한이 만료 시각이라는 규칙은
    // 그대로지만(9.4), 그 안에서도 스트리밍 시점에 다시 확인하는 편이 노출을 줄인다
    const content = await this.contentService.getPublishedById(contentId);

    const path = this.resolveAudioPath(content.audioPath);
    const totalSize = await this.statSize(path);
    const range = parseRange(rangeHeader, totalSize);

    if (!range) {
      return {
        stream: createReadStream(path),
        contentLength: totalSize,
        contentRange: null,
        totalSize,
      };
    }

    return {
      stream: createReadStream(path, { start: range.start, end: range.end }),
      contentLength: range.end - range.start + 1,
      contentRange: `bytes ${range.start}-${range.end}/${totalSize}`,
      totalSize,
    };
  }

  /**
   * `contents.audio_path`는 저장소 키(상대 경로)다. **루트 밖으로 나가지 못하게 가둔다** —
   * 값이 관리자 업로드에서 오더라도 경로 조작이 파일 시스템 전체를 여는 것을 막는다.
   */
  private resolveAudioPath(audioPath: string): string {
    const root = resolve(
      this.configService.get('AUDIO_STORAGE_ROOT', { infer: true }),
    );
    const normalized = normalize(audioPath);

    if (isAbsolute(normalized) || normalized.split(sep).includes('..')) {
      throw this.notFound();
    }

    const resolved = resolve(join(root, normalized));

    if (resolved !== root && !resolved.startsWith(root + sep)) {
      throw this.notFound();
    }

    return resolved;
  }

  private async statSize(path: string): Promise<number> {
    try {
      const stats = await stat(path);

      if (!stats.isFile()) {
        throw this.notFound();
      }

      return stats.size;
    } catch {
      throw this.notFound();
    }
  }

  private notFound(): BusinessNotFoundException {
    return new BusinessNotFoundException({
      errorCode: ErrorCode.CONTENT_NOT_FOUND,
      message: '재생할 수 없어요',
      logLevel: 'warn',
    });
  }
}

/**
 * `Range: bytes=<start>-<end>` 한 구간만 지원한다.
 *
 * **시크에 필요한 것은 이 형태뿐이다** — 다중 구간(`bytes=0-99,200-299`)은 미디어
 * 플레이어가 쓰지 않는다. 해석할 수 없으면 `null`을 돌려 전체 응답으로 떨어진다(RFC 9110 —
 * 서버는 Range를 무시할 수 있다).
 */
function parseRange(
  rangeHeader: string | undefined,
  totalSize: number,
): { start: number; end: number } | null {
  if (!rangeHeader || totalSize === 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;

  // `bytes=-500` = 마지막 500바이트
  if (rawStart === '') {
    if (rawEnd === '') {
      return null;
    }

    const length = Math.min(Number(rawEnd), totalSize);

    // `bytes=-0`은 만족 불가능한 구간이다(RFC 9110). start > end 조합을 만들면
    // `createReadStream`이 동기로 던져(ERR_OUT_OF_RANGE) 500이 된다 — 무시하고 전체 응답
    if (length === 0) {
      return null;
    }

    return { start: totalSize - length, end: totalSize - 1 };
  }

  const start = Number(rawStart);
  const end =
    rawEnd === '' ? totalSize - 1 : Math.min(Number(rawEnd), totalSize - 1);

  if (start > end || start >= totalSize) {
    return null;
  }

  return { start, end };
}
