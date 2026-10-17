import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Series } from '../entities/series.entity';

@Injectable()
export class SeriesRepository {
  constructor(
    @InjectRepository(Series)
    private readonly repository: Repository<Series>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Series> {
    return manager ? manager.getRepository(Series) : this.repository;
  }

  async findById(id: string, manager?: EntityManager): Promise<Series | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  /**
   * 같은 시리즈를 읽고 바꾸는 경로(관리자 수정·업로드 검증)를 직렬화한다 — 트랜잭션 필수.
   * 편수를 줄이는 수정과 큰 번호 편 업로드가 동시에 오면 둘 다 통과해 "총 편수보다 큰 번호"가 생긴다.
   * `FOR NO KEY UPDATE` — 업로드의 `contents` INSERT가 FK 검사로 잡는 `FOR KEY SHARE`와는 충돌하지 않는다
   * (그쪽은 이 잠금을 같은 트랜잭션 안에서 이미 쥐고 있다)
   */
  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Series | null> {
    return manager.getRepository(Series).findOne({
      where: { id },
      lock: { mode: 'for_no_key_update' },
    });
  }

  async findAllByIds(
    ids: string[],
    manager?: EntityManager,
  ): Promise<Series[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({ id: In(ids) });
  }

  /** 관리자 목록 — 최근에 만든 것부터. 시리즈는 수가 적어(수십 단위) 페이지를 두지 않는다 */
  async findAll(manager?: EntityManager): Promise<Series[]> {
    return this.scoped(manager).find({
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async save(series: Series, manager?: EntityManager): Promise<Series> {
    return this.scoped(manager).save(series);
  }

  create(series: Partial<Series>): Series {
    return this.repository.create(series);
  }
}
