import { supabaseServer } from "@/lib/supabase-server";
import { SettingsForm } from "./settings-form";
import { PageHeader, Panel } from "@/components/ui";

export default async function SettingsPage() {
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("key,value,updated_by,updated_at");
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r]));
  return (
    <div className="space-y-4">
      <PageHeader title="설정" breadcrumb={["파이프라인", "설정"]} desc="TTS 보이스·시그니처 템플릿·워커 기본값. 프롬프트 자산(가이드라인·골드·루브릭)은 저장소에서 버전 관리하며 여기서 편집하지 않는다." />
      <SettingsForm tts={s.tts?.value ?? {}} worker={s.worker?.value ?? {}} templates={s.templates?.value ?? {}} meta={{ tts: s.tts, worker: s.worker, templates: s.templates }} />
      <Panel title="프롬프트 자산 (읽기 전용 — 개정은 사람 승인, spec/09)">
        <ul className="list-inside list-disc space-y-0.5 text-xs text-ink-soft"><li>대본 가이드라인: skills/draft/guidelines.md (full-v5 · full-v6 승인 대기)</li><li>골드 예시 3종: skills/draft/examples/</li><li>비평 루브릭: skills/critic/rubric.md (critic-v1.3)</li><li>QA 프롬프트: skills/qa/prompt.md (qa-v1.2)</li></ul>
      </Panel>
    </div>
  );
}
