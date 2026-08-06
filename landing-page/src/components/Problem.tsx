import { problems } from "@/content/site";
import s from "./Problem.module.css";

export function Problem() {
  return (
    <section id="problem" className="section">
      <div className="container">
        <p className="eyebrow">Why</p>
        <h2 className="sectionTitle">
          듣고 싶은데, 마땅히 들을 게 없습니다
        </h2>
        <p className="sectionLede">
          편도 30분 넘는 통근길. 성장에 쓰고 싶은 마음은 있는데, 그 시간에 맞는
          형식의 콘텐츠가 없습니다. 오디오 대안들도 각자 이유로 비어 있습니다.
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
