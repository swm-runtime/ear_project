import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { SeriesStatus } from '../content.enum';

/**
 * 시리즈(KAN-134 확정 설계 1번, 2026-10-17) — 처음부터 N편으로 기획한 콘텐츠 묶음의 주인.
 * `contents.series_id`가 이 행을 가리킨다(`fk_contents_series`).
 *
 * **표지 칸이 없다** — 표지는 발행 중인 가장 앞 편(보통 1화)의 썸네일이다(결정 2026-10-09).
 * **시장 칸도 없다** — 시리즈는 편(contents)의 시장을 따른다. 같은 시리즈에 다른 시장 편을 올리지 못하게 업로드가 막는다.
 *
 * 담기·재생 위치·완청·통계·페이월 차감은 지금처럼 편 단위다 — 그 테이블들은 이 테이블을 참조하지 않는다.
 */
@Entity('series')
export class Series extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  /**
   * 계획 편수 — 총 편수의 기준이다(`contents.total_episodes`는 업로드 계약 호환으로 남고 이 값과 같아야 한다).
   * 상한은 없다. 이미 발행된 가장 큰 편 번호보다 작게 줄일 수 없다
   */
  @Column({ name: 'total_episodes', type: 'int' })
  totalEpisodes: number;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: SeriesStatus;
}
