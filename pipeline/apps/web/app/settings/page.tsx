import { supabaseServer } from "@/lib/supabase-server";
import { SettingsForm } from "./settings-form";
import { PageHeader, Panel } from "@/components/ui";

export default async function SettingsPage() {
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("key,value,updated_by,updated_at");
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r]));
  return (
    <div className="space-y-4">
      <PageHeader title="설정" breadcrumb={["파이프라인", "설정"]} desc="TTS 보이스·시그니처 템플릿·워커 기본값. 규칙 자산(가이드라인·골드·루브릭·QA 프롬프트)은 규칙 자산 화면에서 버전 관리·활성화한다 (spec/10 3.2)." />
      <SettingsForm tts={s.tts?.value ?? {}} worker={s.worker?.value ?? {}} templates={s.templates?.value ?? {}} meta={{ tts: s.tts, worker: s.worker, templates: s.templates }} />
      <Panel title="규칙 자산 (spec/10 3.2)">
        <p className="text-xs text-ink-soft">가이드라인·골드 예시·QA 프롬프트·비평 루브릭의 진실은 DB(<code>prompt_assets</code>)이며 <a className="text-brand underline" href="/assets">규칙 자산</a> 화면에서 새 버전 저장·활성화한다. 워커는 작업 시작 시 active 묶음을 읽고, 에피소드는 시작 때 버전을 끝까지 유지한다. 프롬프트 버전은 여기서 정하지 않고 읽은 버전에서 유도된다.</p>
      </Panel>
    </div>
  );
}
