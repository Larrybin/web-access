#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import {
  CURRENT_STEP,
  PENDING_CONFIRMATION,
  RESULT_STATE,
  STATUS,
  addEvidence,
  createRunbook,
  loadRunbook,
  saveRunbook,
  validateRunbook,
} from './runbook.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_DEPS_SCRIPT = path.join(ROOT, 'scripts', 'check-deps.mjs');
const PROXY_BASE = process.env.CDP_PROXY_BASE || 'http://127.0.0.1:3456';
const OBSERVE_BUDGET = 3;
const RECOVER_BUDGET = 1;
const FINAL_RESULT_STATES = new Set([RESULT_STATE.PUBLIC, RESULT_STATE.AWAITING_REVIEW, RESULT_STATE.BLOCKED]);
const COMMUNITY_CBR_CREATOR_SHOWCASE_POST_URL = 'https://community.cbr.com/forums/creator-showcase.23/post-thread';
const WAKELET_SIGNUP_URL = 'https://wakelet.com/signup';
const DAILY_DEV_SIGNUP_URL = 'https://app.daily.dev/onboarding?stepId=signup';
const DAILY_DEV_PROFILE_SETTINGS_URL = 'https://app.daily.dev/settings/profile';
const JOY_LINK_SIGNUP_URL = 'https://joy.link/user/login?language=en&loginpage=signup';
const MYMINIFACTORY_PROFILE_SETTINGS_URL = 'https://www.myminifactory.com/settings/profile';

export function buildGuideParserExpression() {
  return `(() => {
    const bodyText = document.body.innerText || '';
    return {
      title: document.title,
      text: bodyText,
      links: Array.from(document.querySelectorAll('a'))
        .map((a) => ({
          text: (a.innerText || a.textContent || '').trim(),
          href: a.href || '',
        }))
        .filter((item) => item.text || item.href)
        .slice(0, 200),
    };
  })()`;
}

function extractField(text, label, nextLabels) {
  const next = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const suffix = next ? `(?:${next}|$)` : '$';
  const pattern = new RegExp(`${label}\\s*([\\s\\S]*?)(?=${suffix})`, 'i');
  const match = text.match(pattern);
  return match?.[1]?.trim() || '';
}

function extractFirstField(text, labels, nextLabels) {
  for (const label of labels) {
    const value = extractField(text, label, nextLabels);
    if (value) {
      return value;
    }
  }
  return '';
}

export function compileGuidePagePayload(payload) {
  const text = payload?.text || '';
  const siteField = extractField(text, '网址', ['DR/DA', 'SPAM SCORE', '链接形式', '操作方式']);
  const siteMatch = siteField.match(/https?:\/\/\S+/i);
  const fallbackSiteLink = (payload?.links || []).find((link) => {
    if (!link?.href || !/^https?:\/\//i.test(link.href)) {
      return false;
    }
    const hrefHost = tryParseUrl(link.href)?.hostname || '';
    if (hrefHost === 'pdfreprinting.net') {
      return false;
    }
    const linkText = normalizeLabel(link.text);
    const normalizedSiteField = normalizeLabel(siteField);
    return Boolean(linkText && normalizedSiteField && normalizedSiteField.includes(linkText));
  });
  const targetSite = siteMatch?.[0] || fallbackSiteLink?.href || '';
  const linkType = extractFirstField(text, ['链接形式', '链接方式'], ['操作方法', '操作方式', '操作形式', '讨论区', '正文内容']);
  const guideHint = extractFirstField(text, ['操作方法', '操作方式', '操作形式'], ['讨论区', '正文内容', '慢读归档']);

  if (!targetSite || !linkType || !guideHint) {
    throw new Error('攻略页缺少必要字段');
  }

  return {
    guideTitle: payload?.title || '',
    targetSite,
    linkType,
    guideHint,
  };
}

function normalizeLabel(text) {
  return (text || '').trim().toLowerCase();
}

function normalizeHostname(value) {
  const hostname = tryParseUrl(value)?.hostname || String(value || '');
  const normalized = hostname.replace(/^www\./i, '').toLowerCase();
  if (normalized === 'app.daily.dev') {
    return 'daily.dev';
  }
  return normalized;
}

function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function sameHost(url, expectedHost) {
  return normalizeHostname(url) === normalizeHostname(expectedHost);
}

function findFirstLink(links, predicate) {
  return links.find((link) => predicate({
    text: normalizeLabel(link.text),
    href: normalizeLabel(link.href),
    link,
  }));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function dispatchInputScript() {
  return `
    const fire = (el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
  `;
}

export function findCandidatePaths({ links }) {
  const hasRegister = links.some((link) => {
    const text = normalizeLabel(link.text);
    const href = normalizeLabel(link.href);
    return text.includes('register') || href.includes('/register');
  });
  const hasProfile = links.some((link) => {
    const text = normalizeLabel(link.text);
    const href = normalizeLabel(link.href);
    return text.includes('account') || text.includes('profile') || href.includes('/account') || href.includes('/profile');
  });
  const hasThreadPost = links.some((link) => {
    const text = normalizeLabel(link.text);
    const href = normalizeLabel(link.href);
    return text.includes('post thread') || text.includes('create thread') || href.includes('post-thread');
  });

  const candidates = [];

  if (hasProfile || hasRegister) {
    candidates.push({
      id: 'profile_link',
      label: 'Profile website field',
      evidence: links
        .filter((link) => {
          const text = normalizeLabel(link.text);
          const href = normalizeLabel(link.href);
          return (
            text.includes('register') ||
            text.includes('account') ||
            text.includes('profile') ||
            href.includes('/register') ||
            href.includes('/account') ||
            href.includes('/profile')
          );
        })
        .slice(0, 3)
        .map((link) => link.text || link.href),
    });
  }

  if (hasThreadPost || hasRegister) {
    candidates.push({
      id: 'thread_post',
      label: 'Create thread',
      evidence: links
        .filter((link) => {
          const text = normalizeLabel(link.text);
          const href = normalizeLabel(link.href);
          return (
            text.includes('register') ||
            text.includes('post thread') ||
            text.includes('create thread') ||
            href.includes('/register') ||
            href.includes('post-thread')
          );
        })
        .slice(0, 3)
        .map((link) => link.text || link.href),
    });
  }

  return candidates.filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index);
}

function isCommunityCbrLoggedIn(observation) {
  const links = observation.links || [];
  return links.some((link) => {
    const text = normalizeLabel(link.text);
    const href = normalizeLabel(link.href);
    return (
      text.includes('log out') ||
      text.includes('your account') ||
      text.includes('your profile') ||
      href.includes('/logout/') ||
      href === 'https://community.cbr.com/account/' ||
      href.includes('/members/')
    );
  });
}

function isWakeletLoggedIn(observation) {
  const links = observation.links || [];
  return links.some((link) => {
    const text = normalizeLabel(link.text);
    const href = normalizeLabel(link.href);
    return (
      text.includes('my library') ||
      text.includes('shared with me') ||
      text.includes('collections') ||
      text.includes('items') ||
      href.includes('/workspace/') ||
      href === 'https://wakelet.com/items' ||
      href === 'https://wakelet.com/search'
    );
  });
}

