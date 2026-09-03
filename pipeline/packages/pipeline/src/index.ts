/**
 * @ear/pipeline — 단계별 프롬프트 조립기 + 결과 스키마.
 *
 * 프롬프트 자산(skills/)은 여기서 내용을 읽어 넣지 않는다 — 실행기(Claude)가 Read 하도록
 * **경로만** 넘긴다 (컨텍스트 예산 원칙: 생성 반입 = guidelines + 골드 + spec/04 + 소스만, spec/09).
 * 2026-08-29 사이클 4에서 서브에이전트에 넘긴 프롬프트를 그대로 코드화한 것이다.
 */

export type MidTopic = string;

export interface SourceRef {
  url: string;
  title: string;
  publisher: string;
  published?: string | null;
  backbone?: boolean;
}

export interface BacklogCandidate {
  id: string;
  mid_topic: MidTopic;
  title: string;
  target_fit: string | null;
  angle: string | null;
  sources: SourceRef[];
}

/**
 * 프롬프트 자산·산출물 경로.
 * - assetRoot: 읽기 전용 프롬프트 자산 — 레포 `docs/ai` (skills/·spec/ 레이아웃이 그대로 맞는다)
 * - workRoot: 산출물 작업 디렉토리 — `episodes/`·`sources/sweeps/` (레포 밖. S3 이관 전 local: 키의 기준)
 * 둘을 나누는 이유: 실행기(`claude -p`)의 cwd 는 workRoot 다 — cwd 가 레포 안이면 Claude Code 가 루트 CLAUDE.md·.claude/ 를
 * 자동 반입해 생성 컨텍스트를 오염시킨다 (spec/09 컨텍스트 예산). 자산은 --add-dir 로만 연다.
 */
export function assetPaths(assetRoot: string, workRoot: string = assetRoot) {
  const p = (...s: string[]) => [assetRoot, ...s].join("/");
  return {
    guidelines: p("skills", "draft", "guidelines.md"),
    goldShort: p("skills", "draft", "examples", "gold-T260820-001-short.md"),
    goldFullEum: p("skills", "draft", "examples", "gold-T260820-002-full.md"),
    goldFullYuna: p("skills", "draft", "examples", "gold-T260828-001-full.md"),
    specScript: p("spec", "04-script.md"),
    specQa: p("spec", "05-qa.md"),
    specBacklog: p("spec", "03-backlog.md"),
    qaPrompt: p("skills", "qa", "prompt.md"),
    criticRubric: p("skills", "critic", "rubric.md"),
    criticRubricV2: p("skills", "critic", "rubric-v2.md"),
    episodeDir: (id: string) => [workRoot, "episodes", id].join("/"),
  };
}

/** 해설 담당: topics.explainer 가 있으면 그것, 없으면 중분류 관할 규칙 (spec/04) */
export function explainerFor(midTopic: MidTopic): "윤아" | "이음" {
  return ["심리학", "인문·교양", "글쓰기"].includes(midTopic) ? "윤아" : "이음";
}

/** 도입 형태 로테이션 — 에피소드 간 도입 템플릿화 방지 (사이클 4 판정) */
/** v5.1 (2026-09-01): 구 힌트는 "주제로 스며든다"였다 — 구 규칙 13. 이제 주제는 인트로가 이미 선언했으므로,
 *  네 형태는 모두 "인트로의 질문을 받아 청취자가 대화에 앉는 두세 턴"의 변주다. 주제를 다시 발견하는 척하지 않는다. */
export const INTRO_STYLES = [
  { key: "experience", label: "일상 경험담형", hint: "인트로 질문을 상대가 자기 일상의 사소한 사례 하나로 받는다(소스와 무관한 프레임). 그 사례를 두세 턴 주고받다 첫 해설로." },
  { key: "object", label: "사물 묘사형", hint: "인트로 질문을 구체적 물건 하나로 받는다 — 그 물건이 지금 어떻게 생겼는지 두세 턴, 그 물건이 주제의 첫 사례가 된다." },
  { key: "question", label: "궁금증 질문형", hint: "인트로 질문에 상대가 되묻는다 — 왜 그게 궁금했는지(기원 서사) 한 조각을 캐묻고, 그 답이 첫 해설의 입구가 된다." },
  { key: "thesis", label: "화두 선언형", hint: "주제 선언 직후 해설 담당이 '결론부터 말하면 흔히 아는 것과 반대다' 식 뜻밖의 한 줄을 던지고, 진행 담당이 반발·되물음으로 두세 턴 앉는다." },
] as const;

