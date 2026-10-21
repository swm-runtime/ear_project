import { Module } from '@nestjs/common';

import { DripBatchModule } from '@/modules/drip-batch/drip-batch.module';
import { PartnerModule } from '@/modules/partner/partner.module';

import { RecommendInspectorController } from './recommend-inspector.controller';
import { RecommendInspectorRepository } from './recommend-inspector.repository';
import { RecommendInspectorService } from './recommend-inspector.service';

/**
 * 서비스 지표 "추천 검증"(`/admin/insights/recommendations/*`, 2026-10-22) — **Entity를 소유하지 않는 읽기 전용 유스케이스 모듈**
 * (architecture.md 3.3).
 *
 * 경로는 서비스 지표(`AdminModule`) 아래지만 모듈은 따로 둔다 — 추천 계산(`DripPreviewService.explain`)이 편성 배치 모듈에 있고,
 * `AdminModule`이 배치 모듈을 의존하게 만들 이유가 없다(편성 미리보기 컨트롤러를 배치 모듈에 둔 것과 같은 판단). 감사 로그는
 * 소유 모듈(`partner`)의 서비스만 쓴다. 어떤 모듈도 이 모듈을 의존하지 않는다.
 */
@Module({
  imports: [DripBatchModule, PartnerModule],
  controllers: [RecommendInspectorController],
  providers: [RecommendInspectorRepository, RecommendInspectorService],
})
export class RecommendInspectorModule {}
