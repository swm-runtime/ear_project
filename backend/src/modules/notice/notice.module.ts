import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notice } from './entities/notice.entity';
import { NoticeController } from './notice.controller';
import { NoticeRepository } from './notice.repository';
import { NoticeService } from './notice.service';

/**
 * `notices` 소유(KAN-67). **다른 모듈을 의존하지 않는다.** 관리자 쓰기(감사 기록 포함)는 admin
 * 모듈이 `NoticeService`를 불러 조합한다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Notice])],
  controllers: [NoticeController],
  providers: [NoticeRepository, NoticeService],
  exports: [NoticeService],
})
export class NoticeModule {}
