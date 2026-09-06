import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { SocialProvider, UserRole } from '../user.enum';

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

  /**
   * 파이프라인 SSO(auth) — 이메일이 같은 **관리자** 계정. `email`은 유일 제약이 없으므로
   * (제공자별 계정이 같은 주소를 가질 수 있다) role까지 대조해 대상을 하나로 좁힌다.
   */
  async findAdminByEmail(email: string): Promise<User | null> {
    return this.repository.findOneBy({ email, role: UserRole.ADMIN });
  }

  /**
   * 편성 배치 대상 한 페이지 — **온보딩을 마친 사용자 전부**다(`drip-scheduling.md` 2 —
   * 전 티어 대상, 티어는 편수만 가른다). 탈퇴자는 행이 삭제되므로 조건이 필요 없다.
   * `id` keyset으로 전체를 순회한다 — offset은 배치 도중의 가입·탈퇴로 어긋난다.
   */
  async findDripTargetsPage(
    afterId: string | null,
    limit: number,
    manager?: EntityManager,
  ): Promise<User[]> {
    const builder = this.scoped(manager)
      .createQueryBuilder('user')
      .where('user.onboarding_completed = true')
      .orderBy('user.id', 'ASC')
      .limit(limit);

    if (afterId) {
      builder.andWhere('user.id > :afterId', { afterId });
    }

    return builder.getMany();
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
