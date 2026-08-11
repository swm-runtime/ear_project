import { UserInterestItemDto } from './user-interest-item.dto';
import { UserInterestSelectionView } from '../interest.types';

/**
 * interest-management-api.md 4.2 — 현재 관심사 조회.
 *
 * 활성 관심사가 노출 주제에 하나도 없으면 `interests: []`다 — **404가 아니다.** 보유 주제가
 * 전부 숨겨진 극단 상황에서도 화면은 0개 상태(저장 비활성 + 최소 1개 문구)로 동작해야 한다.
 */
export class GetUserInterestsResponseDto {
  readonly interests: UserInterestItemDto[];

  static from(views: UserInterestSelectionView[]): GetUserInterestsResponseDto {
    return { interests: views.map((view) => UserInterestItemDto.from(view)) };
  }
}
