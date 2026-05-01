import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAIL_PROVIDER_KIND,
  createMailAccountDescriptor,
  createMailProviderRegistry,
  normalizeMailProviderKind,
} from '../lib/mail-provider.mjs';
import { createGmailProvider } from '../lib/gmail-provider.mjs';
import { createOutlookProvider } from '../lib/outlook-provider.mjs';

test('normalizeMailProviderKind accepts Gmail and Outlook aliases', () => {
  assert.equal(normalizeMailProviderKind('gmail'), MAIL_PROVIDER_KIND.GMAIL);
  assert.equal(normalizeMailProviderKind('Hotmail'), MAIL_PROVIDER_KIND.OUTLOOK);
});

test('createMailProviderRegistry registers and resolves providers', () => {
  const registry = createMailProviderRegistry();
  const provider = {
    openInbox() {},
    sendMail() {},
  };

  registry.register('gmail', provider);

  assert.equal(registry.has('gmail'), true);
  assert.equal(registry.get('gmail'), provider);
});

test('createMailAccountDescriptor normalizes structure', () => {
  const account = createMailAccountDescriptor({
    providerKind: 'outlook',
    address: ' VC.DDOM@OUTLOOK.COM ',
    loginEmail: ' login@example.com ',
    displayName: ' Profile ',
  });

  assert.deepEqual(account, {
    provider_kind: MAIL_PROVIDER_KIND.OUTLOOK,
    address: 'vc.ddom@outlook.com',
    login_email: 'login@example.com',
    display_name: 'Profile',
  });
});

test('mail provider factories normalize injected implementations', () => {
  const gmail = createGmailProvider({
    openInbox: () => ({ ok: true }),
    sendMail: () => ({ ok: true }),
  });
  const outlook = createOutlookProvider({
    openInbox: () => ({ ok: true }),
    sendMail: () => ({ ok: true }),
  });

  assert.equal(gmail.resolveAccount('user@gmail.com').provider_kind, MAIL_PROVIDER_KIND.GMAIL);
  assert.equal(outlook.resolveAccount('user@outlook.com').provider_kind, MAIL_PROVIDER_KIND.OUTLOOK);
});
