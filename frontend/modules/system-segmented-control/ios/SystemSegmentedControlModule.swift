import ExpoModulesCore
import UIKit

/**
 iOS 기본 `UISegmentedControl` 을 RN 뷰로 그대로 노출한다 — 색·글꼴·모서리를 하나도 손대지 않아 iOS 26 에서는
 시스템이 그리는 유리 선택바(탭하면 선택 칸이 미끄러지는 그 모양)가 된다(PM 2026-09-26 02:19 "iOS 26 기본 토글로").

 JS 쪽 재현(`shared/ui/SegmentedControl` 의 `system`·`modern`)은 옛 iOS 모양을 흉내 낸 것이라 iOS 26 실기기에서
 "옛날 것 같다"(09-25 23:30)는 평을 들었다. 시스템 컨트롤은 OS 가 바뀌면 같이 바뀐다.

 - `segments` 제목 배열 · `selectedIndex` 선택 칸 · `enabled` 탭 허용 여부 · `onChange({ selectedIndex })`.
 - 선택 칸은 **호출부의 `selectedIndex` 가 기준**이다 — 사용자가 탭하면 시스템이 먼저 움직이고 onChange 로 알리며,
   호출부가 값을 되돌리면(전환 실패·비활성 중 탭) 그 값으로 다시 맞춘다(uiux explore 4.10 "선택 상태를 직전 구간으로").
 */
public class SystemSegmentedControlModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SystemSegmentedControl")

    View(SystemSegmentedControlView.self) {
      Events("onChange")

      Prop("segments") { (view: SystemSegmentedControlView, segments: [String]) in
        view.segments = segments
      }

      Prop("selectedIndex") { (view: SystemSegmentedControlView, index: Int) in
        view.selectedIndex = index
      }

      Prop("enabled") { (view: SystemSegmentedControlView, enabled: Bool) in
        view.control.isEnabled = enabled
      }

      // 프롭은 도착 순서가 보장되지 않는다 — 제목·선택을 한 번에 적용한다
      OnViewDidUpdateProps { (view: SystemSegmentedControlView) in
        view.apply()
      }
    }
  }
}

class SystemSegmentedControlView: ExpoView {
  let control = UISegmentedControl()
  let onChange = EventDispatcher()

  var segments: [String] = []
  var selectedIndex: Int = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    addSubview(control)
    control.addTarget(self, action: #selector(handleValueChanged), for: .valueChanged)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    control.frame = bounds
  }

  func apply() {
    let currentTitles = (0..<control.numberOfSegments).map { control.titleForSegment(at: $0) ?? "" }
    if currentTitles != segments {
      control.removeAllSegments()
      for (index, title) in segments.enumerated() {
        control.insertSegment(withTitle: title, at: index, animated: false)
      }
    }
    let clamped = segments.isEmpty ? UISegmentedControl.noSegment : max(0, min(selectedIndex, segments.count - 1))
    if control.selectedSegmentIndex != clamped {
      control.selectedSegmentIndex = clamped
    }
  }

  @objc private func handleValueChanged() {
    onChange(["selectedIndex": control.selectedSegmentIndex])
  }
}
