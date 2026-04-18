import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CURRENT_STEP,
  PENDING_CONFIRMATION,
  RESULT_STATE,
  STATUS,
  createRunbook,
} from '../scripts/runbook.mjs';
import {
  buildProfileDraft,
  buildThreadDraft,
  buildGuideParserExpression,
  compileGuidePagePayload,
  continueRunbook,
  finalizeSuccessfulRunbook,
  findCandidatePaths,
  inferPatternCandidatePaths,
  normalizeExecutorError,
  resolveChoosePath,
  resolveResultState,
  selectPathNavigationTarget,
} from '../scripts/backlink-executor.mjs';

const FIXTURES_DIR = path.resolve('test/fixtures');

test('buildGuideParserExpression targets the expected guide fields', () => {
  const expression = buildGuideParserExpression();

  assert.match(expression, /document\.body\.innerText/);
  assert.match(expression, /querySelectorAll\('a'\)/);
});

test('compileGuidePagePayload extracts the minimum guide fields', () => {
  return readFile(path.join(FIXTURES_DIR, 'guide-page.json'), 'utf8').then((raw) => {
    const compiled = compileGuidePagePayload(JSON.parse(raw));

    assert.equal(compiled.targetSite, 'https://community.cbr.com/');
    assert.equal(compiled.linkType, 'Do-follow');
    assert.match(compiled.guideHint, /论坛注册/);
  });
});

test('compileGuidePagePayload rejects missing guide fields', () => {
  assert.throws(
    () => compileGuidePagePayload({ title: '平台外链 #114# | 内容归档', text: '只有标题没有字段' }),
    /攻略页缺少必要字段/,
  );
});

test('compileGuidePagePayload falls back to outbound guide link when url field is a title', () => {
  const compiled = compileGuidePagePayload({
    title: '平台外链 #70# | 内容归档',
    text: [
      '平台外链 #70#',
      '网址',
      'Wakelet | The All In One Content Platform',
      'DR/DA',
      '74',
      'SPAM SCORE',
      '1%',
      '链接形式',
      'Do-follow',
      '操作方式',
      'profile形式, 注册登录, 补充信息到profile',
    ].join('\n'),
    links: [
      { text: 'Wakelet | The All In One Content Platform', href: 'https://wakelet.com/' },
    ],
  });

  assert.equal(compiled.targetSite, 'https://wakelet.com/');
  assert.equal(compiled.linkType, 'Do-follow');
  assert.match(compiled.guideHint, /profile形式/);
});

test('compileGuidePagePayload supports 操作形式 label variants', () => {
  const compiled = compileGuidePagePayload({
    title: '平台外链 #109# | 内容归档',
    text: [
      '平台外链 #109#',
      '网址',
      'https://giphy.com/',
      'DR/DA',
      '92',
      'SPAM SCORE',
      '3%',
      '链接形式',
      'Do-follow',
      '操作形式',
      'Profile, 注册, 登录, 补充资料, 补充链接, 发表, 获取profile url, 分发后做促索引',
    ].join('\n'),
    links: [],
  });

  assert.equal(compiled.targetSite, 'https://giphy.com/');
  assert.equal(compiled.linkType, 'Do-follow');
  assert.match(compiled.guideHint, /获取profile url/);
});

test('compileGuidePagePayload supports 链接方式 label variants', () => {
  const compiled = compileGuidePagePayload({
    title: '平台外链 #69# | 内容归档',
    text: [
      '平台外链 #69#',
      '网址',
      'https://www.weddingbee.com/',
      'DR/DA',
      '81',
      'SPAM SCORE',
      '1%',
      '链接方式',
      'Do-follow',
      '操作方式',
      '注册, 登录, 补充资料到profile, 放置网站url',
    ].join('\n'),
    links: [],
  });

  assert.equal(compiled.targetSite, 'https://www.weddingbee.com/');
  assert.equal(compiled.linkType, 'Do-follow');
  assert.match(compiled.guideHint, /profile/);
});

test('findCandidatePaths returns multiple plausible paths when several entry points exist', () => {
  return readFile(path.join(FIXTURES_DIR, 'target-observation.json'), 'utf8').then((raw) => {
    const candidates = findCandidatePaths(JSON.parse(raw));

    assert.deepEqual(
      candidates.map((candidate) => candidate.id),
      ['profile_link', 'thread_post'],
    );
  });
});

