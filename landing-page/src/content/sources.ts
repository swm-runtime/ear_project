/**
 * Sources 섹션의 출처 목록 — **admin.earcast.co.kr(파이프라인 운영 DB)의 `domains` 테이블에서 가져온 값**이다.
 * 우리가 임의로 고른 이름이 아니다(결정 2026-09-18).
 *
 * 추출 기준(2026-09-18 스냅샷):
 *   - tier 가 `blocked`·`hold` 가 아닌 도메인(allow_open · candidate)
 *   - 본문 접근 차단 표시(`fetch_blocked_at`)가 없는 곳
 *   - 스윕으로 실제 적재된 소스가 10건 이상인 곳(domain_stats.source_count)
 *   - 표시 이름은 `publisher` 에서 괄호 설명을 뗀 것. Frontiers 저널 8종은 "Frontiers" 하나로 합쳤다
 *   - **robots.txt · 약관 · 라이선스 확인(2026-09-18)에서 걸린 곳은 뺐다** — 아래 "제외" 목록. 확인 방법: robots 의
 *     전면·AI 봇 차단, 홈 푸터의 라이선스 표기, 약관 페이지의 AI·TDM·스크래핑·비상업 조항. 금지 조항이 확인된 곳만
 *     뺐고, 약관을 못 찾은 상업 매체·개인 블로그는 스펙(01-source-pool 2장)대로 2군 후보로 남겼다
 * 정렬은 적재 건수 내림차순. 주석의 도메인·건수는 추출 당시 값이다.
 *
 * 제외(금지 조항 확인):
 *   - World History Encyclopedia — 약관에 AI 학습·자동 수집 금지 명시, 라이선스가 CC BY-NC(비상업)
 *   - Cloudflare Blog — 웹사이트 약관 8조 "AI 제한" — 봇으로 자료를 수집해 AI 시스템에 쓰는 것을 금지
 *   - Stack Overflow Blog — robots.txt 가 GPTBot 을 차단하고 데이터 라이선스 판매 프로그램을 운영(무허가 AI 이용 반대 입장)
 *   - JSTOR Daily — 약관 "개인적·비상업적 이용만", 그 외는 ITHAKA 서면 허락 필요
 *   - JetBrains Blog — 웹사이트 약관 "비상업 목적만", 2차적 저작물 금지
 *   - 어피티 — 저작권 안내 — 상업적 이용 시 손해배상, 기사 전문 이용은 비상업이라도 허락 필요
 *   - Nautilus — 약관 "어떤 자료도 복제·재게재·배포 불가"(명시 허락 제외), 상업 매체
 *   - The Transmitter — 시몬스 재단 약관 "개인적·비상업적 이용만, 자동화된 수집 금지"; 재게재는 원문 무편집 조건
 *   - Eos — 기사 라이선스 CC BY-NC-ND 3.0(비상업·변경 금지)
 *
 * 다시 뽑을 때: 로그인한 세션으로 `domains` + `domain_stats` 를 읽어 같은 기준으로 걸러 이 목록을 갈아 끼운다.
 * `style` 은 서체 계열(카테고리에서 추정 — 학술·매체는 serif, 오픈소스 공식은 mono, 그 외 sans). **한글 이름은 항상 sans** —
 * serif·mono 는 라틴 서체라 한글이 시스템 글꼴로 떨어져 서체가 섞인다.
 */
