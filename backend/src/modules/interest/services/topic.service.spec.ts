import { TopicService } from './topic.service';
import { Topic } from '../entities/topic.entity';
import { TopicRepository } from '../repositories/topic.repository';

/** '한'을 자모로 풀어 쓴 NFD 표기 — macOS 파일명·일부 입력기에서 이렇게 들어온다 */
const NFD_HAN = '한';

describe('TopicService', () => {
  let service: TopicService;
  let repository: jest.Mocked<TopicRepository>;

  beforeEach(() => {
    repository = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn((value: Partial<Topic>) => value as Topic),
      saveAll: jest.fn((values: Topic[]) => Promise.resolve(values)),
    } as unknown as jest.Mocked<TopicRepository>;

    service = new TopicService(repository);
  });

  it('생성 시 주제명을 NFC로 정규화해 적재한다 — 검색 4필드 중 주제명만 빠져 있던 규칙', async () => {
    // when
    const saved = await service.create({
      name: NFD_HAN,
      parentCategory: '커리어',
      displayOrder: null,
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
});
