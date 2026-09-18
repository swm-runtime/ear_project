import { steps } from "@/content/site";
import s from "./HowItWorks.module.css";
import { Sentences } from "./Sentences";

export function HowItWorks() {
  return (
    <section id="how" className="section">
      <div className="container">
        <div className={s.head}>
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="sectionTitle">고르지 않아도, 매일 도착해요</h2>
          </div>
          <p className={s.headLede}>
            <Sentences text="처음에 주제만 고르면 끝이에요. 그다음부터는 앱을 열기만 하면 돼요." />
          </p>
        </div>

        <ol className={s.steps}>
          {steps.map((step) => (
            <li key={step.n} className={s.step}>
              <span className={s.n} aria-hidden="true">
                {step.n}
              </span>
              <div className={s.stepBody}>
                <h3 className={s.stepTitle}>{step.title}</h3>
                <p className={s.stepText}>{step.body}</p>
                <span className={s.meta}>{step.meta}</span>
              </div>
            </li>
          ))}
        </ol>

        <p className={s.footnote}>
          <Sentences text="고른 주제에 맞는 콘텐츠가 라이브러리에 알아서 쌓여요. 무료 요금제도 똑같이 받아요." />
        </p>
      </div>
    </section>
  );
}
