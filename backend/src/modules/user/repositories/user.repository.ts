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

  /**
   * 같은 사용자의 동시 처리를 **직렬화하기 위한** 행 잠금. 트랜잭션 안에서만 의미가 있다.
   *
   * 읽고-판정하고-쓰는 흐름(재생 한도 차감·탈퇴 아카이브)은 READ COMMITTED에서 두 요청이
   * 같은 스냅샷을 보고 둘 다 통과한다. 잠글 행은 사용자 자신이다 — 판정 대상 테이블이
   * 여러 개라 그것들을 각각 잠그는 것보다 사용자 하나를 잠그는 편이 단순하고 확실하다.
   */
  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<User | null> {
    return manager.getRepository(User).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
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
  /**
   * 파이프라인 SSO가 관리자 계정을 찾는 유일한 경로(`auth-api.md` 4.12).
   *
   * **대소문자를 무시하고 비교한다.** 어느 제공자도 로컬 파트를 대소문자로 구분하지 않는데,
   * 정확 일치로 두면 `Alice@corp.com` 어서션이 `alice@corp.com` 행을 못 찾아 **권한 문제처럼
   * 보이는 403**이 난다.
   *
   * **정렬을 고정한다.** `email`은 유니크가 아니고(`domain.md` 3.1 — 식별자가 아니라 연락처),
   * 같은 주소의 관리자가 둘이면 `LIMIT 1`이 **매번 다른 행**을 줄 수 있다. 그러면
   * `audit_logs.actor`가 실행할 때마다 갈린다.
   */
  async findAdminByEmail(email: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .andWhere('user.role = :role', { role: UserRole.ADMIN })
      .orderBy('user.created_at', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .getOne();
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
