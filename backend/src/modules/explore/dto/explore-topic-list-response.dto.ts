import { ExploreTopicChipView } from '../explore.types';

class ExploreTopicChipDto {
  readonly id: string;
  readonly name: string;
  /** 관심 주제인가 — **순서만으로는 어디까지가 관심 주제인지 알 수 없다** */
  readonly is_interest: boolean;
}

/**
 * explore-api.md 4.2-2 — 주제 칩 줄이 무엇을 보여줄지.
 *
 * **정렬은 서버가 소유한다.** 관심 주제가 앞쪽(선택한 순서), 나머지 노출 주제가 뒤쪽
 * (`display_order` 순)이며 클라이언트는 재배열하지 않는다.
 *
 * **잔여 재생 표시값을 싣지 않는다** — 탐색 진입 시 피드(4.1)가 이미 그 값을 내려준다.
 * 같은 화면에서 두 응답이 다른 시점의 숫자를 실어 보내면 어느 쪽이 최신인지 판단해야 한다.
 *
 * 노출할 주제가 하나도 없으면 `topics: []`다. **404가 아니다.**
 */
export class ExploreTopicListResponseDto {
  readonly topics: ExploreTopicChipDto[];

  static from(chips: ExploreTopicChipView[]): ExploreTopicListResponseDto {
    return {
      topics: chips.map((chip) => ({
        id: chip.id,
        name: chip.name,
        is_interest: chip.isInterest,
      })),
    };
  }
}
