import { topicGroups } from "@/content/site";
import s from "./Topics.module.css";

export function Topics() {
  return (
    <section id="topics" className={`section ${s.wrap}`}>
      <div className="container">
        <p className="eyebrow">Topics</p>
        <h2 className="sectionTitle">자기계발 · 커리어 · 교양</h2>
        <p className="sectionLede">
          큰 갈래는 셋이고, 그 안에서 더 좁은 주제를 최대 3개까지 고릅니다. 상한을
          둔 이유는 관심사가 흩어지면 어느 주제도 충분히 쌓이지 않기 때문입니다.
        </p>

        <div className={s.groups}>
          {topicGroups.map((group) => (
            <div key={group.name} className={s.group}>
              <h3 className={s.groupName}>{group.name}</h3>
              <ul className={s.chips}>
                {group.items.map((item) => (
                  <li key={item} className={s.chip}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className={s.note}>
          위 목록은 예시입니다. 실제로 고를 수 있는 주제는 그 시점에 들을 콘텐츠가
          충분히 준비된 것만 열립니다 — 골랐는데 들을 게 없는 주제는 애초에 보이지
          않습니다. 관심 주제는 나중에 언제든 바꿀 수 있습니다.
        </p>
      </div>
    </section>
  );
}
