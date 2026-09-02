import Image from "next/image";
import Link from "next/link";
import { releaseMailto, site, stats } from "@/content/site";
import { routes } from "@/content/routes";
import s from "./Hero.module.css";

/* 앱 화면 예시에 쓰는 아이콘 — 실제 앱과 같은 도형이다(frontend/src/shared/ui/TabBarIcon,
   PersonIcon, features/library/components/FilterIcon, features/player/.../PlayerIcons).
   선택된 탭을 면(fill)으로, 나머지를 선(stroke)으로 그리는 것도 앱과 같다 — 색만으로
   현재 탭을 알리지 않기 위한 규칙이라 옮겨 올 때 같이 지킨다. */
const ICON_STROKE = 1.8;

/* 브랜드 '이어'를 손글씨 획으로 그리는 SVG — 애플 초기 설정 "hello"처럼 획이 순서대로
   그려진다(pathLength=1 + stroke-dashoffset 1→0, 획마다 지속·지연을 달리해 손맛을 낸다).
   색은 잉크 단색(var(--ink-950) — Hero.module.css)이다. 손글씨에 그라데이션은 어색해서 뺐다.
   실제 텍스트는 스크린리더·SEO용으로 .srOnly 에 남는다. prefers-reduced-motion 이면
   애니메이션 없이 완성형으로 보인다(Hero.module.css). */
function BrandScript() {
  const strokes: [d: string, delay: number, dur: number][] = [
    // 이 — ㅇ (위에서 시작해 반시계로 한 붓)
    ["M60 46 C47 36 24 40 16 57 C7 76 18 98 41 100 C62 102 74 87 70 69 C68 60 64 53 58 49", 0.1, 0.62],
    // 이 — ㅣ (살짝 휘는 세로획)
    ["M97 12 C100 40 100 74 96 108", 0.72, 0.4],
    // 어 — ㅇ
    ["M172 46 C159 36 136 40 128 57 C119 76 130 98 153 100 C174 102 186 87 182 69 C180 60 176 53 170 49", 1.12, 0.62],
    // 어 — ㅓ 의 가로 꼭지 (세로획 허리에 붙는다)
    ["M199 59 C207 57.5 217 57.5 227 60", 1.74, 0.22],
    // 어 — ㅓ 세로획
    ["M230 12 C233 40 233 74 229 108", 1.96, 0.42],
  ];
  return (
    <svg className={s.brandSvg} viewBox="0 0 250 120" fill="none" aria-hidden="true">
      {strokes.map(([d, delay, dur]) => (
        <path key={d} d={d} className={s.brandStroke} pathLength={1}
          strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"
          style={{ animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
      ))}
    </svg>
  );
}

function TabIcon({ name, active }: { name: "library" | "explore" | "profile"; active: boolean }) {
  const shape = {
    fill: active ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: ICON_STROKE,
  };

  if (name === "library") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          {...shape}
          strokeLinejoin="round"
          d="M7 3.6h10A1.6 1.6 0 0 1 18.6 5.2v15.4a.7.7 0 0 1-1.09.58L12 17.5l-5.51 3.68A.7.7 0 0 1 5.4 20.6V5.2A1.6 1.6 0 0 1 7 3.6z"
        />
      </svg>
    );
  }

  if (name === "explore") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
        <path {...shape} strokeLinejoin="round" d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.4" r="3.6" {...shape} />
      <path
        {...shape}
        strokeLinecap="round"
        d="M12 13.6c-4 0-7.2 2.7-7.2 6 0 .5.4.9.9.9h12.6c.5 0 .9-.4.9-.9 0-3.3-3.2-6-7.2-6z"
      />
    </svg>
  );
}

/** 커버 사진 한 변. scripts/preview-art.mjs가 굽는 크기와 같아야 한다 */
const COVER_PX = 420;

/* 피드에 그릴 콘텐츠. 제목·출처·저자·길이는 실제 시드 데이터에서 가져왔고,
   섹션 제목과 순서는 탐색 mock의 것이다(frontend/src/features/explore/api/explore.mock.ts —
   "지금 인기"가 맨 앞, 그다음 "관심사에 맞는 추천"). */
const POPULAR = [
  { title: "AI를 도구로 쓰는 사람들의 습관", meta: "이어 오리지널 · 윤태경", min: 13, cover: "/preview/cover-1.webp" },
  { title: "설득은 논리가 아니라 순서다", meta: "퍼블리 · 배준호", min: 12, cover: "/preview/cover-2.webp" },
];

const RECOMMENDED = [
  { title: "주니어가 3년 차에 가장 많이 하는 착각", meta: "퍼블리 · 14분", cover: "/preview/cover-3.webp" },
  { title: "멀티태스킹은 왜 항상 실패하는가", meta: "이어 오리지널 · 10분", cover: "/preview/cover-4.webp" },
  { title: "위임이 어려운 진짜 이유", meta: "이어 오리지널 · 11분", cover: "/preview/cover-5.webp" },
];