export const sourceItems = [
  { name: "Thoughtworks Insights", style: "sans" }, // www.thoughtworks.com · 2715건
  { name: "Antigone Journal", style: "serif" }, // antigonejournal.com · 200건
  { name: "Engelsberg Ideas", style: "serif" }, // engelsbergideas.com · 106건
  { name: "The Public Domain Review", style: "serif" }, // publicdomainreview.org · 100건
  { name: "뱅크샐러드 기술블로그", style: "sans" }, // blog.banksalad.com · 78건
  { name: "MDN Web Docs Blog", style: "mono" }, // developer.mozilla.org · 71건
  { name: "PsyPost", style: "serif" }, // www.psypost.org · 60건
  { name: "MIT News", style: "serif" }, // news.mit.edu · 50건
  { name: "arXiv", style: "serif" }, // arxiv.org · 49건
  { name: "The Marginalian", style: "sans" }, // www.themarginalian.org · 40건
  { name: "Kellogg Insight", style: "serif" }, // insight.kellogg.northwestern.edu · 33건
  { name: "Martin Fowler", style: "sans" }, // martinfowler.com · 30건
  { name: "Kubernetes Blog", style: "mono" }, // kubernetes.io · 25건
  { name: "Hugging Face Blog", style: "sans" }, // huggingface.co · 25건
  { name: "LINE 기술블로그", style: "sans" }, // techblog.lycorp.co.jp · 25건
  { name: "SK플래닛 기술블로그", style: "sans" }, // techtopic.skplanet.com · 25건
  { name: "Node.js Blog", style: "mono" }, // nodejs.org · 25건
  { name: "데브시스터즈 기술블로그", style: "sans" }, // tech.devsisters.com · 25건
  { name: "카카오스타일 기술블로그", style: "sans" }, // devblog.kakaostyle.com · 25건
  { name: "Google Research Blog", style: "sans" }, // research.google · 25건
  { name: "올리브영 기술블로그", style: "sans" }, // oliveyoung.tech · 25건
  { name: "React Blog", style: "mono" }, // react.dev · 23건
  { name: "토스 블로그", style: "sans" }, // blog.toss.im · 23건
  { name: "Frontiers", style: "serif" }, // frontiersin.org/journals/cognition · 20건
  { name: "Mozilla Hacks", style: "sans" }, // hacks.mozilla.org · 20건
  { name: "네이버 D2", style: "sans" }, // d2.naver.com · 20건
  { name: "토스 기술블로그", style: "sans" }, // toss.tech · 20건
  { name: "Google Developers Blog", style: "sans" }, // developers.googleblog.com · 20건
  { name: "The Pragmatic Engineer", style: "sans" }, // blog.pragmaticengineer.com · 15건
  { name: "InfoQ", style: "serif" }, // www.infoq.com · 15건
  { name: "미국 연방준비제도", style: "sans" }, // www.federalreserve.gov · 15건
  { name: "HBS Working Knowledge", style: "serif" }, // hbswk.hbs.edu · 12건
  { name: "Our World in Data", style: "serif" }, // ourworldindata.org · 12건
  { name: "Neuroscience News", style: "serif" }, // neurosciencenews.com · 12건
  { name: "Knowledge at Wharton", style: "serif" }, // knowledge.wharton.upenn.edu · 12건
  { name: "Mindful", style: "serif" }, // www.mindful.org · 10건
  { name: "CNCF Blog", style: "mono" }, // cncf.io · 10건
  { name: "Rust Blog", style: "mono" }, // blog.rust-lang.org · 10건
  { name: "지마켓 기술블로그", style: "sans" }, // dev.gmarket.com · 10건
  { name: "James Clear", style: "sans" }, // jamesclear.com · 10건
  { name: "우아한형제들 기술블로그", style: "sans" }, // techblog.woowahan.com · 10건
  { name: "NASA", style: "sans" }, // www.nasa.gov · 10건
  { name: "The Public Medievalist", style: "sans" }, // www.publicmedievalist.com · 10건
  { name: "Microsoft DevBlogs", style: "sans" }, // devblogs.microsoft.com · 10건
  { name: "Dropbox Tech", style: "sans" }, // dropbox.tech · 10건
  { name: "카카오 기술블로그", style: "sans" }, // tech.kakao.com · 10건
  { name: "하이퍼커넥트 기술블로그", style: "sans" }, // hyperconnect.github.io · 10건
  { name: "Stripe Blog", style: "sans" }, // stripe.com · 10건
  { name: "NHN Cloud Meetup", style: "sans" }, // meetup.nhncloud.com · 10건
  { name: "Go Blog", style: "mono" }, // go.dev · 10건
  { name: "GitHub Blog", style: "sans" }, // github.blog · 10건
  { name: "Literary Hub", style: "serif" }, // lithub.com · 10건
  { name: "web.dev", style: "sans" }, // web.dev · 10건
  { name: "Behavioral Scientist", style: "serif" }, // behavioralscientist.org · 10건
  { name: "MIT McGovern Institute", style: "serif" }, // mcgovern.mit.edu · 10건
] as const;

/**
 * 선을 타고 내려오는 대표 6곳(선 여섯 줄기와 1:1) — 위 목록 중 적재·실제 참고(ok_count)가 많고 알아보기 쉬우며,
 * **재사용 정책을 확인해 무리가 없는 곳**을 골랐다(2026-09-18 robots·약관 확인: Frontiers·OWID는 CC BY, MIT News는
 * 출처 표기 조건 재게재 허용, arXiv는 논문별 라이선스, Kellogg는 무료 허락제, toss.tech는 공식 블로그·RSS 제공).
 * 배지는 **글자 약칭**을 원 위에 얹는다. 로고 그림은 쓰지 않는다 — 마케팅 페이지의 로고는 제휴·보증으로 읽히고
 * 기관 브랜드 가이드가 사전 허락을 요구한다(2026-09-18 로고로 바꿨다가 같은 날 글자로 되돌림). `size`는 글자 크기(px),
 * `style`은 서체 계열, `line`은 타는 줄기(Sources.tsx LINE_STARTS 인덱스).
 */
export const featuredSources = [
  { name: "MIT News", mark: "MIT", color: "#a31f34", size: 13, style: "sans", line: 0 }, // news.mit.edu · 대학 발행
  { name: "arXiv", mark: "arXiv", color: "#b31b1b", size: 12, style: "mono", line: 1 }, // arxiv.org · 학술 오픈액세스
  { name: "Frontiers", mark: "Frontiers", color: "#1a1a1e", size: 9.5, style: "serif", line: 2 }, // frontiersin.org · 학술 오픈액세스, 실제 참고 최다 묶음
  { name: "Kellogg Insight", mark: "Kellogg", color: "#4e2a84", size: 10.5, style: "serif", line: 3 }, // insight.kellogg.northwestern.edu · 대학 발행, 실제 참고 2위(12건)
  { name: "Our World in Data", mark: "OWID", color: "#1d3d63", size: 12, style: "sans", line: 4 }, // ourworldindata.org · 옥스퍼드 기반 비영리, 원저작물 CC BY(2026-09-18 확인). PsyPost(약관 확인 불가·상업 매체) 대신
  { name: "토스 기술블로그", mark: "toss", color: "#0064ff", size: 13, style: "sans", line: 5 }, // toss.tech · 국내 기업 기술블로그
] as const;
