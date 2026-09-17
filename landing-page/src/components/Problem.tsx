import { problems } from "@/content/site";
import s from "./Problem.module.css";

export function Problem() {
  return (
    <section id="problem" className="section">
      <div className="container">
        <p className="eyebrow">Why</p>
        <h2 className="sectionTitle">듣고 싶은데, 마땅히 들을 게 없어요</h2>
        <p className="sectionLede">
          출퇴근길 30분, 뭔가 들으며 성장하고 싶은데 딱 맞는 콘텐츠가 없어요.
        </p>

        <ul className={s.grid}>
          {problems.map((p, i) => (
            <li key={p.title} className={s.card}>
              <span className={s.num} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className={s.cardTitle}>{p.title}</h3>
              <p className={s.cardBody}>{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
