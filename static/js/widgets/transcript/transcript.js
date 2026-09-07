// transcript widget — every transcript on the bound session, live and retired
//
// Lists every region on the session: live regions first with a live dot,
// retired regions after with the retired dot. Picking a cache reads it
// through the existing retired chat route and renders its turns with
// turns.js. Ported from static/js/ade/retiredwin.js, widened from many
// sessions to the one this instance is bound to.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function injectStyle() {
    if (document.getElementById("mx-transcript-style")) return;
    const style = document.createElement("style");
    style.id = "mx-transcript-style";
    style.textContent = `
      .mx-tr-head{ flex-shrink:0; display:flex; align-items:center; gap:10px; height:36px;
        padding:0 14px; background:var(--surface-1); border-bottom:1px solid var(--gridline); }
      .mx-tr-head .wtitle{ font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-3); font-weight:600; }
      .mx-tr-head .ph-spacer{ flex:1; }
      .mx-tr-title{ font-size:11.5px; color:var(--text-2); }
      .mx-tr-body{ flex:1; min-height:0; display:flex; }
      .mx-tr-list{ width:290px; flex-shrink:0; overflow-y:auto;
        border-right:1px solid var(--gridline); background:var(--surface-1); }
      .mx-tr-script{ flex:1; min-width:0; overflow-y:auto; padding:14px 18px; }
      .mx-transcript .rt-agent{ display:flex; align-items:center; gap:7px; padding:5px 10px;
        cursor:pointer; font-size:11.5px; color:var(--text-2); }
      .mx-transcript .rt-agent:hover{ background:var(--surface-3); color:var(--text-1); }
      .mx-transcript .rt-agent.rt-on{ background:var(--surface-3); color:var(--text-1); }
      .mx-transcript .rt-agent.rt-nocache{ cursor:default; opacity:.45; }
      .mx-transcript .rt-agent.rt-nocache:hover{ background:none; }
      .mx-transcript .rt-dot{ width:6px; height:6px; border-radius:50%; background:var(--text-3); flex-shrink:0; }
      .mx-transcript .rt-dot.rt-ret{ background:var(--text-2); opacity:.55; }
      .mx-transcript .rt-aname{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .mx-transcript .rt-cache{ color:var(--text-3); font-size:10px; }
      .mx-transcript .rt-vessel, .mx-transcript .rt-size, .mx-transcript .rt-note{ font-size:10px; color:var(--text-3); }
      .mx-transcript .rt-empty{ padding:16px; font-size:11.5px; color:var(--text-3); }
    `;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function bytes(n) {
    if (n == null) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function renderList(frame) {
    const t = frame._transcript;
    const host = t.list;
    if (!t.regions.length) {
      host.innerHTML = '<div class="rt-empty">no regions on this session</div>';
      return;
    }
    const parts = [];
    for (const r of t.regions) {
      if (!r.caches.length) {
        parts.push(
          '<div class="rt-agent rt-nocache" title="no transcript on disk">' +
            '<span class="rt-dot' + (r.live ? '' : ' rt-ret') + '"></span>' +
            '<span class="rt-aname">' + esc(r.name) + '</span>' +
            '<span class="rt-note">no cache</span>' +
          '</div>'
        );
        continue;
      }
      for (const c of r.caches) {
        const key = r.id + '|' + (c.cache == null ? '' : c.cache);
        const on = t.sel && t.sel.key === key;
        parts.push(
          '<div class="rt-agent' + (on ? ' rt-on' : '') + '" data-rid="' + esc(r.id) +
               '" data-cache="' + (c.cache == null ? '' : esc(c.cache)) + '" data-name="' + esc(r.name) + '">' +
            '<span class="rt-dot' + (r.live ? '' : ' rt-ret') + '"></span>' +
            '<span class="rt-aname">' + esc(r.name) +
              (c.cache == null ? '' : ' <span class="rt-cache">cache ' + c.cache + '</span>') +
            '</span>' +
            '<span class="rt-vessel">' + esc(r.vessel) + '</span>' +
            '<span class="rt-size">' + bytes(c.bytes) + '</span>' +
          '</div>'
        );
      }
    }
    host.innerHTML = parts.join('');
  }

  function renderTranscript(frame, name, messages) {
    const host = frame._transcript.script;
    host.innerHTML = '';
    const turns = MX.turns._groupTurns(messages);
    if (!turns.length) {
      host.innerHTML = '<div class="rt-empty">this cache holds no turns</div>';
      return;
    }
    turns.forEach((turn, idx) => {
      const built = MX.turns._buildTurnBlock(name, turn, idx, false, null);
      host.appendChild(built.blk);
    });
    host.scrollTop = 0;
  }

  async function openCache(frame, rid, cache, name) {
    const t = frame._transcript;
    const key = rid + '|' + (cache || '');
    t.sel = { key, rid, cache, name };
    renderList(frame);
    t.title.textContent = name + (cache ? '  ·  cache ' + cache : '');
    t.script.innerHTML = '<div class="rt-empty">reading…</div>';
    const url = '/api/retired-chats/' + encodeURIComponent(frame.sid) + '/' + encodeURIComponent(rid) +
      (cache ? '?cache=' + encodeURIComponent(cache) : '');
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j.missing) {
        t.script.innerHTML = '<div class="rt-empty">no transcript on disk</div>';
        return;
      }
      renderTranscript(frame, name, j.messages || []);
    } catch (e) {
      t.script.innerHTML = '<div class="rt-empty">could not read this cache</div>';
    }
  }

  async function load(frame) {
    const t = frame._transcript;
    t.list.innerHTML = '<div class="rt-empty">reading…</div>';
    try {
      const r = await fetch('/api/transcripts?sid=' + encodeURIComponent(frame.sid));
      const j = await r.json();
      const session = (j.sessions || [])[0];
      t.regions = session ? session.regions.slice() : [];
      t.regions.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
    } catch (e) {
      t.regions = [];
    }
    renderList(frame);
  }

  function onListClick(frame, ev) {
    const row = ev.target.closest('.rt-agent');
    if (!row || row.classList.contains('rt-nocache')) return;
    openCache(frame, row.dataset.rid, row.dataset.cache, row.dataset.name);
  }

  MX.registerWidget('transcript', {
    mount(frame) {
      injectStyle();
      const t = frame._transcript = { regions: [], sel: null };

      const wrap = document.createElement('div');
      wrap.className = 'mx-transcript';
      wrap.style.cssText = 'height:100%; display:flex; flex-direction:column;';

      const head = document.createElement('div');
      head.className = 'mx-tr-head';
      const wtitle = document.createElement('span');
      wtitle.className = 'wtitle';
      wtitle.textContent = 'Transcript';
      const title = document.createElement('span');
      title.className = 'mx-tr-title';
      const spacer = document.createElement('span');
      spacer.className = 'ph-spacer';
      const refresh = document.createElement('button');
      refresh.className = 'tb-btn';
      refresh.textContent = 'refresh';
      refresh.addEventListener('click', () => load(frame));
      head.appendChild(wtitle);
      head.appendChild(title);
      head.appendChild(spacer);
      head.appendChild(refresh);

      const body = document.createElement('div');
      body.className = 'mx-tr-body';
      const list = document.createElement('div');
      list.className = 'mx-tr-list';
      const script = document.createElement('div');
      script.className = 'mx-tr-script';
      script.innerHTML = '<div class="rt-empty">pick a region</div>';
      body.appendChild(list);
      body.appendChild(script);

      wrap.appendChild(head);
      wrap.appendChild(body);
      frame.host.appendChild(wrap);

      t.title = title;
      t.list = list;
      t.script = script;
      list.addEventListener('click', (ev) => onListClick(frame, ev));

      load(frame);
    },

    unmount(frame) {
      frame._transcript = null;
    },
  });
})();
