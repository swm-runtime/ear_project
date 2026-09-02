import { StatsPeriodType } from '@/modules/content/content.enum';

import { ExploreSectionKey } from '../explore.enum';
import { ExploreFeedResult } from '../explore.types';
import { ExploreItemDto } from './explore-item.dto';

class ExploreSectionTopicDto {
  readonly id: string;
  readonly name: string;
}

class ExploreSectionDto {
  /** **분석·로깅용.** 화면 분기에 쓰지 않는다 */
  readonly key: ExploreSectionKey;
  /** **화면에 그대로 그리는 문자열.** 구성·순서·제목은 서버 제어다 */
  readonly title: string;
  /** `topic_group` 섹션만 값이 있다 */
  readonly topic: ExploreSectionTopicDto | null;
  /** **`popular` 섹션만 값이 있다** — 구간 토글의 선택 상태를 그리는 근거다 */
  readonly period: StatsPeriodType | null;
  readonly items: ExploreItemDto[];
}

/**
 * explore-api.md 4.1.
 *
 * **잔여 재생 표시값을 피드에 얹는다.** 전용 엔드포인트를 두지 않는 이유는 피드를 여는
 * 시점이 곧 그 값을 갱신하는 시점이기 때문이다 — 호출을 나누면 화면과 숫자가 어긋난다.
 * 라이브러리와 **같은 이름·같은 규약**의 세 필드다(explore-api.md 2장).
 *
 * 섹션이 하나도 없으면 `sections: []`다. **404가 아니다** — 빈 피드는 정상 상태이며
 * 클라이언트가 "준비된 콘텐츠가 곧 늘어나요"를 그린다.
 */
export class GetExploreFeedResponseDto {
  readonly sections: ExploreSectionDto[];
  /** **null이면 무제한** */
  readonly daily_play_limit: number | null;
  /** `daily_play_limit`이 null이면 이 값도 null이다 */
  readonly daily_play_count: number | null;
  /** 04:00 KST 경계로 계산한 날짜 라벨. UTC 타임스탬프가 아니다 */
  readonly service_date: string;

  static from(result: ExploreFeedResult): GetExploreFeedResponseDto {
    return {
      sections: result.sections.map((section) => ({
        key: section.key,
        title: section.title,
        topic: section.topic
          ? { id: section.topic.id, name: section.topic.name }
          : null,
        period: section.period,
        items: section.items.map((item) => ExploreItemDto.from(item)),
      })),
      daily_play_limit: result.quota.dailyPlayLimit,
      daily_play_count: result.quota.dailyPlayCount,
      service_date: result.quota.serviceDate,
    };
  }
}
