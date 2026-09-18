import { Controller, Get, Header } from '@nestjs/common';

import { PublicTopicListResponseDto } from './dto/public-topic-list-response.dto';
import { TopicService } from './services/topic.service';

/**
 * public-api.md — **로그인 없이** 부르는 공개 주제 목록. 랜딩 페이지가 빌드할 때 받아 "고를 수 있는 주제"
 * 섹션을 그린다(관리자에서 공개한 주제와 랜딩이 어긋나지 않게 — 2026-09-17).
 *
 * 노출 판정은 앱 온보딩과 같다 — `is_visible = true`만(`TopicService.findAllVisible`). 노출 가능 콘텐츠가
 * 0건인 주제는 서버가 켜지 못하게 하고 자동으로 숨기므로(admin.md 4.5) 여기 나오는 주제는 들을 게 있다.
 *
 * 인증이 없으므로 전역 레이트 리밋(IP 단위)만 걸린다. 응답은 5분 캐시해도 된다 — 주제 공개는 드물게 바뀌고,
 * 랜딩은 하루 한 번 다시 빌드한다.
 */
@Controller('public/topics')
export class PublicTopicController {
  constructor(private readonly topicService: TopicService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  async getTopics(): Promise<PublicTopicListResponseDto> {
    return PublicTopicListResponseDto.from(
      await this.topicService.findAllVisible(),
    );
  }
}
