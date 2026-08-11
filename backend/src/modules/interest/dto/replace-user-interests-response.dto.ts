import { UserInterestItemDto } from './user-interest-item.dto';
import { UserInterestSelectionView } from '../interest.types';

/**
 * interest-management-api.md 4.3 — 저장 후의 최종 상태를 조회(4.2)와 **같은 모양**으로
 * 되돌린다. 클라이언트는 이 값으로 화면을 확정하고 성공 토스트 후 이전 화면으로 복귀한다.
 */
export class ReplaceUserInterestsResponseDto {
  readonly interests: UserInterestItemDto[];

  static from(
    views: UserInterestSelectionView[],
  ): ReplaceUserInterestsResponseDto {
    return { interests: views.map((view) => UserInterestItemDto.from(view)) };
  }
}
