export const MAIL_PROVIDER_KIND = Object.freeze({
  GMAIL: 'gmail',
  OUTLOOK: 'outlook',
});

export function normalizeMailProviderKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (!kind) {
    throw new Error('mail provider kind 不能为空');
  }
  if (kind === 'gmail' || kind === 'googlemail') {
    return MAIL_PROVIDER_KIND.GMAIL;
  }
  if (kind === 'outlook' || kind === 'hotmail' || kind === 'live') {
    return MAIL_PROVIDER_KIND.OUTLOOK;
  }
  throw new Error(`不支持的 mail provider kind: ${value}`);
}

export function createMailProviderRegistry() {
  const providers = new Map();

  return {
    register(kind, provider) {
      const normalizedKind = normalizeMailProviderKind(kind);
      if (!provider || typeof provider !== 'object') {
        throw new Error('mail provider 必须是对象');
      }
      for (const method of ['openInbox', 'sendMail']) {
        if (typeof provider[method] !== 'function') {
          throw new Error(`mail provider 缺少 ${method} 方法`);
        }
      }
      providers.set(normalizedKind, provider);
      return provider;
    },
    get(kind) {
      const normalizedKind = normalizeMailProviderKind(kind);
      const provider = providers.get(normalizedKind);
      if (!provider) {
        throw new Error(`未注册 mail provider: ${normalizedKind}`);
      }
      return provider;
    },
    has(kind) {
      return providers.has(normalizeMailProviderKind(kind));
    },
  };
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} 必须是非空字符串`);
  }
}

export function createMailAccountDescriptor({
  providerKind,
  address,
  loginEmail = '',
  displayName = '',
}) {
  assertNonEmptyString(providerKind, 'providerKind');
  assertNonEmptyString(address, 'address');
  return {
    provider_kind: normalizeMailProviderKind(providerKind),
    address: address.trim().toLowerCase(),
    login_email: String(loginEmail || '').trim().toLowerCase(),
    display_name: String(displayName || '').trim(),
  };
}