test('normalizeExecutorError converts thrown errors into structured blocking data', () => {
  const normalized = normalizeExecutorError(new Error('CDP 命令超时: Runtime.evaluate'), {
    step: CURRENT_STEP.TARGET_OPENED,
  });

  assert.equal(normalized.status, STATUS.BLOCKED);
  assert.equal(normalized.currentStep, CURRENT_STEP.TARGET_OPENED);
  assert.match(normalized.blockingReason, /CDP 命令超时/);
});

test('continueRunbook pauses for choose_path until a path is chosen', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.candidate_paths = [
    { id: 'profile_link', label: 'Profile website field', evidence: ['Account details'] },
    { id: 'thread_post', label: 'Create thread', evidence: ['Post thread'] },
  ];
  runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
  runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
  runbook.status = STATUS.PAUSED;

  const result = await continueRunbook(runbook, {
    ensureTargetPage: async () => ({ targetId: 'target-1', url: 'https://community.cbr.com/' }),
    getPreSubmitSnapshot: async () => ({ url: 'https://community.cbr.com/account/details', title: 'Account details' }),
  });

  assert.equal(result.status, STATUS.PAUSED);
  assert.equal(result.pending_confirmation, PENDING_CONFIRMATION.CHOOSE_PATH);
});

test('continueRunbook advances from choose_path to pre_submit_check when path is chosen', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.candidate_paths = [
    { id: 'profile_link', label: 'Profile website field', evidence: ['Account details'] },
  ];
  runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
  runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
  runbook.status = STATUS.PAUSED;
  runbook.chosen_path = 'profile_link';

  const result = await continueRunbook(runbook, {
    ensureTargetPage: async () => ({ targetId: 'target-1', url: 'https://community.cbr.com/' }),
    getPreSubmitSnapshot: async () => ({ url: 'https://community.cbr.com/account/details', title: 'Account details' }),
  });

  assert.equal(result.status, STATUS.PAUSED);
  assert.equal(result.current_step, CURRENT_STEP.PRE_SUBMIT_CHECK);
  assert.equal(result.pending_confirmation, PENDING_CONFIRMATION.PRE_SUBMIT_CHECK);
});

test('continueRunbook advances single-candidate auto choice to pre_submit_check', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/82811214455822252/',
    targetSite: 'https://wakelet.com/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.candidate_paths = [
    { id: 'profile_link', label: 'Wakelet public profile', evidence: ['Collections'] },
  ];
  runbook.status = STATUS.PAUSED;
  runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
  runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
  runbook.chosen_path = 'profile_link';

  const result = await continueRunbook(runbook, {
    ensureTargetPage: async () => ({ targetId: 'target-1', url: 'https://wakelet.com/profile' }),
    getPreSubmitSnapshot: async () => ({ targetId: 'target-1', url: 'https://wakelet.com/@BingJack30046', title: 'wakelet.com/@BingJack30046', filledFields: ['bio', 'social_link_1'] }),
  });

  assert.equal(result.status, STATUS.PAUSED);
  assert.equal(result.current_step, CURRENT_STEP.PRE_SUBMIT_CHECK);
  assert.equal(result.pending_confirmation, PENDING_CONFIRMATION.PRE_SUBMIT_CHECK);
  assert.equal(result.target_id, 'target-1');
});

test('continueRunbook blocks corrupted runbooks instead of silently continuing', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
  runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
  runbook.status = STATUS.PAUSED;
  runbook.chosen_path = 'missing-path';

  const result = await continueRunbook(runbook, {
    ensureTargetPage: async () => ({ targetId: 'target-1', url: 'https://community.cbr.com/' }),
    getPreSubmitSnapshot: async () => ({ url: 'https://community.cbr.com/account/details', title: 'Account details' }),
  });

  assert.equal(result.status, STATUS.BLOCKED);
  assert.equal(result.result.state, RESULT_STATE.BLOCKED);
  assert.match(result.blocking_reason, /chosen_path/);
});

test('resolveChoosePath prefers explicit CLI choice over interactive prompt', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.candidate_paths = [
    { id: 'profile_link', label: 'Profile website field', evidence: ['Account details'] },
    { id: 'thread_post', label: 'Create thread', evidence: ['Post thread'] },
  ];

  const value = await resolveChoosePath(runbook, {
    explicitChoice: 'thread_post',
    isInteractive: true,
    prompt: async () => {
      throw new Error('should not prompt');
    },
  });

  assert.equal(value, 'thread_post');
});

