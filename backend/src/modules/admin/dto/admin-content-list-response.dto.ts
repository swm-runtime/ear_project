import { AdminContentPage } from '../admin.types';
import { AdminContentItemDto } from './admin-content-item.dto';

/** convention.md 5.3 — 관리 화면은 offset 페이지네이션을 허용한다 */
export class AdminContentListResponseDto {
  readonly items: AdminContentItemDto[];
  readonly total: number;

  static from(page: AdminContentPage): AdminContentListResponseDto {
    return {
      items: page.items.map((item) => AdminContentItemDto.from(item)),
      total: page.total,
    };
  }
}
