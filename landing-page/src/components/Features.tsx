import { features } from "@/content/site";
import { icons, type IconName } from "./Icons";
import s from "./Features.module.css";

export function Features() {
  return (
    <section id="features" className="section">
      <div className="container">
        <p className="eyebrow">Features</p>
        <h2 className="sectionTitle">듣는 데 걸리는 마찰을 없앴습니다</h2>
        <p className="sectionLede">
          고르는 수고, 기다리는 시간, 다시 찾는 번거로움. 오디오로 콘텐츠를 듣게
          만드는 데 실제로 방해가 되는 것들을 하나씩 걷어냈습니다.
        </p>

        <ul className={s.grid}>
          {features.map((f) => (
            <li key={f.title} className={s.card}>
              <span className={s.icon}>{icons[f.icon as IconName]}</span>
              <h3 className={s.cardTitle}>{f.title}</h3>
              <p className={s.cardBody}>{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
