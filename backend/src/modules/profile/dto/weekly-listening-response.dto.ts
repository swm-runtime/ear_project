import { TopicDistributionView, WeeklyListeningView } from '../profile.types';

class TopicDistributionItemDto {
  readonly topic_id: string;
  readonly name: string;
  readonly ratio: number;
}

/** 주제 분포(`profile-api.md` 4.1) — 전체 기간·그 주·요일 어디에 실리든 같은 모양이다 */
export class TopicDistributionDto {
  /** 상위 5개(비율 내림차순). 5개 미만이면 있는 만큼만 */
  readonly topics: TopicDistributionItemDto[];
  /** 6위 이하를 묶은 비율. **"기타" 라벨 문자열은 내려주지 않는다** — 카피는 uiux 소유 */
  readonly others_ratio: number;

  static from(view: TopicDistributionView): TopicDistributionDto {
    return {
      topics: view.topics.map((topic) => ({
        topic_id: topic.topicId,
        name: topic.name,
        ratio: topic.ratio,
      })),
      others_ratio: view.othersRatio,
    };
  }
}

/**
 * profile-api.md 4.2 — 주간 그래프 한 주.
 *
 * **4.1의 `weekly_listening` 오브젝트와 같은 모양이다.** 두 응답이 다른 행 타입을 쓰면
 * 그래프 렌더가 두 벌이 된다.
 */
export class WeeklyListeningResponseDto {
  /** 그 주 월요일 라벨. 주 경계는 **월요일 05:00**(`domain.md` 1.2) */
  readonly week_start: string;
  /** 월~일 **7개 고정 배열**(초). 기록 없는 요일도 0으로 자리를 지킨다 */
  readonly daily_listened_sec: number[];
  /** `null`이면 이전 주가 없다(가입 주) → [◀] 비활성 */
  readonly previous_week_start: string | null;
  /** `null`이면 이번 주다 → [다음 주 ▶] 비활성 */
  readonly next_week_start: string | null;
  /** 그 주 청취만의 주제 분포(KAN-113). 기록 없는 주면 `topics: []` · `others_ratio: 0` */
  readonly topic_distribution: TopicDistributionDto;
  /** 월~일 7개 고정 — 각 요일 청취만의 주제 분포. 없는 날도 빈 분포로 자리를 지킨다 */
  readonly daily_topic_distribution: TopicDistributionDto[];

  static from(view: WeeklyListeningView): WeeklyListeningResponseDto {
    return {
      week_start: view.weekStart,
      daily_listened_sec: view.dailyListenedSec,
      previous_week_start: view.previousWeekStart,
      next_week_start: view.nextWeekStart,
      topic_distribution: TopicDistributionDto.from(view.topicDistribution),
      daily_topic_distribution: view.dailyTopicDistribution.map((day) =>
        TopicDistributionDto.from(day),
      ),
    };
  }
}
