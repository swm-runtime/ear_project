import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '@/modules/idempotency/idempotency.interceptor';

import { IssueAudioUrlRequestDto } from '../dto/issue-audio-url-request.dto';
import { IssueAudioUrlResponseDto } from '../dto/issue-audio-url-response.dto';
import { StartPlayRequestDto } from '../dto/start-play-request.dto';
import { StartPlayResponseDto } from '../dto/start-play-response.dto';
import { AudioUrlService } from '../services/audio-url.service';
import { PlaybackSignalService } from '../services/playback-signal.service';
import { PlayService } from '../services/play.service';

/**
 * 콘텐츠 축의 재생 계열 엔드포인트(`player-api.md` 3장).
 *
 * **재생 시작만이 아니라 발급·신호도 `/contents/:content_id/...`에 둔다.** 탐색에서 담지
 * 않은 콘텐츠도 재생할 수 있어(`explore.md` 4.3) 라이브러리 항목 id로는 대상을 지목할 수
 * 없기 때문이다 — 라이브러리 경로에 두면 담기 없이는 재생할 수 없게 된다.
 */
@Controller('contents')
@UseGuards(JwtAuthGuard)
export class PlayController {
  constructor(
    private readonly playService: PlayService,
    private readonly audioUrlService: AudioUrlService,
    private readonly playbackSignalService: PlaybackSignalService,
  ) {}

  /**
   * 서명 URL 발급 + 진입 메타(`player-api.md` 4.1). **재생 중 갱신도 이 호출이다.**
   *
   * **GET이 아니라 POST인 이유** — 발급은 조회가 아니라 **기록이 남는 생성**이다. 호출마다
   * 새 서명 URL이 만들어지고 `audio_access_logs`에 행이 쌓인다. 또한 서명 URL이 담긴 응답이
   * 중간 캐시에 남으면 그 자체가 유출 경로이므로 캐시 가능성이 있는 GET을 피하고
   * `Cache-Control: no-store`를 강제한다(7장).
   *
   * `Idempotency-Key`를 받지 않는다 — 반복 호출돼도 **각 발급이 독립적으로 유효하다.**
   */
  @Post(':contentId/audio-urls')
  @Header('Cache-Control', 'no-store')
  async issueAudioUrl(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() request: IssueAudioUrlRequestDto,
    @Ip() ip: string,
  ): Promise<IssueAudioUrlResponseDto> {
    return IssueAudioUrlResponseDto.from(
      await this.audioUrlService.issue({
        userId: currentUser.id,
        contentId,
        deviceId: request.device_id,
        ip,
        now: new Date(),
      }),
    );
  }

  /**
   * 재생 시작(계약 소유: `library-api.md` 4.4).
   *
   * `Idempotency-Key`를 쓰지 않는다 — `uq_play_records_user_id_content_id_play_date`가
   * **하루 단위 멱등을 DB로 보장한다**(domain.md 6.3).
   */
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

  /**
   * `replay` 신호(`player-api.md` 4.4) — 완료 상태에서 **위치 0부터의 재생**이 시작된 시점.
   *
   * **`Idempotency-Key`가 필수다.** `user_signals`에는 중복을 막는 유니크 제약이 없고,
   * 오프라인 큐의 소비 신호는 "전부 보존, 순서대로 전송"이라 응답 유실 후 재전송이 같은
   * 신호를 두 번 적재한다. 중복은 `content_stats.replay_count`(정산·지표)와 드립
   * 스코어링을 부풀린다.
   */
  @Post(':contentId/replay')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  async recordReplay(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<void> {
    await this.playbackSignalService.recordReplay(currentUser.id, contentId);
  }

  /**
   * 원문 유입 클릭(`player-api.md` 4.5) — **라이브러리·탐색·플레이어 세 화면 공용 계약**이다.
   *
   * 진입점마다 경로를 나누면 `content_stats.source_link_click_count`가 경로별로 갈라진다 —
   * 재생 시작이 화면 불문 한 엔드포인트인 것과 같은 이유다.
   *
   * `Idempotency-Key`가 필수인 이유는 `replay`와 같다. 이 요청은 오프라인 큐 적재 대상이라
   * 재전송이 정산 지표를 부풀릴 수 있다.
   */
  @Post(':contentId/source-link-clicks')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  async recordSourceLinkClick(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<void> {
    await this.playbackSignalService.recordSourceLinkClick(
      currentUser.id,
      contentId,
    );
  }
}
