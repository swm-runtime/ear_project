import { steps } from "@/content/site";
import s from "./HowItWorks.module.css";

export function HowItWorks() {
  return (
    <section id="how" className="section onDark">
      <div className="container">
        <div className={s.head}>
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="sectionTitle">고르지 않아도, 매일 도착합니다</h2>
          </div>
          <p className={s.headLede}>
            처음 한 번 주제를 고르고 나면 할 일이 끝납니다. 그다음부터는 앱을 여는
            것이 전부입니다.
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
          <strong>드립</strong>은 관심사를 기준으로 콘텐츠가 라이브러리에 저절로
          쌓이는 방식입니다. 무료 요금제를 포함한 모든 요금제가 하루 2편으로 같습니다.
        </p>
      </div>
    </section>
  );
}