export function pickIntroStyle(seed: number) {
  return INTRO_STYLES[Math.abs(seed) % INTRO_STYLES.length];
}

const COMMON_RULES = `   - 핵심 규칙 리마인드: 소스가 말한 것까지만 (비교 축 추가·연관의 방향 확정·귀속 범위 확장·연대 환산·문장 위치 주장 금지 — QA 최다 실패 유형), 복창 대신 번역, 질문에 기원 서사, 티키타카·호흡 교차 (**후반부까지** 유지 — 후반 리듬 균질화가 4편 연속 지적됨), 역질문 1~2회, '요'체·'다'체 혼용, 귀속 전언체, 비유는 새 이해를 줄 때만 + 에피소드 내 비유 계열 통일, AI체·번역투 금지 (소리 내 읽어 어색하면 다시), 날짜는 년-월까지, 소수점·정밀 수치는 자연스러운 범위 표현 (단 실제보다 크게 올림 금지), 가독 표기 (음차 금지 — 영문 고유명사·두문자는 원표기), 오디오 태그는 [curious] [surprised] [sighs] [exhales] [laughs] [whispers] [excited]만 턴당 최대 1개 수준. 소스 게재 매체를 언급할 때 "같은 매체" 같은 지시어는 직전 명명 매체로 해소되므로 매체가 바뀌면 반드시 재명명.`;

const GOLD_USAGE = `   **골드 사용법 (중요)**: 골드에서 배울 것은 구조·리듬·기법·전언체뿐이다. 골드의 **구체 비유(요리 재료·마트 진열대·사진 현상 등), 특정 문구(확인구 "예리하세요"·"정확해요"·"딱 그 그림이에요", 역질문 답변 "솔직히 반반이에요", 피벗 "오늘 이야기가 정확히 그 얘기예요" 등), 도입 형태는 재사용 금지** — 같은 기법을 새 재료로 구현하라.`;

export interface Templates {
  version: string;
  intro: string;
  closing: string;
  major_lines: Record<string, string>;
}

export interface DraftInput {
  assetRoot: string;
  workRoot: string;
  episodeId: string;
  candidate: BacklogCandidate;
  introStyle: (typeof INTRO_STYLES)[number];
  promptVersion: string;
  templates?: Templates | null;
  majorTopic?: string;
}

/** 시그니처 인트로·마무리 (미결 #7 확정, 2026-08-31 박수헌). 골격은 고정, {슬롯}만 에피소드별로 채운다. */
function templateBlock(i: DraftInput): string {
  const t = i.templates;
  if (!t) return "   - 인트로·클로징 템플릿 미확정 — `{인트로 템플릿}` / `{클로징 템플릿}` 자리 표기만 남긴다.";
  const majorLine = (i.majorTopic && t.major_lines?.[i.majorTopic]) || "";
  return `   - **인트로 (고정 시그니처 — 골격을 바꾸지 말 것, {슬롯}만 채운다)**:
\`\`\`
${t.intro}
\`\`\`
     · {대주제 한 줄} = ${majorLine ? `"${majorLine}" (확정 문구 — 토씨 그대로 사용)` : `대분류 "${i.majorTopic ?? "-"}"를 소개하는 한 줄을 **직접 지어 쓴다** (확정 문구 미정 상태). 청취자는 자기계발을 원하는 2030 직장인이다 — 개발자·전문가 대상 표현 금지. 한 문장, 담백하게 (예: "출근길에 채우는 배움 한 조각 전하러 왔습니다.")`}
     · {주제 한 줄 요약} = 이 에피소드의 축을 한 줄로 (제목 복창이 아니라 귀로 들어도 잡히는 말로)
     · 인트로는 **진행 담당(Y1)** 의 발화다. 마지막 줄의 질문까지 한 턴으로 이어 쓴다.
   - **마무리 (고정 시그니처 — 골격 고정)**:
\`\`\`
${t.closing}
\`\`\`
     · 진행 담당이 위 두 문장(지금까지~ + 한마디/정리 요청)을 말하고, **해설 담당이 이어서 내용을 정리**한다 — 정리는 "무엇을 이해하게 됐나"로 닫는다 (규칙 13-1).
     · 진행자의 "한마디"는 매번 새로 쓴다 (예시 문구를 복제하지 말 것).`;
}

