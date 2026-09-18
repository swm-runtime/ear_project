import { Controller, Get, Header } from '@nestjs/common';

import { PublicSampleResponseDto } from '../dto/public-sample-response.dto';
import { PublicSampleService } from '../services/public-sample.service';

/**
 * public-api.md 2.2 — **로그인 없이** 부르는 샘플 오디오. 랜딩 페이지 Try 섹션이 브라우저에서
 * 직접 부른다(빌드 시점이 아니라 재생 시점 — 서명 URL은 수 분 만에 만료되므로 HTML에 굽지 못한다).
 *
 * 인증이 없으므로 전역 레이트 리밋(IP 단위)만 걸린다. 응답에 서명 URL이 들어 있어 **캐시하지
 * 않는다** — 공개 주제 목록(5분 캐시)과 다른 점이다.
 */
@Controller('public/sample')
export class PublicSampleController {
  constructor(private readonly publicSampleService: PublicSampleService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async getSample(): Promise<PublicSampleResponseDto> {
    return PublicSampleResponseDto.from(
      await this.publicSampleService.get(new Date()),
    );
  }
}
