import { CURRENT_ENRICHMENT_SCHEMA_VERSION } from '../../content/content.constant';
import { AdminContentPage } from '../admin.types';
import { AdminContentItemDto } from './admin-content-item.dto';

/** convention.md 5.3 — 관리 화면은 offset 페이지네이션을 허용한다 */
export class AdminContentListResponseDto {
  readonly items: AdminContentItemDto[];
  readonly total: number;
  /**
   * 현재 추천 메타 형식 버전(admin-api.md 4.5 · 8장). 콘솔은 각 항목의
   * `enrichment_schema_version`을 이 값과 비교해 구형 메타를 고른다 — 서버만 아는 값을
   * 콘솔이 상수로 따로 들고 있으면 형식이 오를 때 두 곳이 어긋나 구형 콘텐츠를 놓친다(KAN-55)
   */
  readonly current_enrichment_schema_version: number;

  static from(page: AdminContentPage): AdminContentListResponseDto {
    return {
      items: page.items.map((item) => AdminContentItemDto.from(item)),
      total: page.total,
      current_enrichment_schema_version: CURRENT_ENRICHMENT_SCHEMA_VERSION,
    };
  }
}
