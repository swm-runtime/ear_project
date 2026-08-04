import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { SocialProvider } from '../user.enum';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  private scoped(manager?: EntityManager): Repository<User> {
    return manager ? manager.getRepository(User) : this.repository;
  }

  async findById(id: string, manager?: EntityManager): Promise<User | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  /** domain.md 3.1 — 계정 식별은 `provider + provider_user_id` 조합이다 */
  async findByProviderAndProviderUserId(
    provider: SocialProvider,
    providerUserId: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    return this.scoped(manager).findOneBy({ provider, providerUserId });
  }

  async save(user: User, manager?: EntityManager): Promise<User> {
    return this.scoped(manager).save(user);
  }

  create(user: Partial<User>): User {
    return this.repository.create(user);
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ id });
  }
}
