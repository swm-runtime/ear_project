import { LibraryItem } from '@/modules/library/library-item.entity';
import { User } from '@/modules/user/entities/user.entity';

import { RecommendTestAction } from './recommend-test.enum';

export interface RecommendTestAccountView {
  /** `SENTRY_ENVIRONMENT` — 콘솔이 "개발계" 배지를 그리는 근거 */
  environment: string;
  user: User;
  interests: { topicId: string; name: string | null; source: string }[];
  /** 삭제된 항목은 제외 — 앱 라이브러리가 보는 것과 같다 */
  library: LibraryItem[];
}

export interface RecommendTestActionResult {
  action: RecommendTestAction;
  contentId: string;
  performedAt: Date;
  effects: string[];
  preferenceRebuilt: boolean;
}
