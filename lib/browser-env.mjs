export const BROWSER_ENV_KIND = Object.freeze({
  ADSPOWER: 'adspower',
  HUBSTUDIO: 'hubstudio',
});

export function normalizeBrowserEnvKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (!kind) {
    throw new Error('browser env kind 不能为空');
  }
  if (kind === 'adspower' || kind === 'adspower-local') {
    return BROWSER_ENV_KIND.ADSPOWER;
  }
  if (kind === 'hubstudio' || kind === 'hubstudio-local') {
    return BROWSER_ENV_KIND.HUBSTUDIO;
  }
  throw new Error(`不支持的 browser env kind: ${value}`);
}

export function createBrowserEnvRegistry() {
  const providers = new Map();

  return {
    register(kind, provider) {
      const normalizedKind = normalizeBrowserEnvKind(kind);
      if (!provider || typeof provider !== 'object') {
        throw new Error('browser env provider 必须是对象');
      }
      for (const method of ['resolveProfile', 'start', 'stop']) {
        if (typeof provider[method] !== 'function') {
          throw new Error(`browser env provider 缺少 ${method} 方法`);
        }
      }
      providers.set(normalizedKind, provider);
      return provider;
    },
    get(kind) {
      const normalizedKind = normalizeBrowserEnvKind(kind);
      const provider = providers.get(normalizedKind);
      if (!provider) {
        throw new Error(`未注册 browser env provider: ${normalizedKind}`);
      }
      return provider;
    },
    has(kind) {
      return providers.has(normalizeBrowserEnvKind(kind));
    },
  };
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} 必须是非空字符串`);
  }
}

export function createBrowserEnvDescriptor({
  kind,
  profileId,
  profileName = '',
  serialNumber = '',
}) {
  assertNonEmptyString(kind, 'kind');
  assertNonEmptyString(profileId, 'profileId');
  return {
    kind: normalizeBrowserEnvKind(kind),
    profile_id: profileId.trim(),
    profile_name: String(profileName || '').trim(),
    serial_number: String(serialNumber || '').trim(),
  };
}

