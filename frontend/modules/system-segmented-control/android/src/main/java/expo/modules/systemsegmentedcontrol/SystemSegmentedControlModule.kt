package expo.modules.systemsegmentedcontrol

import android.content.Context
import android.view.ContextThemeWrapper
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import com.google.android.material.R as MaterialR
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Android 기본 토글 — **Material 3 Expressive 의 Connected button toggle group** 을 RN 뷰로 그대로 노출한다
 * (PM 2026-09-29 16:37 "존나 최신 기준으로, 재현하지 말고 그대로 사용해"). iOS 쪽 `UISegmentedControl` 과 같은 계약이다 —
 * `segments` · `selectedIndex` · `enabled` · `onChange({ selectedIndex })`.
 *
 * - M3 Expressive 에서 세그먼트 버튼은 폐기됐고 이것이 대체다(2dp 틈 · 안쪽 모서리 8dp · 바깥 완전 원형 · 선택 칸 모핑).
 *   색·모양·모션은 하나도 손대지 않고 테마(`Theme.Material3Expressive.DynamicColors.Light`)가 정하게 둔다 — Android 12+
 *   에서는 사용자 배경화면 색(다이내믹 컬러)을 따른다.
 * - 앱 테마(AppCompat)에서는 Material 버튼이 뜨지 않으므로 이 뷰 안에서만 Material 테마로 감싼다.
 * - 선택 칸은 **호출부의 `selectedIndex` 가 기준**이다 — 사용자가 탭하면 그룹이 먼저 움직이고 onChange 로 알리며, 호출부가
 *   값을 되돌리면 그 값으로 다시 맞춘다(iOS 와 같다).
 */
class SystemSegmentedControlModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SystemSegmentedControl")

    View(SystemSegmentedControlView::class) {
      Events("onChange")

      Prop("segments") { view: SystemSegmentedControlView, segments: List<String> ->
        view.segments = segments
      }

      Prop("selectedIndex") { view: SystemSegmentedControlView, index: Int ->
        view.selectedIndex = index
      }

      Prop("enabled") { view: SystemSegmentedControlView, enabled: Boolean ->
        view.setGroupEnabled(enabled)
      }

      // 프롭은 도착 순서가 보장되지 않는다 — 제목·선택을 한 번에 적용한다
      OnViewDidUpdateProps { view: SystemSegmentedControlView ->
        view.apply()
      }
    }
  }
}

class SystemSegmentedControlView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // 자식(Material 그룹)의 크기·배치를 Android 레이아웃에 맡긴다 — 이 뷰 자체의 크기는 JS style 이 정한다
  override val shouldUseAndroidLayout = true

  private val onChange by EventDispatcher<Map<String, Any>>()
  private val themed = ContextThemeWrapper(
    context,
    MaterialR.style.Theme_Material3Expressive_DynamicColors_Light_NoActionBar,
  )
  private val group = MaterialButtonToggleGroup(themed, null, MaterialR.attr.materialButtonToggleGroupStyle)
  private val buttonIds = mutableListOf<Int>()
  /** 호출부 값으로 맞추는 중 — 이때의 체크 변화는 사용자 탭이 아니다 */
  private var syncing = false

  var segments: List<String> = emptyList()
  var selectedIndex: Int = 0

  init {
    group.setSingleSelection(true)
    group.setSelectionRequired(true)
    addView(group, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    group.addOnButtonCheckedListener { _, checkedId, isChecked ->
      if (!isChecked || syncing) return@addOnButtonCheckedListener
      val index = buttonIds.indexOf(checkedId)
      if (index >= 0) onChange(mapOf("selectedIndex" to index))
    }
  }

  fun setGroupEnabled(enabled: Boolean) {
    group.isEnabled = enabled
  }

  fun apply() {
    val currentTitles = buttonIds.map { id -> group.findViewById<MaterialButton>(id)?.text?.toString() ?: "" }
    syncing = true
    if (currentTitles != segments) {
      group.removeAllViews()
      buttonIds.clear()
      for (title in segments) {
        // 테마 기본 버튼(Widget.Material3Expressive.Button) — 토글 가능하게만 켠다
        val button = MaterialButton(themed, null, MaterialR.attr.materialButtonStyle).apply {
          id = View.generateViewId()
          text = title
          isCheckable = true
        }
        buttonIds.add(button.id)
        group.addView(button, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
      }
    }
    if (buttonIds.isNotEmpty()) {
      val clamped = selectedIndex.coerceIn(0, buttonIds.size - 1)
      if (group.checkedButtonId != buttonIds[clamped]) group.check(buttonIds[clamped])
    }
    syncing = false
  }
}
