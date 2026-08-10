import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { pipeline } from 'node:stream';

import type { Response } from 'express';

import { AudioStreamRequestDto } from '../dto/audio-stream-request.dto';
import { AudioStreamService } from '../services/audio-stream.service';

/**
 * 서명 URL이 가리키는 스트리밍 경로.
 *
 * **`JwtAuthGuard`를 붙이지 않는다.** 네이티브 미디어 플레이어는 우리 인증 헤더를 붙이지
 * 않고 URL만 받아 요청한다. 인증은 **서명이 대신하며**(`AudioUrlSigner`) 서명 대상에
 * `user_id`가 들어 있어 남의 URL로는 통과하지 못한다.
 *
 * **오브젝트 스토리지가 확정되면 이 라우트는 사라진다** — `audio.url`이 CDN 서명 URL을
 * 가리키게 되고, 검증은 CDN이 한다. 클라이언트 계약(`player-api.md` 4.1)은 그대로다.
 */
@Controller('audio')
export class AudioStreamController {
  constructor(private readonly audioStreamService: AudioStreamService) {}

  @Get(':contentId')
  async stream(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Query() query: AudioStreamRequestDto,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const audio = await this.audioStreamService.open(
      contentId,
      query.user,
      query.expires,
      query.signature,
      range,
      new Date(),
    );

    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Content-Length', audio.contentLength);
    // 시크가 가능하려면 부분 요청을 받는다는 사실을 재생기에 알려야 한다
    response.setHeader('Accept-Ranges', 'bytes');
    // 서명 URL로 받은 응답을 중간 캐시에 남기지 않는다(architecture.md 9.4)
    response.setHeader('Cache-Control', 'no-store');

    if (audio.contentRange) {
      response.setHeader('Content-Range', audio.contentRange);
      response.status(HttpStatus.PARTIAL_CONTENT);
    }

    /**
     * `pipe`가 아니라 `pipeline`이다 — 둘의 차이가 프로세스 생사를 가른다.
     *
     * `pipe`는 소스의 `'error'`에 리스너를 붙이지 않아, 스트리밍 중 파일이 사라지거나
     * (콘텐츠 재발행) 디스크 오류가 나면 **uncaughtException으로 프로세스 전체가 죽는다.**
     * 또 재생기가 시크할 때마다 이전 Range 요청을 중단하는데, `pipe`는 소스를 destroy하지
     * 않아 파일 디스크립터가 누적된다. `pipeline`은 양쪽 어느 쪽이 끊겨도 상대를 정리한다.
     *
     * 에러 시 응답은 `destroy`로 끊는다 — 이미 헤더·일부 바이트가 나간 뒤라 상태 코드를
     * 바꿀 수 없고, 연결 절단이 재생기에게 "다시 요청하라"는 유일한 신호다.
     */
    pipeline(audio.stream, response, (error) => {
      if (error && !response.writableEnded) {
        response.destroy();
      }
    });
  }
}
