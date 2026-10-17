import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  CreateSeriesCommand,
  UpdateSeriesCommand,
} from '@/modules/content/content.types';
import { Series } from '@/modules/content/entities/series.entity';
import {
  SeriesService,
  SeriesWithCounts,
} from '@/modules/content/services/series.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import {
  AUDIT_ACTION_SERIES_CREATE,
  AUDIT_ACTION_SERIES_UPDATE,
} from '../admin.constant';

/**
 * 시리즈 관리(KAN-134 확정 설계 2번). 쓰기와 감사 기록을 **한 트랜잭션**으로 묶는다(공지·초대 코드 관리와 같은 구조).
 * 시리즈를 지우는 API는 없다 — 편이 FK로 가리키고, 회수는 편 단위(시리즈 전 편 회수는 파이프라인이 편마다 부른다).
 */
@Injectable()
export class AdminSeriesService {
  private readonly logger = new Logger(AdminSeriesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly seriesService: SeriesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(): Promise<SeriesWithCounts[]> {
    return this.seriesService.findAllWithCounts();
  }

  async create(
    actorUserId: string,
    command: CreateSeriesCommand,
  ): Promise<SeriesWithCounts> {
    const created = await this.dataSource.transaction(async (manager) => {
      const series = await this.seriesService.create(command, manager);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_SERIES_CREATE,
          target: `series:${series.id}`,
          after: snapshot(series),
        },
        manager,
      );
      return series;
    });

    this.logger.log('series created', {
      series_id: created.id,
      actor: actorUserId,
    });

    // 막 만든 시리즈는 편이 없다
    return {
      series: created,
      counts: await this.seriesService.getCounts(created.id),
    };
  }

  async update(
    actorUserId: string,
    seriesId: string,
    command: UpdateSeriesCommand,
  ): Promise<SeriesWithCounts> {
    const updated = await this.dataSource.transaction(async (manager) => {
      // 업로드 검증과 같은 행 잠금 — 편수를 줄이는 사이에 큰 번호 편이 올라가 하한을 넘지 않게
      const current = await this.seriesService.getByIdForUpdate(
        seriesId,
        manager,
      );
      const before = snapshot(current);
      const saved = await this.seriesService.update(current, command, manager);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_SERIES_UPDATE,
          target: `series:${saved.id}`,
          before,
          after: snapshot(saved),
        },
        manager,
      );
      return saved;
    });

    this.logger.log('series updated', {
      series_id: updated.id,
      actor: actorUserId,
    });

    return {
      series: updated,
      counts: await this.seriesService.getCounts(updated.id),
    };
  }
}

/** 소개는 길 수 있어 길이만 남긴다 — 감사 로그는 "무엇이 바뀌었나"를 추적하는 용도다(공지와 같은 규칙) */
function snapshot(series: Series): Record<string, unknown> {
  return {
    title: series.title,
    description_length: series.description.length,
    total_episodes: series.totalEpisodes,
    status: series.status,
  };
}