export function buildDraftPrompt(i: DraftInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const explainer = explainerFor(i.candidate.mid_topic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  const sources = i.candidate.sources
    .map((s, n) => `${n + 1}. ${s.publisher}, "${s.title}"${s.backbone ? " (뼈대 후보)" : ""} — ${s.url}${s.published ? ` (${String(s.published).slice(0, 7)})` : ""}`)
    .join("\n");
  const dir = a.episodeDir(i.episodeId);
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 작가다. 청취자는 자기계발을 원하는 2030 한국 직장인 (IT 개발자 아님). 15분 분량의 2인 대화 팟캐스트 에피소드 대본을 만든다.

## 0. 먼저 읽을 파일 (이것 외의 프로젝트 파일은 읽지 말 것 — 특히 episodes/ 하위 다른 에피소드, critic/qa 리포트, PIPELINE 문서 금지)
1. ${a.guidelines} — 대본 규칙 (${i.promptVersion}). 전 규칙 준수.
2. ${a.specScript} — 대본 규격·페르소나.
3. 골드 예시 3종: ${a.goldShort}, ${a.goldFullEum}, ${a.goldFullYuna}
${GOLD_USAGE}

## 1. 에피소드 정보 (백로그 ${i.candidate.id}, 게이트1 승인 완료)
- 에피소드 ID: ${i.episodeId} · 제목(가): "${i.candidate.title}" · 중분류: ${i.candidate.mid_topic}
- 해설: **${explainer}** / 진행: **${host}** — 역할 고정, spec/04 페르소나 준수
- 축(규칙 13-1): ${i.candidate.angle ?? "(백로그 angle 미기재 — 제목의 개념·질문을 축으로)"} 사건이 아니라 개념이 에피소드를 이끈다. 마무리는 "무엇을 이해하게 됐나"로.
- 타깃 정합 메모: ${i.candidate.target_fit ?? "-"}

## 2. 소스 (전부 WebFetch로 원문 정독 — 이 단계가 파이프라인에서 원문을 읽는 유일한 지점)
${sources}

403·접근 실패 시 우회 금지 — 해당 소스 제외하고 진행 (최소 3건 유지, 미달 시 중단·보고). 영어 소스이면 대본은 전량 한국어 재서술. 직접 인용은 짧게 + 번역 + 귀속.

## 3. 산출물 (디렉토리 ${dir}/ 에 생성 — 이 디렉토리 밖에는 아무것도 쓰지 말 것)
a) **sources.md** — 첫 줄에 "> 내부 증적 — 재배포 금지" 표기. 소스별로: 메타(발행처·제목·URL·발행일) + **원문 발췌(원문 언어 그대로, 항목 ID 부여)** + 한국어 요지. 발췌는 대본에 쓸 사실을 전부 커버해야 한다 — QA는 대본 원문이 아니라 이 발췌만을 기준으로 검증한다. 발췌에 없는 주장이 대본에 있으면 QA 실패다.
b) **claims.md** — 대본의 사실 주장 → 소스·발췌 ID 대조표.
c) **pronunciations.json** — 대본에 등장하는 **모든 비한글 표기**(영문 용어·인명·기관·매체 등) → 자연스러운 한국식 한글 발음. \`{"표기": "발음"}\` JSON 객체 하나만 (예: \`{"Stanford": "스탠퍼드", "AI": "에이아이"}\`). 인명은 원어 발음 기준. TTS 변환이 이 맵으로 치환한다 — 누락된 표기는 합성이 중단된다. 비한글 표기가 없으면 빈 객체 \`{}\`.
d) **script.md** — 대본. 규격:
   - 첫 줄 메타: 에피소드 ID·제목·중분류·해설/진행·프롬프트 버전(${i.promptVersion})·사용 소스 수.
   - 구조: 콜드오픈(본편에서 가장 강한 해설 대목을 **본편 문장 그대로** 발췌, 새 문장 생성 금지, 약 120~180자=20~30초, 발췌 위치를 "E몇"으로 정확히 표기) → 인트로 → 본편 (해설 턴 E1, E2, ... / 진행 턴 Y1, Y2, ... 표기) → 마무리
${templateBlock(i)}
   - 도입 (규칙 13, v5.1 개정 — **주제를 먼저 소개하고 시작한다**. 에둘러 들어가지 말 것): 주제 선언 뒤 첫 해설 턴 사이에 짧은 진입 구간(두세 턴)을 둔다. 주제는 인트로가 이미 말했으므로 **다시 발견하는 척("그 질문이 오늘 주제랑 닿아 있어요" 류) 금지**. 그 진입 방식 (이 에피소드 전용 지정): **${i.introStyle.label}** — ${i.introStyle.hint} 골드의 [도입]은 구 규칙 판이라 자리표기로 비워 두었다 — 형태를 참조할 것이 없으니 규칙 13 문장대로 쓴다. 인트로 골격은 고정이지만 질문의 재료는 매번 새로.
   - 분량: **공백·기호 제외 4,500자 이상 목표, 5,000자 내외 이상적** (350자/분 기준 약 13~15분). 채우기용 잡담·같은 말 반복 금지.
${COMMON_RULES}

## 4. 마무리 자기 점검 (필수)
대본 작성 후 claims를 발췌와 대조해 발췌에 없는 주장을 찾아 수정하라. 콜드오픈이 해당 E턴의 부분 문자열인지 python 등으로 기계 검증하라. 공백·기호 제외 글자 수([가-힣A-Za-z0-9]만 카운트, 콜드오픈·템플릿 자리 제외)를 python으로 계산하라.

## 5. 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다.`;
}

