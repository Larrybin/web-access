import { createBrowserEnvDescriptor, normalizeBrowserEnvKind } from './browser-env.mjs';

export const HUBSTUDIO_BROWSER_ENV_KIND = normalizeBrowserEnvKind('hubstudio');

function assertProviderFactory(factory) {
  if (typeof factory !== 'function') {
    throw new Error('HubStudio provider factory 必须是函数');
  }
}

export function createHubStudioBrowserEnvProvider({
  resolveProfile,
  start,
  stop,
} = {}) {
  assertProviderFactory(resolveProfile);
  assertProviderFactory(start);
  assertProviderFactory(stop);

  return {
    resolveProfile(envSerial) {
      const info = resolveProfile(envSerial);
      return createBrowserEnvDescriptor({
        kind: HUBSTUDIO_BROWSER_ENV_KIND,
        profileId: info.profileId || info.profile_id,
        profileName: info.profileName || info.profile_name || '',
        serialNumber: info.serialNumber || info.serial_number || '',
      });
    },
    start(envSerial, options = {}) {
      return start(envSerial, options);
    },
    stop(profileId) {
      return stop(profileId);
    },
  };
}
