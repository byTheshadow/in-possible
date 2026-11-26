export const MEMORY_TYPES = Object.freeze({
  FACT: 'fact',
  PREFERENCE: 'preference',
  EPISODE: 'episode',
  RELATIONSHIP: 'relationship',
  CHARACTER_THOUGHT: 'character_thought',
  EMOTION: 'emotion',
  EXPRESSION_RULE: 'expression_rule',
  REFLECTION: 'reflection',
  CHARACTER_ACTION: 'character_action',
  BELIEF: 'belief',
});

export const MEMORY_SUBJECTS = Object.freeze({ USER: 'user', CHARACTER: 'character', RELATIONSHIP: 'relationship', SHARED: 'shared' });
export const MEMORY_STATUSES = Object.freeze({ ACTIVE: 'active', TEMPORARY: 'temporary', DORMANT: 'dormant', ARCHIVED: 'archived', WITHDRAWN: 'withdrawn', CORRECTED: 'corrected' });
export const MEMORY_CONFIDENCES = Object.freeze({ INFERRED: 'inferred', SUGGESTED: 'suggested', CONFIRMED: 'confirmed', USER_WRITTEN: 'user_written' });
export const MEMORY_JOB_STATUSES = Object.freeze({ IDLE: 'idle', PENDING: 'pending', RUNNING: 'running', FAILED: 'failed' });
export const RECALLABLE_MEMORY_STATUSES = [MEMORY_STATUSES.ACTIVE, MEMORY_STATUSES.TEMPORARY];
