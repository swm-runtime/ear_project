import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { SaveProgressRequestDto } from '../dto/save-progress-request.dto';
import { SaveProgressResponseDto } from '../dto/save-progress-response.dto';
import { PlaybackProgressService } from '../services/playback-progress.service';

/**
 * 재생 위치 저장(`player-api.md` 4.3).
 *
 * **경로에 `userId`를 받지 않고 `me`를 쓴다**(IDOR 방지 — architecture.md 9.2).
 * 대상은 `content_id`로 지목한다 — user × content 당 1행이라 이것으로 유일하다.
 *
 * **PUT인 이유** — "이 값으로 하라"는 절대값 저장이라 같은 요청이 두 번 도착해도 위치·도달
 * 값의 결과가 같다. `listened_sec_delta`(적산분)가 함께 실리는 것이 예외적 비멱등 요소인데,
 * 별도 엔드포인트로 나누면 5초 주기마다 왕복이 2회가 된다. 중복 위험은 감수하고 적산량
 * 이상치를 관측하는 쪽으로 확정됐다(`player-api.md` 9장 — 협의 2026-08-10).
 *
 * `Idempotency-Key`를 받지 않는 이유도 같다 — 절대값이라 재전송이 무해하다.
 */
@Controller('users/me/playback-progresses')
@UseGuards(JwtAuthGuard)
export class PlaybackProgressController {
  constructor(
    private readonly playbackProgressService: PlaybackProgressService,
  ) {}

  @Put(':contentId')
  async saveProgress(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() request: SaveProgressRequestDto,
  ): Promise<SaveProgressResponseDto> {
    return SaveProgressResponseDto.from(
      await this.playbackProgressService.saveProgress({
        userId: currentUser.id,
        contentId,
        positionSec: request.position_sec,
        maxReachedSec: request.max_reached_sec,
        listenedSecDelta: request.listened_sec_delta,
        contentVersion: request.content_version,
        now: new Date(),
      }),
    );
  }
}
