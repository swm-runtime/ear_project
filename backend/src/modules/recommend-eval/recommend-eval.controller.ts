import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { RecommendEvalSnapshotQueryRequestDto } from './dto/recommend-eval-snapshot-query-request.dto';
import {
  RecommendEvalSnapshotService,
  SNAPSHOT_DEFAULT_MAX_USERS,
  SNAPSHOT_DEFAULT_SIGNAL_DAYS,
} from './recommend-eval-snapshot.service';
import { EvalSnapshot } from './recommend-eval.types';

/**
 * 추천 평가 스냅샷(`admin-api.md` 4.18) — 오프라인 평가기의 입력. **읽기 전용**이고 응답은 이미 파일 형식(snake_case)이라
 * 별도 응답 DTO 없이 그대로 내려준다. 권한은 다른 관리자 라우트와 같다(`users.role == 'admin'`).
 */
@Controller('admin/recommend-eval')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class RecommendEvalController {
  constructor(private readonly snapshotService: RecommendEvalSnapshotService) {}

  @Get('snapshot')
  @Header('Cache-Control', 'no-store')
  async snapshot(
    @Query() query: RecommendEvalSnapshotQueryRequestDto,
  ): Promise<EvalSnapshot> {
    return this.snapshotService.export(
      {
        maxUsers: query.max_users ?? SNAPSHOT_DEFAULT_MAX_USERS,
        signalDays: query.signal_days ?? SNAPSHOT_DEFAULT_SIGNAL_DAYS,
      },
      new Date(),
    );
  }
}
