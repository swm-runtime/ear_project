import { afterEach, describe, expect, it, jest } from '@jest/globals';

import appConfig from '../../../app.json';

const loadVersion = (nativeVersion: string | null, environment = 'standalone') => {
  jest.resetModules();
  jest.doMock('expo-application', () => ({ nativeApplicationVersion: nativeVersion }));
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: { executionEnvironment: environment },
    ExecutionEnvironment: { StoreClient: 'storeClient' },
  }));
  jest.doMock('expo-updates', () => ({ isEmbeddedLaunch: true }));
  return jest.requireActual<typeof import('./app-version')>('./app-version');
};

afterEach(() => {
  jest.resetModules();
});

describe('앱 버전 원천', () => {
  it('1.2.0 바이너리의 버전을 설정 표시와 서버 요청에 사용한다', () => {
    const version = loadVersion('1.2.0');
    expect(version.APP_VERSION).toBe('1.2.0');
    expect(version.APP_VERSION_LABEL).toMatch(/^1\.2\.0 \(내장\)/);
  });

  it('최신 OTA를 받아도 구버전 바이너리의 버전을 올려 보고하지 않는다', () => {
    expect(loadVersion('1.1.0').APP_VERSION).toBe('1.1.0');
  });

  it('웹처럼 네이티브 버전이 없으면 프로젝트 설정을 사용한다', () => {
    expect(loadVersion(null).APP_VERSION).toBe(appConfig.expo.version);
  });

  it('Expo Go 호스트의 버전 대신 프로젝트 버전을 사용한다', () => {
    expect(loadVersion('57.0.0', 'storeClient').APP_VERSION).toBe(appConfig.expo.version);
  });
});
