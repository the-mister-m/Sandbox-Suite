

'use strict';

import { blankRegion } from './region.js';
import { insertRegion } from './arrange.js';


const NULLABLE = new Set(['gate_wait_s', 'max_tools', 'num_gpu', 'num_thread',
                          'context_reset_cap_k']);

const IDENTITY_KEYS = new Set(['name', 'model', 'seat', 'root',
                               'provider', 'loop_class', 'mechanism']);


const RESET_INSTRUCTION_DEFAULT =
  'You have been reset, message The Captain directly or agents in chat for instructions';
const CONTEXT_CAP_K_DEFAULT = 300;




const FIELD_SPECS = {
  gate_wait_s:     { label: 'gate wait',       type: 'num', def: 20,   hint: 'blank = wait forever' },
  max_tools:       { label: 'tool budget',     type: 'num', def: null, hint: 'tool calls per turn · off by default, the field stays visible' },
  request_timeout: { label: 'request timeout', type: 'num', def: 30,  hint: 'seconds of silence allowed before/between chunks — an IDLE timeout, not a ceiling on total run time' },

  num_ctx:         { label: 'context window',  type: 'num', def: 32768, hint: 'tokens' },
  think:           { label: 'thinking',        type: 'bool', def: true, text: 'allow thinking / chain-of-thought' },

  temperature:     { label: 'temperature',    type: 'num', def: 0.8,  step: '0.05', fold: true },
  top_k:           { label: 'top_k',          type: 'num', def: 40,   step: '1',    fold: true },
  top_p:           { label: 'top_p',          type: 'num', def: 0.9,  step: '0.05', fold: true },
  min_p:           { label: 'min_p',          type: 'num', def: 0.0,  step: '0.01', fold: true },
  repeat_penalty:  { label: 'repeat_penalty', type: 'num', def: 1.1,  step: '0.05', fold: true },
  repeat_last_n:   { label: 'repeat_last_n',  type: 'num', def: 64,   step: '1',    fold: true },
  seed:            { label: 'seed',           type: 'num', def: 0,    step: '1',    fold: true },
  num_predict:     { label: 'num_predict',    type: 'num', def: -1,   step: '1',    fold: true },
  keep_alive:      { label: 'keep_alive',     type: 'num', def: 30,   step: '1',    fold: true },
  mirostat:        { label: 'mirostat',       type: 'num', def: 0,    step: '1',    fold: true },
  mirostat_tau:    { label: 'mirostat_tau',   type: 'num', def: 5.0,  step: '0.1',  fold: true },
  mirostat_eta:    { label: 'mirostat_eta',   type: 'num', def: 0.1,  step: '0.01', fold: true },
  num_gpu:         { label: 'num_gpu',        type: 'num', def: null, step: '1',    fold: true },
  num_thread:      { label: 'num_thread',     type: 'num', def: null, step: '1',    fold: true },

  claude_effort:   { label: 'effort', type: 'sel', def: '',
                     opts: [['', 'binary default'], ['low', 'low'], ['medium', 'medium'],
                            ['high', 'high'], ['xhigh', 'xhigh'], ['max', 'max']] },
  claude_keep_warm: { label: 'keep warm on switch', type: 'bool', def: false,
                      text: "keep other models' sessions warm on switch",
                      hint: 'off (default): switching models ends the old one\'s session · on: leaves it live so switching back is cheap' },
  claude_cache_ttl: { label: 'cache TTL', type: 'sel', def: '1h',
                      opts: [['1h', '1h (default)'], ['5m', '5m']],
                      hint: 'also a per-track quick toggle on the timeline row' },
  claude_exclude_dynamic: { label: 'exclude dynamic prompt', type: 'bool', def: false,
                      text: 'strip date/cwd/git-status from the system prompt',
                      hint: 'dormant escape hatch — off by default' },

  claude_tools: { label: 'claude tools', type: 'toolset', def: [] },
  claude_hook_ask_blocking: { label: 'hook ask blocks', type: 'bool', def: true,
                  text: "hook's ask decision blocks the tool call",
                  hint: "off: the hook's ask degrades straight to queue instead of blocking (OPEN QUESTIONS item 1 off-switch) · bounded by gate wait" },
  claude_setting_sources: { label: 'setting sources', type: 'sources',
                  hint: 'which settings scopes the child loads · every box unchecked sends no --setting-sources flag at all, which loads every scope (the CLI default)' },
  claude_system_prompt: { label: 'system prompt', type: 'sysprompt',
                  hint: 'replaces the memory block, the delivering-work / corrections / context-management prose, the security preamble, and the harness notes. It does NOT remove tool schemas, CLAUDE.md, git status, the environment block, or the skill and agent rosters. Blank = omit --system-prompt; the additive --append-system-prompt is untouched either way.' },
  claude_bare: { label: 'Raw Claude', type: 'bool', def: false,
                  text: '⚠ Raw Claude (--bare): skip hooks / LSP / plugins / CLAUDE.md / auto-memory / keychain',
                  warn: { title: '⚠ Raw Claude removes the gate',
                          text: '--bare skips hooks, including the PreToolUse gate registered through --settings. A track with Raw Claude ON and a non-empty tool roster has NO gate. This is a warning, not a refusal.' },
                  hint: 'one flag, six effects, no sub-flags — three of the six have their own levers in this panel (CLAUDE.md excludes, memory, setting sources); plugins, LSP, and keychain do not' },
  claude_config_dir: { label: 'config dir', type: 'dirpick', unset: '.claude/',
                  hint: 'CLAUDE_CONFIG_DIR · blank = ~/.claude (default). The agents folder lives inside it — moving the config dir moves it.' },
  claude_memory_enabled: { label: 'memory', type: 'bool', def: false,
                  text: 'auto-memory on',
                  hint: 'off (default) removes the "# Memory" block from the system prompt entirely — the model is never told the memory directory exists, so it neither writes there nor recalls from it. Files on disk are untouched: invisible, not deleted.' },
  claude_md_excludes: { label: 'CLAUDE.md excludes', type: 'mdexcl',
                  hint: 'checked = loaded; every UNCHECKED file is excluded. Best enumeration of what is on disk (global file · walk up from the root · glob below it) — NOT proof of what the CLI actually loads.' },
  claude_output_style: { label: 'output style', type: 'style',
                  hint: 'resolved names from ~/.claude/output-styles/*.md (the frontmatter `name:`, or the filename when absent) · blank = CLI default' },
  claude_disallowed_tools: { label: 'claude tools', type: 'toolset', def: [] },
  claude_add_dirs: { label: 'extra dirs (--add-dir)', type: 'dirlist', def: [],
                  hint: 'directories the track\'s tools may reach beyond its root' },

  claude_settings_file: { label: 'settings file override', type: 'settingsfile', def: '',
                  hint: 'session-only --settings source, read fresh at spawn · blank = none (global default)' },

  claude_preset: { label: 'Claude Preset', type: 'stackpreset', def: '',
                  hint: 'context-stack and harness/provider fields, one merged vocabulary — injections/presets/claude/ · applies immediately, independent of Save' },


  codex_sandbox_mode:    { label: 'sandbox mode', type: 'text' },
  codex_approval_policy: { label: 'approval policy', type: 'text' },
};

const RAIL_KEYS = ['provider', 'loop_class', 'mechanism'];

const HOOKS = ['open', 'ask', 'queue', 'locked'];

function hookColor(hook) {
  if (hook === 'queue')  return 'yellow';
  if (hook === 'locked') return 'red';
  if (hook === 'open')   return 'green';
  return 'blue';
}


function normalizeEdges(edges) {
  if (!Array.isArray(edges)) return [];
  const out = [];
  for (const e of edges) {
    if (!e) continue;
    if (typeof e === 'string')      out.push({ edge: e, scope: 'any' });
    else if (Array.isArray(e))      out.push({ edge: String(e[0]), scope: e[1] || 'any' });
    else if (e.edge)                out.push({ edge: String(e.edge), scope: e.scope || 'any',
                                               hook: HOOKS.includes(e.hook) ? e.hook : undefined });
  }
  return out;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function row(labelText, ctl, hint, parent) {
  const r = el('div', 'ts-row');
  r.appendChild(el('label', null, labelText));
  const holder = el('div', 'ts-ctl');
  holder.appendChild(ctl);
  r.appendChild(holder);
  parent.appendChild(r);
  if (hint) parent.appendChild(el('div', 'ts-hint', hint));
  return r;
}
function option(value, text, selected) {
  const o = el('option', null, text);
  o.value = value;
  if (selected) o.selected = true;
  return o;
}

function ensureFieldPopout(className, title, subtitle) {
  const stale = document.querySelector('.' + className);
  if (stale) stale.remove();

  const ov = el('div', 'ts-ctxmodal ' + className);
  const box = el('div', 'ts-ctxbox');
  const head = el('div', 'ts-ctxhead');
  head.appendChild(el('h3', null, title));
  const closeBtn = el('button', 'ts-ctxx', '×');
  closeBtn.type = 'button';
  head.appendChild(closeBtn);
  box.appendChild(head);
  if (subtitle) box.appendChild(el('div', 'ts-ctxsub', subtitle));
  const body = el('div', 'ts-ctxbody');
  box.appendChild(body);
  ov.appendChild(box);
  document.body.appendChild(ov);

  let onKey = null;
  function close() {
    ov.classList.remove('show');
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
  }
  ov.open = () => {
    ov.classList.add('show');
    onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey);
  };
  ov.close = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  closeBtn.addEventListener('click', close);
  ov.body = body;
  return ov;
}

const CLAUDE_TOOL_NAMES = ['Read', 'Write', 'Edit', 'Bash', 'BashOutput',
  'KillShell', 'Glob', 'Grep', 'NotebookRead', 'NotebookEdit', 'WebFetch', 'WebSearch'];




