import { getTopicGroups } from "@/content/public-topics";
import { Sentences } from "./Sentences";
import { TopicPicker } from "./TopicPicker";
import s from "./Topics.module.css";

export async function Topics() {
  // 빌드 때 관리자에서 공개한 주제를 받아 온다 — 실패하면 기본 목록(public-topics.ts)
  const topicGroups = await getTopicGroups();

  return (
    <section id="topics" className={`section ${s.wrap}`}>
      <div className="container">
        <p className="eyebrow">Topics</p>
        <h2 className="sectionTitle">관심 있는 주제를 골라 보세요</h2>
        <p className="sectionLede">
          <Sentences text="아래 주제 중에서 최대 3개까지 고를 수 있어요." />
        </p>

        {/* 실제로 고를 수 있다 — 앱 온보딩 1단계 규칙(최대 3개)을 그대로 겪게 한다(2026-09-18) */}
        <TopicPicker groups={topicGroups} />

        <p className={s.note}>
          <Sentences text="지금 이어에서 들을 수 있는 주제예요. 새로운 주제는 계속 늘어나고, 고른 주제는 앱에서 언제든 바꿀 수 있어요." />
        </p>
      </div>
    </section>
  );
}
