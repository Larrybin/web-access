import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROWSER_ENV_KIND,
  createBrowserEnvRegistry,
  createBrowserEnvDescriptor,
  normalizeBrowserEnvKind,
} from '../lib/browser-env.mjs';
import { createAdsPowerBrowserEnvProvider } from '../lib/adspower-env.mjs';
import { createHubStudioBrowserEnvProvider } from '../lib/hubstudio-env.mjs';

test('normalizeBrowserEnvKind accepts adsPower aliases', () => {
  assert.equal(normalizeBrowserEnvKind('adspower'), BROWSER_ENV_KIND.ADSPOWER);
  assert.equal(normalizeBrowserEnvKind('HubStudio'), BROWSER_ENV_KIND.HUBSTUDIO);
});

test('createBrowserEnvRegistry registers and resolves providers', () => {
  const registry = createBrowserEnvRegistry();
  const provider = {
    resolveProfile() {},
    start() {},
    stop() {},
  };

  registry.register('adspower', provider);

  assert.equal(registry.has('adspower'), true);
  assert.equal(registry.get('adspower'), provider);
});

test('createBrowserEnvDescriptor normalizes structure', () => {
  const descriptor = createBrowserEnvDescriptor({
    kind: 'adspower',
    profileId: ' pid-1 ',
    profileName: ' profile ',
    serialNumber: ' 3 ',
  });

  assert.deepEqual(descriptor, {
    kind: BROWSER_ENV_KIND.ADSPOWER,
    profile_id: 'pid-1',
    profile_name: 'profile',
    serial_number: '3',
  });
});

test('browser env provider factories normalize injected implementations', () => {
  const adspower = createAdsPowerBrowserEnvProvider({
    resolveProfile: (envSerial) => ({
      profileId: `pid-${envSerial}`,
      profileName: 'Adspower',
      serialNumber: envSerial,
    }),
    start: () => ({ ok: true }),
    stop: () => ({ ok: true }),
  });
  const hubstudio = createHubStudioBrowserEnvProvider({
    resolveProfile: (envSerial) => ({
      profile_id: `hub-${envSerial}`,
      profile_name: 'Hub',
      serial_number: envSerial,
    }),
    start: () => ({ ok: true }),
    stop: () => ({ ok: true }),
  });

  assert.equal(adspower.resolveProfile('3').kind, BROWSER_ENV_KIND.ADSPOWER);
  assert.equal(hubstudio.resolveProfile('4').kind, BROWSER_ENV_KIND.HUBSTUDIO);
});
