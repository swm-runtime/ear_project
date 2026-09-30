import { iosStoreUrl } from "@/content/site";
import { AppleLogo } from "./AppleLogo";
import { CtaPanel } from "./CtaPanel";
import s from "./FinalCta.module.css";
import { Sentences } from "./Sentences";

export function FinalCta() {
  return (
    <section id="cta" className={s.wrap}>
      <div className="container">
        {/* 포인터가 [App Store에서 다운로드]에 가까워질수록 빛이 강해진다(CtaPanel) — 값은 --gx/--gy/--glow */}
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
              <Sentences text="이어가 App Store에 나왔어요. 아이폰이라면 지금 바로 받아서 들어 보세요." />
            </p>

            <div className={s.actions}>
              <a
                href={iosStoreUrl}
                className={`btn btnPrimary ${s.cta}`}
                target="_blank"
                rel="noopener noreferrer"
                data-cta
              >
                <AppleLogo />
                App Store에서 다운로드
              </a>
              <span className={s.stores}>Android는 곧 출시 예정이에요</span>
            </div>
          </div>
        </CtaPanel>
      </div>
    </section>
  );
}
