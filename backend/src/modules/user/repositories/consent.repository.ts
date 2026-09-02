import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Consent } from '../entities/consent.entity';

@Injectable()
export class ConsentRepository {
  constructor(
    @InjectRepository(Consent)
    private readonly repository: Repository<Consent>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Consent> {
    return manager ? manager.getRepository(Consent) : this.repository;
  }

  /** append-only이므로 저장은 추가뿐이다 (domain.md 3.2) */
  async saveAll(
    consents: Consent[],
    manager?: EntityManager,
  ): Promise<Consent[]> {
    return this.scoped(manager).save(consents);
  }

  create(consent: Partial<Consent>): Consent {
    return this.repository.create(consent);
  }

  async findAllByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Consent[]> {
    return this.scoped(manager).find({
      where: { userId },
      order: { agreedAt: 'DESC' },
    });
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
