// turns — grouping messages into turns and building a turn block's DOM
//
// Ported from static/js/ade/chat.js. Used by anchor-chat and gate-list's
// sibling widgets that render a transcript (E10, E13).

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const _TOOL_RESULT_ECHO_RE = /^\[\w+ result\]\n/;

  const _MAIL_FROM_RE   = /^\[message from (.+?) \(id: [^)]+\) — another agent, not the user\. Reply to that id with send_message\.\]\n?/;
  const _MAIL_NOTICE_RE = /^\[NOTICE from the harness — not a user, not another agent\]\n?/;
  const _MAIL_ALERT_RE  = /^● NEW MAIL — /;

  function _classifyInbound(text) {
    let m = _MAIL_FROM_RE.exec(text);
    if (m) return { kind: 'mail', who: m[1], body: text.slice(m[0].length) };
    m = _MAIL_NOTICE_RE.exec(text);
    if (m) return { kind: 'notice', who: 'harness', body: text.slice(m[0].length) };
    if (_MAIL_ALERT_RE.test(text)) return { kind: 'notice', who: 'mail', body: text };
    return null;
  }

  function _text(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(p => (typeof p === 'string' ? p : (p && p.text) || '[image]')).join('');
    }
    return '';
  }

  function _mediaTag(media) {
    if (!Array.isArray(media) || !media.length) return '';
    return media.map(m => `[${(m && m.kind) || 'image'}]`).join(' ');
  }

  const _SEND_CMD_RE = /SEND:\s*([^\n]+)[\s\S]*?---BEGIN---\n[\s\S]*?\n?---END---/g;
  function _stripSendBlocks(text) {
    if (!text) return text;
    return text.replace(_SEND_CMD_RE, (_, who) => '→ message sent to ' + who.trim());
  }

  function parseFences(str) {
    const segments = [];
    const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
    let lastIdx = 0, m;
    while ((m = fenceRe.exec(str)) !== null) {
      if (m.index > lastIdx) segments.push({ type: 'text', content: str.slice(lastIdx, m.index) });
      segments.push({ type: 'code', lang: m[1].trim(), content: m[2] });
      lastIdx = fenceRe.lastIndex;
    }
    if (lastIdx < str.length) segments.push({ type: 'text', content: str.slice(lastIdx) });
    return segments;
  }

  function _renderFenced(container, text) {
    container.innerHTML = '';
    const segments = parseFences(text || '');
    for (const seg of segments) {
      if (seg.type === 'text') {
        const span = document.createElement('span');
        span.textContent = seg.content;
        container.appendChild(span);
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'code-fence';
        const header = document.createElement('div');
        header.className = 'code-fence-header';
        if (seg.lang) {
          const langLabel = document.createElement('span');
          langLabel.className = 'code-fence-lang';
          langLabel.textContent = seg.lang;
          header.appendChild(langLabel);
        }
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-fence-copy';
        copyBtn.textContent = 'copy';
        const codeText = seg.content;
        copyBtn.onclick = () => {
          try {
            navigator.clipboard.writeText(codeText).then(() => {
              copyBtn.textContent = 'copied';
              setTimeout(() => { copyBtn.textContent = 'copy'; }, 1500);
            }).catch(() => { copyBtn.textContent = 'err'; });
          } catch (err) { copyBtn.textContent = 'err'; }
        };
        header.appendChild(copyBtn);
        wrap.appendChild(header);
        const pre = document.createElement('pre');
        pre.className = 'code-fence-body';
        const code = document.createElement('code');
        code.textContent = codeText;
        pre.appendChild(code);
        wrap.appendChild(pre);
        container.appendChild(wrap);
      }
    }
  }

  function _makeThinkingBlock() {
    const details = document.createElement('details');
    details.className = 'cot thinking';
    const summary = document.createElement('summary');
    summary.innerHTML = '<span class="hmm-l">H</span><span class="hmm-l">m</span><span class="hmm-l">m</span><span class="hmm-l">m</span><span class="hmm-d1"> ...</span><span class="hmm-d2"> ...</span><span class="hmm-d3"> ...</span>';
    const ht = document.createElement('span');
    ht.className = 'hmm-time';
    summary.appendChild(ht);
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'cot-body';
    details.appendChild(body);
    return { el: details, body, timeEl: ht };
  }

  function _groupTurns(messages) {
    const turns = [];
    let current = null;
    for (const msg of (messages || [])) {
      if (!msg || msg.role === 'system' || msg._seat_context || msg.role === 'tool') continue;
      const text = _text(msg.content);
      if (msg.role === 'user') {
        if (_TOOL_RESULT_ECHO_RE.test(text)) continue;
        const inbound = _classifyInbound(text);
        if (inbound && inbound.kind === 'notice' && inbound.who === 'mail') continue;
        current = inbound
          ? { user: inbound.body, media: msg.media, agent: [], thinking: [], kind: inbound.kind, who: inbound.who }
          : { user: text, media: msg.media, agent: [], thinking: [] };
        turns.push(current);
      } else if (msg.role === 'assistant') {
        if (!current) { current = { user: '', media: null, agent: [], thinking: [] }; turns.push(current); }
        if (text.trim()) current.agent.push(text);
        const think = _text(msg.thinking);
        if (think.trim()) current.thinking.push(think);
      }
    }
    return turns;
  }

  function _buildTurnBlock(rowName, turn, idx, live, onTurnHover) {
    const blk = document.createElement('div');
    blk.className = 'turnblock';
    blk.dataset.turn = String(idx);

    if (turn.kind === 'mail') {
      const mark = document.createElement('div');
      mark.className = 'msg-mark';
      mark.textContent = '← message from ' + (turn.who || 'a peer');
      blk.appendChild(mark);
    } else {
      const userText = (turn.user || '') + (turn.media ? ' ' + _mediaTag(turn.media) : '');
      if (userText.trim()) {
        const row = document.createElement('div');
        row.className = 'msg ' + (turn.kind === 'notice' ? 'notice' : 'user');
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = turn.who || 'you';
        const bub = document.createElement('div');
        bub.className = 'bub';
        bub.textContent = userText;
        row.appendChild(who);
        row.appendChild(bub);
        blk.appendChild(row);
      }
    }

    const thinkingText = (turn.thinking || []).join('\n\n');
    if (thinkingText.trim()) {
      const tb = _makeThinkingBlock();
      tb.el.classList.remove('thinking');
      tb.body.textContent = thinkingText;
      blk.appendChild(tb.el);
    }

    let liveBub = null;
    const agentText = (turn.agent || []).join('\n\n');
    if (agentText || live) {
      const row = document.createElement('div');
      row.className = 'msg agent';
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = rowName || 'agent';
      const bub = document.createElement('div');
      bub.className = 'bub';
      if (agentText && !live) _renderFenced(bub, _stripSendBlocks(agentText));
      else bub.textContent = agentText;
      row.appendChild(who);
      row.appendChild(bub);
      blk.appendChild(row);
      if (live) liveBub = bub;
    }

    const foot = document.createElement('div');
    foot.className = 'tb-foot';
    const hint = document.createElement('span');
    hint.className = 'tb-hint';
    hint.textContent = 'ledger → (S8)';
    foot.appendChild(hint);
    blk.appendChild(foot);

    blk.addEventListener('mouseenter', () => {
      if (typeof onTurnHover === 'function') onTurnHover(turn, idx);
    });

    return { blk, liveBub };
  }

  MX.turns = { _groupTurns, _buildTurnBlock };
})();
