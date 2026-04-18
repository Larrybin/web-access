#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const STATUS = Object.freeze({
  DISCOVERING: 'discovering',
  PAUSED: 'paused',
  SUBMITTING: 'submitting',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
});

export const CURRENT_STEP = Object.freeze({
  GUIDE_PARSED: 'guide_parsed',
  TARGET_OPENED: 'target_opened',
  CHOOSE_PATH: 'choose_path',
  PRE_SUBMIT_CHECK: 'pre_submit_check',
  SUBMIT_ATTEMPTED: 'submit_attempted',
});

export const PENDING_CONFIRMATION = Object.freeze({
  NONE: null,
  CHOOSE_PATH: 'choose_path',
  PRE_SUBMIT_CHECK: 'pre_submit_check',
});

export const RESULT_STATE = Object.freeze({
  NONE: 'none',
  PUBLIC: 'public',
  AWAITING_REVIEW: 'awaiting_review',
  BLOCKED: 'blocked',
});

const SLUG = 'eze-is-web-access';

function valuesOf(record) {
  return Object.values(record);
}

export function getRunbookRoot({ rootDir } = {}) {
  if (rootDir) return rootDir;
  const gstackHome = process.env.GSTACK_HOME || path.join(os.homedir(), '.gstack');
  return path.join(gstackHome, 'projects', SLUG, 'runbooks');
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} 必须是非空字符串`);
  }
}

function assertNullableString(value, field) {
  if (value === null) return;
  if (typeof value !== 'string') {
    throw new Error(`${field} 必须是字符串或 null`);
  }
}

function assertOneOf(value, allowedValues, field) {
  if (!allowedValues.includes(value)) {
    throw new Error(`${field} 非法: ${String(value)}`);
  }
}

function assertArray(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} 必须是数组`);
  }
}

function baseEvidenceEntry(entry) {
  return {
    type: entry?.type || 'note',
    url: entry?.url || '',
    note: entry?.note || '',
    ts: entry?.ts || new Date().toISOString(),
  };
}

export function createRunbook({
  guideUrl,
  targetSite,
  targetLink,
  linkType = '',
  guideHint = '',
  contentInputs,
}) {
  assertNonEmptyString(guideUrl, 'guideUrl');
  assertNonEmptyString(targetSite, 'targetSite');
  assertNonEmptyString(targetLink, 'targetLink');
  if (!contentInputs || typeof contentInputs !== 'object') {
    throw new Error('contentInputs 必须是对象');
  }

  return {
    runbook_id: randomUUID(),
    guide_url: guideUrl,
    target_site: targetSite,
    target_link: targetLink,
    link_type: linkType,
    guide_hint: guideHint,
    content_inputs: {
      site_name: contentInputs.site_name || '',
      site_summary: contentInputs.site_summary || '',
      anchor_text: contentInputs.anchor_text || '',
    },
    candidate_paths: [],
    chosen_path: null,
    last_seen_url: '',
    target_id: null,
    target_owned: false,
    status: STATUS.DISCOVERING,
    current_step: CURRENT_STEP.GUIDE_PARSED,
    pending_confirmation: PENDING_CONFIRMATION.NONE,
    evidence: [],
    attempts: {
      observe: 0,
      recover: 0,
    },
    result: {
      state: RESULT_STATE.NONE,
      submitted: false,
      publicly_visible: false,
      awaiting_review: false,
    },
    blocking_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function validateRunbook(runbook) {
  if (!runbook || typeof runbook !== 'object') {
    throw new Error('runbook 必须是对象');
  }

  assertNonEmptyString(runbook.runbook_id, 'runbook_id');
  assertNonEmptyString(runbook.guide_url, 'guide_url');
  assertNonEmptyString(runbook.target_site, 'target_site');
  assertNonEmptyString(runbook.target_link, 'target_link');
  assertOneOf(runbook.status, valuesOf(STATUS), 'status');
  assertOneOf(runbook.current_step, valuesOf(CURRENT_STEP), 'current_step');
  assertOneOf(runbook.pending_confirmation, valuesOf(PENDING_CONFIRMATION), 'pending_confirmation');
  assertNullableString(runbook.chosen_path, 'chosen_path');
  assertNullableString(runbook.target_id, 'target_id');
  if (typeof runbook.target_owned !== 'boolean') {
    throw new Error('target_owned 必须是布尔值');
  }
  assertNullableString(runbook.blocking_reason, 'blocking_reason');
  assertArray(runbook.candidate_paths, 'candidate_paths');
  assertArray(runbook.evidence, 'evidence');
  assertOneOf(runbook.result?.state, valuesOf(RESULT_STATE), 'result.state');

  for (const candidate of runbook.candidate_paths) {
    assertNonEmptyString(candidate.id, 'candidate_paths[].id');
    assertNonEmptyString(candidate.label, 'candidate_paths[].label');
    assertArray(candidate.evidence || [], 'candidate_paths[].evidence');
  }

  for (const entry of runbook.evidence) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('evidence[] 必须是对象');
    }
    assertNonEmptyString(entry.type, 'evidence[].type');
  }

  return runbook;
}

export function addEvidence(runbook, entry) {
  runbook.evidence.push(baseEvidenceEntry(entry));
  runbook.updated_at = new Date().toISOString();
  return runbook;
}

export async function saveRunbook(runbook, { rootDir } = {}) {
  validateRunbook(runbook);
  const resolvedRoot = getRunbookRoot({ rootDir });
  await mkdir(resolvedRoot, { recursive: true });
  const filePath = runbook.runbook_path || path.join(resolvedRoot, `${runbook.runbook_id}.json`);
  runbook.runbook_path = filePath;
  runbook.updated_at = new Date().toISOString();
  await writeFile(filePath, `${JSON.stringify(runbook, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function loadRunbook(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  parsed.runbook_path = filePath;
  parsed.target_owned ??= Boolean(parsed.target_id);
  validateRunbook(parsed);
  return parsed;
}
