import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/user/entities/user.entity';

/**
 * domain.md 5.7 — 키워드 검색 **첫 페이지 요청 1회 = 1행**이다(`explore.md` 4.5-5).
 *
 * 매칭 방식(`pg_trgm` 부분 일치)의 재검토 근거를 만들기 위한 표다 — "어떤 질의가 0건으로
 * 끝나는가"를 세는 것이 목적이고, 그 밖의 분석(형태소·오타·동의어 도입 여부)도 전부 이
 * 원천에서 나온다. 구조화 로그로 보내지 않는 이유: CloudWatch 보관이 7일이라
 * (`backend-monitoring.md`) 몇 주 단위의 미스율을 셀 수 없다.
 *
 * 저장하는 질의는 **정규화된 값**(NFC·소문자·트림)이다 — 조회가 본 그 문자열이라 결과 수와
 * 짝이 맞고, 같은 뜻의 입력이 한 행으로 묶인다. 커서 페이지는 기록하지 않는다(같은 질의의
 * 반복일 뿐 새 검색이 아니다).
 *
 * 디바운스 자동 검색의 중간 입력("커"·"커리"·"커리어")도 전부 행이 된다 — 서버는 제출과
 * 자동 검색을 구분할 수 없다. 분석할 때 같은 사용자의 연속 행에서 앞 질의가 뒤 질의의
 * 접두사이면 뒤 것만 세는 식으로 접는다. `user_id`는 그 접기와 탈퇴 파기 경로용이고, 집계는
 * 개인 식별 없이 질의·건수만 쓴다.
 */
@Entity('search_query_logs')
@Index('idx_search_query_logs_user_id_created_at', ['userId', 'createdAt'])
// 보존 기간 배치가 `created_at`만으로 범위 삭제한다 (domain.md 12.1)
@Index('idx_search_query_logs_created_at', ['createdAt'])
export class SearchQueryLog extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_search_query_logs_users',
  })
  user: User;

  /** 정규화된 질의(NFC·소문자·트림). 길이 상한은 요청 DTO와 같은 100자 */
  @Column({ name: 'query', type: 'varchar', length: 100 })
  query: string;

  /**
   * 첫 페이지에 실린 건수(0 ~ 페이지 크기). **총 건수가 아니다** — 총수를 세면 검색마다
   * COUNT 쿼리가 하나 더 붙는데, 미스율에 필요한 것은 0건 여부뿐이다
   */
  @Column({ name: 'result_count', type: 'smallint' })
  resultCount: number;

  /** 첫 페이지 뒤에 더 있었는가 — `result_count`가 페이지 크기와 같을 때 "딱 그만큼"과 "더 있음"을 가른다 */
  @Column({ name: 'has_next', type: 'boolean' })
  hasNext: boolean;

  /** 함께 걸린 주제 필터 수. 0이면 필터 없는 검색 — 0건의 원인이 질의인지 필터인지 가른다 */
  @Column({ name: 'topic_filter_count', type: 'smallint' })
  topicFilterCount: number;
}