export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["turns", "chars", "minutes", "cold_open_turn", "cold_open_verified", "sources_used", "sources_excluded", "self_check_fixes", "notes"],
  properties: {
    turns: { type: "integer", description: "본편 발화 턴 수 (콜드오픈·템플릿 제외)" },
    chars: { type: "integer", description: "공백·기호 제외 글자 수" },
    minutes: { type: "number", description: "350자/분 환산 분량" },
    cold_open_turn: { type: "string", description: "콜드오픈 발췌 위치 E번호" },
    cold_open_verified: { type: "boolean", description: "콜드오픈이 해당 턴의 부분 문자열임을 기계 검증했는가" },
    sources_used: { type: "array", items: { type: "string" }, description: "사용한 소스 URL" },
    sources_excluded: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "reason"], properties: { url: { type: "string" }, reason: { type: "string" } } } },
    self_check_fixes: { type: "array", items: { type: "string" }, description: "자기 점검에서 발견·수정한 발췌 밖 주장" },
    notes: { type: "string", description: "특이사항 (역질문 위치, 비유 계열 등) 3문장 이내" },
  },
} as const;

export interface DraftRevisionInput extends DraftInput {
  attempt: number;
  qaFailures: { location: string; item: string; reason: string }[];
}

/** QA 실패 후 재생성 — 전면 재작성이 아니라 지적 사항만 최소 수정 (사이클 3·4의 수작업 절차를 코드화) */
export function buildDraftRevisionPrompt(i: DraftRevisionInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const dir = a.episodeDir(i.episodeId);
  const failures = i.qaFailures.map((f, n) => `${n + 1}. [${f.location}] 항목 ${f.item}: ${f.reason}`).join("\n");
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 작가다. QA(사실 무결성 검증)가 실패한 대본을 **최소 수정**한다 (attempt ${i.attempt}/3).

## 읽을 파일 (이 외 금지)
- ${dir}/script.md (수정 대상) · ${dir}/claims.md · ${dir}/sources.md (발췌 = 검증의 최종 기준)
- ${a.guidelines} (규칙 참조용)

## QA 실패 사항 (전부 해소해야 한다)
${failures}

## 수정 원칙
- 지적된 턴만 고친다. 전면 재작성 금지 — 나머지 문장은 그대로 둔다.
- 수정은 발췌 안으로 들어오는 방향으로만: 발췌에 없는 수식·비교·방향·연대·위치 주장은 삭제하거나 발췌 문장 범위로 축소한다. 발췌를 새로 추가하지 않는다 (원문 재접근 금지).
- 지시어 참조를 깨뜨리지 않는다: 삭제한 표현을 되받는 진행(Y) 턴·콜백("아까 그 ~", "같은 매체")이 있으면 함께 고친다. 매체 지시가 바뀌면 재명명한다.
- 수정한 턴이 콜드오픈 발췌 원본이면 콜드오픈도 동일하게 갱신하고 부분 문자열 일치를 기계 재검증한다.
- 수정 후 claims.md 해당 행을 갱신하고, 파일 끝에 "## QA attempt ${i.attempt - 1} 반영" 절로 수정 내역을 기록한다.
- 수정으로 새 비한글 표기(영문 용어·인명 등)를 도입했으면 ${dir}/pronunciations.json 에 한글 발음을 추가한다 (없는 표기는 TTS 합성이 중단된다).
- 같은 인용·문장을 다른 턴에서 이미 쓰고 있지 않은지 확인한다 (중복 낭독 금지).

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다.`;
}

export const DRAFT_REVISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fixes", "cold_open_updated", "cold_open_verified", "notes"],
  properties: {
    fixes: { type: "array", items: { type: "object", additionalProperties: false, required: ["location", "before", "after"], properties: { location: { type: "string" }, before: { type: "string" }, after: { type: "string" } } } },
    cold_open_updated: { type: "boolean" },
    cold_open_verified: { type: "boolean" },
    notes: { type: "string" },
  },
} as const;

export interface QaInput {
  assetRoot: string;
  workRoot: string;
  episodeId: string;
  attempt: number;
  scriptFile?: string;
}

/** 항목 6 정의 명시 — spec/05 6번 "영문 표기" 구 문구와 표기 이원화의 충돌 조정 (2026-08-29, spec 정정 승인 대기) */
const QA_ITEM6_NOTE = `## 항목 6 판정 기준 명시 (규격 충돌 조정 — 오케스트레이션 전달 사항)
spec/05 3장 6번의 "영문 표기" 문구는 표기 이원화 설계(spec/04 5장: 대본은 가독 표기로 영문 원표기 유지, 음차는 TTS 단계 치환 테이블 전담)와 충돌하는 구 문구로 확인되어 정정 제안 중이다. 항목 6은 **표·URL·시점 고정 표현·낭독 불가능한 숫자 표기·대본 내 음차 표기 혼입**을 검사하라 — 대본의 영문 원표기(고유명사·두문자·매체명·제목 등)는 위반이 아니다.`;

export function buildQaPrompt(i: QaInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const dir = a.episodeDir(i.episodeId);
  const script = i.scriptFile ?? `${dir}/script.md`;
  const prior = i.attempt > 1 ? ` 이전 QA 회차의 판정도 반입하지 않는다 (이번이 attempt ${i.attempt}라는 사실만 안다). qa-report.md의 기존 내용도 읽지 말 것 — 추기만 한다. claims.md의 "QA 반영" 절도 판정 근거로 삼지 말 것 — 발췌만이 기준이다.` : "";
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 QA 검수자다. 대본의 사실 무결성을 독립 검증한다. 생성 맥락은 일절 모른 채 검사하는 것이 원칙이다.${prior}

## 입력 (이 파일들만 읽는다 — 다른 프로젝트 파일 금지. 소스 원문 URL 접속 금지: 검증 기준은 발췌가 최종이다)
1. ${a.qaPrompt} — QA 절차·항목 정의. 이 문서의 검사 항목과 판정 규약을 그대로 따른다.
2. ${a.specQa} — QA 명세.
3. ${script} — 검사 대상 대본.
4. ${dir}/claims.md — 주장 대조표.
5. ${dir}/sources.md — 소스 발췌 (검증의 최종 기준).

${QA_ITEM6_NOTE}

## 작업
전 검사 항목을 수행하고, 결과를 ${dir}/qa-report.md 파일 **끝에** "## attempt ${i.attempt} (${todayKst()})" 섹션으로 추가한다 (파일이 없으면 헤더 "# QA 리포트 — ${i.episodeId}" + "> QA: 독립 실행 (qa-v1.2) · 입력 3종 + spec/05만" 부터 새로 작성. 기존 내용 수정 금지, 추기만).
리포트에 포함: 항목별 판정 표, 실패 건마다 위치(턴 번호)·항목 번호·구체 사유(발췌의 어느 부분과 어긋나는지 또는 발췌에 없는지), 종합 판정.

특히 주의 깊게 볼 유형: ① 발췌에 없는 주장 (비교 축 추가, 연관의 방향 확정, 귀속 범위 확장, 연대·수치의 무근거 환산, 문장 위치 주장), ② 귀속 정확성 — 게재 매체 지시("~라는 매체", "같은 매체", "아까 그 ~")가 발췌의 실제 게재처와 일치하는지 지시 사슬 전수 추적, ③ 수치·시점의 상향 왜곡 (하향 범위 표현은 의도된 규격), ④ 콜드오픈이 본편 해당 턴과 자구 일치 + 위치 표기 정확, ⑤ 화자 규칙 (진행 담당의 사실 주장 금지 — 감상·추측 허용), ⑥ 수정 잔존 참조 (지시어·콜백이 가리키는 대상이 현재 대본 안에 실재하는지), ⑦ claims가 스스로 "발췌 밖" 등으로 표시한 항목은 그 판단을 믿지 말고 발췌 기준으로 독립 재판정.

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. 리포트 파일 작성이 먼저다.`;
}