function isDailyDevLoggedIn(observation) {
  const url = tryParseUrl(observation.url);
  const links = observation.links || [];
  if (url?.hostname === 'app.daily.dev' && !url.pathname.startsWith('/onboarding')) {
    return true;
  }
  return links.some((link) => {
    const text = normalizeLabel(link.text);
    const href = normalizeLabel(link.href);
    return (
      text.includes('edit profile') ||
      text.includes('saved') ||
      href.includes('/settings/profile') ||
      href.includes('app.daily.dev/')
    );
  });
}

function isMyMiniFactoryLoggedIn(observation) {
  const url = tryParseUrl(observation.url);
  const links = observation.links || [];
  if (normalizeHostname(url?.hostname) !== 'myminifactory.com') {
    return false;
  }
  return links.some((link) => {
    const text = normalizeLabel(link.text);
    const href = normalizeLabel(link.href);
    return (
      text.includes('settings') ||
      text.includes('my public profile') ||
      text.includes('logout') ||
      href.includes('/settings') ||
      href.includes('/users/') ||
      href.includes('/log_out')
    );
  });
}

function isJoyLinkDashboard(observation) {
  const url = tryParseUrl(observation.url);
  const links = observation.links || [];
  if (url?.hostname !== 'joy.link') {
    return false;
  }
  if (url.pathname.startsWith('/user/')) {
    return true;
  }
  return links.some((link) => {
    const text = normalizeLabel(link.text);
    const href = normalizeLabel(link.href);
    return (
      text.includes('logout') ||
      text.includes('analytics') ||
      text.includes('profiles') ||
      text.includes('content') ||
      href.includes('/user/logout') ||
      href.includes('/user/')
    );
  });
}

function selectCommunityCbrNavigation(runbook, observation) {
  const links = observation.links || [];
  const loggedIn = isCommunityCbrLoggedIn(observation);
  const accountDetailsLink = findFirstLink(links, ({ href }) => href.includes('/account/account-details'));
  const googleAuthLink = findFirstLink(links, ({ text, href }) => text.includes('google') || href.includes('google'));
  const registerLink = findFirstLink(links, ({ href }) => href.includes('/register'));

  if (runbook.chosen_path === 'profile_link') {
    if (loggedIn) {
      return accountDetailsLink || {
        text: 'Account details',
        href: 'https://community.cbr.com/account/account-details',
      };
    }
    return googleAuthLink || registerLink || {
      text: 'Register',
      href: 'https://community.cbr.com/register/',
    };
  }

  if (runbook.chosen_path === 'thread_post') {
    if (loggedIn) {
      return {
        text: 'Creator Showcase post thread',
        href: COMMUNITY_CBR_CREATOR_SHOWCASE_POST_URL,
      };
    }
    return googleAuthLink || registerLink || {
      text: 'Register',
      href: 'https://community.cbr.com/register/',
    };
  }

  return null;
}

function selectJoyLinkNavigation(runbook, observation) {
  if (runbook.chosen_path !== 'profile_link') {
    return null;
  }

  if (isJoyLinkDashboard(observation)) {
    return {
      text: 'Joy.link dashboard',
      href: observation.url,
    };
  }

  return {
    text: 'Sign up',
    href: JOY_LINK_SIGNUP_URL,
  };
}

function selectWakeletNavigation(runbook, observation) {
  const links = observation.links || [];
  const loggedIn = isWakeletLoggedIn(observation);
  const signupLink = findFirstLink(links, ({ text, href }) => text.includes('sign up') || href.includes('/signup'));
  const publicProfileLink = findFirstLink(links, ({ href }) => href.includes('wakelet.com/@'));

  if (runbook.chosen_path !== 'profile_link') {
    return null;
  }

  if (loggedIn) {
    return publicProfileLink || null;
  }

  return signupLink || {
    text: 'Sign up',
    href: WAKELET_SIGNUP_URL,
  };
}

function selectDailyDevNavigation(runbook, observation) {
  const links = observation.links || [];
  const loggedIn = isDailyDevLoggedIn(observation);
  const settingsLink = findFirstLink(links, ({ href }) => href.includes('/settings/profile'));
  const signupLink = findFirstLink(links, ({ text, href }) => (
    text.includes('sign up') ||
    text.includes('signup') ||
    text.includes('login') ||
    href.includes('/onboarding') ||
    href.includes('/login')
  ));

  if (runbook.chosen_path !== 'profile_link') {
    return null;
  }

  if (settingsLink) {
    return settingsLink;
  }

  if (loggedIn) {
    return {
      text: 'Profile settings',
      href: DAILY_DEV_PROFILE_SETTINGS_URL,
    };
  }

  return signupLink || {
    text: 'Sign up',
    href: DAILY_DEV_SIGNUP_URL,
  };
}

function selectMyMiniFactoryNavigation(runbook, observation) {
  const links = observation.links || [];
  const settingsLink = findFirstLink(links, ({ href }) => href.includes('/settings/profile') || href.endsWith('/settings'));
  const publicProfileLink = findFirstLink(links, ({ href }) => href.includes('/users/'));

  if (runbook.chosen_path !== 'profile_link') {
    return null;
  }

  if (settingsLink?.href) {
    return settingsLink.href.endsWith('/settings')
      ? { text: 'Profile settings', href: MYMINIFACTORY_PROFILE_SETTINGS_URL }
      : settingsLink;
  }

  if (publicProfileLink?.href || isMyMiniFactoryLoggedIn(observation)) {
    return {
      text: 'Profile settings',
      href: MYMINIFACTORY_PROFILE_SETTINGS_URL,
    };
  }

  return {
    text: 'Profile settings',
    href: MYMINIFACTORY_PROFILE_SETTINGS_URL,
  };
}

function inferJoyLinkProfileLinkCandidate(observation) {
  const url = tryParseUrl(observation.url);
  if (url?.hostname !== 'joy.link') {
    return null;
  }

  const evidence = (observation.links || [])
    .filter((link) => {
      const text = normalizeLabel(link.text);
      const href = normalizeLabel(link.href);
      return (
        text.includes('log in') ||
        text.includes('get started') ||
        text.includes('logout') ||
        text.includes('profiles') ||
        href.includes('/user/login') ||
        href.includes('/user/logout')
      );
    })
    .slice(0, 3)
    .map((link) => link.text || link.href);

  return {
    id: 'profile_link',
    label: 'Joy.link public page',
    evidence: evidence.length > 0 ? evidence : [url.pathname.startsWith('/user/') ? 'joy.link dashboard session' : 'joy.link landing page'],
  };
}

function inferWakeletProfileLinkCandidate(observation) {
  const evidence = (observation.links || [])
    .filter((link) => {
      const text = normalizeLabel(link.text);
      const href = normalizeLabel(link.href);
      return (
        text.includes('my library') ||
        text.includes('items') ||
        text.includes('collections') ||
        text.includes('shared with me') ||
        text.includes('sign up') ||
        href.includes('/signup') ||
        href.includes('/workspace/')
      );
    })
    .slice(0, 3)
    .map((link) => link.text || link.href);

  if (evidence.length === 0 && !isWakeletLoggedIn(observation)) {
    return null;
  }

  return {
    id: 'profile_link',
    label: 'Wakelet public profile',
    evidence: evidence.length > 0 ? evidence : ['logged-in wakelet session'],
  };
}

