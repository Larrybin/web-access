import { createMailAccountDescriptor, normalizeMailProviderKind } from './mail-provider.mjs';

export const OUTLOOK_PROVIDER_KIND = normalizeMailProviderKind('outlook');

function assertProviderFactory(factory) {
  if (typeof factory !== 'function') {
    throw new Error('Outlook provider factory 必须是函数');
  }
}

export function createOutlookProvider({ openInbox, sendMail } = {}) {
  assertProviderFactory(openInbox);
  assertProviderFactory(sendMail);

  return {
    resolveAccount(address) {
      return createMailAccountDescriptor({
        providerKind: OUTLOOK_PROVIDER_KIND,
        address,
        loginEmail: address,
      });
    },
    openInbox(address, options = {}) {
      return openInbox(address, options);
    },
    sendMail(address, message, options = {}) {
      return sendMail(address, message, options);
    },
  };
}