export const QA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "failures", "holds", "report_written", "summary"],
  properties: {
    verdict: { type: "string", enum: ["qa_passed", "failed"] },
    failures: { type: "array", items: { type: "object", additionalProperties: false, required: ["location", "item", "reason"], properties: { location: { type: "string", description: "턴 번호 + 첫 몇 단어" }, item: { type: "string", description: "spec/05 항목 번호" }, reason: { type: "string" } } } },
    holds: { type: "array", items: { type: "string" }, description: "규약상 보류 항목 (5·7 등)" },
    report_written: { type: "boolean" },
    summary: { type: "string" },
  },
} as const;

export interface CriticInput {
  assetRoot: string;
  workRoot: string;
  episodeId: string;
  title: string;
  midTopic: MidTopic;
  scriptFile?: string;
  /** 루브릭 버전 — v2 = skills/critic/rubric-v2.md (초안, 100점 배점). 기본 v1 */
  rubric?: "v1" | "v2";
  /** tpl-v1 이전 세대 대본 (인트로·마무리가 자리표기) — v2 채점 시 3.5·3.7·G1에서 자리표기를 감점하지 않는다 */
  preTemplate?: boolean;
}

export function buildCriticPrompt(i: CriticInput): string {
  if (i.rubric === "v2") return buildCriticPromptV2(i);
  const a = assetPaths(i.assetRoot, i.workRoot);
  const dir = a.episodeDir(i.episodeId);
  const script = i.scriptFile ?? `${dir}/script.md`;
  const explainer = explainerFor(i.midTopic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 비평가다. 스타일·구성 품질을 독립 평가한다. 생성 맥락·QA 결과는 일절 모른 채 평가하는 것이 원칙이다.

## 입력 (정확히 이 파일들만 읽는다 — 다른 프로젝트 파일 금지. 특히 같은 디렉토리의 qa-report, claims, sources 및 다른 에피소드 금지)
1. ${a.criticRubric} — 비평 루브릭. 이 문서의 평가 항목·리포트 규격을 그대로 따른다.
2. ${a.guidelines} — 대본 규칙 (평가 기준의 원본).
3. ${script} — 평가 대상 대본 (에피소드: "${i.title}", 해설 ${explainer} / 진행 ${host}, ${i.midTopic}).
4. 골드 예시 2종 (비교 기준): ${a.goldFullEum}, ${a.goldFullYuna}

## 작업
루브릭의 전 항목(A·B·C·D·F군 + E 종합)을 평가하고, 결과를 ${dir}/critic-report.md 에 작성한다. 리포트 규격은 루브릭 문서의 규격을 따른다 — 반드시 포함: 종합 점수(5축), 플래그 표(위치·항목·지적 + 빈 "판정(사람)"·"사유" 열), ⭐ 잘된 지점 표(빈 판정 열 포함), 사람 추가 지적란(빈 칸), 비평가 총평.

평가 시 특별 유의 (루브릭 항목 내에서):
- C5 (사건 종속): 에피소드가 주제 축으로 전개되는지.
- F5 확장 관점: 골드 예시의 구체 비유·문구·도입 형태를 복제했는지 — 골드 2종과 대조해 표면 요소 중복이 있으면 플래그.
- 도입부가 템플릿화된 형태("습관 질문 → 오늘은 그 얘기")인지, 자기만의 진입인지.
- "~라..." 식 리액션 개시 틱의 반복 여부 (진행 턴 전반).
- 후반부 리듬 균질화 (중간 해설→한 줄 리액션 반복 구간).

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. 리포트 파일 작성이 먼저다.`;
}

/** critic-v2 (초안): 판단 항목 20개 플래그 + 12항목 100점 채점. 리포트는 critic-report-v2.md — v1 리포트 스냅샷은 건드리지 않는다. */
function buildCriticPromptV2(i: CriticInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const dir = a.episodeDir(i.episodeId);
  const script = i.scriptFile ?? `${dir}/script.md`;
  const explainer = explainerFor(i.midTopic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  const pre = i.preTemplate
    ? `
## 이 대본은 tpl-v1 이전 세대다
인트로·마무리에 \`{인트로 시그니처 …}\` \`{클로징 …}\` 같은 자리표기가 있다. 생성 당시 템플릿이 없었던 것이지 대본 결함이 아니다.
- 3.5 오프닝·3.7 마무리: 자리표기를 **tpl-v1 골격이 있는 것으로 간주**하고 콜드오픈·도입 구간·정리 내용만 채점한다. 자리표기 자체를 감점하지 않는다.
- C2: 주제 선언은 자리표기 안에 있는 것으로 간주한다.
- G1: 템플릿 골격 복제 판단에서 제외한다 (골드 관용구 복제는 그대로 본다).
`
    : "";
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 비평가다. 스타일·구성 품질을 독립 평가한다. 생성 맥락·QA 결과·기계 검사(L0) 결과는 일절 모른 채 평가하는 것이 원칙이다.

## 입력 (정확히 이 파일들만 읽는다 — 다른 프로젝트 파일 금지. 특히 같은 디렉토리의 qa-report, claims, sources, critic-report.md(구판) 및 다른 에피소드 금지)
1. ${a.criticRubricV2} — 비평 루브릭 v2. 이 문서의 판단 항목(2.1)·배점과 구간 정의(3장)·리포트 규격(4장)을 그대로 따른다.
2. ${a.guidelines} — 대본 규칙 (평가 기준의 원본).
3. ${script} — 평가 대상 대본 (에피소드: "${i.title}", 해설 ${explainer} / 진행 ${host}, ${i.midTopic}).
4. 골드 예시 2종 (비교 기준선): ${a.goldFullEum}, ${a.goldFullYuna}
${pre}
## 작업
결과를 ${dir}/critic-report-v2.md 에 작성한다 (루브릭 v2 4장 규격). 순서:
1. **점수 (100점)** — 3장의 하위 항목 12개를 **각각 독립적으로** 채점한다. 항목마다 구간 정의를 대본과 대조하고, 점수 옆에 반드시 대본 자구를 \`[E12] "…"\` 형식으로 인용한다 (인용 없는 점수는 무효). 합계는 계산 결과일 뿐 — 합계를 보고 조정하지 않는다. 몰입(3.10)은 다른 축의 합으로 역산하지 말고 통으로 판단한다.
   - **앵커 자리(\`{앵커 …: }\`)는 이번 실행에서 비어 있다.** 구간 정의만으로 채점한다. 이 실행은 "앵커 없음" 기준선이다.
   - 만점 구간은 **골드 2종보다 그 항목에서 명백히 나을 때만** 준다. 평범하면 평범하다고 쓴다.
   - 리포트의 "사람 점수"·"사람 사유" 열은 비워 둔다.
2. **플래그** — 2.1의 판단 항목 20개(A1~A8·B2·C1·C2·C3·C5·D1·D3·F1·F2·F4·F5·G1)만. **2.2의 이관 항목(B1·B3·B4·C4·D2·D4·D5·F3·F6)은 플래그하지 않는다** — 코드와 QA가 잰다. 강도는 위반/의심, 15건 이내, 자구 인용 필수, "판정(사람)"·"사유" 열은 비운다.
   - G1: 골드 2종과 대조해 관용구·진입 문구·정리 문구의 재사용을 찾는다.
3. **⭐ 잘된 지점** 3~7건 (빈 판정 열 포함).
4. **집계** 행은 사람 판정 후 채우므로 플래그·⭐ 수만 적는다.

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. 리포트 파일 작성이 먼저다. evidence의 각 항목은 리포트에 적은 인용과 같아야 한다.`;
}

const int = { type: "integer" } as const;
const str = { type: "string" } as const;
export const CRITIC_SCHEMA_V2 = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "evidence", "total", "violations", "suspects", "stars", "report_written", "summary"],
  properties: {
    scores: {
      type: "object", additionalProperties: false, required: ["content", "structure", "naturalness", "immersion", "persona"],
      properties: {
        content: { type: "object", additionalProperties: false, required: ["value", "argument", "perspective", "resonance"], properties: { value: int, argument: int, perspective: int, resonance: int }, description: "가치·깊이 /12 · 논증·귀속 /8 · 관점 /8 · 정서 공명 /7" },
        structure: { type: "object", additionalProperties: false, required: ["opening", "flow", "ending"], properties: { opening: int, flow: int, ending: int }, description: "오프닝 /6 · 전개 /8 · 마무리 /6" },
        naturalness: { type: "object", additionalProperties: false, required: ["spoken", "exchange"], properties: { spoken: int, exchange: int }, description: "구어성 /12 · 주고받기 /8" },
        immersion: { ...int, description: "몰입 /15 — 통으로" },
        persona: { type: "object", additionalProperties: false, required: ["voice", "listener"], properties: { voice: int, listener: int }, description: "말투·역할 /5 · 청취자 관점 /5" },
      },
    },
    evidence: {
      type: "object", additionalProperties: false,
      required: ["content_value", "content_argument", "content_perspective", "content_resonance", "structure_opening", "structure_flow", "structure_ending", "natural_spoken", "natural_exchange", "immersion", "persona_voice", "persona_listener"],
      properties: { content_value: str, content_argument: str, content_perspective: str, content_resonance: str, structure_opening: str, structure_flow: str, structure_ending: str, natural_spoken: str, natural_exchange: str, immersion: str, persona_voice: str, persona_listener: str },
      description: "항목별 근거 — [턴] 자구 인용",
    },
    total: { ...int, description: "12항목 합계 /100" },
    violations: int,
    suspects: int,
    stars: int,
    report_written: { type: "boolean" },
    summary: { type: "string", description: "총평 3문장" },
  },
} as const;