function inferDailyDevProfileLinkCandidate(observation) {
  const url = tryParseUrl(observation.url);
  const isDailyDevShell = url?.hostname === 'app.daily.dev' && url.pathname === '/';
  const evidence = (observation.links || [])
    .filter((link) => {
      const text = normalizeLabel(link.text);
      const href = normalizeLabel(link.href);
      return (
        text.includes('sign up') ||
        text.includes('signup') ||
        text.includes('login') ||
        text.includes('edit profile') ||
        href.includes('/onboarding') ||
        href.includes('/login') ||
        href.includes('/settings/profile')
      );
    })
    .slice(0, 3)
    .map((link) => link.text || link.href);

  if (evidence.length === 0 && !isDailyDevLoggedIn(observation) && !isDailyDevShell) {
    return null;
  }

  return {
    id: 'profile_link',
    label: 'daily.dev profile link',
    evidence: evidence.length > 0 ? evidence : [isDailyDevShell ? 'daily.dev landing shell' : 'logged-in daily.dev session'],
  };
}

function inferMyMiniFactoryProfileLinkCandidate(observation) {
  if (normalizeHostname(observation.url) !== 'myminifactory.com') {
    return null;
  }

  const evidence = (observation.links || [])
    .filter((link) => {
      const text = normalizeLabel(link.text);
      const href = normalizeLabel(link.href);
      return (
        text.includes('settings') ||
        text.includes('my public profile') ||
        text.includes('logout') ||
        href.includes('/settings') ||
        href.includes('/users/') ||
        href.includes('/log_out')
      );
    })
    .slice(0, 3)
    .map((link) => link.text || link.href);

  return {
    id: 'profile_link',
    label: 'MyMiniFactory profile website',
    evidence: evidence.length > 0 ? evidence : ['known myminifactory profile settings path'],
  };
}

const SITE_PATTERNS = Object.freeze({
  'community.cbr.com': {
    paths: {
      profile_link: {
        label: 'Profile website field',
        selectNavigation: selectCommunityCbrNavigation,
        createOrUpdate: fillCommunityCbrProfileDraft,
      },
      thread_post: {
        label: 'Create thread',
        selectNavigation: selectCommunityCbrNavigation,
        createOrUpdate: fillCommunityCbrThreadDraft,
      },
    },
  },
  'joy.link': {
    paths: {
      profile_link: {
        label: 'Joy.link public page',
        inferCandidate: inferJoyLinkProfileLinkCandidate,
        selectNavigation: selectJoyLinkNavigation,
        createOrUpdate: fillJoyLinkProfileDraft,
      },
    },
  },
  'wakelet.com': {
    paths: {
      profile_link: {
        label: 'Wakelet public profile',
        inferCandidate: inferWakeletProfileLinkCandidate,
        selectNavigation: selectWakeletNavigation,
        createOrUpdate: fillWakeletProfileDraft,
      },
    },
  },
  'daily.dev': {
    paths: {
      profile_link: {
        label: 'daily.dev profile link',
        inferCandidate: inferDailyDevProfileLinkCandidate,
        selectNavigation: selectDailyDevNavigation,
        createOrUpdate: fillDailyDevProfileDraft,
      },
    },
  },
  'myminifactory.com': {
    paths: {
      profile_link: {
        label: 'MyMiniFactory profile website',
        inferCandidate: inferMyMiniFactoryProfileLinkCandidate,
        selectNavigation: selectMyMiniFactoryNavigation,
        createOrUpdate: fillMyMiniFactoryProfileDraft,
      },
    },
  },
});

function getSitePattern(runbook) {
  return SITE_PATTERNS[normalizeHostname(runbook.target_site)] || null;
}

function getChosenPathPattern(runbook) {
  return getSitePattern(runbook)?.paths?.[runbook.chosen_path] || null;
}

export function inferPatternCandidatePaths(runbook, observation) {
  const sitePattern = getSitePattern(runbook);
  if (!sitePattern) {
    return [];
  }

  return Object.entries(sitePattern.paths)
    .map(([pathId, pathPattern]) => {
      const candidate = pathPattern.inferCandidate?.(observation, runbook);
      if (!candidate) {
        return null;
      }
      return {
        id: pathId,
        label: candidate.label || pathPattern.label || pathId,
        evidence: candidate.evidence || [],
      };
    })
    .filter(Boolean);
}

export function selectPathNavigationTarget(runbook, observation) {
  const chosenPathPattern = getChosenPathPattern(runbook);
  if (chosenPathPattern?.selectNavigation) {
    return chosenPathPattern.selectNavigation(runbook, observation);
  }

  const links = observation.links || [];
  return findFirstLink(links, ({ text, href }) => {
    if (runbook.chosen_path === 'profile_link') {
      return text.includes('register') || text.includes('account') || text.includes('profile') || href.includes('/register') || href.includes('/account');
    }
    if (runbook.chosen_path === 'thread_post') {
      return text.includes('register') || text.includes('post thread') || text.includes('create thread') || href.includes('/register') || href.includes('post-thread');
    }
    return false;
  }) || findFirstLink(links, ({ text }) => text.includes('register')) || null;
}

export function buildProfileDraft(runbook) {
  const siteName = runbook.content_inputs.site_name || 'Website';
  const siteSummary = runbook.content_inputs.site_summary || '';
  const aboutLines = [siteName];
  const bioLines = [];
  if (siteSummary) {
    aboutLines.push(siteSummary);
    bioLines.push(siteSummary);
  }
  aboutLines.push(runbook.target_link);
  bioLines.push(runbook.target_link);

  return {
    profileName: siteName,
    bioText: bioLines.join('\n'),
    website: runbook.target_link,
    aboutText: aboutLines.join('\n'),
  };
}

export function buildThreadDraft(runbook) {
  const siteName = runbook.content_inputs.site_name || 'Website';
  const siteSummary = runbook.content_inputs.site_summary || 'a website worth checking out';
  const anchorText = runbook.content_inputs.anchor_text || '';
  const title = `${siteName} - ${siteSummary}`.slice(0, 120);
  const linkLine = anchorText
    ? `Link: ${runbook.target_link} (${anchorText})`
    : `Link: ${runbook.target_link}`;
  const messageText = [
    'Hi everyone,',
    '',
    `I recently launched ${siteName}, ${siteSummary}.`,
    '',
    linkLine,
    '',
    'Would love any feedback.',
  ].join('\n');
  const messageHtml = messageText
    .split('\n\n')
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('');

  return {
    forumUrl: COMMUNITY_CBR_CREATOR_SHOWCASE_POST_URL,
    title,
    messageText,
    messageHtml,
  };
}

