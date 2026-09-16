import { CURRENT_ENRICHMENT_SCHEMA_VERSION } from '../../content/content.constant';
import { AdminContentListResponseDto } from './admin-content-list-response.dto';

describe('AdminContentListResponseDto', () => {
  it('응답 최상위에 현재 추천 메타 형식 버전을 싣는다 — 콘솔이 구형 메타를 서버 기준으로 판정한다', () => {
    const dto = AdminContentListResponseDto.from({ items: [], total: 0 });

    expect(dto.current_enrichment_schema_version).toBe(
      CURRENT_ENRICHMENT_SCHEMA_VERSION,
    );
    expect(dto.current_enrichment_schema_version).toBe(2);
    expect(dto).toEqual({
      items: [],
      total: 0,
      current_enrichment_schema_version: 2,
    });
  });
});
