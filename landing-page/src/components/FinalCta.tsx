import { releaseMailto } from "@/content/site";
import s from "./FinalCta.module.css";

export function FinalCta() {
  return (
    <section id="cta" className={s.wrap}>
      <div className="container">
        <div className={`darkTokens ${s.panel}`}>
          <div className={s.glow} aria-hidden="true" />
          <div className={s.content}>
            <h2 className={s.title}>
              내일 아침 출근길에,
              <br />
              남들과 다른 시작을 하고 싶다면
            </h2>
            <p className={s.lede}>
              이어는 지금 정식 출시를 준비하고 있어요. 메일을 남겨 주시면
              출시하는 날 가장 먼저 알려 드릴게요.
            </p>

            <div className={s.actions}>
              <a href={releaseMailto} className="btn btnPrimary">
                출시 소식 받기
              </a>
              <span className={s.stores} aria-label="앱 출시 준비 중">
                App Store · Google Play 준비 중
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
