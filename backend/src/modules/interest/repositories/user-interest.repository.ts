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

  /** 탈퇴 파기용 (domain.md 12.3) */
  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
