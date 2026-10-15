import { QueryFailedError } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { TopicService } from './topic.service';
import { Topic } from '../entities/topic.entity';
import { TopicRepository } from '../repositories/topic.repository';
import { UserInterestRepository } from '../repositories/user-interest.repository';
import { UserMarket } from '@/modules/user/user.enum';

/** '한'을 자모로 풀어 쓴 NFD 표기 — macOS 파일명·일부 입력기에서 이렇게 들어온다 */
const NFD_HAN = '한';

describe('TopicService', () => {
  let service: TopicService;
  let repository: jest.Mocked<TopicRepository>;
  let userInterestRepository: jest.Mocked<UserInterestRepository>;

  beforeEach(() => {
    repository = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn((value: Partial<Topic>) => value as Topic),
      saveAll: jest.fn((values: Topic[]) => Promise.resolve(values)),
    } as unknown as jest.Mocked<TopicRepository>;

    userInterestRepository = {
      deleteByTopicId: jest.fn().mockResolvedValue(2),
    } as unknown as jest.Mocked<UserInterestRepository>;
    repository.remove = jest.fn().mockResolvedValue(undefined);

    service = new TopicService(repository, userInterestRepository);
  });

  it('주제를 삭제하면 그 주제를 고른 관심사 행을 먼저 지우고 지운 수를 돌려준다', async () => {
    // given — 관심사 행이 남아 있으면 FK 에 걸려 주제 삭제가 500 이 된다
    const topic = { id: 'topic-1' } as Topic;

    // when
    const removed = await service.remove(topic);

    // then
    expect(removed).toBe(2);
    expect(
      userInterestRepository.deleteByTopicId.mock.invocationCallOrder[0],
    ).toBeLessThan(repository.remove.mock.invocationCallOrder[0]);
  });

  it('생성 시 주제명을 NFC로 정규화해 적재한다 — 검색 4필드 중 주제명만 빠져 있던 규칙', async () => {
    // when
    const saved = await service.create({
      name: NFD_HAN,
      parentCategory: '커리어',
      displayOrder: null,
      market: UserMarket.KR,
      slug: null,
    });

    // then
    expect(saved.name).toBe('한');
  });

  it('수정 시에도 주제명을 NFC로 정규화한다', async () => {
    // given
    const topic = { name: '기존', parentCategory: '커리어' } as Topic;

    // when
    const saved = await service.update(topic, { name: NFD_HAN });

    // then
    expect(saved.name).toBe('한');
  });

  it('같은 시장에 같은 slug 가 있으면 409 CONFLICT 로 돌려준다 — 500 이 아니다', async () => {
    // given — `uq_topics_market_slug` 위반
    repository.saveAll.mockRejectedValue(
      new QueryFailedError('INSERT', [], { code: '23505' } as never),
    );

    // when
    const result = service.create({
      name: 'K-Pop',
      parentCategory: 'K-Pop',
      displayOrder: null,
      market: UserMarket.GLOBAL,
      slug: 'k-pop',
    });

    // then
    await expect(result).rejects.toBeInstanceOf(BusinessException);
    await expect(result).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
  });

  it('수정에 slug 가 담기면 그 값으로 바꾼다', async () => {
    // given
    const topic = { name: '커리어', slug: null } as Topic;

    // when
    const saved = await service.update(topic, { slug: 'career' });

    // then
    expect(saved.slug).toBe('career');
  });

  it('수정에 slug 가 null 로 담기면 비운다', async () => {
    // given
    const topic = { name: '커리어', slug: 'career' } as Topic;

    // when
    const saved = await service.update(topic, { slug: null });

    // then
    expect(saved.slug).toBeNull();
  });
});
