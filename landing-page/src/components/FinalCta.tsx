import { androidStoreUrl, iosStoreUrl } from "@/content/site";
import { AppleLogo } from "./AppleLogo";
import { CtaPanel } from "./CtaPanel";
import { GooglePlayLogo } from "./GooglePlayLogo";
import s from "./FinalCta.module.css";
import { Sentences } from "./Sentences";

export function FinalCta() {
  return (
    <section id="cta" className={s.wrap}>
      <div className="container">
        {/* 포인터가 다운로드 버튼 묶음에 가까워질수록 빛이 강해진다(CtaPanel) — 값은 --gx/--gy/--glow */}
        <CtaPanel className={`darkTokens ${s.panel}`}>
          <div className={s.glow} aria-hidden="true" />
          <div className={s.pointerGlow} aria-hidden="true" />
          <div className={s.content}>
            <h2 className={s.title}>
              내일 아침 출근길에,
              <br />
              남들과 다른 시작을 하고 싶다면
            </h2>
            <p className={s.lede}>
              <Sentences text="이어는 App Store와 Google Play에서 받을 수 있어요. 지금 바로 받아서 들어 보세요." />
            </p>

            {/* 빛의 기준점은 두 버튼의 묶음이다(`data-cta`) — 버튼 하나에 걸면 다른 쪽에 다가갈 때 빛이 약해진다 */}
            <div className={s.actions} data-cta>
              <a
                href={iosStoreUrl}
                className={`btn btnPrimary ${s.cta}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <AppleLogo />
                App Store
              </a>
              <a
                href={androidStoreUrl}
                className={`btn btnPrimary ${s.cta}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GooglePlayLogo />
                Google Play
              </a>
            </div>
          </div>
        </CtaPanel>
      </div>
    </section>
  );
}