const SECTION_KEYS = {
  session:  ['claude_effort', 'claude_keep_warm', 'claude_cache_ttl',
             'request_timeout', 'num_ctx', 'think'],
  context:  ['claude_config_dir', 'claude_system_prompt', 'claude_output_style',
             'claude_md_excludes', 'claude_memory_enabled'],
  advanced: ['claude_bare', 'claude_exclude_dynamic', 'claude_add_dirs'],
  tools:    ['claude_tools', 'claude_disallowed_tools', 'max_tools',
             'gate_wait_s', 'claude_hook_ask_blocking'],
  presets:  ['claude_settings_file', 'claude_preset'],
};
const SECTION_OF = {};
for (const [sec, keys] of Object.entries(SECTION_KEYS)) {
  for (const k of keys) SECTION_OF[k] = sec;
}

export function openTrackMenu({ mode, track, targetTrack, models, crew, edges, rails, tracks, send }) {
  const isEdit = mode === 'edit';
  const isAddTrack = mode === 'addTrack';
  const t = track || {};
  const settings = (t && t.settings) || {};
  const modelList = Array.isArray(models) ? models : [];
  const crewList  = Array.isArray(crew) ? crew : [];
  const edgeList  = normalizeEdges(edges);

  const railCat = (rails && Array.isArray(rails.rails) && rails.rails.length)
    ? rails
    : {
        providers: [{ id: t.provider || 'ollama', label: t.provider || 'ollama' }],
        rails: [{
          provider: t.provider || 'ollama',
          loop_class: t.loop_class || 'user-loop',
          mechanism: t.mechanism || 'native',
          label: 'no rail catalog — showing every parameter',
          piped: true,
          params: ['num_ctx', 'request_timeout', 'gate_wait_s', 'max_tools', 'think',
                   'temperature', 'top_k', 'top_p', 'min_p', 'repeat_penalty',
                   'repeat_last_n', 'seed', 'num_predict', 'keep_alive', 'mirostat',
                   'mirostat_tau', 'mirostat_eta', 'num_gpu', 'num_thread'],
          unwired: [],
        }],
        models: {}, markers: {},
      };

  const box = document.getElementById('modalBox');
  const modal = document.getElementById('modal');
  if (!box || !modal) return Promise.resolve(null);

  box.innerHTML = '';
  box.appendChild(el('h3', null,
    isEdit ? `Track settings — ${t.name || 'untitled'}` : isAddTrack ? 'Add track' : 'Add region'));

  const wrap = el('div', 'ts-wrap');



  const infoBtn = el('button', 'ts-ctxbtn ts-infobtn', 'show all info text');
  infoBtn.type = 'button';
  infoBtn.addEventListener('click', () => {
    const hiding = !wrap.classList.contains('ts-nohints');
    wrap.classList.toggle('ts-nohints', hiding);
    infoBtn.textContent = hiding ? 'show all info text' : 'hide all info text';
  });
  wrap.classList.add('ts-nohints');
  const infoRow = el('div', 'ts-inforow');
  infoRow.appendChild(infoBtn);

  box.appendChild(wrap);
  box.appendChild(infoRow);

  let trackSel = null;
  if (mode === 'add') {
    wrap.appendChild(el('div', 'ts-sec', 'track'));
    trackSel = el('select', 'ts-sel');
    const liveTracks = Array.isArray(tracks) ? tracks : [];
    if (!liveTracks.length) {
      trackSel.appendChild(option('', 'no tracks yet — add one first', true));
      trackSel.disabled = true;
    } else {
      trackSel.appendChild(option('', 'choose a track…', true));
      for (const tr of liveTracks) trackSel.appendChild(option(tr.id, tr.name || tr.id, false));


      if (targetTrack && liveTracks.some((tr) => tr.id === targetTrack)) {
        trackSel.value = targetTrack;
      }
    }
    row('track', trackSel, 'which track this region runs on', wrap);
  }


  function makeSection(name) {
    const sec = name ? el('div', 'ts-sec', name) : null;
    const box = el('div', 'ts-params');
    const tail = el('div');
    if (sec) wrap.appendChild(sec);
    wrap.appendChild(box);
    wrap.appendChild(tail);
    return {
      sec, box, tail,
      show(on) {
        const d = on ? '' : 'none';
        if (sec) sec.style.display = d;
        box.style.display = d; tail.style.display = d;
      },
    };
  }
  const secPresets  = makeSection('PRESETS');
  const secIdentity = makeSection('IDENTITY');
  const secSession  = makeSection('SESSION');
  const secContext  = makeSection('CONTEXT STACK');
  const secTools    = makeSection('');
  const secResolved = makeSection('RESOLVED STACK');
  const SECTION_BOX = { session: secSession, context: secContext,
                        tools: secTools, presets: secPresets };


  const fields = [];
  function register(key, node, read, evt) {
    const f = { key, node, read, dirty: false };
    node.addEventListener(evt || 'input', () => { f.dirty = true; });
    fields.push(f);
    return f;
  }

  function readNum(node, key) {
    const raw = (node.value || '').trim();
    if (raw === '') return NULLABLE.has(key) ? null : undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  const identBox = secIdentity.tail;

  const nameIn = el('input', 'ts-in');
  nameIn.type = 'text';
  nameIn.autocomplete = 'off';
  nameIn.placeholder = 'track name';
  nameIn.value = t.name || '';
  row('name', nameIn, null, identBox);
  register('name', nameIn, () => (nameIn.value || '').trim());



  const providers = (railCat.providers || []);
  const allRails  = (railCat.rails || []);
  const markers   = (railCat.markers || {});
  const modelsBy  = (railCat.models || {});

  const railsFor = (p) => allRails.filter(r => r.provider === p);
  const classesFor = (p) => [...new Set(railsFor(p).map(r => r.loop_class))];
  const mechsFor = (p, lc) => railsFor(p).filter(r => r.loop_class === lc)
                                         .map(r => r.mechanism);
  const findRail = (p, lc, m) => allRails.find(
    r => r.provider === p && r.loop_class === lc && r.mechanism === m) || null;
  const providerPiped = (p) => railsFor(p).some(r => r.piped);

  const firstPiped = allRails.find(r => r.piped) || allRails[0] || {};
  let cur = {
    provider:   t.provider   || firstPiped.provider   || '',
    loop_class: t.loop_class || firstPiped.loop_class || '',
    mechanism:  t.mechanism  || firstPiped.mechanism  || '',
  };

  const provSel = el('select', 'ts-sel');
  const classSel = el('select', 'ts-sel');
  const mechSel = el('select', 'ts-sel');
  const modelSel = el('select', 'ts-sel');

  for (const p of providers) {
    const piped = providerPiped(p.id);
    provSel.appendChild(option(p.id, piped ? p.label : `${p.label} · not piped`,
                               p.id === cur.provider));
  }
  const provRow = row('provider', provSel, null, identBox);
  identBox.appendChild(el('div', 'ts-hint', ''));
  const provHint = identBox.lastElementChild;

  const classRow = row('loop class', classSel, null, identBox);


  const modelRow = row('model', modelSel, null, identBox);
  if (isAddTrack) { modelRow.style.display = 'none'; }

  const showRow = (r, hint, on) => {
    r.style.display = on ? '' : 'none';
    if (hint) hint.style.display = on ? '' : 'none';
  };

  function fillSel(sel, values, chosen, labeller) {
    sel.innerHTML = '';
    for (const v of values) sel.appendChild(option(v, labeller(v), v === chosen));
    return sel.value;
  }

  let rail = null;
  let reopenOn = null;
  let presetPick = '';
  let railSeen = null;

  function syncRail() {
    cur.provider = provSel.value;

    const classes = classesFor(cur.provider);
    if (!classes.includes(cur.loop_class)) cur.loop_class = classes[0] || '';
    cur.loop_class = fillSel(classSel, classes, cur.loop_class, lc => lc);
    classSel.disabled = classes.length <= 1;
    classRow.classList.toggle('ts-locked', classSel.disabled);
    showRow(classRow, null, !isAddTrack && classes.length > 0);

    const mechs = mechsFor(cur.provider, cur.loop_class);
    const mechsNonSdk = mechs.filter(m => m !== 'sdk');
    cur.mechanism = mechsNonSdk.length ? mechsNonSdk[0] : (mechs[0] || '');
    mechSel.innerHTML = '';
    if (cur.mechanism) mechSel.appendChild(option(cur.mechanism, cur.mechanism, true));

    rail = findRail(cur.provider, cur.loop_class, cur.mechanism);

    const own = modelsBy[cur.provider];
    const list = Array.isArray(own) ? own : modelList;
    if (!list.length) {
      modelSel.innerHTML = '';
      modelSel.appendChild(option('', `no ${cur.provider} models available`, true));
    } else {
      const keep = list.includes(modelSel.value) ? modelSel.value
                 : (list.includes(t.model) ? t.model : list[0]);
      fillSel(modelSel, list, keep, m => m);
    }

    const notPiped = rail && !rail.piped;
    provHint.textContent = rail
      ? (notPiped ? `${rail.label} — NOT PIPED: fully described, not yet wired to run a turn`
                  : rail.label)
      : 'no rail — pick a provider';
    provHint.classList.toggle('ts-warn', !!notPiped);
    showRow(provRow, provHint, !isAddTrack);
  }

  provSel.addEventListener('change', () => { cur.loop_class = ''; cur.mechanism = '';
                                             syncRail(); renderParams(); });
  classSel.addEventListener('change', () => { cur.loop_class = classSel.value;
                                              cur.mechanism = '';
                                              syncRail(); renderParams(); });

  register('provider', provSel, () => provSel.value, 'change');
  register('loop_class', classSel, () => classSel.value, 'change');
  register('mechanism', mechSel, () => mechSel.value, 'change');
  register('model', modelSel, () => modelSel.value, 'change');

  const seatSel = el('select', 'ts-sel');
  seatSel.appendChild(option('', 'bare model (no seat)', !t.seat));
  for (const c of crewList) {
    const nick = (c && c.nick) || '';
    if (!nick) continue;
    seatSel.appendChild(option(nick, c.tag ? `${nick} · ${c.tag}` : nick, nick === t.seat));
  }
  const seatRow = row('crew seat', seatSel, null, identBox);
  register('seat', seatSel, () => seatSel.value, 'change');
  if (isAddTrack) seatRow.style.display = 'none';





  const rootBlock = el('div');

  const rootIn = el('input', 'ts-in mono');
  rootIn.type = 'hidden';
  rootIn.value = t.root || '';
  register('root', rootIn, () => (rootIn.value || '').trim());

  let sessionRoot = '';
  fetch('/api/settings/browse')
    .then(r => r.json())
    .then(data => { sessionRoot = (data && data.path) || ''; syncRootDisp(); })
    .catch(() => {});

  const rootCtl = el('div', 'ts-rootctl');
  const rootDisp = el('button', 'ts-in mono ts-rootdisp ts-rootpick', '');
  rootDisp.type = 'button';
  rootCtl.appendChild(rootDisp);
  rootCtl.appendChild(rootIn);

  row('root', rootCtl,
    'the working directory this agent runs in — the value passed as the subprocess cwd, which decides its CLAUDE.md chain, git-status block, and project/local settings scopes. Click the path to pick a folder.',
    rootBlock);

  const currentRoot = () => (rootIn.value || '').trim() || sessionRoot;
  const rootWatchers = [];
  function syncRootDisp() {
    rootDisp.textContent = rootIn.value
      || (sessionRoot ? `(not set — runs at the session root: ${sessionRoot})`
                     : '(not set — runs at the session root)');
    rootDisp.title = rootIn.value ? `${rootIn.value} — click to change`
                                  : 'click to pick a folder';
    for (const fn of rootWatchers) { try { fn(currentRoot()); } catch (_) {} }
  }
  rootIn.addEventListener('input', syncRootDisp);
  syncRootDisp();

  const rootPop = ensureFieldPopout('ts-rootmodal', 'Agent root',
    'Browse the filesystem and pick a folder. Select copies the path into root — nothing else changes; the server still validates it on submit.');
  const rootPathLine = el('div', 'ts-rootpath mono');
  const rootListBox = el('div', 'ts-rootlist');
  const rootSelectRow = el('div', 'ts-popbtnrow');
  const rootSelectBtn = el('button', 'ts-ctxbtn', 'Select');
  rootSelectBtn.type = 'button';
  rootSelectRow.appendChild(rootSelectBtn);
  rootPop.body.appendChild(rootPathLine);
  rootPop.body.appendChild(rootListBox);
  rootPop.body.appendChild(rootSelectRow);

  let browsePath = '/';
  const parentOf = (p) => {
    const trimmed = p.replace(/\/+$/, '');
    const idx = trimmed.lastIndexOf('/');
    return idx > 0 ? trimmed.slice(0, idx) : '/';
  };
  const joinPath = (base, name) => (base === '/' ? '/' + name : base + '/' + name);

  function loadDirs(path) {
    rootPathLine.textContent = path;
    rootListBox.innerHTML = '';
    rootListBox.appendChild(el('div', 'ts-gscope', 'loading…'));
    fetch('/api/fs/browse?path=' + encodeURIComponent(path))
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          rootListBox.innerHTML = '';
          rootListBox.appendChild(el('div', 'ts-gscope', data.error));
          return;
        }
        browsePath = data.path || path;
        rootPathLine.textContent = browsePath;
        rootListBox.innerHTML = '';
        if (browsePath !== '/') {
          const up = el('div', 'ts-rootitem', '.. (up one level)');
          up.addEventListener('click', () => loadDirs(parentOf(browsePath)));
          rootListBox.appendChild(up);
        }
        const dirs = Array.isArray(data.dirs) ? data.dirs : [];
        if (!dirs.length) rootListBox.appendChild(el('div', 'ts-gscope', 'no subfolders'));
        for (const name of dirs) {
          const item = el('div', 'ts-rootitem', name);
          item.addEventListener('click', () => loadDirs(joinPath(browsePath, name)));
          rootListBox.appendChild(item);
        }
      })
      .catch(() => {
        rootListBox.innerHTML = '';
        rootListBox.appendChild(el('div', 'ts-gscope', 'browse failed'));
      });
  }

  rootDisp.addEventListener('click', () => {
    loadDirs('/');
    rootPop.open();
  });
  rootSelectBtn.addEventListener('click', () => {
    rootIn.value = browsePath;
    rootIn.dispatchEvent(new Event('input', { bubbles: true }));
    rootPop.close();
  });

  if (isAddTrack) { rootBlock.style.display = 'none'; }

  const region = blankRegion(null);



  const foldBox = el('details', 'ts-adv');
  foldBox.appendChild(el('summary', null, 'advanced — sampling'));
  const foldGrid = el('div', 'ts-grid');
  foldBox.appendChild(foldGrid);
  secSession.tail.appendChild(foldBox);
  secSession.tail.appendChild(rootBlock);

  const advBox = el('details', 'ts-adv');
  advBox.appendChild(el('summary', null, 'advanced'));
  const advBody = el('div', 'ts-advbody');
  advBox.appendChild(advBody);
  secContext.tail.appendChild(advBox);

  if (isAddTrack) {
    secSession.show(false);
    secContext.show(false);
    secTools.show(false);
    secPresets.show(false);
  }

  const paramDraft = {};



  let lastResolved = null;

  const INHERIT_ROWS = {
    claude_output_style:    { prov: 'outputStyle',       get: r => r.overlay && r.overlay.outputStyle },
    claude_md_excludes:     { prov: 'claudeMdExcludes',  get: r => r.overlay && r.overlay.claudeMdExcludes },
    claude_setting_sources: { prov: 'setting_sources',   get: r => r.setting_sources },
    claude_config_dir:      { prov: 'config_dir',        get: r => r.config_dir },
    claude_system_prompt:   { prov: 'system_prompt',     get: r => r.system_prompt },
    claude_bare:            { prov: 'bare',              get: r => r.bare },
  };

  function fmtInherited(v) {
    if (v === undefined || v === null || v === '') return '';
    if (Array.isArray(v)) return v.length + (v.length === 1 ? ' entry: ' : ' entries: ') + v.join(' · ');
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    const str = String(v);
    if (str.length > 120) return str.slice(0, 117).replace(/\s+\S*$/, '') + '… (' + str.length + ' chars)';
    return str;
  }

  function rowFor(key, label, ctl, hint, parent) {
    const r = row(label, ctl, hint, parent);
    r.dataset.tsKey = key;
    return r;
  }

  function applyInherited() {
    for (const stale of wrap.querySelectorAll('.ts-inherit')) stale.remove();
    if (!lastResolved) return;
    const provenance = lastResolved.provenance || {};
    for (const [key, spec] of Object.entries(INHERIT_ROWS)) {
      const layer = provenance[spec.prov];
      if (layer !== 'preset' && layer !== 'file') continue;
      const r = wrap.querySelector('[data-ts-key="' + key + '"]');
      if (!r) continue;
      const shown = fmtInherited(spec.get(lastResolved));
      if (!shown) continue;
      const note = el('div', 'ts-inherit');
      note.appendChild(el('span', 'ts-inherit-tag', 'in force · ' + layer));
      note.appendChild(el('span', 'ts-inherit-val', shown));
      r.insertAdjacentElement('afterend', note);
    }
  }

  function warnSym(level) {
    return el('i', 'ts-marksym', level === 'red' ? '⛔' : '⚠');
  }
  const stripSym = (txt) => String(txt == null ? '' : txt).replace(/^\s*[⚠⛔]\s*/, '');

  function markerNode(key) {
    const m = markers[key];
    if (!m) return null;
    const level = m.level === 'red' ? 'red' : 'warn';
    const n = el('div', `ts-marker ts-marker-${level}`);
    n.appendChild(warnSym(level));
    n.appendChild(el('b', null, stripSym(m.title)));
    n.appendChild(el('span', null, m.text));
    return n;
  }

  function buildControl(key, spec, live) {
    if (spec.type === 'bool') {
      const lab = el('label', 'ts-check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = (live != null) ? !!live : !!spec.def;
      lab.appendChild(box);
      lab.appendChild(el('span', null, spec.text || spec.label));
      return { ctl: lab, node: box, read: () => box.checked, evt: 'change' };
    }
    if (spec.type === 'sel') {
      const sel = el('select', 'ts-sel');
      const chosen = (live != null) ? String(live) : String(spec.def == null ? '' : spec.def);
      for (const [v, l] of (spec.opts || [])) sel.appendChild(option(v, l, v === chosen));
      return { ctl: sel, node: sel, read: () => sel.value, evt: 'change' };
    }
    if (spec.type === 'area') {
      const ta = el('textarea', 'ts-in mono');
      ta.rows = 3;
      ta.value = (live != null) ? live : '';
      return { ctl: ta, node: ta, read: () => ta.value };
    }
    if (spec.type === 'text') {
      const inp = el('input', 'ts-in mono');
      inp.type = 'text';
      inp.spellcheck = false;
      inp.value = (live != null) ? live : '';
      return { ctl: inp, node: inp, read: () => (inp.value || '').trim() };
    }
    const inp = el('input', 'ts-in' + (spec.fold ? ' mono' : ''));
    inp.type = 'number';
    if (spec.step) inp.step = spec.step;
    inp.value = (live != null) ? live : (spec.def != null ? spec.def : '');
    if (spec.def == null) inp.placeholder = spec.fold ? 'auto' : 'blank';
    return { ctl: inp, node: inp, read: () => readNum(inp, key) };
  }


  function liveOf(key, fallback) {
    if (key in paramDraft) return paramDraft[key];
    const v = settings[key];
    return (v === undefined) ? fallback : v;
  }
  function pushParamField(key, read) {
    const f = { key, owner: 'param', dirty: (key in paramDraft), read };
    fields.push(f);
    return f;
  }

  function makeFolderPicker(cls, title, subtitle, onPick) {
    const pop = ensureFieldPopout(cls, title, subtitle);
    const pathLine = el('div', 'ts-rootpath mono');
    const listBox = el('div', 'ts-rootlist');
    const btnRow = el('div', 'ts-popbtnrow');
    const selBtn = el('button', 'ts-ctxbtn', 'Select this folder');
    selBtn.type = 'button';
    btnRow.appendChild(selBtn);
    pop.body.appendChild(pathLine);
    pop.body.appendChild(listBox);
    pop.body.appendChild(btnRow);

    let here = '/';
    const upOf = (p) => {
      const trimmed = p.replace(/\/+$/, '');
      const idx = trimmed.lastIndexOf('/');
      return idx > 0 ? trimmed.slice(0, idx) : '/';
    };
    const join = (base, name) => (base === '/' ? '/' + name : base + '/' + name);

    function load(path) {
      pathLine.textContent = path;
      listBox.innerHTML = '';
      listBox.appendChild(el('div', 'ts-gscope', 'loading…'));
      fetch('/api/fs/browse?path=' + encodeURIComponent(path))
        .then(r => r.json())
        .then(data => {
          listBox.innerHTML = '';
          if (data.error) { listBox.appendChild(el('div', 'ts-gscope', data.error)); return; }
          here = data.path || path;
          pathLine.textContent = here;
          if (here !== '/') {
            const up = el('div', 'ts-rootitem', '.. (up one level)');
            up.addEventListener('click', () => load(upOf(here)));
            listBox.appendChild(up);
          }
          const dirs = Array.isArray(data.dirs) ? data.dirs : [];
          if (!dirs.length) listBox.appendChild(el('div', 'ts-gscope', 'no subfolders'));
          for (const name of dirs) {
            const item = el('div', 'ts-rootitem', name);
            item.addEventListener('click', () => load(join(here, name)));
            listBox.appendChild(item);
          }
        })
        .catch(() => {
          listBox.innerHTML = '';
          listBox.appendChild(el('div', 'ts-gscope', 'browse failed'));
        });
    }
    selBtn.addEventListener('click', () => { onPick(here); pop.close(); });
    return { open(start) { load(start || '/'); pop.open(); } };
  }

  function makeFilePicker(cls, title, subtitle, onPick) {
    const pop = ensureFieldPopout(cls, title, subtitle);
    const pathLine = el('div', 'ts-rootpath mono');
    const listBox = el('div', 'ts-rootlist');
    const noteBox = el('div', 'ts-filepreview');
    pop.body.appendChild(pathLine);
    pop.body.appendChild(listBox);
    pop.body.appendChild(noteBox);

    let here = '/';
    const upOf = (p) => {
      const trimmed = p.replace(/\/+$/, '');
      const idx = trimmed.lastIndexOf('/');
      return idx > 0 ? trimmed.slice(0, idx) : '/';
    };
    const join = (base, name) => (base === '/' ? '/' + name : base + '/' + name);

    function pick(path) {
      noteBox.innerHTML = '';
      noteBox.appendChild(el('div', 'ts-gscope', 'reading…'));
      fetch('/api/fs/read?path=' + encodeURIComponent(path))
        .then(r => r.json())
        .then(data => {
          noteBox.innerHTML = '';
          if (data.error) { noteBox.appendChild(el('div', 'ts-resolved-warn', data.error)); return; }
          onPick(String(data.text == null ? '' : data.text), path);
          pop.close();
        })
        .catch(() => {
          noteBox.innerHTML = '';
          noteBox.appendChild(el('div', 'ts-resolved-warn', 'read failed'));
        });
    }

    function load(path) {
      pathLine.textContent = path;
      listBox.innerHTML = '';
      noteBox.innerHTML = '';
      listBox.appendChild(el('div', 'ts-gscope', 'loading…'));
      fetch('/api/fs/browse?path=' + encodeURIComponent(path))
        .then(r => r.json())
        .then(data => {
          listBox.innerHTML = '';
          if (data.error) { listBox.appendChild(el('div', 'ts-gscope', data.error)); return; }
          here = data.path || path;
          pathLine.textContent = here;
          if (here !== '/') {
            const up = el('div', 'ts-rootitem', '.. (up one level)');
            up.addEventListener('click', () => load(upOf(here)));
            listBox.appendChild(up);
          }
          const dirs = Array.isArray(data.dirs) ? data.dirs : [];
          const files = Array.isArray(data.files) ? data.files : [];
          if (!dirs.length && !files.length) listBox.appendChild(el('div', 'ts-gscope', 'empty'));
          for (const name of dirs) {
            const item = el('div', 'ts-rootitem', name + '/');
            item.addEventListener('click', () => load(join(here, name)));
            listBox.appendChild(item);
          }
          for (const name of files) {
            const item = el('div', 'ts-rootitem ts-fileitem', name);
            item.addEventListener('click', () => pick(join(here, name)));
            listBox.appendChild(item);
          }
        })
        .catch(() => {
          listBox.innerHTML = '';
          listBox.appendChild(el('div', 'ts-gscope', 'browse failed'));
        });
    }
    return { open(start) { load(start || '/'); pop.open(); } };
  }



  function buildClaudeToolsCtl() {
    const onRaw  = liveOf('claude_tools', []);
    const offRaw = liveOf('claude_disallowed_tools', []);
    const onList = new Set(Array.isArray(onRaw) ? onRaw : []);
    const offSet = new Set(Array.isArray(offRaw) ? offRaw : []);
    const virgin = !isEdit
      && !('claude_tools' in paramDraft) && !('claude_tools' in settings);




    const railId = cur.provider + '/' + cur.loop_class + '/' + cur.mechanism;
    const railHasRoster = !!(rail && (rail.params || []).includes('claude_tools'));
    const railChanged = (railSeen !== null && railSeen !== railId);
    railSeen = railId;

    const state = {};
    for (const n of CLAUDE_TOOL_NAMES) {
      state[n] = railChanged ? railHasRoster
               : virgin      ? true
               : (onList.has(n) && !offSet.has(n));
    }

    const fOn  = pushParamField('claude_tools',
                                () => CLAUDE_TOOL_NAMES.filter(n => state[n]));
    const fOff = pushParamField('claude_disallowed_tools',
                                () => CLAUDE_TOOL_NAMES.filter(n => !state[n]));
    if (virgin || railChanged) { fOn.dirty = true; fOff.dirty = true; }
    const touch = () => { fOn.dirty = true; fOff.dirty = true; };

    const ctl = el('div');
    const box = el('div', 'ts-gates ts-tools');
    for (const name of CLAUDE_TOOL_NAMES) {
      const r = el('div', 'ts-grow');
      r.appendChild(el('div', 'ts-gname', name));
      const sel = el('select', 'ts-hook');
      sel.appendChild(option('on', 'on', state[name]));
      sel.appendChild(option('off', 'off', !state[name]));
      const paint = () => {
        sel.classList.remove('green', 'red');
        sel.classList.add(sel.value === 'on' ? 'green' : 'red');
      };
      paint();
      sel.addEventListener('change', () => {
        state[name] = (sel.value === 'on');
        touch();
        paint();
      });
      r.appendChild(sel);
      box.appendChild(r);
    }
    ctl.appendChild(box);
    return ctl;
  }

  const SETTING_SOURCES = ['user', 'project', 'local'];
  function buildSourcesCtl(key) {
    const raw = liveOf(key, '');
    const saved = String(raw == null ? '' : raw)
      .split(',').map(s => s.trim()).filter(Boolean);
    const boxes = {};
    const f = pushParamField(key,
      () => SETTING_SOURCES.filter(s => boxes[s].checked).join(','));
    const ctl = el('div', 'ts-checkrow');
    for (const s of SETTING_SOURCES) {
      const lab = el('label', 'ts-check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = saved.length ? saved.includes(s) : true;
      box.addEventListener('change', () => { f.dirty = true; });
      boxes[s] = box;
      lab.appendChild(box);
      lab.appendChild(el('span', null, s));
      ctl.appendChild(lab);
    }
    return ctl;
  }

  function buildSysPromptCtl(key) {
    const ta = el('textarea', 'ts-in mono');
    ta.rows = 4;
    const raw = liveOf(key, '');
    ta.value = (raw == null) ? '' : String(raw);

    const ctl = el('div', 'ts-rootctl');
    ctl.appendChild(ta);
    const btnRow = el('div', 'ts-popbtnrow');
    const bypassBtn = el('button', 'ts-ctxbtn', 'bypass');
    bypassBtn.title = 'bypass — write a blank system prompt';
    bypassBtn.type = 'button';
    const fileBtn = el('button', 'ts-ctxbtn', 'load file…');
    fileBtn.title = 'load the CONTENTS of a file into this field';
    fileBtn.type = 'button';
    btnRow.appendChild(bypassBtn);
    btnRow.appendChild(fileBtn);
    ctl.appendChild(btnRow);

    const touched = () => ta.dispatchEvent(new Event('input', { bubbles: true }));
    bypassBtn.addEventListener('click', () => { ta.value = '   '; touched(); });
    const picker = makeFilePicker('ts-syspromptmodal', 'System prompt from a file',
      "Pick a file; its TEXT is loaded into the field. Nothing is stored as a path — the track carries the prompt itself.",
      (text) => { ta.value = text; touched(); });
    fileBtn.addEventListener('click', () => picker.open(currentRoot() || '/'));

    return { ctl, node: ta, read: () => ta.value };
  }

  function buildDirPickCtl(key, spec) {
    const inp = el('input', 'ts-in mono');
    inp.type = 'text';
    inp.spellcheck = false;
    const raw = liveOf(key, '');
    inp.value = (raw == null) ? '' : String(raw);
    inp.style.display = 'none';

    const ctl = el('div', 'ts-rootctl');
    const disp = el('div', 'ts-in mono ts-rootdisp', '');
    const btnRow = el('div', 'ts-popbtnrow');
    const pickBtn = el('button', 'ts-ctxbtn', 'browse…');
    pickBtn.title = 'browse for a folder';
    pickBtn.type = 'button';
    const clearBtn = el('button', 'ts-ctxbtn', 'clear');
    clearBtn.type = 'button';
    const manualBtn2 = el('button', 'ts-ctxbtn', 'manual');
    manualBtn2.title = 'type the path by hand';
    manualBtn2.type = 'button';
    btnRow.appendChild(pickBtn);
    btnRow.appendChild(clearBtn);
    btnRow.appendChild(manualBtn2);
    ctl.appendChild(disp);
    ctl.appendChild(btnRow);
    ctl.appendChild(inp);

    const unsetText = spec.unset || '(unset)';
    const sync = () => {
      disp.textContent = inp.value || unsetText;
      disp.title = inp.value || '';
      clearBtn.disabled = !inp.value;
    };
    inp.addEventListener('input', sync);
    sync();

    const picker = makeFolderPicker('ts-dirmodal-' + key, spec.label,
      'Browse the filesystem and pick a folder. Select copies the path into the field — nothing else changes.',
      (path) => {
        inp.value = path;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
    pickBtn.addEventListener('click', () => picker.open(inp.value || currentRoot() || '/'));
    clearBtn.addEventListener('click', () => {
      inp.value = '';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    manualBtn2.addEventListener('click', () => {
      const goingManual = inp.style.display === 'none';
      inp.style.display = goingManual ? '' : 'none';
      disp.style.display = goingManual ? 'none' : '';
      manualBtn2.textContent = goingManual ? 'done' : 'manual';
      if (goingManual) inp.focus();
    });

    return { ctl, node: inp, read: () => (inp.value || '').trim() };
  }

  function buildDirListCtl(key, spec) {
    const raw = liveOf(key, []);
    const chosen = Array.isArray(raw) ? raw.slice() : [];
    const f = pushParamField(key, () => chosen.slice());

    const ctl = el('div', 'ts-rootctl');
    const listBox = el('div', 'ts-checklist');
    const btnRow = el('div', 'ts-popbtnrow');
    const addBtn = el('button', 'ts-ctxbtn', 'add folder…');
    addBtn.title = 'browse for a folder to add';
    addBtn.type = 'button';
    btnRow.appendChild(addBtn);
    ctl.appendChild(listBox);
    ctl.appendChild(btnRow);

    function paint() {
      listBox.innerHTML = '';
      if (!chosen.length) {
        listBox.appendChild(el('div', 'ts-gscope', 'none — tools reach this track\'s root only'));
        return;
      }
      chosen.forEach((path, i) => {
        const r = el('div', 'ts-listrow');
        r.appendChild(el('div', 'ts-checkpath', path));
        const x = el('button', 'ts-ctxbtn', 'remove');
        x.type = 'button';
        x.addEventListener('click', () => { chosen.splice(i, 1); f.dirty = true; paint(); });
        r.appendChild(x);
        listBox.appendChild(r);
      });
    }
    paint();

    const picker = makeFolderPicker('ts-dirmodal-' + key, spec.label,
      'Each folder picked is added to the list. The flag repeats once per directory.',
      (path) => {
        if (!chosen.includes(path)) { chosen.push(path); f.dirty = true; paint(); }
      });
    addBtn.addEventListener('click', () => picker.open(currentRoot() || '/'));
    return ctl;
  }

  function buildStyleCtl(key) {
    const raw = liveOf(key, '');
    const savedName = (raw == null) ? '' : String(raw);
    const sel = el('select', 'ts-sel');
    sel.appendChild(option('', 'loading…', true));
    fetch('/api/claude/output-styles')
      .then(r => r.json())
      .then(data => {
        const styles = Array.isArray(data && data.styles) ? data.styles : [];
        sel.innerHTML = '';
        sel.appendChild(option('', 'CLI default', !savedName));
        const names = [];
        for (const s of styles) {
          const n = s && s.name;
          if (!n || names.includes(n)) continue;
          names.push(n);
          sel.appendChild(option(n, n, n === savedName));
        }
        if (savedName && !names.includes(savedName)) {
          sel.appendChild(option(savedName, `${savedName} · not found in ~/.claude/output-styles`, true));
        }
        if (!styles.length) {
          sel.appendChild(option('__none__', 'no output styles found', false));
          sel.querySelector('option[value="__none__"]').disabled = true;
        }
      })
      .catch(() => {
        sel.innerHTML = '';
        sel.appendChild(option('', 'CLI default', !savedName));
        if (savedName) sel.appendChild(option(savedName, savedName, true));
      });
    return { ctl: sel, node: sel, read: () => sel.value, evt: 'change' };
  }



  function buildMdExclCtl(key) {
    const raw = liveOf(key, []);
    const excluded = new Set(Array.isArray(raw) ? raw : []);
    const f = pushParamField(key, () => Array.from(excluded));

    const box = el('div', 'ts-checklist');
    const ctl = el('div', 'ts-rootctl');
    ctl.appendChild(box);

    function paintRow(path, where, missing) {
      const r = el('div', 'ts-listrow');
      const lab = el('label', 'ts-check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !excluded.has(path);
      cb.addEventListener('change', () => {
        if (cb.checked) excluded.delete(path); else excluded.add(path);
        f.dirty = true;
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', 'ts-checkpath', path));
      r.appendChild(lab);
      if (missing) r.appendChild(el('span', 'ts-flag', 'missing'));
      else if (where) r.appendChild(el('span', 'ts-gscope', where));
      box.appendChild(r);
    }

    function load(root) {
      box.innerHTML = '';
      box.appendChild(el('div', 'ts-gscope', 'looking…'));
      fetch('/api/claude/md-files?root=' + encodeURIComponent(root || ''))
        .then(r => r.json())
        .then(data => {
          box.innerHTML = '';
          const found = Array.isArray(data && data.files) ? data.files : [];
          const seen = new Set();
          for (const item of found) {
            if (!item || !item.path) continue;
            seen.add(item.path);
            paintRow(item.path, item.where, false);
          }
          for (const path of excluded) {
            if (!seen.has(path)) paintRow(path, '', true);
          }
          if (!found.length && !excluded.size) {
            box.appendChild(el('div', 'ts-gscope', 'no CLAUDE.md found'));
          }
          if (data && data.truncated) {
            box.appendChild(el('div', 'ts-resolved-warn',
              'enumeration truncated — too many files beneath this root'));
          }
        })
        .catch(() => {
          box.innerHTML = '';
          box.appendChild(el('div', 'ts-gscope', 'enumeration failed'));
        });
    }
    load(currentRoot());
    rootWatchers.push(load);
    return ctl;
  }

  function basename(path) {
    const trimmed = String(path || '').replace(/\/+$/, '');
    const idx = trimmed.lastIndexOf('/');
    return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  }

  function buildSettingsFilePopout(onSelect) {
    const pop = ensureFieldPopout('ts-filemodal', 'Settings file override (session only)',
      'Pick a settings.json to read at spawn time — never written back to disk. Only outputStyle, autoMemoryEnabled, and claudeMdExcludes carry into the overlay; everything else in the file is dropped (shown below when you open a file).');
    const pathLine = el('div', 'ts-rootpath mono');
    const listBox = el('div', 'ts-rootlist');
    const previewBox = el('div', 'ts-filepreview');
    pop.body.appendChild(pathLine);
    pop.body.appendChild(listBox);
    pop.body.appendChild(previewBox);

    let browsePath = '/';
    const parentOf = (p) => {
      const trimmed = p.replace(/\/+$/, '');
      const idx = trimmed.lastIndexOf('/');
      return idx > 0 ? trimmed.slice(0, idx) : '/';
    };
    const joinPath = (base, name) => (base === '/' ? '/' + name : base + '/' + name);

    function previewFile(path) {
      previewBox.innerHTML = '';
      previewBox.appendChild(el('div', 'ts-gscope', 'reading…'));
      fetch('/api/settings/read?path=' + encodeURIComponent(path))
        .then(r => r.json())
        .then(data => {
          previewBox.innerHTML = '';
          previewBox.appendChild(el('div', 'ts-filepath mono', path));
          const fvals = (data && data.fields) || {};
          const carried = Array.isArray(data && data.carried) ? data.carried : [];
          const dropped = Array.isArray(data && data.dropped) ? data.dropped : [];
          const warnings = Array.isArray(data && data.warnings) ? data.warnings : [];
          if (carried.length) {
            previewBox.appendChild(el('div', 'ts-ctxgroup', 'carries into the overlay'));
            for (const k of carried) {
              const v = fvals[k];
              const shown = (v === undefined || v === '' || (Array.isArray(v) && !v.length))
                ? '(empty)' : (Array.isArray(v) ? v.join(', ') : String(v));
              previewBox.appendChild(el('div', 'ts-gscope', `${k}: ${shown}`));
            }
          }
          if (dropped.length) {
            previewBox.appendChild(el('div', 'ts-ctxgroup', 'dropped — no sandbox field'));
            previewBox.appendChild(el('div', 'ts-gscope', dropped.join(', ')));
          }
          if (!carried.length && !dropped.length) {
            previewBox.appendChild(el('div', 'ts-gscope', 'nothing eligible found in this file'));
          }
          for (const w of warnings) previewBox.appendChild(el('div', 'ts-resolved-warn', w));

          const selRow = el('div', 'ts-popbtnrow');
          const selBtn = el('button', 'ts-ctxbtn', 'use this file');
          selBtn.type = 'button';
          selBtn.addEventListener('click', () => { onSelect(path); pop.close(); });
          selRow.appendChild(selBtn);
          previewBox.appendChild(selRow);
        })
        .catch(() => {
          previewBox.innerHTML = '';
          previewBox.appendChild(el('div', 'ts-gscope', 'read failed'));
        });
    }

    function load(path) {
      pathLine.textContent = path;
      listBox.innerHTML = '';
      previewBox.innerHTML = '';
      listBox.appendChild(el('div', 'ts-gscope', 'loading…'));
      fetch('/api/settings/browse?path=' + encodeURIComponent(path))
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            listBox.innerHTML = '';
            listBox.appendChild(el('div', 'ts-gscope', data.error));
            return;
          }
          browsePath = data.path || path;
          pathLine.textContent = browsePath;
          listBox.innerHTML = '';
          if (browsePath !== '/') {
            const up = el('div', 'ts-rootitem', '.. (up one level)');
            up.addEventListener('click', () => load(parentOf(browsePath)));
            listBox.appendChild(up);
          }
          const dirs = Array.isArray(data.dirs) ? data.dirs : [];
          const files = Array.isArray(data.files) ? data.files : [];
          if (!dirs.length && !files.length) listBox.appendChild(el('div', 'ts-gscope', 'empty'));
          for (const name of dirs) {
            const item = el('div', 'ts-rootitem', name + '/');
            item.addEventListener('click', () => load(joinPath(browsePath, name)));
            listBox.appendChild(item);
          }
          for (const name of files) {
            const item = el('div', 'ts-rootitem ts-fileitem', name);
            item.addEventListener('click', () => previewFile(joinPath(browsePath, name)));
            listBox.appendChild(item);
          }
        })
        .catch(() => {
          listBox.innerHTML = '';
          listBox.appendChild(el('div', 'ts-gscope', 'browse failed'));
        });
    }

    pop.load = load;
    return pop;
  }

  function buildSettingsFileBtn() {
    const live = ('claude_settings_file' in paramDraft) ? paramDraft.claude_settings_file
               : (settings.claude_settings_file || '');
    const f = { key: 'claude_settings_file', owner: 'param',
               dirty: 'claude_settings_file' in paramDraft,
               value: live, read: () => f.value };
    fields.push(f);

    const wrap2 = el('div', 'ts-filectl');
    const disp = el('div', 'ts-in mono ts-filedisp',
      live ? basename(live) : '(none — global default)');
    disp.title = live || '';
    const btnRow = el('div', 'ts-popbtnrow');
    const pickBtn = el('button', 'ts-ctxbtn', 'Browse…');
    pickBtn.type = 'button';
    const clearBtn = el('button', 'ts-ctxbtn', 'Clear');
    clearBtn.type = 'button';
    clearBtn.disabled = !live;
    btnRow.appendChild(pickBtn);
    btnRow.appendChild(clearBtn);
    wrap2.appendChild(disp);
    wrap2.appendChild(btnRow);

    const pop = buildSettingsFilePopout((path) => {
      f.value = path;
      f.dirty = true;
      disp.textContent = basename(path);
      disp.title = path;
      clearBtn.disabled = false;
    });
    pickBtn.addEventListener('click', () => { pop.load(f.value ? parentDirOf(f.value) : ''); pop.open(); });
    clearBtn.addEventListener('click', () => {
      f.value = '';
      f.dirty = true;
      disp.textContent = '(none — global default)';
      disp.title = '';
      clearBtn.disabled = true;
    });

    return wrap2;
  }

  function parentDirOf(path) {
    const trimmed = String(path).replace(/\/+$/, '');
    const idx = trimmed.lastIndexOf('/');
    return idx > 0 ? trimmed.slice(0, idx) : '/';
  }



  function buildPresetPicker() {
    const wrap = el('div', 'ts-filectl');
    const sel = el('select', 'ts-sel');
    sel.appendChild(option('', '(none saved)', true));
    const status = el('div', 'ts-gscope', '');
    const btnRow = el('div', 'ts-popbtnrow');
    const loadBtn = el('button', 'ts-ctxbtn', 'Load');
    loadBtn.type = 'button';
    loadBtn.disabled = true;
    const saveBtn = el('button', 'ts-ctxbtn', 'Save…');
    saveBtn.type = 'button';
    const renBtn = el('button', 'ts-ctxbtn', 'Rename');
    renBtn.type = 'button';
    renBtn.disabled = true;
    const delBtn = el('button', 'ts-ctxbtn', 'Delete');
    delBtn.type = 'button';
    delBtn.disabled = true;
    btnRow.appendChild(loadBtn);
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(renBtn);
    btnRow.appendChild(delBtn);
    wrap.appendChild(sel);
    wrap.appendChild(btnRow);
    wrap.appendChild(status);

    function syncButtons() {
      const has = !!sel.value;
      loadBtn.disabled = !has || !isEdit;
      renBtn.disabled = !has;
      delBtn.disabled = !has;
    }
    sel.addEventListener('change', syncButtons);
    if (!isEdit) {
      sel.addEventListener('change', () => {
        presetPick = sel.value || '';
        status.textContent = sel.value
          ? `applies to the region when it is created`
          : '';
      });
    }

    function refreshList(selectName) {
      fetch('/api/settings/browse?presets=claude')
        .then(r => r.json())
        .then(data => {
          const names = Array.isArray(data.names) ? data.names : [];
          sel.innerHTML = '';
          sel.appendChild(option('', names.length ? '(choose a preset)' : '(none saved)', true));
          for (const n of names) sel.appendChild(option(n, n, n === selectName));
          syncButtons();
        })
        .catch(() => { status.textContent = 'list failed'; });
    }

    loadBtn.addEventListener('click', () => {
      if (!isEdit || !sel.value) return;
      const chosen = sel.value;
      status.textContent = 'loading…';
      let done = false;
      const onList = (ev) => {
        if (done) return;
        const rows = (ev && ev.detail && ev.detail.tracks) || [];
        const fresh = rows.find((r) => r && r.id === t.id);
        if (!fresh) return;
        done = true;
        window.removeEventListener('ade:track_list', onList);
        clearTimeout(timer);
        if (reopenOn) reopenOn(fresh);
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener('ade:track_list', onList);
        status.textContent = `sent — reopen this menu to see ${chosen}'s fields (warnings, if any, print to this track's log)`;
      }, 4000);
      window.addEventListener('ade:track_list', onList);
      send({ type: 'load_preset', track: t.id, name: chosen });
    });

    saveBtn.addEventListener('click', () => {
      if (!isEdit) { status.textContent = 'save needs an existing track'; return; }
      const target = sel.value;
      const pop = ensureFieldPopout('ts-presetsave',
        'Claude preset',
        "writes what is in force on this track right now — the fields you see plus whatever the loaded preset supplies under them");

      const panelFields = () => {
        const out = collect();
        const ov = overlayRows();
        if (ov) out.overlay = ov;
        return out;
      };

      if (target) {
        const upRow = el('div', 'ts-saverow');
        const upBtn = el('button', 'ts-ctxbtn', 'Update ' + target);
        upBtn.type = 'button';
        upBtn.addEventListener('click', () => {
          send({ type: 'save_preset', track: t.id, name: target,
                 fields: panelFields() });
          status.textContent = 'updated ' + target;
          pop.close();
          setTimeout(() => refreshList(target), 250);
        });
        upRow.appendChild(upBtn);
        upRow.appendChild(el('div', 'ts-hint', 'overwrite the selected preset in place — no name to give'));
        pop.body.appendChild(upRow);
        pop.body.appendChild(el('div', 'ts-savesep', 'or'));
      }

      const newRow = el('div', 'ts-saverow');
      const nameIn2 = el('input', 'ts-in');
      nameIn2.type = 'text';
      nameIn2.placeholder = 'new preset name';
      const newBtn = el('button', 'ts-ctxbtn', 'Save as new');
      newBtn.type = 'button';
      const doSave = () => {
        const name = (nameIn2.value || '').trim();
        if (!name) { nameIn2.focus(); return; }
        send({ type: 'save_preset', track: t.id, name, fields: panelFields() });
        status.textContent = 'saved ' + name;
        pop.close();
        setTimeout(() => refreshList(name), 250);
      };
      newBtn.addEventListener('click', doSave);
      nameIn2.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSave(); }
      });
      const newCtl = el('div', 'ts-filectl');
      newCtl.appendChild(nameIn2);
      newCtl.appendChild(newBtn);
      newRow.appendChild(newCtl);
      newRow.appendChild(el('div', 'ts-hint',
        'a name already in the list is overwritten, same as Update'));
      pop.body.appendChild(newRow);

      pop.open();
      nameIn2.focus();
    });
    renBtn.addEventListener('click', () => {
      if (!sel.value) return;
      const name = (window.prompt('Rename preset ' + sel.value + ' to:', sel.value) || '').trim();
      if (!name || name === sel.value) return;
      send({ type: 'rename_preset', old_name: sel.value, new_name: name });
      status.textContent = 'renamed';
      setTimeout(() => refreshList(name), 250);
    });
    delBtn.addEventListener('click', () => {
      if (!sel.value) return;
      if (!window.confirm('Delete preset ' + sel.value + '? This cannot be undone.')) return;
      const gone = sel.value;
      send({ type: 'delete_preset', name: gone });
      status.textContent = 'deleted';
      setTimeout(() => refreshList(''), 250);
    });

    refreshList(settings.claude_preset
                || (!isEdit ? presetPick : '') || '');
    if (!isEdit && presetPick) status.textContent = 'applies to the region when it is created';
    return wrap;
  }

  function renderParams() {
    for (const f of fields) {
      if (f.owner === 'param' && f.dirty) {
        const v = f.read();
        if (v !== undefined) paramDraft[f.key] = v;
      }
    }
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i].owner === 'param') fields.splice(i, 1);
    }
    secSession.box.innerHTML = '';
    secContext.box.innerHTML = '';
    secTools.box.innerHTML = '';
    secPresets.box.innerHTML = '';
    foldGrid.innerHTML = '';
    advBody.innerHTML = '';
    rootWatchers.length = 0;

    const keys = (rail && rail.params) || [];
    const unwired = (rail && rail.unwired) || [];

    if (!keys.length && !unwired.length) {
      secSession.box.appendChild(el('div', 'ts-gscope',
        'no parameters on this rail — the loop is deferred, not absent'));
    }

    const repl = (rail && rail.replaces) || null;
    if (repl && repl.max_tools) {
      secTools.box.appendChild(el('div', 'ts-swap',
        `tool budget → ${repl.max_tools.join(' + ')} · our per-turn counter ` +
        `cannot apply when the model owns the loop`));
    }

    const present = new Set(keys);
    const drawn = new Set();
    let toolsDrawn = false;

    function drawKey(key, parent) {
      const spec = FIELD_SPECS[key];
      if (!spec) return;
      drawn.add(key);

      if (spec.type === 'toolset') {
        if (toolsDrawn) return;
        toolsDrawn = true;
        drawn.add('claude_tools');
        drawn.add('claude_disallowed_tools');
        parent.appendChild(el('div', 'ts-ctxgroup', 'claude tools'));
        parent.appendChild(buildClaudeToolsCtl());
        parent.appendChild(el('div', 'ts-hint',
          'on = the tool is in the roster (--tools). off = it is removed from it ' +
          '(--disallowedTools, measured to take the tool off the advertised list, ' +
          'not merely refuse it). Every tool off = tools off entirely, and the ' +
          'PreToolUse gate is not registered.'));
        return;
      }
      if (spec.type === 'settingsfile') {
        rowFor(key, spec.label, buildSettingsFileBtn(), spec.hint, parent);
        return;
      }
      if (spec.type === 'stackpreset') {
        rowFor(key, spec.label, buildPresetPicker(), spec.hint, parent);
        return;
      }
      if (spec.type === 'sources') {
        rowFor(key, spec.label, buildSourcesCtl(key), spec.hint, parent);
        return;
      }
      if (spec.type === 'dirlist') {
        rowFor(key, spec.label, buildDirListCtl(key, spec), spec.hint, parent);
        return;
      }
      if (spec.type === 'mdexcl') {
        rowFor(key, spec.label, buildMdExclCtl(key), spec.hint, parent);
        return;
      }

      const live = (key in paramDraft) ? paramDraft[key] : settings[key];
      const c = spec.type === 'sysprompt' ? buildSysPromptCtl(key)
              : spec.type === 'dirpick'   ? buildDirPickCtl(key, spec)
              : spec.type === 'style'     ? buildStyleCtl(key)
              : buildControl(key, spec, live);
      rowFor(key, spec.label, c.ctl, spec.fold ? null : spec.hint, parent);
      const f = register(key, c.node, c.read, c.evt);
      f.owner = 'param';
      if (key in paramDraft) f.dirty = true;
      if (spec.warn) {
        const w = el('div', 'ts-marker ts-marker-warn');
        w.appendChild(warnSym('warn'));
        w.appendChild(el('b', null, stripSym(spec.warn.title)));
        w.appendChild(el('span', null, spec.warn.text));
        parent.appendChild(w);
      }
      const mk = markerNode(spec.marker || key);
      if (mk) parent.appendChild(mk);
    }

    for (const [sec, sectionKeys] of Object.entries(SECTION_KEYS)) {
      const parent = sec === 'advanced' ? advBody : SECTION_BOX[sec].box;
      for (const key of sectionKeys) {
        if (present.has(key)) drawKey(key, parent);
      }
    }

    for (const key of keys) {
      if (drawn.has(key)) continue;
      const spec = FIELD_SPECS[key];
      if (!spec) continue;
      if (spec.fold) { drawKey(key, foldGrid); continue; }
      if (SECTION_OF[key]) continue;
      drawKey(key, secSession.box);
    }

    for (const u of unwired) {
      const spec = FIELD_SPECS[u.key];
      if (!spec) continue;
      const parent = (SECTION_BOX[SECTION_OF[u.key]] || secSession).box;
      const c = buildControl(u.key, spec, undefined);
      c.node.disabled = true;
      const r = row(spec.label, c.ctl, u.why, parent);
      r.classList.add('ts-locked');
      const mk = markerNode(u.marker);
      if (mk) parent.appendChild(mk);
    }

    foldBox.classList.toggle('ts-hidden', !foldGrid.children.length);
    advBox.classList.toggle('ts-hidden', !advBody.children.length);

    if (!isAddTrack) {
      secSession.show(true);
      secContext.show(!!(secContext.box.children.length || advBody.children.length));
      secTools.show(true);
      secPresets.show(!!secPresets.box.children.length);
    }

    applyInherited();
  }


  const RESOLVED_ROWS = [
    { key: 'outputStyle',       get: r => r.overlay && r.overlay.outputStyle },
    { key: 'autoMemoryEnabled', get: r => r.overlay && r.overlay.autoMemoryEnabled },
    { key: 'claudeMdExcludes',  get: r => r.overlay && r.overlay.claudeMdExcludes },
    { key: 'setting_sources',   get: r => r.setting_sources },
    { key: 'config_dir',        get: r => r.config_dir },
    { key: 'system_prompt',     get: r => r.system_prompt },
    { key: 'bare',              get: r => r.bare },
  ];
  function fmtResolvedVal(v) {
    if (v === undefined || v === null || v === '') return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
  }

  const resolvedBox = el('div', 'ts-resolved');
  secResolved.tail.appendChild(resolvedBox);
  const resolvedBtnRow = el('div', 'ts-popbtnrow');
  const resolvedRefreshBtn = el('button', 'ts-ctxbtn', 'refresh');
  resolvedRefreshBtn.type = 'button';
  resolvedBtnRow.appendChild(resolvedRefreshBtn);
  secResolved.tail.appendChild(resolvedBtnRow);
  secResolved.tail.appendChild(el('div', 'ts-hint',
    "reflects the track's last SAVED settings — Save, then refresh, to see an edit made above"));

  function resolveTrackId() {
    if (isEdit) return t.id || '';
    if (mode === 'add') return trackSel ? trackSel.value : '';
    return '';
  }

  function loadResolved() {
    const trackId = resolveTrackId();
    resolvedBox.innerHTML = '';
    if (!trackId) {
      resolvedBox.appendChild(el('div', 'ts-gscope',
        isAddTrack ? 'no track yet — appears once this track exists' : 'choose a track above first'));
      return;
    }
    resolvedBox.appendChild(el('div', 'ts-gscope', 'loading…'));
    fetch('/api/settings/resolved?track=' + encodeURIComponent(trackId))
      .then(r => r.json())
      .then(data => {
        resolvedBox.innerHTML = '';
        lastResolved = data || null;
        applyInherited();
        const provenance = (data && data.provenance) || {};
        for (const rr of RESOLVED_ROWS) {
          const layer = provenance[rr.key] || 'global';
          const val = layer === 'global' ? '' : fmtResolvedVal(rr.get(data || {}));
          const line = el('div', 'ts-resolved-row');
          line.appendChild(el('div', 'ts-resolved-key', rr.key));
          line.appendChild(el('div', 'ts-resolved-val', val));
          line.appendChild(el('div', `ts-resolved-prov ts-resolved-prov-${layer}`, layer));
          resolvedBox.appendChild(line);
        }
        const warnings = Array.isArray(data && data.warnings) ? data.warnings : [];
        if (warnings.length) {
          const wbox = el('div', 'ts-resolved-warns');
          for (const w of warnings) wbox.appendChild(el('div', 'ts-resolved-warn', w));
          resolvedBox.appendChild(wbox);
        }
      })
      .catch(() => {
        resolvedBox.innerHTML = '';
        resolvedBox.appendChild(el('div', 'ts-gscope', 'resolved-stack read failed'));
      });
  }
  resolvedRefreshBtn.addEventListener('click', loadResolved);
  if (mode === 'add' && trackSel) trackSel.addEventListener('change', loadResolved);
  if (isAddTrack) { secResolved.show(false); }
  loadResolved();

  const gatesHost = secTools.tail;



  gatesHost.appendChild(el('div', 'ts-ctxgroup', 'region reset'));
  const resetLab = el('label', 'ts-check');
  const resetBox = el('input');
  resetBox.type = 'checkbox';
  resetBox.checked = settings.allow_agent_reset !== false;
  resetLab.appendChild(resetBox);
  resetLab.appendChild(el('span', null, 'an agent may reset this region'));
  row('agent reset', resetLab,
      'off: nothing an agent does can reset this region · on: a reset throws away '
      + 'its transcript, context and cache and stands the same agent back up on '
      + 'this track with these settings · a human still approves each one at the '
      + 'reset_self / reset_region gate below',
      gatesHost);
  register('allow_agent_reset', resetBox, () => resetBox.checked, 'change');





  const capIn = el('input', 'ts-in ts-num-k');
  capIn.type = 'text';
  capIn.inputMode = 'numeric';
  capIn.autocomplete = 'off';
  capIn.placeholder = 'off';
  const capRaw = settings.context_reset_cap_k;
  capIn.value = (capRaw === undefined) ? String(CONTEXT_CAP_K_DEFAULT)
              : (capRaw === null || capRaw === '') ? '' : String(capRaw);
  capIn.addEventListener('input', () => {
    const cleaned = capIn.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (cleaned !== capIn.value) capIn.value = cleaned;
  });

  const capCtl = el('div', 'ts-kwrap');
  capCtl.appendChild(capIn);
  capCtl.appendChild(el('span', 'ts-kunit', 'k'));

  row('token cap', capCtl,
      'hard reset at this many THOUSAND tokens of context (cache_read_peak, the '
      + "ledger's Read Peak column) · at 75% the agent is told at its next tool "
      + 'call and its chip flashes red, so it can write down what it needs to '
      + 'survive · crossing it is not a gate: the region comes back new, with no '
      + 'transcript, no context and no cache · blank = off',
      gatesHost);
  register('context_reset_cap_k', capIn, () => readNum(capIn, 'context_reset_cap_k'));

 
  const startLab = el('label', 'ts-check');
  const startBox = el('input');
  startBox.type = 'checkbox';
  startBox.checked = settings.start_turn_on_reset !== false;
  startLab.appendChild(startBox);
  startLab.appendChild(el('span', null, 'the region that comes back takes a turn'));
  row('start turn on reset', startLab,
      'on: the fresh region wakes immediately and acts — note or no note, mail '
      + 'or no mail · off: it sits idle until something prompts it',
      gatesHost);
  register('start_turn_on_reset', startBox, () => startBox.checked, 'change');

 
  const resetNoteTa = el('textarea', 'ts-in mono');
  resetNoteTa.rows = 4;
  resetNoteTa.placeholder = 'left empty, it comes back silent';
  const resetNoteRaw = settings.reset_instruction;
  resetNoteTa.value = (resetNoteRaw == null)
    ? RESET_INSTRUCTION_DEFAULT : String(resetNoteRaw);

  const resetNoteCtl = el('div', 'ts-rootctl');
  resetNoteCtl.appendChild(resetNoteTa);
  const resetNoteBtns = el('div', 'ts-popbtnrow');
  const resetNoteClear = el('button', 'ts-ctxbtn', 'clear');
  resetNoteClear.title = 'clear — the region comes back silent';
  resetNoteClear.type = 'button';
  const resetNoteFile = el('button', 'ts-ctxbtn', 'load file…');
  resetNoteFile.title = 'load the CONTENTS of a file into this field';
  resetNoteFile.type = 'button';
  resetNoteBtns.appendChild(resetNoteClear);
  resetNoteBtns.appendChild(resetNoteFile);
  resetNoteCtl.appendChild(resetNoteBtns);

  const resetNoteTouched = () =>
    resetNoteTa.dispatchEvent(new Event('input', { bubbles: true }));
  const syncResetNote = () => { resetNoteClear.disabled = !resetNoteTa.value; };
  resetNoteTa.addEventListener('input', syncResetNote);
  syncResetNote();
  resetNoteClear.addEventListener('click', () => {
    resetNoteTa.value = '';
    resetNoteTouched();
  });
  const resetNotePicker = makeFilePicker('ts-resetnotemodal',
    'Reset instruction from a file',
    "Pick a file; its TEXT is loaded into the field. Nothing is stored as a path — the track carries the instruction itself.",
    (text) => { resetNoteTa.value = text; resetNoteTouched(); });
  resetNoteFile.addEventListener('click',
    () => resetNotePicker.open(currentRoot() || '/'));

  row('on reset, say', resetNoteCtl,
      'injected into the system prompt of the region that comes back — on every '
      + 'reset, never on a fresh spawn · whether it takes a turn is the switch '
      + 'above, not this field · empty: it comes back silent',
      gatesHost);
  register('reset_instruction', resetNoteTa, () => resetNoteTa.value, 'input');

  gatesHost.appendChild(el('div', 'ts-ctxgroup', 'gate overlay'));

  const overlayLive = (isEdit && Array.isArray(t.overlay)) ? t.overlay : [];
  const overlayMap = new Map();
  for (const r of overlayLive) {
    if (r && r.edge) overlayMap.set(`${r.edge}::${r.scope || 'any'}`, r.hook);
  }
  const overlayIsCustom = overlayLive.some(r => r && r.hook && r.hook !== 'ask');

  const modes = el('div', 'ts-modes');
  const mkMode = (val, title, sub, checked) => {
    const l = el('label', 'ts-mode');
    const r = el('input');
    r.type = 'radio'; r.name = 'ts-gatemode'; r.value = val; r.checked = checked;
    l.appendChild(r);
    l.appendChild(el('b', null, title));
    l.appendChild(el('span', null, sub));
    modes.appendChild(l);
    return r;
  };
  const rAll = mkMode('all', 'all gates on', 'every edge asks — the server pins the list', !overlayIsCustom);
  const rCustom = mkMode('custom', 'custom', 'set each edge yourself', overlayIsCustom);
  gatesHost.appendChild(modes);

  const gatesBox = el('div', 'ts-gates');
  const hookSelects = [];

  let gatesTouched = false;

  if (!edgeList.length) {
    rCustom.disabled = true;
    rAll.checked = true;
    gatesBox.appendChild(el('div', 'ts-gscope',
      'no gate catalog arrived from the server — custom is unavailable; ' +
      'this track takes the server-pinned all-ask table.'));
  } else {
    for (const e of edgeList) {
      const r = el('div', 'ts-grow');
      r.appendChild(el('div', 'ts-gname', e.edge));
      if (e.scope && e.scope !== 'any') r.appendChild(el('div', 'ts-gscope', e.scope));
      const sel = el('select', 'ts-hook');
      const realHook = overlayMap.get(`${e.edge}::${e.scope || 'any'}`);
      const initialHook = HOOKS.includes(realHook) ? realHook : (e.hook || 'ask');
      for (const h of HOOKS) sel.appendChild(option(h, h, h === initialHook));
      const paint = () => {
        sel.classList.remove('green', 'blue', 'yellow', 'red');
        sel.classList.add(hookColor(sel.value));
      };
      paint();
      sel.addEventListener('change', () => { gatesTouched = true; paint(); });
      r.appendChild(sel);
      gatesBox.appendChild(r);
      hookSelects.push({ e, sel, paint });
    }
  }
  gatesHost.appendChild(gatesBox);

  if (hookSelects.length) {
    const bulk = el('div', 'ts-bulk ts-gatebulk');
    bulk.appendChild(el('span', null, 'set all:'));
    for (const h of HOOKS) {
      const b = el('button', null, h);
      b.type = 'button';
      b.onclick = () => {
        gatesTouched = true;
        for (const hs of hookSelects) { hs.sel.value = h; hs.paint(); }
      };
      bulk.appendChild(b);
    }
    gatesBox.parentNode.insertBefore(bulk, gatesBox.nextSibling);
  }

  const syncGates = () => {
    const custom = rCustom.checked;
    gatesBox.style.opacity = custom ? '1' : '0.45';
    for (const hs of hookSelects) hs.sel.disabled = !custom;
    const bulkBtns = gatesHost.querySelectorAll('.ts-gatebulk button');
    bulkBtns.forEach(b => { b.disabled = !custom; });
  };
  rAll.addEventListener('change', () => { gatesTouched = true; syncGates(); });
  rCustom.addEventListener('change', () => { gatesTouched = true; syncGates(); });
  syncGates();



  function collect() {
    const out = {};
    for (const f of fields) {
      if (!f.dirty) continue;
      const v = f.read();
      if (v === undefined) continue;
      out[f.key] = v;
    }
    if (RAIL_KEYS.some(k => k in out)) {
      out.provider   = provSel.value;
      out.loop_class = classSel.value;
      out.mechanism  = mechSel.value;
    }
    return out;
  }

  const rows = (hook) => hookSelects.map(({ e, sel }) => ({
    edge: e.edge,
    driver: 'model',
    scope: e.scope || 'any',
    hook: hook || sel.value,
  }));

  function overlayRows() {
    if (!gatesTouched) return null;
    if (rCustom.checked) return rows(null);
    if (isEdit && hookSelects.length) return rows('ask');
    return null;
  }

  syncRail();
  renderParams();

  if (isEdit) {
    const sh = el('div', 'ts-shell');
    const btn = el('button', null, 'close shell');
    btn.type = 'button';
    btn.onclick = () => {
      send({ type: 'close_shell', track: t.id });
      btn.textContent = 'shell closed';
      btn.disabled = true;
    };
    sh.appendChild(btn);
    sh.appendChild(el('span', null, "ends this track's terminal — it respawns at the current root when you next type in it"));
    wrap.appendChild(sh);

    const del = el('div', 'ts-shell');
    const delBtn = el('button', null, 'delete track');
    delBtn.type = 'button';
    delBtn.onclick = () => {
      send({ type: 'kill_track', track: t.id });
      delBtn.textContent = 'deleted';
      delBtn.disabled = true;
    };
    del.appendChild(delBtn);
    del.appendChild(el('span', null, 'removes this track entirely — cannot be undone'));
    wrap.appendChild(del);
  }

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      document.removeEventListener('keydown', onKey, true);
      modal.removeEventListener('click', onBackdrop);
    };
    const cancel = () => { if (settled) return; settled = true; cleanup(); resolve(null); };
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    const onBackdrop = (e) => { if (e.target === modal) cancel(); };
    document.addEventListener('keydown', onKey, true);
    modal.addEventListener('click', onBackdrop);

    const close = () => { modal.classList.remove('show'); };

    reopenOn = (freshRow) => {
      if (settled) return;
      settled = true;
      cleanup();
      close();
      resolve(openTrackMenu({ mode: 'edit', track: freshRow, models, crew, edges, rails, tracks, send }));
    };

    function commit() {
      if (settled) return;
      if (mode === 'add' && !trackSel.value) return;
      const dirty = collect();
      const overlay = overlayRows();
      let frame;

      if (isEdit) {
        const fieldsOut = dirty;
        if (overlay) fieldsOut.overlay = overlay;
        if (!Object.keys(fieldsOut).length) { cancel(); close(); return; }
        frame = { type: 'edit_track', track: t.id, fields: fieldsOut };
      } else if (isAddTrack) {
        const ident = {}, settings = {};
        for (const [k, v] of Object.entries(dirty)) {
          (IDENTITY_KEYS.has(k) ? ident : settings)[k] = v;
        }
        frame = Object.assign({}, ident, {
          type:       'create_track',
          name:       (nameIn.value || '').trim() || 'untitled',
          provider:   provSel.value,
          loop_class: classSel.value,
          mechanism:  mechSel.value,
        });
        delete frame.model;
        delete frame.seat;
        delete frame.settings;
        if (overlay) frame.overlay = overlay;
      } else {
        const ident = {}, settings = {};
        for (const [k, v] of Object.entries(dirty)) {
          (IDENTITY_KEYS.has(k) ? ident : settings)[k] = v;
        }
        frame = Object.assign({}, ident, {
          type:       'insert_region',
          track:      trackSel.value,
          name:       (nameIn.value || '').trim() || 'untitled',
          model:      modelSel.value || '',
          provider:   provSel.value,
          loop_class: classSel.value,
          mechanism:  mechSel.value,
        });
        if (Object.keys(settings).length) frame.settings = settings;
        if (presetPick) frame.presets = presetPick;
        if (overlay) {
          frame.overlay = overlay;
        }
        region.name  = frame.name;
        region.model = frame.model;
        try {
          const n = insertRegion(region);
          if (n) frame.node_id = n.id;
        } catch (_) {  }
      }

      settled = true;
      cleanup();
      send(frame);
      close();
      resolve(frame);
    }

    const mrow = el('div', 'mrow');
    const ok = el('button', null, isEdit ? 'Save' : isAddTrack ? 'Add track' : 'Add region');
    ok.onclick = commit;
    if (mode === 'add') {
      const syncOk = () => { ok.disabled = !trackSel.value; };
      trackSel.addEventListener('change', syncOk);
      syncOk();
    }
    const no = el('button', null, 'Cancel');
    no.onclick = () => { cancel(); close(); };
    mrow.appendChild(ok);
    mrow.appendChild(no);
    box.appendChild(mrow);

    modal.classList.add('show');
    if (mode === 'add' && !trackSel.disabled) { trackSel.focus(); }
    else { nameIn.focus(); nameIn.select(); }
  });
}

export default openTrackMenu;