test('resolveChoosePath stays paused in non-interactive mode without explicit choice', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.candidate_paths = [
    { id: 'profile_link', label: 'Profile website field', evidence: ['Account details'] },
  ];

  const value = await resolveChoosePath(runbook, {
    isInteractive: false,
  });

  assert.equal(value, null);
});

test('resolveResultState accepts explicit result-state without prompting', async () => {
  const value = await resolveResultState({
    explicitState: RESULT_STATE.AWAITING_REVIEW,
    isInteractive: true,
    prompt: async () => {
      throw new Error('should not prompt');
    },
  });

  assert.equal(value, RESULT_STATE.AWAITING_REVIEW);
});

test('selectPathNavigationTarget prefers account details for community.cbr.com profile_link when logged in', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.chosen_path = 'profile_link';

  const selected = selectPathNavigationTarget(runbook, {
    url: 'https://community.cbr.com/',
    links: [
      { text: 'Your account', href: 'https://community.cbr.com/account/' },
      { text: 'Account details', href: 'https://community.cbr.com/account/account-details' },
      { text: 'Log out', href: 'https://community.cbr.com/logout/?t=token' },
      { text: 'register', href: 'https://community.cbr.com/register/' },
    ],
  });

  assert.equal(selected?.href, 'https://community.cbr.com/account/account-details');
});

test('selectPathNavigationTarget prefers create-thread for community.cbr.com thread_post when logged in', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.chosen_path = 'thread_post';

  const selected = selectPathNavigationTarget(runbook, {
    url: 'https://community.cbr.com/',
    links: [
      { text: 'Your account', href: 'https://community.cbr.com/account/' },
      { text: 'Post thread…', href: 'https://community.cbr.com/forums/-/create-thread' },
      { text: 'Log out', href: 'https://community.cbr.com/logout/?t=token' },
      { text: 'register', href: 'https://community.cbr.com/register/' },
    ],
  });

  assert.equal(selected?.href, 'https://community.cbr.com/forums/creator-showcase.23/post-thread');
});

test('selectPathNavigationTarget keeps current workspace for wakelet profile_link when public profile link is not yet exposed', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/82811214455822252/',
    targetSite: 'https://wakelet.com/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.chosen_path = 'profile_link';

  const selected = selectPathNavigationTarget(runbook, {
    url: 'https://wakelet.com/workspace/rOuHT4107T4OTlVJz0F0_/collections',
    links: [
      { text: 'My Library', href: 'https://wakelet.com/collections' },
      { text: 'Items', href: 'https://wakelet.com/items' },
      { text: 'Collections', href: 'https://wakelet.com/workspace/rOuHT4107T4OTlVJz0F0_/collections' },
    ],
  });

  assert.equal(selected, null);
});

test('selectPathNavigationTarget prefers daily.dev profile settings when session is already logged in', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/45811241551855828/',
    targetSite: 'https://daily.dev/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.chosen_path = 'profile_link';

  const selected = selectPathNavigationTarget(runbook, {
    url: 'https://app.daily.dev/',
    links: [
      { text: 'Saved', href: 'https://app.daily.dev/bookmarks' },
      { text: 'Leaderboard', href: 'https://app.daily.dev/leaderboard' },
    ],
  });

  assert.equal(selected?.href, 'https://app.daily.dev/settings/profile');
});

test('inferPatternCandidatePaths accepts daily.dev landing shell without visible links', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/45811241551855828/',
    targetSite: 'https://app.daily.dev/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });

  const candidates = inferPatternCandidatePaths(runbook, {
    url: 'https://app.daily.dev/',
    links: [],
  });

  assert.deepEqual(candidates, [
    {
      id: 'profile_link',
      label: 'daily.dev profile link',
      evidence: ['daily.dev landing shell'],
    },
  ]);
});

