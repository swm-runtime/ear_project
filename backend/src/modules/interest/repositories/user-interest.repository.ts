import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserInterest } from '../entities/user-interest.entity';

@Injectable()
export class UserInterestRepository {
  constructor(
    @InjectRepository(UserInterest)
    private readonly repository: Repository<UserInterest>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserInterest> {
    return manager ? manager.getRepository(UserInterest) : this.repository;
  }

  async findAllByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserInterest[]> {
    return this.scoped(manager).findBy({ userId });
  }

  async findAllActiveByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserInterest[]> {
    return this.scoped(manager).find({
      where: { userId, isActive: true },
      order: { createdAt: 'ASC' },
    });
  }

  async saveAll(
    interests: UserInterest[],
    manager?: EntityManager,
  ): Promise<UserInterest[]> {
    return this.scoped(manager).save(interests);
  }

  create(interest: Partial<UserInterest>): UserInterest {
    return this.repository.create(interest);
  }

  /** 주제 삭제용 — `fk_user_interests_topics`(ON DELETE 없음)를 풀기 위해 먼저 지운다. 지운 행 수를 돌려준다 */
  async deleteByTopicId(
    topicId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.scoped(manager).delete({ topicId });

    return result.affected ?? 0;
  }

  /** 탈퇴 파기용 (domain.md 12.3) */
  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