async function fillCommunityCbrProfileDraft(targetId, runbook) {
  const draft = buildProfileDraft(runbook);
  const expression = `(() => {
    ${dispatchInputScript()}
    const draft = ${JSON.stringify(draft)};
    const website = document.querySelector('input[name="profile[website]"]');
    const about = document.querySelector('textarea[name="about_html"]');
    if (!website || !about) {
      throw new Error('未找到 community.cbr.com 资料页字段');
    }
    website.value = draft.website;
    fire(website);
    about.value = draft.aboutText;
    fire(about);
    return {
      filledFields: ['profile[website]', 'about_html'],
      website: website.value,
      about: about.value,
    };
  })()`;
  const result = await evalOnTarget(targetId, expression);
  return result.value;
}

async function fillCommunityCbrThreadDraft(targetId, runbook) {
  const draft = buildThreadDraft(runbook);
  const expression = `(() => {
    ${dispatchInputScript()}
    const draft = ${JSON.stringify(draft)};
    const title = document.querySelector('textarea[name="title"]');
    const message = document.querySelector('textarea[name="message_html"]');
    const editor = document.querySelector('.fr-element[contenteditable="true"]');
    if (!title || !message) {
      throw new Error('未找到 community.cbr.com 发帖字段');
    }
    title.value = draft.title;
    fire(title);
    message.value = draft.messageHtml;
    fire(message);
    if (editor) {
      editor.innerHTML = draft.messageHtml;
      fire(editor);
    }
    return {
      filledFields: ['title', 'message_html'],
      title: title.value,
      message: message.value,
      editorText: editor ? (editor.innerText || '').trim() : '',
    };
  })()`;
  const result = await evalOnTarget(targetId, expression);
  return result.value;
}

