import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { AudioAccessLog } from '../entities/audio-access-log.entity';

@Injectable()
export class AudioAccessLogRepository {
  constructor(
    @InjectRepository(AudioAccessLog)
    private readonly repository: Repository<AudioAccessLog>,
  ) {}

  private scoped(manager?: EntityManager): Repository<AudioAccessLog> {
    return manager ? manager.getRepository(AudioAccessLog) : this.repository;
  }

  /**
   * 발급 사실 적재(domain.md 6.5). **서명 URL은 인자로도 받지 않는다** — 받을 수 있게
   * 두면 언젠가 저장된다(`architecture.md` 9.4).
   */
  async insert(
    log: Pick<
      AudioAccessLog,
      'contentId' | 'userId' | 'deviceId' | 'issuedAt' | 'expiresAt' | 'ipHash'
    >,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).insert(log);
  }
}
