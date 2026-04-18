import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import {
  CURRENT_STEP,
  PENDING_CONFIRMATION,
  RESULT_STATE,
  STATUS,
  createRunbook,
  getRunbookRoot,
  loadRunbook,
  saveRunbook,
  validateRunbook,
} from '../scripts/runbook.mjs';

test('createRunbook creates a valid runbook with defaults', () => {
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

  validateRunbook(runbook);
  assert.equal(runbook.status, STATUS.DISCOVERING);
  assert.equal(runbook.current_step, CURRENT_STEP.GUIDE_PARSED);
  assert.equal(runbook.pending_confirmation, PENDING_CONFIRMATION.NONE);
  assert.equal(runbook.result.state, RESULT_STATE.NONE);
  assert.equal(runbook.target_owned, false);
});

test('validateRunbook rejects invalid enum values', () => {
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

  runbook.status = 'oops';

  assert.throws(() => validateRunbook(runbook), /status/);
});

test('saveRunbook and loadRunbook round-trip through the configured root', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'runbook-test-'));

  try {
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

    const savedPath = await saveRunbook(runbook, { rootDir: tempRoot });
    const loaded = await loadRunbook(savedPath);

    assert.equal(getRunbookRoot({ rootDir: tempRoot }), tempRoot);
    assert.equal(loaded.runbook_id, runbook.runbook_id);
    assert.equal(loaded.target_site, runbook.target_site);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
