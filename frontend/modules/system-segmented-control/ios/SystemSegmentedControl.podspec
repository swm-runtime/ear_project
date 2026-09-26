Pod::Spec.new do |s|
  s.name           = 'SystemSegmentedControl'
  s.version        = '1.0.0'
  s.summary        = 'Native UISegmentedControl for React Native (Expo module)'
  s.description    = 'Local Expo module: exposes the system UISegmentedControl as a React Native view so the iOS 26 glass segmented control is used as-is.'
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
