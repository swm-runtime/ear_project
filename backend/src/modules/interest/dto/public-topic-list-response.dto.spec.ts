import { Topic } from '../entities/topic.entity';
import { PublicTopicListResponseDto } from './public-topic-list-response.dto';

function topic(name: string, parentCategory: string): Topic {
  return { id: `id-${name}`, name, parentCategory, isVisible: true } as Topic;
}

describe('PublicTopicListResponseDto', () => {
  it('정렬된 주제를 대분류별로 묶고 대분류는 처음 나온 순서를 따른다', () => {
    // given — display_order 오름차순으로 들어온다
    const topics = [
      topic('재테크', '돈'),
      topic('부동산', '돈'),
      topic('커리어 설계', '일'),
      topic('투자', '돈'),
    ];

    // when
    const response = PublicTopicListResponseDto.from(topics);

    // then
    expect(response).toEqual({
      groups: [
        {
          name: '돈',
          topics: [{ name: '재테크' }, { name: '부동산' }, { name: '투자' }],
        },
        { name: '일', topics: [{ name: '커리어 설계' }] },
      ],
    });
  });

  it('id 같은 운영 값은 싣지 않는다 — 로그인 없이 보이는 응답이다', () => {
    // when
    const response = PublicTopicListResponseDto.from([topic('재테크', '돈')]);

    // then
    expect(response.groups[0].topics[0]).toEqual({ name: '재테크' });
  });
});
