import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Topic } from '../entities/topic.entity';

@Injectable()
export class TopicRepository {
  constructor(
    @InjectRepository(Topic)
    private readonly repository: Repository<Topic>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Topic> {
    return manager ? manager.getRepository(Topic) : this.repository;
  }

  /** onboarding-api.md 4.2 — `is_visible = true`만, `display_order` 오름차순 */
  async findAllVisible(manager?: EntityManager): Promise<Topic[]> {
    return this.scoped(manager).find({
      where: { isVisible: true },
      order: { displayOrder: 'ASC' },
    });
  }

  /** 노출 주제가 하나도 없을 때의 폴백 경로에서만 쓴다 (onboarding.md 7) */
  async findAll(manager?: EntityManager): Promise<Topic[]> {
    return this.scoped(manager).find({ order: { displayOrder: 'ASC' } });
  }

  async findAllByIds(ids: string[], manager?: EntityManager): Promise<Topic[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({ id: In(ids) });
  }

  async saveAll(topics: Topic[], manager?: EntityManager): Promise<Topic[]> {
    return this.scoped(manager).save(topics);
  }

  create(topic: Partial<Topic>): Topic {
    return this.repository.create(topic);
  }
}