export const CRITIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "violations", "suspects", "stars", "report_written", "summary"],
  properties: {
    scores: { type: "object", additionalProperties: false, required: ["immersion", "naturalness", "density", "persona", "structure"], properties: { immersion: { type: "integer" }, naturalness: { type: "integer" }, density: { type: "integer" }, persona: { type: "integer" }, structure: { type: "integer" } } },
    violations: { type: "integer" },
    suspects: { type: "integer" },
    stars: { type: "integer" },
    report_written: { type: "boolean" },
    summary: { type: "string", description: "총평 3문장" },
  },
} as const;

export interface ClusterInput {
  assetRoot: string;
  midTopic: MidTopic;
  nextIdNumber: number;
  sources: { url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }[];
  existingTitles: string[];
}

export function buildClusterPrompt(i: ClusterInput): string {
  const a = assetPaths(i.assetRoot);
  const list = i.sources
    .map((s, n) => `${n + 1}. [${s.domain}] ${s.title}${s.published ? ` (${s.published.slice(0, 10)})` : ""}\n   ${s.url}\n   ${(s.summary ?? "").slice(0, 220)}`)
    .join("\n");
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 군집화 담당이다. 스윕된 소스 **메타데이터만** 보고 (원문 접속 금지 — WebFetch 사용 금지) 에피소드 후보를 뽑는다.

## 읽을 파일
- ${a.specBacklog} — 군집화 기준·후보 구성 항목 (특히 "군집의 축 = 주제" 규칙)

## 원칙 (전부 준수)
- **에피소드는 주제(개념·원리·질문)가 이끈다 — 사건 종속 금지.** 후보 제목이 "○○ 사건의 전말"형이면 축이 잘못된 것. 사건·소식성 소스는 사례 재료로만.
- **군집당 소스 5건 이상** (15분 분량 확보 — 3~4건은 분량 미달 실증). 5건을 못 채우면 후보로 내지 말고 예비 메모에만 남긴다. 최소 3건 하한은 절대선.
- 타깃: 자기계발을 원하는 2030 한국 직장인 (IT 개발자 아님). 각 후보에 타깃 정합 한 줄.
- 기존 후보와 축이 겹치면 내지 않는다. 기존 제목: ${i.existingTitles.length ? i.existingTitles.join(" / ") : "(없음)"}
- 후보 ID는 C${i.nextIdNumber}부터 순번 부여. 중분류: ${i.midTopic} (소스가 다른 중분류에 더 맞으면 그 중분류로 표기 가능).
- 후보 수: 성립하는 만큼 (0~6). 억지로 채우지 않는다.

## 소스 메타데이터 (${i.sources.length}건)
${list}

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다.`;
}

export const CLUSTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates", "reserve_notes", "dropped_notes"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "mid_topic", "title", "summary", "target_fit", "angle", "sources", "dedup_note"],
        properties: {
          id: { type: "string" },
          mid_topic: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          target_fit: { type: "string" },
          angle: { type: "string", description: "축 + 전개 순서 한 문단" },
          sources: { type: "array", minItems: 3, items: { type: "object", additionalProperties: false, required: ["url", "title", "publisher", "backbone"], properties: { url: { type: "string" }, title: { type: "string" }, publisher: { type: "string" }, backbone: { type: "boolean" } } } },
          dedup_note: { type: "string" },
        },
      },
    },
    reserve_notes: { type: "array", items: { type: "string" }, description: "성립 가능하나 이번엔 안 낸 군집 메모" },
    dropped_notes: { type: "array", items: { type: "string" }, description: "탈락 사유 메모 (사건 축·소스 부족 등)" },
  },
} as const;

export function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 에피소드 ID 날짜 부분: T{YYMMDD} (KST) */
export function episodeDatePrefix(prefix = "T"): string {
  return prefix + todayKst().slice(2).replace(/-/g, "");
}