test('continueRunbook supports daily.dev profile_link snapshots after path selection', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/45811241551855828/',
    targetSite: 'https://daily.dev/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.candidate_paths = [
    { id: 'profile_link', label: 'daily.dev profile link', evidence: ['logged-in daily.dev session'] },
  ];
  runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
  runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
  runbook.status = STATUS.PAUSED;
  runbook.chosen_path = 'profile_link';

  const result = await continueRunbook(runbook, {
    ensureTargetPage: async () => ({ targetId: 'target-daily', url: 'https://app.daily.dev/settings/profile' }),
    getPreSubmitSnapshot: async () => ({
      targetId: 'target-daily',
      url: 'https://app.daily.dev/settings/profile',
      title: 'Manage account profile | daily.dev',
      filledFields: ['headline', 'social_link_1'],
    }),
  });

  assert.equal(result.status, STATUS.PAUSED);
  assert.equal(result.current_step, CURRENT_STEP.PRE_SUBMIT_CHECK);
  assert.equal(result.pending_confirmation, PENDING_CONFIRMATION.PRE_SUBMIT_CHECK);
  assert.equal(result.target_id, 'target-daily');
});

test('inferPatternCandidatePaths returns profile_link for joy.link landing page', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/45811242214255528/',
    targetSite: 'https://joy.link/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });

  const candidates = inferPatternCandidatePaths(runbook, {
    url: 'https://joy.link/',
    links: [
      { text: 'Log In', href: 'https://joy.link/user/login?language=en' },
      { text: 'Get Started!', href: 'https://joy.link/user/login?language=en&loginpage=signup' },
    ],
  });

  assert.deepEqual(candidates, [
    {
      id: 'profile_link',
      label: 'Joy.link public page',
      evidence: ['Log In', 'Get Started!'],
    },
  ]);
});

test('selectPathNavigationTarget routes joy.link profile_link to signup entry', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/45811242214255528/',
    targetSite: 'https://joy.link/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.chosen_path = 'profile_link';

  const selected = selectPathNavigationTarget(runbook, {
    url: 'https://joy.link/',
    links: [],
  });

  assert.equal(selected?.href, 'https://joy.link/user/login?language=en&loginpage=signup');
});

test('continueRunbook supports joy.link profile_link snapshots after path selection', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/45811242214255528/',
    targetSite: 'https://joy.link/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.candidate_paths = [
    { id: 'profile_link', label: 'Joy.link public page', evidence: ['Log In', 'Get Started!'] },
  ];
  runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
  runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
  runbook.status = STATUS.PAUSED;
  runbook.chosen_path = 'profile_link';

  const result = await continueRunbook(runbook, {
    ensureTargetPage: async () => ({ targetId: 'target-joy', url: 'https://joy.link/' }),
    getPreSubmitSnapshot: async () => ({
      targetId: 'target-joy',
      url: 'https://joy.link/backwardstext',
      title: '@backwardstext | joy.link',
      filledFields: ['content_url', 'content_title', 'public_link_verified'],
    }),
  });

  assert.equal(result.status, STATUS.PAUSED);
  assert.equal(result.current_step, CURRENT_STEP.PRE_SUBMIT_CHECK);
  assert.equal(result.pending_confirmation, PENDING_CONFIRMATION.PRE_SUBMIT_CHECK);
  assert.equal(result.target_id, 'target-joy');
});

test('inferPatternCandidatePaths returns profile_link for myminifactory.com known profile site', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/55188425155512444/',
    targetSite: 'https://www.myminifactory.com/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });

  const candidates = inferPatternCandidatePaths(runbook, {
    url: 'https://www.myminifactory.com/',
    links: [],
  });

  assert.deepEqual(candidates, [
    {
      id: 'profile_link',
      label: 'MyMiniFactory profile website',
      evidence: ['known myminifactory profile settings path'],
    },
  ]);
});

test('selectPathNavigationTarget routes myminifactory.com profile_link to stable settings page fallback', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/55188425155512444/',
    targetSite: 'https://www.myminifactory.com/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.chosen_path = 'profile_link';

  const selected = selectPathNavigationTarget(runbook, {
    url: 'https://www.myminifactory.com/',
    links: [],
  });

  assert.equal(selected?.href, 'https://www.myminifactory.com/settings/profile');
});