/** 아이폰 상태바 오른쪽 3종. 신호·와이파이·배터리 순서와 형태만 흉내 낸다. */
function StatusIcons() {
  return (
    <span className={s.statusIcons} aria-hidden="true">
      <svg viewBox="0 0 18 12" className={s.statusSignal}>
        <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
        <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
        <rect x="15" y="0.5" width="3" height="11.5" rx="1" fill="currentColor" />
      </svg>
      <svg viewBox="0 0 16 12" className={s.statusWifi}>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          d="M1.2 4.1a10 10 0 0 1 13.6 0M3.7 7a6.4 6.4 0 0 1 8.6 0"
        />
        <path fill="currentColor" d="M8 11.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" />
      </svg>
      <svg viewBox="0 0 26 12" className={s.statusBattery}>
        <rect
          x="0.6"
          y="0.6"
          width="22"
          height="10.8"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />
        <rect x="2.4" y="2.4" width="14" height="7.2" rx="1.8" fill="currentColor" />
        <path
          fill="currentColor"
          fillOpacity="0.4"
          d="M24.2 4.2c1 .4 1.5 1.1 1.5 1.8s-.5 1.4-1.5 1.8z"
        />
      </svg>
    </span>
  );
}

/**
 * 히어로 오른쪽의 앱 화면 예시 — 실제 이어 앱의 **탐색 화면**을 그대로 옮겼다.
 *
 * 구조·문구·치수의 출처는 `frontend/`다: 검색 줄과 주제 칩·섹션 피드는 features/explore의
 * ExploreScreen·ExploreSearchBarRow·TopicChips·PopularPeriodToggle, 큰 카드와 사각 타일은
 * ExploreFeaturedCard·ExploreTile, 탭바는 app/navigation/MainNavigator다.
 * **앱 화면이 바뀌면 여기도 같이 고쳐야 한다** — 랜딩이 실제와 다른 화면을 보여주면
 * 첫인상부터 약속이 어긋난다(탐색 피드는 2026-09-02에 섹션별 가로 캐러셀로 바뀌었다).
 *
 * 미니플레이어는 그리지 않는다 — 탐색은 **활성 재생 세션이 있을 때만** 그것을 띄우고,
 * 여기 담은 장면은 재생 없이 둘러보는 중이다(복원 스냅샷 판정은 라이브러리 소유다).
 *
 * 껍데기는 아이폰이다. 화면 비율(393:852)·모서리·다이내믹 아일랜드·홈 인디케이터를
 * 실제 비율로 두어야 "폰에서 이렇게 보인다"가 그대로 읽힌다.
 *
 * 순수 장식이라 스크린리더에는 캡션 한 줄만 남긴다.
 */
