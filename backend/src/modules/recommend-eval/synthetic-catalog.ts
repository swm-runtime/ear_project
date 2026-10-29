import { EMBEDDING_MODEL_ID } from '@/modules/content/content.constant';

import {
  EVAL_SNAPSHOT_SCHEMA_VERSION,
  EvalSnapshot,
  EvalSnapshotContent,
} from './recommend-eval.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOPIC_COUNT = 6;
const CONTENTS_PER_TOPIC = 14;
/** GLOBAL 시장 — 주제 3 × 콘텐츠 8(`global-api.md` 2.1). 시장 격리 불변식과 GLOBAL 페르소나의 재료다 */
const GLOBAL_TOPIC_COUNT = 3;
const GLOBAL_CONTENTS_PER_TOPIC = 8;
const EMBEDDING_DIM = 16;
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const FORMATS = ['howto', 'interview', 'case_study'];

/** 결정적 의사난수 — 같은 시드면 어디서 돌려도 같은 카탈로그가 나온다 */
function lcg(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const uuid = (kind: number, index: number) =>
  `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${index
    .toString(16)
    .padStart(12, '0')}`;

export const syntheticTopicId = (index: number) => uuid(0xa, index);

/**
 * **합성 카탈로그** — 실데이터 없이 평가기를 돌리기 위한 고정 세계(KR 주제 6 × 콘텐츠 14, 5부작 시리즈 하나 +
 * GLOBAL 주제 3 × 콘텐츠 8). GLOBAL 몫은 KR 몫 **뒤에** 만들어 KR 카탈로그는 GLOBAL 추가 전과 같은 값이다.
 *
 * CI가 PR마다 이 위에서 페르소나를 돌려 **불변식**(관심 밖 콘텐츠가 정규에 섞이지 않는다, 본 것을 다시 주지
 * 않는다, 시리즈 순서 …)을 본다. 숫자 지표의 절대값은 의미가 없다 — 실사용자 스냅샷으로 재는 것과 다른 목적이다
 * (`docs/backend/recommendation-evaluation.md` 3장).
 *
 * 임베딩은 주제별 축 하나에 작은 잡음을 얹은 16차원 벡터다. 같은 주제끼리 가깝고 다른 주제와 멀다는 성질만 있으면
 * 코사인 기반 계산(임베딩 축·MMR)이 실데이터와 같은 방향으로 움직인다.
 */
export function buildSyntheticSnapshot(now: Date): EvalSnapshot {
  const random = lcg(20260930);
  const contents: EvalSnapshotContent[] = [];

  for (let topic = 0; topic < TOPIC_COUNT; topic += 1) {
    for (let index = 0; index < CONTENTS_PER_TOPIC; index += 1) {
      const serial = topic * CONTENTS_PER_TOPIC + index;
      const embedding = Array.from({ length: EMBEDDING_DIM }, (_, dim) =>
        dim === topic ? 1 : (random() - 0.5) * 0.35,
      );
      const playCount = Math.floor(random() * 60);
      // 주제 0의 앞 다섯 편은 5부작 시리즈다 — 시리즈 유료화(KAN-290, 4편부터 프로)가 실제로 갈리는 길이
      const inSeries = topic === 0 && index < 5;

      contents.push({
        id: uuid(0xc, serial),
        title: `합성 ${topic}-${index}`,
        author_name: `저자 ${topic}-${index % 2}`,
        source_name: '합성',
        duration_sec: 420 + Math.floor(random() * 600),
        published_at: new Date(
          now.getTime() - Math.floor(random() * 120) * MS_PER_DAY - MS_PER_DAY,
        ).toISOString(),
        difficulty: DIFFICULTIES[serial % DIFFICULTIES.length],
        format: FORMATS[(serial + topic) % FORMATS.length],
        is_evergreen: serial % 4 === 0,
        keywords: [`주제${topic}`, `키워드${topic}-${index % 3}`],
        target_audiences: null,
        series_id: inSeries ? uuid(0x5, 1) : null,
        episode_no: inSeries ? index + 1 : null,
        status: 'published',
        license_expires_at: null,
        // 다섯 편에 한 편은 이웃 주제에도 걸친다 — 실제 카탈로그의 다중 주제 콘텐츠
        topic_ids:
          index % 5 === 4 && !inSeries
            ? [
                syntheticTopicId(topic),
                syntheticTopicId((topic + 1) % TOPIC_COUNT),
              ]
            : [syntheticTopicId(topic)],
        play_count: playCount,
        complete_count: Math.floor(playCount * (0.3 + random() * 0.5)),
        embedding,
        market: 'kr',
      });
    }
  }

  for (let global = 0; global < GLOBAL_TOPIC_COUNT; global += 1) {
    const topic = TOPIC_COUNT + global;

    for (let index = 0; index < GLOBAL_CONTENTS_PER_TOPIC; index += 1) {
      const playCount = Math.floor(random() * 60);

      contents.push({
        id: uuid(0xc, topic * CONTENTS_PER_TOPIC + index),
        title: `Synthetic ${global}-${index}`,
        author_name: `Author ${global}`,
        source_name: 'Synthetic',
        duration_sec: 420 + Math.floor(random() * 600),
        published_at: new Date(
          now.getTime() - Math.floor(random() * 60) * MS_PER_DAY - MS_PER_DAY,
        ).toISOString(),
        difficulty: DIFFICULTIES[index % DIFFICULTIES.length],
        format: FORMATS[index % FORMATS.length],
        is_evergreen: index % 4 === 0,
        keywords: [`topic${global}`],
        target_audiences: null,
        series_id: null,
        episode_no: null,
        status: 'published',
        license_expires_at: null,
        topic_ids: [syntheticTopicId(topic)],
        play_count: playCount,
        complete_count: Math.floor(playCount * 0.5),
        embedding: Array.from({ length: EMBEDDING_DIM }, (_, dim) =>
          dim === topic ? 1 : (random() - 0.5) * 0.35,
        ),
        market: 'global',
      });
    }
  }

  return {
    schema_version: EVAL_SNAPSHOT_SCHEMA_VERSION,
    exported_at: now.toISOString(),
    environment: 'synthetic',
    embedding_model: EMBEDDING_MODEL_ID,
    plans: [
      { tier: 'light', daily_drip_count: 2, daily_discovery_count: 1 },
      { tier: 'pro', daily_drip_count: 2, daily_discovery_count: 1 },
    ],
    topics: [
      ...Array.from({ length: TOPIC_COUNT }, (_, index) => ({
        id: syntheticTopicId(index),
        name: `합성 주제 ${index}`,
        is_visible: true,
        market: 'kr',
      })),
      ...Array.from({ length: GLOBAL_TOPIC_COUNT }, (_, index) => ({
        id: syntheticTopicId(TOPIC_COUNT + index),
        name: `Synthetic topic ${index}`,
        is_visible: true,
        market: 'global',
      })),
    ],
    contents,
    users: [],
  };
}