test('continueRunbook supports myminifactory.com profile_link snapshots after path selection', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/55188425155512444/',
    targetSite: 'https://www.myminifactory.com/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.candidate_paths = [
    { id: 'profile_link', label: 'MyMiniFactory profile website', evidence: ['known myminifactory profile settings path'] },
  ];
  runbook.pending_confirmation = PENDING_CONFIRMATION.CHOOSE_PATH;
  runbook.current_step = CURRENT_STEP.CHOOSE_PATH;
  runbook.status = STATUS.PAUSED;
  runbook.chosen_path = 'profile_link';

  const result = await continueRunbook(runbook, {
    ensureTargetPage: async () => ({ targetId: 'target-mmf', url: 'https://www.myminifactory.com/settings/profile' }),
    getPreSubmitSnapshot: async () => ({
      targetId: 'target-mmf',
      url: 'https://www.myminifactory.com/settings/profile',
      title: 'Discover STL files for 3D printing ideas and high-quality 3D printer models. | MyMiniFactory',
      filledFields: ['user_profile_type[website]', 'user_profile_type[about]'],
    }),
  });

  assert.equal(result.status, STATUS.PAUSED);
  assert.equal(result.current_step, CURRENT_STEP.PRE_SUBMIT_CHECK);
  assert.equal(result.pending_confirmation, PENDING_CONFIRMATION.PRE_SUBMIT_CHECK);
  assert.equal(result.target_id, 'target-mmf');
});

test('buildProfileDraft uses target link and summary for account details page', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });

  const draft = buildProfileDraft(runbook);

  assert.equal(draft.website, 'https://www.dfilters.com/');
  assert.equal(draft.profileName, 'DFilters');
  assert.match(draft.bioText, /A filter discovery site/);
  assert.match(draft.aboutText, /DFilters/);
  assert.match(draft.aboutText, /A filter discovery site/);
});

test('buildThreadDraft creates a title, body, and canonical forum url', () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });

  const draft = buildThreadDraft(runbook);

  assert.equal(draft.forumUrl, 'https://community.cbr.com/forums/creator-showcase.23/post-thread');
  assert.match(draft.title, /DFilters/);
  assert.match(draft.messageText, /https:\/\/www\.dfilters\.com\//);
  assert.match(draft.messageHtml, /<p>/);
});

test('finalizeSuccessfulRunbook closes the owned tab after completion', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.status = STATUS.COMPLETED;
  runbook.current_step = CURRENT_STEP.SUBMIT_ATTEMPTED;
  runbook.target_id = 'target-1';
  runbook.target_owned = true;
  runbook.last_seen_url = 'https://community.cbr.com/account/account-details';

  const closed = [];
  await finalizeSuccessfulRunbook(runbook, {
    closeTarget: async (targetId) => {
      closed.push(targetId);
    },
  });

  assert.deepEqual(closed, ['target-1']);
  assert.equal(runbook.target_id, null);
  assert.match(runbook.evidence.at(-1).note, /closed owned tab/);
});

test('finalizeSuccessfulRunbook does nothing for paused runbooks', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/22811425142228521/',
    targetSite: 'https://community.cbr.com/',
    targetLink: 'https://www.dfilters.com/',
    contentInputs: {
      site_name: 'DFilters',
      site_summary: 'A filter discovery site',
      anchor_text: 'dfilters',
    },
  });
  runbook.status = STATUS.PAUSED;
  runbook.target_id = 'target-2';

  const closed = [];
  await finalizeSuccessfulRunbook(runbook, {
    closeTarget: async (targetId) => {
      closed.push(targetId);
    },
  });

  assert.deepEqual(closed, []);
  assert.equal(runbook.target_id, 'target-2');
});

test('finalizeSuccessfulRunbook keeps reused tabs open and clears target_id', async () => {
  const runbook = createRunbook({
    guideUrl: 'https://pdfreprinting.net/wailian/2026-03/45811241551855828/',
    targetSite: 'https://daily.dev/',
    targetLink: 'https://backwardstextgenerator.com/',
    contentInputs: {
      site_name: 'Backward Text Generator',
      site_summary: 'Free reverse text generator for backwards letters, mirror text, and flip text.',
      anchor_text: 'Backward Text Generator',
    },
  });
  runbook.status = STATUS.COMPLETED;
  runbook.current_step = CURRENT_STEP.SUBMIT_ATTEMPTED;
  runbook.target_id = 'target-daily-user';
  runbook.target_owned = false;
  runbook.last_seen_url = 'https://app.daily.dev/bingjack';

  const closed = [];
  await finalizeSuccessfulRunbook(runbook, {
    closeTarget: async (targetId) => {
      closed.push(targetId);
    },
  });

  assert.deepEqual(closed, []);
  assert.equal(runbook.target_id, null);
  assert.match(runbook.evidence.at(-1).note, /kept reused tab open/);
});