async function clickOnTarget(targetId, selector) {
  return proxyJson(`/click?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    body: selector,
  });
}

async function waitFor(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildWakeletEditorStateExpression() {
  return `(() => {
    return {
      hasEditButton: Boolean(document.querySelector('button[aria-label="Edit Profile"]')),
      hasCloseButton: Boolean(document.querySelector('button[aria-label="Close"]')),
      hasBioField: Boolean(document.querySelector('textarea[name="Bio"]')),
    };
  })()`;
}

async function ensureWakeletEditorOpen(targetId) {
  const initial = await evalOnTarget(targetId, buildWakeletEditorStateExpression());
  if (initial.value?.hasBioField) {
    return;
  }

  if (!initial.value?.hasEditButton) {
    const menuButtonSelector = 'button[aria-label="Profile settings"]';
    const hasProfileMenu = await evalOnTarget(targetId, `(() => Boolean(document.querySelector(${JSON.stringify(menuButtonSelector)})))()`);
    if (hasProfileMenu.value) {
      await clickOnTarget(targetId, menuButtonSelector);
      await waitFor(800);
      const publicProfileHref = await evalOnTarget(targetId, `(() => {
        const match = Array.from(document.querySelectorAll('a')).find((link) => {
          const text = (link.innerText || link.textContent || '').trim().toLowerCase();
          return text === 'public profile' || /wakelet\\.com\\/@/i.test(link.href || '');
        });
        return match ? match.href : null;
      })()`);
      if (publicProfileHref.value) {
        await navigateTarget(targetId, publicProfileHref.value);
        await waitFor(1000);
      }
    }
  }

  const editableState = await evalOnTarget(targetId, buildWakeletEditorStateExpression());
  if (editableState.value?.hasEditButton && !editableState.value?.hasBioField) {
    await clickOnTarget(targetId, 'button[aria-label="Edit Profile"]');
    await waitFor(1000);
  }

  const afterClick = await evalOnTarget(targetId, buildWakeletEditorStateExpression());
  if (!afterClick.value?.hasBioField) {
    throw new Error('未找到 wakelet 编辑入口');
  }
}

async function fillWakeletProfileDraft(targetId, runbook) {
  await ensureWakeletEditorOpen(targetId);
  const draft = buildProfileDraft(runbook);
  const expression = `(() => {
    const setControlledValue = (el, value) => {
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      descriptor.set.call(el, value);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    };

    const fields = Array.from(document.querySelectorAll('textarea, input[type="text"]'));
    const profileName = fields.find((el) => el.tagName === 'TEXTAREA' && !el.name && el.placeholder === 'Type here');
    const bio = fields.find((el) => el.tagName === 'TEXTAREA' && el.name === 'Bio');
    const website = fields.find((el) => el.tagName === 'INPUT' && el.placeholder === 'www');
    if (!profileName || !bio || !website) {
      throw new Error('未找到 wakelet profile 字段');
    }

    setControlledValue(profileName, ${JSON.stringify(draft.profileName)});
    setControlledValue(bio, ${JSON.stringify(draft.bioText)});
    setControlledValue(website, ${JSON.stringify(draft.website)});

    return {
      filledFields: ['profile_name', 'bio', 'social_link_1'],
      profileName: profileName.value,
      bio: bio.value,
      website: website.value,
    };
  })()`;
  const result = await evalOnTarget(targetId, expression);
  await waitFor(1500);
  const editorState = await evalOnTarget(targetId, buildWakeletEditorStateExpression());
  if (editorState.value?.hasCloseButton) {
    await clickOnTarget(targetId, 'button[aria-label="Close"]');
    await waitFor(1000);
  }
  return result.value;
}

function buildDailyDevEditorStateExpression() {
  return `(() => {
    const saveButton = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').trim() === 'Save');
    return {
      url: location.href,
      hasHeadlineField: Boolean(document.querySelector('textarea[name="bio"]')),
      hasLinkField: Boolean(
        document.querySelector('input[id^="socialLinkUrl:"]') ||
        document.querySelector('input[placeholder^="Paste a URL"]')
      ),
      hasSaveButton: Boolean(saveButton),
    };
  })()`;
}

async function ensureDailyDevEditorOpen(targetId) {
  const readState = async () => {
    const state = await evalOnTarget(targetId, buildDailyDevEditorStateExpression());
    return state.value;
  };
  const hasRequiredFields = (state) => state?.hasHeadlineField && state?.hasLinkField && state?.hasSaveButton;

  let state = await readState();
  if (!hasRequiredFields(state)) {
    await navigateTarget(targetId, DAILY_DEV_PROFILE_SETTINGS_URL);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await waitFor(1000);
    state = await readState();
    if (hasRequiredFields(state)) {
      return;
    }
  }

  if (!hasRequiredFields(state)) {
    throw new Error('未找到 daily.dev profile 编辑字段');
  }
}

async function fillDailyDevProfileDraft(targetId, runbook) {
  await ensureDailyDevEditorOpen(targetId);
  const siteSummary = runbook.content_inputs.site_summary || runbook.content_inputs.site_name || 'Website';
  const targetLink = runbook.target_link;
  const normalizedTargetLink = targetLink.replace(/\/+$/, '');
  const expression = `(() => {
    const setControlledValue = (el, value) => {
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      descriptor.set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    };

    const normalizedTargetLink = ${JSON.stringify(normalizedTargetLink)};
    const headline = document.querySelector('textarea[name="bio"]');
    const linkInput = document.querySelector('input[id^="socialLinkUrl:"]')
      || document.querySelector('input[placeholder^="Paste a URL"]');
    const saveButton = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').trim() === 'Save');
    if (!headline || !linkInput || !saveButton) {
      throw new Error('未找到 daily.dev profile 字段');
    }

    setControlledValue(headline, ${JSON.stringify(siteSummary)});

    const hasExistingLink = Array.from(document.querySelectorAll('a[href], div, span, p'))
      .some((el) => {
        const href = (el.href || '').replace(/\\/+$/, '');
        const text = (el.textContent || '').trim().replace(/\\/+$/, '');
        return href === normalizedTargetLink || text === normalizedTargetLink;
      });

    if (!hasExistingLink) {
      setControlledValue(linkInput, ${JSON.stringify(targetLink)});
      const addButton = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').trim() === 'Add');
      if (!addButton || addButton.disabled) {
        throw new Error('daily.dev 链接 Add 按钮不可用');
      }
      addButton.click();
    }

    const linkAdded = Array.from(document.querySelectorAll('a[href], div, span, p'))
      .some((el) => {
        const href = (el.href || '').replace(/\\/+$/, '');
        const text = (el.textContent || '').trim().replace(/\\/+$/, '');
        return href === normalizedTargetLink || text === normalizedTargetLink;
      });

    if (!linkAdded) {
      throw new Error('daily.dev 链接未进入待保存列表');
    }

    return {
      filledFields: ['headline', 'social_link_1'],
      headline: headline.value,
      linkAdded,
      saveEnabled: !saveButton.disabled,
    };
  })()`;

  let lastError = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const result = await evalOnTarget(targetId, expression);
      await waitFor(800);
      return result.value;
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !/daily\.dev profile 字段|daily\.dev 链接 Add 按钮不可用|daily\.dev 链接未进入待保存列表/.test(error.message)) {
        throw error;
      }
      await waitFor(1000);
    }
  }

  throw lastError || new Error('未找到 daily.dev profile 编辑字段；当前 settings/profile 可能仍是空壳，建议先打开已登录的 daily.dev profile/settings 页面再重试');
}

async function closeMyMiniFactoryPromo(targetId) {
  await evalOnTarget(targetId, `(() => {
    const closeButton = document.querySelector('.floating-ads-close-button');
    if (!closeButton) return false;
    closeButton.click();
    return true;
  })()`);
  await waitFor(400);
}

async function fillMyMiniFactoryProfileDraft(targetId, runbook) {
  await closeMyMiniFactoryPromo(targetId);
  const draft = buildProfileDraft(runbook);
  const expression = `(() => {
    ${dispatchInputScript()}
    const draft = ${JSON.stringify(draft)};
    const website = document.querySelector('#user_profile_type_website');
    const about = document.querySelector('#user_profile_type_about');
    const save = document.querySelector('#save_user_settings');
    if (!website || !save) {
      throw new Error('未找到 myminifactory.com profile 字段');
    }
    website.value = draft.website;
    fire(website);
    if (about) {
      about.value = draft.aboutText;
      fire(about);
    }
    save.click();
    return {
      filledFields: about ? ['user_profile_type[website]', 'user_profile_type[about]'] : ['user_profile_type[website]'],
      website: website.value,
      about: about ? about.value : '',
    };
  })()`;
  const result = await evalOnTarget(targetId, expression);
  await waitFor(1200);
  return result.value;
}

async function fillJoyLinkProfileDraft(targetId, runbook) {
  const draft = buildProfileDraft(runbook);
  const normalizedTargetLink = runbook.target_link.replace(/\/+$/, '');
  const expression = `(() => {
    const normalize = (value) => String(value || '').replace(/\\/+$/, '');
    const publicPage = Array.from(document.querySelectorAll('a[href]')).find((link) => {
      const href = link.href || '';
      return href.startsWith('https://joy.link/') && !href.includes('/user/') && normalize(href) !== 'https://joy.link';
    });
    const form = document.querySelector('form[action*="/addLink"]');
    const url = document.querySelector('#mainAddUrl');
    const title = document.querySelector('#mainAddUrlTitle');
    const fetchedUrl = document.querySelector('#mainAddUrlFetchedUrl');
    const fetchedTitle = document.querySelector('#mainAddUrlFetchedTitle');
    if (!form || !url || !title || !fetchedUrl || !fetchedTitle) {
      throw new Error('未找到 joy.link 编辑字段');
    }

    const existingLink = Array.from(document.querySelectorAll('input[name="url"][linkid]'))
      .find((input) => normalize(input.value) === ${JSON.stringify(normalizedTargetLink)});

    if (!existingLink) {
      url.value = ${JSON.stringify(runbook.target_link)};
      title.value = ${JSON.stringify(draft.profileName)};
      fetchedUrl.value = ${JSON.stringify(runbook.target_link)};
      fetchedTitle.value = ${JSON.stringify(draft.profileName)};
      form.submit();
    }

    return {
      action: existingLink ? 'existing' : 'submitted',
      publicUrl: publicPage ? publicPage.href : '',
    };
  })()`;
  const result = await evalOnTarget(targetId, expression);
  await waitFor(1200);
  if (result.value?.publicUrl) {
    await navigateTarget(targetId, result.value.publicUrl);
    await waitFor(800);
  }
  return {
    filledFields: result.value?.action === 'existing'
      ? ['existing_dashboard_link']
      : ['content_url', 'content_title'],
  };
}

async function createOrUpdatePath(runbook, targetId) {
  const chosenPathPattern = getChosenPathPattern(runbook);
  if (chosenPathPattern?.createOrUpdate) {
    return chosenPathPattern.createOrUpdate(targetId, runbook);
  }
  return { filledFields: [] };
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    options[token.slice(2)] = rest[i + 1];
    i += 1;
  }

  return { mode, options };
}

function isInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptSelection(message, choices) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const renderedChoices = choices.map((choice, index) => `${index + 1}. ${choice.label}`).join('\n');
    const answer = await rl.question(`${message}\n${renderedChoices}\n> `);
    const byIndex = Number.parseInt(answer, 10);
    if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= choices.length) {
      return choices[byIndex - 1].value;
    }
    const direct = choices.find((choice) => choice.value === answer.trim());
    if (direct) {
      return direct.value;
    }
    throw new Error('输入无效');
  } finally {
    rl.close();
  }
}

export async function resolveChoosePath(runbook, {
  explicitChoice,
  isInteractive = isInteractiveTerminal(),
  prompt = promptSelection,
} = {}) {
  if (explicitChoice) {
    return explicitChoice;
  }
  if (!isInteractive) {
    return null;
  }
  return prompt(
    'choose_path: 请选择本次执行路径',
    runbook.candidate_paths.map((candidate) => ({
      label: `${candidate.id} (${candidate.label})`,
      value: candidate.id,
    })),
  );
}

export async function resolveResultState({
  explicitState,
  isInteractive = isInteractiveTerminal(),
  prompt = promptSelection,
} = {}) {
  if (explicitState) {
    return explicitState;
  }
  if (!isInteractive) {
    return null;
  }
  return prompt(
    'pre_submit_check: 请选择当前提交结果',
    [
      { label: 'public (已公开可见)', value: RESULT_STATE.PUBLIC },
      { label: 'awaiting_review (已提交待审核)', value: RESULT_STATE.AWAITING_REVIEW },
      { label: 'blocked (被规则阻塞/提交失败)', value: RESULT_STATE.BLOCKED },
    ],
  );
}

async function runCheckDeps() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHECK_DEPS_SCRIPT], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`check-deps 失败，退出码 ${code}`));
    });
  });
}

async function proxyJson(endpoint, { method = 'GET', body } = {}) {
  const response = await fetch(`${PROXY_BASE}${endpoint}`, {
    method,
    headers: body ? { 'Content-Type': 'text/plain; charset=utf-8' } : undefined,
    body,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(parsed.error || `请求失败: ${endpoint}`);
  }
  return parsed;
}

async function createBackgroundTab(url) {
  const result = await proxyJson(`/new?url=${encodeURIComponent(url)}`);
  return result.targetId;
}

async function listTargets() {
  const targets = await proxyJson('/targets');
  return Array.isArray(targets) ? targets : [];
}

async function closeTab(targetId) {
  if (!targetId) return;
  try {
    await proxyJson(`/close?target=${encodeURIComponent(targetId)}`);
  } catch {
    // 非关键清理，不阻断主流程。
  }
}

async function evalOnTarget(targetId, expression) {
  return proxyJson(`/eval?target=${encodeURIComponent(targetId)}`, {
    method: 'POST',
    body: expression,
  });
}

async function getTargetInfo(targetId) {
  const raw = await proxyJson(`/info?target=${encodeURIComponent(targetId)}`);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function navigateTarget(targetId, url) {
  return proxyJson(`/navigate?target=${encodeURIComponent(targetId)}&url=${encodeURIComponent(url)}`);
}

async function clickLinkByHref(targetId, href) {
  const result = await evalOnTarget(targetId, `(() => {
    const href = ${JSON.stringify(href)};
    const link = Array.from(document.querySelectorAll('a[href]')).find((anchor) => anchor.href === href);
    if (!link) return false;
    link.click();
    return true;
  })()`);
  return Boolean(result.value);
}

async function pageContainsTargetLink(targetId, targetLink) {
  const normalizedTargetLink = targetLink.replace(/\/+$/, '');
  const result = await evalOnTarget(targetId, `(() => {
    const normalizedTargetLink = ${JSON.stringify(normalizedTargetLink)};
    const links = Array.from(document.querySelectorAll('a[href]'));
    const hasHref = links.some((link) => (link.href || '').replace(/\\/+$/, '') === normalizedTargetLink);
    const text = (document.body.innerText || '').replace(/\\/+$/, '');
    const hasText = text.includes(normalizedTargetLink);
    return hasHref || hasText;
  })()`);
  return Boolean(result.value);
}

async function shortCircuitProfileLink(runbook, targetId, observation) {
  if (runbook.chosen_path !== 'profile_link') {
    return null;
  }

  if (!await pageContainsTargetLink(targetId, runbook.target_link)) {
    return null;
  }

  const info = await getTargetInfo(targetId);
  return {
    targetId,
    url: info.url || observation.url || runbook.last_seen_url,
    title: info.title || observation.title || '',
    filledFields: ['existing_public_link'],
  };
}

async function verifyPublicPath(runbook, targetId, observation, fillResult) {
  const info = await getTargetInfo(targetId);

  if (runbook.chosen_path !== 'profile_link') {
    return {
      targetId,
      url: info.url || observation.url || runbook.last_seen_url,
      title: info.title || observation.title || '',
      filledFields: fillResult.filledFields || [],
    };
  }

  const filledFields = fillResult.filledFields || [];
  if (!await pageContainsTargetLink(targetId, runbook.target_link)) {
    return {
      targetId,
      url: info.url || observation.url || runbook.last_seen_url,
      title: info.title || observation.title || '',
      filledFields,
    };
  }

  return {
    targetId,
    url: info.url || observation.url || runbook.last_seen_url,
    title: info.title || observation.title || '',
    filledFields: [...new Set([...filledFields, 'public_link_verified'])],
  };
}

async function hasVisibleDomText(targetId) {
  try {
    const result = await evalOnTarget(targetId, '(() => (document.body.innerText || "").trim().length > 0)()');
    return Boolean(result.value);
  } catch {
    return false;
  }
}

async function findReusableDailyDevTarget() {
  const targets = await listTargets();
  const candidates = targets.filter((target) => {
    if (target.type !== 'page' || typeof target.url !== 'string') {
      return false;
    }
    const url = tryParseUrl(target.url);
    if (url?.hostname !== 'app.daily.dev' || url.pathname.startsWith('/onboarding')) {
      return false;
    }
    return typeof target.title === 'string' && target.title.trim().length > 0;
  });

  const scoreTarget = (target) => {
    const url = tryParseUrl(target.url);
    if (!url) return 0;
    if (url.pathname === '/settings/profile') return 3;
    if (/^\/[^/]+$/.test(url.pathname)) return 2;
    if (url.pathname === '/') return 1;
    return 0;
  };

  candidates.sort((left, right) => scoreTarget(right) - scoreTarget(left));

  for (const candidate of candidates) {
    if (await hasVisibleDomText(candidate.targetId)) {
      return candidate;
    }
  }

  return null;
}

function buildSiteObservationExpression() {
  return `(() => {
    return {
      title: document.title,
      url: location.href,
      links: Array.from(document.querySelectorAll('a'))
        .map((a) => ({
          text: (a.innerText || a.textContent || '').trim(),
          href: a.href || '',
        }))
        .filter((item) => item.text || item.href)
        .slice(0, 100),
    };
  })()`;
}

async function parseGuidePage(guideUrl) {
  const guideTargetId = await createBackgroundTab(guideUrl);
  try {
    const payload = await evalOnTarget(guideTargetId, buildGuideParserExpression());
    return compileGuidePagePayload(payload.value);
  } finally {
    await closeTab(guideTargetId);
  }
}

function buildContentInputs(rawContent) {
  if (!rawContent || typeof rawContent !== 'object') {
    throw new Error('content-file 必须是 JSON 对象');
  }

  return {
    site_name: rawContent.site_name || '',
    site_summary: rawContent.site_summary || '',
    anchor_text: rawContent.anchor_text || '',
  };
}

function buildBlockingResult(runbook, reason, step) {
  runbook.status = STATUS.BLOCKED;
  runbook.current_step = step;
  runbook.pending_confirmation = PENDING_CONFIRMATION.NONE;
  runbook.blocking_reason = reason;
  runbook.result.state = RESULT_STATE.BLOCKED;
  runbook.result.submitted = false;
  runbook.result.publicly_visible = false;
  runbook.result.awaiting_review = false;
  addEvidence(runbook, {
    type: 'error',
    url: runbook.last_seen_url || '',
    note: reason,
  });
  return runbook;
}

export function normalizeExecutorError(error, { step }) {
  return {
    status: STATUS.BLOCKED,
    currentStep: step,
    blockingReason: error instanceof Error ? error.message : String(error),
    resultState: RESULT_STATE.BLOCKED,
  };
}

async function ensureTargetPage(runbook) {
  if (runbook.target_id) {
    try {
      const info = await getTargetInfo(runbook.target_id);
      const titleLooksUsable = typeof info.title === 'string' && info.title.trim();
      const sameOrigin = typeof info.url === 'string' && info.url.startsWith(runbook.target_site);
      const isBlank = !info.url || info.url === 'about:blank';
      const hasReadyDom = normalizeHostname(runbook.target_site) === 'daily.dev' ? await hasVisibleDomText(runbook.target_id) : true;
      if ((sameOrigin || titleLooksUsable) && !isBlank && hasReadyDom) {
        runbook.last_seen_url = info.url || runbook.last_seen_url;
        return { targetId: runbook.target_id, url: info.url || runbook.last_seen_url };
      }
    } catch {
      runbook.attempts.recover += 1;
    }
  }

  if (runbook.attempts.recover > RECOVER_BUDGET) {
    throw new Error('恢复预算已耗尽');
  }

  if (normalizeHostname(runbook.target_site) === 'daily.dev') {
    const reusableTarget = await findReusableDailyDevTarget();
    if (reusableTarget) {
      if (runbook.target_id && runbook.target_id !== reusableTarget.targetId && runbook.target_owned) {
        await closeTab(runbook.target_id);
      }
      runbook.target_id = reusableTarget.targetId;
      runbook.target_owned = false;
      runbook.last_seen_url = reusableTarget.url || runbook.last_seen_url;
      addEvidence(runbook, {
        type: 'target_reuse',
        url: reusableTarget.url || '',
        note: `reused existing daily.dev tab: ${reusableTarget.targetId}`,
      });
      return { targetId: reusableTarget.targetId, url: reusableTarget.url || runbook.last_seen_url };
    }
  }

  const targetId = await createBackgroundTab(runbook.last_seen_url || runbook.target_site);
  let info = await getTargetInfo(targetId);
  if (!info.url || info.url === 'about:blank') {
    await navigateTarget(targetId, runbook.target_site);
    info = await getTargetInfo(targetId);
  }
  if (runbook.target_id && runbook.target_id !== targetId) {
    await closeTab(runbook.target_id);
  }
  runbook.target_id = targetId;
  runbook.target_owned = true;
  runbook.last_seen_url = info.url || runbook.target_site;
  return { targetId, url: runbook.last_seen_url };
}

async function observeCandidatePaths(runbook) {
  if (runbook.attempts.observe >= OBSERVE_BUDGET) {
    throw new Error('入口观察预算已耗尽');
  }

  const { targetId } = await ensureTargetPage(runbook);
  runbook.current_step = CURRENT_STEP.TARGET_OPENED;
  const observation = await evalOnTarget(targetId, buildSiteObservationExpression());
  let value = observation.value;
  const looksBlank = !value?.url || value.url === 'about:blank' || (value.links || []).length === 0;
  if (looksBlank) {
    await navigateTarget(targetId, runbook.target_site);
    const retried = await evalOnTarget(targetId, buildSiteObservationExpression());
    value = retried.value;
  }
  runbook.attempts.observe += 1;
  runbook.last_seen_url = value.url || runbook.last_seen_url;
  addEvidence(runbook, {
    type: 'dom',
    url: value.url || '',
    note: `observed links: ${value.links.length}`,
  });

  let candidates = findCandidatePaths(value);
  if (candidates.length === 0) {
    candidates = inferPatternCandidatePaths(runbook, value);
  }
  runbook.candidate_paths = candidates;

  if (candidates.length === 0) {
    return buildBlockingResult(runbook, '未发现可用的留链入口，需要人工探索', CURRENT_STEP.TARGET_OPENED);
  }

  if (candidates.length > 1) {
    runbook.status = STATUS.PAUSED;
    runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
    runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
    return runbook;
  }

  runbook.status = STATUS.PAUSED;
  runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
  runbook.chosen_path = candidates[0].id;
  runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
  return continueRunbook(runbook, {
    ensureTargetPage,
    getPreSubmitSnapshot: getPreSubmitSnapshotForPath,
  });
}

async function getPreSubmitSnapshotForPath(runbook) {
  const { targetId } = await ensureTargetPage(runbook);
  const observation = await evalOnTarget(targetId, buildSiteObservationExpression());
  const value = observation.value;

  const shortCircuitResult = await shortCircuitProfileLink(runbook, targetId, value);
  if (shortCircuitResult) {
    return shortCircuitResult;
  }

  const matchingLink = selectPathNavigationTarget(runbook, value);

  if (matchingLink?.href && value.url !== matchingLink.href) {
    if (normalizeHostname(runbook.target_site) === 'daily.dev') {
      const clicked = await clickLinkByHref(targetId, matchingLink.href);
      if (clicked) {
        await waitFor(800);
      } else {
        await navigateTarget(targetId, matchingLink.href);
      }
    } else {
      await navigateTarget(targetId, matchingLink.href);
    }
  }

  const fillResult = await createOrUpdatePath(runbook, targetId);
  return verifyPublicPath(runbook, targetId, {
    ...value,
    url: matchingLink?.href || value.url || runbook.last_seen_url,
  }, fillResult);
}

export async function continueRunbook(runbook, {
  ensureTargetPage: ensureTargetPageImpl = ensureTargetPage,
  getPreSubmitSnapshot: getPreSubmitSnapshotImpl = getPreSubmitSnapshotForPath,
} = {}) {
  validateRunbook(runbook);

  if (runbook.pending_confirmation === PENDING_CONFIRMATION.CHOOSE_PATH) {
    if (!runbook.chosen_path) {
      return runbook;
    }

    const candidate = runbook.candidate_paths.find((entry) => entry.id === runbook.chosen_path);
    if (!candidate) {
      return buildBlockingResult(runbook, 'chosen_path 无法匹配 candidate_paths', CURRENT_STEP.CHOOSE_PATH);
    }

    runbook.status = STATUS.SUBMITTING;
    runbook.pending_confirmation = PENDING_CONFIRMATION.NONE;
    await ensureTargetPageImpl(runbook);
    const snapshot = await getPreSubmitSnapshotImpl(runbook);
    runbook.target_id = snapshot.targetId || runbook.target_id;
    runbook.last_seen_url = snapshot.url || runbook.last_seen_url;
    if (snapshot.filledFields?.length) {
      addEvidence(runbook, {
        type: 'draft',
        url: runbook.last_seen_url,
        note: `prepared fields: ${snapshot.filledFields.join(', ')}`,
      });
    }
    runbook.current_step = CURRENT_STEP.PRE_SUBMIT_CHECK;
    runbook.status = STATUS.PAUSED;
    runbook.pending_confirmation = PENDING_CONFIRMATION.PRE_SUBMIT_CHECK;
    addEvidence(runbook, {
      type: 'checkpoint',
      url: runbook.last_seen_url,
      note: `ready for pre_submit_check on ${runbook.chosen_path}`,
    });
    return runbook;
  }

  if (runbook.pending_confirmation === PENDING_CONFIRMATION.PRE_SUBMIT_CHECK) {
    if (runbook.result.state !== RESULT_STATE.NONE) {
      runbook.status = runbook.result.state === RESULT_STATE.BLOCKED ? STATUS.BLOCKED : STATUS.COMPLETED;
      runbook.pending_confirmation = PENDING_CONFIRMATION.NONE;
      runbook.current_step = CURRENT_STEP.SUBMIT_ATTEMPTED;
      return runbook;
    }
    return runbook;
  }

  return runbook;
}

function applyFinalResult(runbook, resultState) {
  if (!FINAL_RESULT_STATES.has(resultState)) {
    throw new Error(`result.state 非法: ${resultState}`);
  }
  runbook.result.state = resultState;
  runbook.result.submitted = resultState !== RESULT_STATE.BLOCKED;
  runbook.result.publicly_visible = resultState === RESULT_STATE.PUBLIC;
  runbook.result.awaiting_review = resultState === RESULT_STATE.AWAITING_REVIEW;
  if (resultState === RESULT_STATE.BLOCKED) {
    runbook.blocking_reason = runbook.blocking_reason || '人工确认标记为 blocked';
  } else {
    runbook.blocking_reason = null;
  }
  addEvidence(runbook, {
    type: 'confirmation',
    url: runbook.last_seen_url || '',
    note: `result.state set to ${resultState}`,
  });
  return runbook;
}

export async function finalizeSuccessfulRunbook(runbook, {
  closeTarget = closeTab,
} = {}) {
  if (runbook.status !== STATUS.COMPLETED || !runbook.target_id) {
    return runbook;
  }

  if (!runbook.target_owned) {
    addEvidence(runbook, {
      type: 'cleanup',
      url: runbook.last_seen_url || '',
      note: `kept reused tab open: ${runbook.target_id}`,
    });
    runbook.target_id = null;
    return runbook;
  }

  const targetId = runbook.target_id;
  try {
    await closeTarget(targetId);
    runbook.target_id = null;
    addEvidence(runbook, {
      type: 'cleanup',
      url: runbook.last_seen_url || '',
      note: `closed owned tab: ${targetId}`,
    });
  } catch {
    // 清理失败不影响主流程结果，保留 target_id 供后续人工处理。
  }

  return runbook;
}

async function settleRunbook(runbook, options = {}) {
  const mutableOptions = { ...options };

  while (true) {
    if (runbook.pending_confirmation === PENDING_CONFIRMATION.CHOOSE_PATH) {
      const chosenPath = await resolveChoosePath(runbook, {
        explicitChoice: mutableOptions.choosePath,
      });
      mutableOptions.choosePath = null;
      if (!chosenPath) {
        return runbook;
      }
      runbook.chosen_path = chosenPath;
      await continueRunbook(runbook, {
        ensureTargetPage,
        getPreSubmitSnapshot: getPreSubmitSnapshotForPath,
      });
      continue;
    }

    if (runbook.pending_confirmation === PENDING_CONFIRMATION.PRE_SUBMIT_CHECK) {
      const resultState = await resolveResultState({
        explicitState: mutableOptions.resultState,
      });
      mutableOptions.resultState = null;
      if (!resultState) {
        return runbook;
      }
      applyFinalResult(runbook, resultState);
      await continueRunbook(runbook, {
        ensureTargetPage,
        getPreSubmitSnapshot: getPreSubmitSnapshotForPath,
      });
      continue;
    }

    return runbook;
  }
}

async function startExecution({ guideUrl, targetLink, contentFile, choosePath, resultState }) {
  const rawContent = JSON.parse(await readFile(contentFile, 'utf8'));
  const contentInputs = buildContentInputs(rawContent);
  await runCheckDeps();

  const guide = await parseGuidePage(guideUrl);
  const runbook = createRunbook({
    guideUrl,
    targetSite: guide.targetSite,
    targetLink,
    linkType: guide.linkType,
    guideHint: guide.guideHint,
    contentInputs,
  });

  addEvidence(runbook, {
    type: 'guide',
    url: guideUrl,
    note: `${guide.guideTitle || 'guide parsed'} -> ${guide.targetSite}`,
  });

  await saveRunbook(runbook);

  try {
    await observeCandidatePaths(runbook);
    await settleRunbook(runbook, { choosePath, resultState });
  } catch (error) {
    const normalized = normalizeExecutorError(error, { step: runbook.current_step });
    buildBlockingResult(runbook, normalized.blockingReason, normalized.currentStep);
  }

  await finalizeSuccessfulRunbook(runbook);
  await saveRunbook(runbook);
  return runbook;
}

async function resumeExecution({ runbookPath, choosePath, resultState }) {
  await runCheckDeps();
  const runbook = await loadRunbook(runbookPath);

  try {
    await settleRunbook(runbook, { choosePath, resultState });
    await continueRunbook(runbook, {
      ensureTargetPage,
      getPreSubmitSnapshot: getPreSubmitSnapshotForPath,
    });
  } catch (error) {
    const normalized = normalizeExecutorError(error, { step: runbook.current_step });
    buildBlockingResult(runbook, normalized.blockingReason, normalized.currentStep);
  }

  await finalizeSuccessfulRunbook(runbook);
  await saveRunbook(runbook);
  return runbook;
}

function printNextAction(runbook) {
  console.log(`runbook: ${runbook.runbook_path}`);
  console.log(`status: ${runbook.status}`);
  console.log(`step: ${runbook.current_step}`);
  if (runbook.pending_confirmation === PENDING_CONFIRMATION.CHOOSE_PATH) {
    console.log('需要人工确认：choose_path');
    console.log(`候选路径: ${runbook.candidate_paths.map((item) => item.id).join(', ')}`);
    console.log('可直接重新执行 resume 并传 --choose-path，或在交互终端中直接选择。');
  } else if (runbook.pending_confirmation === PENDING_CONFIRMATION.PRE_SUBMIT_CHECK) {
    console.log('需要人工确认：pre_submit_check');
    console.log(`当前页面: ${runbook.last_seen_url}`);
    console.log('可直接重新执行 resume 并传 --result-state，或在交互终端中直接选择。');
  } else if (runbook.status === STATUS.BLOCKED) {
    console.log(`blocked_reason: ${runbook.blocking_reason}`);
  }
}

async function main() {
  const { mode, options } = parseArgs(process.argv.slice(2));
  if (mode !== 'start' && mode !== 'resume') {
    throw new Error('用法: backlink-executor.mjs <start|resume> [--guide-url URL] [--target-link URL] [--content-file FILE] [--runbook FILE] [--choose-path PATH] [--result-state STATE]');
  }

  let runbook;
  if (mode === 'start') {
    if (!options['guide-url'] || !options['target-link'] || !options['content-file']) {
      throw new Error('start 模式需要 --guide-url、--target-link、--content-file');
    }
    runbook = await startExecution({
      guideUrl: options['guide-url'],
      targetLink: options['target-link'],
      contentFile: options['content-file'],
      choosePath: options['choose-path'],
      resultState: options['result-state'],
    });
  } else {
    if (!options.runbook) {
      throw new Error('resume 模式需要 --runbook');
    }
    runbook = await resumeExecution({
      runbookPath: options.runbook,
      choosePath: options['choose-path'],
      resultState: options['result-state'],
    });
  }

  printNextAction(runbook);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  main().catch((error) => {
    console.error(`executor error: ${error.message}`);
    process.exitCode = 1;
  });
}
