Pod::Spec.new do |s|
  s.name           = 'ScrollEdgeEffect'
  s.version        = '1.0.0'
  s.summary        = 'iOS 26 UIScrollView.topEdgeEffect for React Native scroll views'
  s.description    = 'Local Expo module: applies UIScrollEdgeEffect style to the UIScrollView behind an RCTScrollView by react tag.'
  s.author         = 'Run-Time'
  s.homepage       = 'https://github.com/swm-runtime/ear_project'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
