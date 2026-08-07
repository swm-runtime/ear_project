import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { StartPlayRequestDto } from './dto/start-play-request.dto';
import { StartPlayResponseDto } from './dto/start-play-response.dto';
import { PlayService } from './services/play.service';

/**
 * library-api.md 3장 — **재생 시작만 `/contents/:content_id/play`에 둔다.**
 *
 * 탐색에서 담지 않은 콘텐츠도 재생할 수 있어(`explore.md` 4.3) 라이브러리 항목 id로는
 * 대상을 지목할 수 없다. 라이브러리 경로에 두면 담기 없이는 재생할 수 없게 되거나,
 * 재생이 담기를 유발하는 부작용이 생긴다.
 *
 * `Idempotency-Key`를 쓰지 않는다 — `uq_play_records_user_id_content_id_play_date`가
 * **하루 단위 멱등을 DB로 보장한다**(domain.md 6.3).
 */
@Controller('contents')
@UseGuards(JwtAuthGuard)
export class PlayController {
  constructor(private readonly playService: PlayService) {}

  @Post(':contentId/play')
  @HttpCode(HttpStatus.OK)
  async startPlay(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() request: StartPlayRequestDto,
  ): Promise<StartPlayResponseDto> {
    return StartPlayResponseDto.from(
      await this.playService.startPlay({
        userId: currentUser.id,
        contentId,
        entryPoint: request.entry_point,
        now: new Date(),
      }),
    );
  }
}
