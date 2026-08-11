import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { JobCategoryListResponseDto } from '../dto/job-category-list-response.dto';
import { UserCareerService } from '../services/user-career.service';

/**
 * career-api.md 4.3 — 직군 선택지 목록. **온보딩 2단계와 커리어 정보 화면이 같은 목록을
 * 쓴다**(확정 2026-08-10 — 클라이언트 상수 금지).
 *
 * `/onboarding` 아래나 `/users/me` 아래에 두지 않는 이유(3장 설계 메모) — 온보딩 완료
 * 계정의 접근이 어색해지고, `me` 아래면 개인화된 값처럼 읽힌다. 사용자별로 다르지 않은
 * 참조 데이터라 최상위 리소스다.
 */
@Controller('job-categories')
@UseGuards(JwtAuthGuard)
export class JobCategoryController {
  constructor(private readonly userCareerService: UserCareerService) {}

  @Get()
  getJobCategories(): JobCategoryListResponseDto {
    return JobCategoryListResponseDto.from(
      this.userCareerService.getJobCategories(),
    );
  }
}
