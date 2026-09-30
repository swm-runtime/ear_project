import { Module } from '@nestjs/common';

import { RecommendEvalController } from './recommend-eval.controller';
import { RecommendEvalSnapshotService } from './recommend-eval-snapshot.service';

/**
 * 추천 평가(KAN-108, `backend/recommendation-evaluation.md`).
 *
 * 서버가 하는 일은 **스냅샷 내보내기**뿐이다(읽기 전용 원시 SQL — `DataSource`만 쓴다). 평가 자체(`eval-*.ts`)는
 * 서버 밖에서 `npm run eval:recommend`로 돌리며 Nest 모듈에 등록하지 않는다 — 제품 편성기를 인메모리 세계로
 * 직접 조립해 쓰기 때문에 DI가 필요 없다.
 */
@Module({
  controllers: [RecommendEvalController],
  providers: [RecommendEvalSnapshotService],
})
export class RecommendEvalModule {}
