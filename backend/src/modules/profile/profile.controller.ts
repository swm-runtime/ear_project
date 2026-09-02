import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { GetProfileResponseDto } from './dto/get-profile-response.dto';
import { WeeklyListeningQueryRequestDto } from './dto/weekly-listening-query-request.dto';
import { WeeklyListeningResponseDto } from './dto/weekly-listening-response.dto';
import { ProfileOrchestrator } from './profile.orchestrator';

/**
 * profile-api.md 3장 — 프로필 화면의 **조회 전용** 엔드포인트 둘.
 *
 * **변경(POST/PUT/PATCH/DELETE) 엔드포인트가 없다.** 프로필에서 직접 서버에 쓰는 값은 하나도
 * 없고(`profile.md` 1장), 각 카드의 편집은 소유 화면의 API가 담당한다 — 같은 데이터를 두
 * 화면이 각자 저장하면 규칙이 갈라진다.
 *
 * **경로에 `userId`를 받지 않고 `me`를 쓴다**(IDOR 방지 — architecture.md 9.2).
 * 통계 집계도 토큰에서 꺼낸 요청자의 행만 스코프한다.
 *
 * Controller는 try/catch 하지 않는다. 전역 Exception Filter가 변환한다(architecture.md 7.3).
 */
@Controller('users/me/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileOrchestrator: ProfileOrchestrator) {}

  /**
   * 프로필 탭 진입·편집 후 복귀·당겨서 새로고침이 모두 이 하나를 호출한다.
   * **파라미터가 없다** — 카드별 부분 조회를 두지 않는다(조회 시점이 섹션마다 갈라진다).
   */
  @Get()
  async getProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetProfileResponseDto> {
    return GetProfileResponseDto.from(
      await this.profileOrchestrator.getSummary(currentUser.id, new Date()),
    );
  }

  /**
   * 주간 그래프의 [◀ 이전 주] 탐색 시점에만 호출한다. 이번 주는 위 응답에 이미 들어 있다.
   *
   * 범위 조회(여러 주 일괄)를 두지 않는다 — 화살표 탐색은 한 번에 한 주씩이고, 오래된 주까지
   * 미리 받으면 첫 탐색이 무거워진다(`profile-api.md` 4.2 설계 메모).
   */
  @Get('weekly-listening')
  async getWeeklyListening(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: WeeklyListeningQueryRequestDto,
  ): Promise<WeeklyListeningResponseDto> {
    return WeeklyListeningResponseDto.from(
      await this.profileOrchestrator.getWeeklyListening(
        currentUser.id,
        query.week_start,
        new Date(),
      ),
    );
  }
}