function AppPreview() {
  return (
    <div className={s.previewWrap}>
      <p className="srOnly">
        앱 탐색 화면 예시 — 검색창과 주제 칩 아래로 &lsquo;지금 인기&rsquo;, &lsquo;관심사에 맞는
        추천&rsquo; 섹션이 가로로 넘겨 보는 카드 목록으로 놓여 있습니다.
      </p>
      {/* 흰 페이지 위에 놓이는 검은 컴포넌트는 기기 껍데기뿐이다. 화면 안은 앱과 같은
          흰 배경이라 토큰을 뒤집지 않는다(darkTokens를 붙이지 않는 이유다). */}
      <div className={s.phone} aria-hidden="true">
        {/* 측면 버튼 — 왼쪽은 액션·볼륨, 오른쪽은 전원 */}
        <span className={`${s.sideBtn} ${s.btnAction}`} />
        <span className={`${s.sideBtn} ${s.btnVolUp}`} />
        <span className={`${s.sideBtn} ${s.btnVolDown}`} />
        <span className={`${s.sideBtn} ${s.btnPower}`} />

        <div className={s.phoneScreen}>
          {/* 상태바 — 다이내믹 아일랜드가 가운데를 차지하므로 시각과 아이콘이 양옆으로 갈린다 */}
          <div className={s.statusBar}>
            <span className={s.statusTime}>9:41</span>
            <span className={s.island} />
            <StatusIcons />
          </div>

          {/* 검색 줄 — 오른쪽에 오늘 남은 재생 횟수가 붙는다(무제한이면 자리를 비운다) */}
          <div className={s.searchRow}>
            <span className={s.searchBox}>콘텐츠 검색</span>
            <span className={s.remaining}>오늘 재생 1/2 남음</span>
          </div>

          {/* 주제 칩 — 고르면 피드가 캐러셀이 아니라 세로 목록으로 바뀐다 */}
          <div className={s.chipRow}>
            <span className={`${s.chip} ${s.chipSelected}`}>커리어</span>
            <span className={s.chip}>생산성</span>
            <span className={s.chip}>IT·테크</span>
            <span className={s.chip}>인공지능</span>
          </div>

          {/* 섹션형 피드. 섹션 구성·순서·제목은 서버 응답 그대로다 */}
          <div className={s.feed}>
            {/* 인기 섹션만 큰 카드이고, 제목 줄에 집계 구간 토글이 붙는다 */}
            <div className={s.section}>
              <div className={s.sectionHead}>
                <span className={s.sectionTitle}>지금 인기</span>
                <span className={s.periodToggle}>
                  <span className={`${s.seg} ${s.segActive}`}>주간</span>
                  <span className={s.seg}>월간</span>
                  <span className={s.seg}>전체</span>
                </span>
              </div>
              {/* 다음 카드가 옆에 걸쳐 보여야 가로로 더 있다는 것이 드러난다 */}
              <div className={s.carousel}>
                {POPULAR.map((c) => (
                  <span key={c.title} className={s.featCard}>
                    <Image
                      className={s.featArt}
                      src={c.cover}
                      alt=""
                      width={COVER_PX}
                      height={COVER_PX}
                    />
                    <span className={s.featMeta}>{c.meta}</span>
                    <span className={s.featTitle}>{c.title}</span>
                    <span className={s.featFoot}>
                      <span className={s.playPill}>
                        <span className={s.playGlyph}>▶</span>
                        <span className={s.playLabel}>{c.min}분</span>
                      </span>
                      <span className={s.featMore}>⋯</span>
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* 일반 섹션은 사각 타일. 더보기는 아트워크 위에 얹는다 */}
            <div className={s.section}>
              <span className={s.sectionTitle}>관심사에 맞는 추천</span>
              <div className={s.carousel}>
                {RECOMMENDED.map((c) => (
                  <span key={c.title} className={s.tile}>
                    <span className={s.tileArt}>
                      <Image
                        className={s.tileImg}
                        src={c.cover}
                        alt=""
                        width={COVER_PX}
                        height={COVER_PX}
                      />
                      <span className={s.tileMore}>⋯</span>
                    </span>
                    <span className={s.tileTitle}>{c.title}</span>
                    <span className={s.tileMeta}>{c.meta}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 하단 탭바 — 아이콘과 라벨을 함께 둔다. 지금 보이는 화면은 탐색이다 */}
          <div className={s.tabBar}>
            {(
              [
                { name: "library", label: "라이브러리" },
                { name: "explore", label: "탐색" },
                { name: "profile", label: "프로필" },
              ] as const
            ).map((t) => {
              const active = t.name === "explore";
              return (
                <span
                  key={t.name}
                  className={`${s.tabBarItem} ${active ? s.tabBarItemActive : ""}`}
                >
                  <TabIcon name={t.name} active={active} />
                  <span className={s.tabBarLabel}>{t.label}</span>
                </span>
              );
            })}
          </div>

          <span className={s.homeIndicator} />
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className={s.hero} id="top">
      <div className={s.glow} aria-hidden="true" />
      <div className={`container ${s.inner}`}>
        <div className={s.copy}>
          <p className={s.eyebrow}>AI가 만드는 오디오 팟캐스트</p>

          <h1 className={s.title}>
            <span className={s.brand}>
              <BrandScript />
              <span className={s.srOnly}>{site.name}</span>
            </span>
            <span className={s.tagline}>
              자기계발 하고 싶은데,
              <br />
              시간이 부족하신가요?
            </span>
          </h1>

          {/* 히어로 문구에는 편수·한도 같은 정책 수치를 넣지 않는다. 정책이 바뀔 때마다
              첫 화면을 고쳐야 하고, 무엇보다 여기서 할 말은 규격이 아니라 약속이다.
              구체적인 숫자는 바로 아래 숫자 띠와 요금제 페이지가 맡는다. */}
          <p className={s.lede}>
            이어는 출근길 15분에 맞춰 준비합니다. 듣고 싶은 주제만 한 번 정해 두면
            자기계발·커리어·교양 콘텐츠가 오디오로 기다리고 있어, 무엇을 들을지 찾고 고를
            필요가 없습니다.
            <strong> 이어폰만 꽂으면 됩니다.</strong>
          </p>

          <div className={s.actions}>
            <a href={releaseMailto} className="btn btnPrimary">
              출시 소식 받기
            </a>
            <Link href={routes.features.path} className="btn btnGhost">
              어떻게 작동하나요
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <path
                  d="M5 12h13m0 0-5.5-5.5M18 12l-5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

          <p className={s.note}>
            카카오·네이버·구글 계정으로 시작 · 무료 요금제에도 매일 2편이 도착합니다
          </p>
        </div>

        <AppPreview />
      </div>

      <div className={`container ${s.statsWrap}`}>
        <dl className={s.stats}>
          {stats.map((stat) => (
            <div key={stat.label} className={s.stat}>
              <dt className={s.statLabel}>{stat.label}</dt>
              <dd className={s.statValue}>{stat.value}</dd>
              <dd className={s.statNote}>{stat.note}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
