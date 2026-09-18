import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { DataSource } from 'typeorm';

import { TopicExposureService } from './services/topic-exposure.service';

/**
 * 노출 가능 콘텐츠가 0건인 노출 주제의 일일 숨김(admin.md 4.5, KAN-58).
 *
 * 회수·재발행은 그 자리에서 숨기지만 **라이선스 만료는 사건이 아니라 시각이 지나는 것**이라
 * 트리거가 없다. 이 배치가 그 경로를 맡고, 규칙 이전에 0건인 채 켜진 주제도 첫 실행에서 정리한다.
 *
 * **04:15 KST** — 라이선스 만료 배치(04:10) 뒤, 드립 편성(05:00) 앞. 판정은 `status`가 아니라
 * 만료일로 걸러지므로(`CONTENT_VISIBILITY_CONDITION`) 만료 배치가 늦어지거나 실패해도 결과가
 * 틀리지 않는다 — 순서는 로그를 읽기 쉽게 하려는 것이지 정합성 조건이 아니다.
 *
 * 멱등이다. 바뀔 것이 없으면 아무것도 쓰지 않는다. 던지지 않는다 — 던지면 스케줄러가 멈춘다.
 */
@Injectable()
export class TopicExposureScheduler {
  private readonly logger = new Logger(TopicExposureScheduler.name);

  constructor(
    private readonly topicExposureService: TopicExposureService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('15 4 * * *', {
    name: 'empty-topic-sweep',
    timeZone: 'Asia/Seoul',
  })
  async run(): Promise<void> {
    const now = new Date();

    try {
      await this.dataSource.transaction((manager) =>
        this.topicExposureService.hideAllEmptyVisibleTopics(now, manager),
      );
    } catch (error) {
      // 다음 날 다시 시도한다. 그 사이 새 회수·재발행은 각 경로가 즉시 판정한다
      this.logger.error(
        'empty topic sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
