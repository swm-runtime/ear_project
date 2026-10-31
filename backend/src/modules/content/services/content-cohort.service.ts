import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { UserMarket } from '@/modules/user/user.enum';

import {
  parseShortContentCohortSince,
  resolveContentLengthProfile,
} from '../content-cohort.policy';
import { ContentLengthProfile } from '../content.enum';

/**
 * 짧은 판 코호트(KAN-298)의 **서버 한 곳** — 노출면(드립·탐색·검색·추천·시리즈 목록·리텐션 알림)이 사용자 코호트를 여기서만 묻는다.
 * 규칙은 `content-cohort.policy.ts`, 이 클래스는 설정값(`SHORT_CONTENT_COHORT_SINCE`)을 부팅 때 한 번 읽어 붙인다.
 */
@Injectable()
export class ContentCohortService {
  private readonly since: Date | null;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.since = parseShortContentCohortSince(
      configService.get('SHORT_CONTENT_COHORT_SINCE', { infer: true }),
    );
  }

  /** 가입 시각·시장 → 길이 프로필. 요청 경로는 `AuthenticatedUser.signedUpAt`, 배치는 `users.created_at`을 넘긴다 */
  resolve(
    signedUpAt: Date | null | undefined,
    market: UserMarket,
  ): ContentLengthProfile {
    return resolveContentLengthProfile(signedUpAt, this.since, market);
  }

  /** 원시 SQL 판정(`cohortLengthProfileSql`)의 파라미터 — 비어 있으면 null(전원 standard) */
  cohortSince(): Date | null {
    return this.since;
  }
}
