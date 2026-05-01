import { createMailAccountDescriptor, normalizeMailProviderKind } from './mail-provider.mjs';

export const GMAIL_PROVIDER_KIND = normalizeMailProviderKind('gmail');

function assertProviderFactory(factory) {
  if (typeof factory !== 'function') {
    throw new Error('Gmail provider factory 必须是函数');
  }
}

export function createGmailProvider({ openInbox, sendMail } = {}) {
  assertProviderFactory(openInbox);
  assertProviderFactory(sendMail);

  return {
    resolveAccount(address) {
      return createMailAccountDescriptor({
        providerKind: GMAIL_PROVIDER_KIND,
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
