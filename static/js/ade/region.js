
'use strict';

export const REGION_STATUS = ['blank', 'idle', 'thinking', 'working', 'complete'];

export const NAME_MODEL = ['name', 'model'];

export const REGION_FIELDS = [
  { key: 'agent',       in: 'detail', label: 'agent',       type: 'area' },
  { key: 'track',       in: 'node',   label: 'track',       type: 'text',
    placeholder: 'the row this region sits on  ·  blank = a row of its own',
    hint: 'regions sharing a track name land on ONE track when the plan pipes' },
  { key: 'wt',          in: 'node',   label: 'worktree / branch', type: 'text',
    placeholder: '../agent-1  ·  or a branch  ·  blank = wherever the plan is',
    hint: 'where this region works — a region property, same as on the canvas face' },
  { key: 'notes',       in: 'node',   label: 'notes',       type: 'area' },
  { key: 'status',      in: 'node',   label: 'status',      type: 'status',
    hint: 'the face light · blank = nothing has run yet' },
  { key: 'stxt',        in: 'node',   label: 'status text', type: 'text',
    placeholder: 'the line beside the status dot' },
];

export function regionGet(region, field) {
  if (!region) return '';
  if (field.in === 'detail') return (region.detail && region.detail[field.key]) || '';
  return region[field.key] || '';
}
export function regionSet(region, field, value) {
  if (field.in === 'detail') {
    region.detail = region.detail || {};
    region.detail[field.key] = value;
  } else {
    region[field.key] = value;
  }
}

export function blankRegion(id, canvas) {
  const r = { id: id };
  if (canvas) { r.x = canvas.x; r.y = canvas.y; }
  r.name = '';
  r.model = '';
  r.notes = '';
  r.status = 'blank';
  r.stxt = '';
  r.wt = '';
  r.track = '';
  if (canvas) r.notches = [];
  r.detail = { agent: '' };
  return r;
}
