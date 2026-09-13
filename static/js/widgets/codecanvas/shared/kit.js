// canvas kit — Code Canvas Kit as one module, every taxonomy merged
//
// MX.canvasKit(): the Kit object, built once and memoized. Carries
// palettes, sizes, fonts, shadows, the widget definitions of the text,
// media, container, input, reveal and status taxonomies, the tool
// builder queue, and the filler word bank.
// Tool builders take (widgets, state) — state is the MX.canvasState
// instance the draining widget owns. No window.Kit, no window.State.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // ---- filler --------------------------------------------------------

  // state: fixed word bank, Lorem-style. No external calls.
  const WORDS = [
    'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
    'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
    'et', 'dolore', 'magna', 'aliqua', 'enim', 'minim', 'veniam', 'quis',
    'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip',
    'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'in',
    'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum', 'fugiat',
    'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat',
    'non', 'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt',
    'mollit', 'anim', 'id', 'est', 'laborum'
  ];

  // function: string to positive integer seed
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h) || 1;
  }

  // function: seeded stepper, same seed walks the same path
  function makeStepper(seed) {
    var n = seed;
    return function () {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n;
    };
  }

  // function: one word from the bank. Never repeats prev, same seed path.
  function word(step, prev) {
    var w = WORDS[step() % WORDS.length];
    if (prev !== undefined && w === prev) {
      var pool = WORDS.filter(function (x) { return x !== prev; });
      w = pool[step() % pool.length];
    }
    return w;
  }

  // function: capitalize first letter
  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // function: count plain words, space joined
  function makeWords(step, count) {
    var out = [];
    var prev;
    for (var i = 0; i < count; i++) {
      var w = word(step, prev);
      out.push(w);
      prev = w;
    }
    if (out.length) out[0] = cap(out[0]);
    return out.join(' ');
  }

  // function: count short sentences, space joined
  function makeLines(step, count) {
    var out = [];
    var prev;
    for (var i = 0; i < count; i++) {
      var len = 4 + (step() % 4);
      var words = [];
      for (var j = 0; j < len; j++) {
        var w = word(step, prev);
        words.push(w);
        prev = w;
      }
      words[0] = cap(words[0]);
      out.push(words.join(' ') + '.');
    }
    return out.join(' ');
  }

  // function: count short items, returned as an array
  function makeList(step, count) {
    var out = [];
    var prev;
    for (var i = 0; i < count; i++) {
      var len = 2 + (step() % 3);
      var words = [];
      for (var j = 0; j < len; j++) {
        var w = word(step, prev);
        words.push(w);
        prev = w;
      }
      words[0] = cap(words[0]);
      out.push(words.join(' '));
    }
    return out;
  }

  // function: filler text for a hint. Deterministic per widget id.
  function makeFiller(hint) {
    hint = hint || {};
    var kind = hint.kind;
    var count = hint.count || 1;
    var seed = hint.id
      ? hash(String(hint.id) + ':' + kind + ':' + count)
      : hash(kind + ':' + count + ':' + Math.random());
    var step = makeStepper(seed);
    if (kind === 'words') return makeWords(step, count);
    if (kind === 'lines') return makeLines(step, count);
    if (kind === 'list') return makeList(step, count);
    if (kind === 'image') return { marker: 'image', gray: true };
    throw new Error('unknown filler kind: ' + kind);
  }

  // ---- panel dom helpers, shared by the tool builders -----------------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function labelWrap(label, field) {
    var wrap = el('label', 'cc-panel-label');
    wrap.appendChild(el('span', null, label));
    wrap.appendChild(field);
    return wrap;
  }

  // function: write a prop to every selected widget, one batch.
  function writeProp(state, ids, key, value) {
    state.batch(function () {
      for (var i = 0; i < ids.length; i++) state.setProp(ids[i], key, value);
    });
  }

  // ---- text taxonomy --------------------------------------------------

  function registerText(Kit) {
    var TOOLS = ['text', 'box', 'color', 'link', 'notes'];
    var ANIMATABLE = ['opacity', 'offset', 'size', 'fill', 'text'];

    // state: shared css template. Every default key resolved as a tag.
    var BASE_CSS = '[data-id="{{id}}"] { font-size: {{size}}px; ' +
      'font-weight: {{weight}}; text-align: {{align}}; font-family: {{font}}; ' +
      'color: {{text}}; background: {{fill}}; border: 1px solid {{border}}; ' +
      'padding: {{padding}}px; margin: {{margin}}px; ' +
      'border-radius: {{corner}}px; box-shadow: {{shadow}}; }';

    // state: list css. Marker follows the style prop, bullet or number.
    var LIST_CSS = BASE_CSS +
      ' [data-id="{{id}}"] { list-style-position: inside; }' +
      ' [data-id="{{id}}"][data-style="bullet"] { list-style-type: disc; }' +
      ' [data-id="{{id}}"][data-style="number"] { list-style-type: decimal; }';

    // function: default props shared by every text widget
    function baseDefaults(overrides) {
      var d = { size: 'md', weight: 'normal', align: 'left', font: 'sans',
        fill: 'none', text: 'ink', border: 'none', padding: 8, margin: 0,
        corner: 0, shadow: 'none' };
      for (var k in overrides) d[k] = overrides[k];
      return d;
    }

    Kit.register([
      {
        type: 'text.block',
        taxonomy: 'text',
        label: 'Text',
        tools: TOOLS,
        animatable: ANIMATABLE,
        defaults: baseDefaults({ tag: 'p' }),
        box: { w: 640, h: 120 },
        filler: { kind: 'lines', count: 4 },
        content: 'text',
        children: false,
        html: '<{{tag}} data-id="{{id}}">{{content}}</{{tag}}>',
        css: BASE_CSS,
        js: ''
      },
      {
        type: 'text.list',
        taxonomy: 'text',
        label: 'List',
        tools: TOOLS,
        animatable: ANIMATABLE,
        defaults: baseDefaults({ style: 'bullet' }),
        box: { w: 480, h: 120 },
        filler: { kind: 'list', count: 4 },
        content: 'list',
        children: false,
        html: '<{{tag}} data-id="{{id}}" data-style="{{style}}">{{content}}</{{tag}}>',
        css: LIST_CSS,
        js: ''
      }
    ]);
  }

  // ---- media taxonomy -------------------------------------------------

  function registerMedia(Kit) {
    var TOOLS = ['media', 'box', 'color', 'link', 'notes'];
    var ANIMATABLE = ['opacity', 'offset'];

    // state: accept lists, one per media kind.
    var IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.svg,' +
      'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
    var VIDEO_ACCEPT = '.mp4,.webm,video/mp4,video/webm';

    // state: shared css. Class rule is the gray placeholder, id rule the props.
    var BASE_CSS =
      '.cc-media-gray { background: #d9d9d9; }' +
      ' [data-id="{{id}}"] { display: block; max-width: 100%; ' +
      'background: {{fill}}; border: 1px solid {{border}}; ' +
      'padding: {{padding}}px; margin: {{margin}}px; ' +
      'border-radius: {{corner}}px; box-shadow: {{shadow}}; }';

    // function: box props plus src. No text keys. alt arrives on image only.
    function baseDefaults(overrides) {
      var d = { fill: 'line', border: 'none', padding: 0, margin: 0,
        corner: 0, shadow: 'none', src: '' };
      for (var k in overrides) d[k] = overrides[k];
      return d;
    }

    // function: a YouTube watch url to its embed path. Anything else is kept.
    function embedUrl(url) {
      var s = String(url || '').trim();
      var m = s.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(.+)$/);
      if (!m) return s;
      var parts = m[1].split('&');
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].indexOf('v=') === 0) {
          return 'https://www.youtube.com/embed/' + parts[i].slice(2);
        }
      }
      return s;
    }
    Kit.embedUrl = embedUrl;

    // function: file to an asset record, src on every selection. The
    // store path is the state's own assetMode, set by the widget.
    function uploadFile(state, widgets, file) {
      var reader = new FileReader();
      reader.onload = function () {
        var put = state.putAsset
          ? state.putAsset(file.name, file.type, reader.result)
          : Promise.resolve(state.addAsset(file.name, file.type, reader.result));
        Promise.resolve(put).then(function (assetId) {
          state.batch(function () {
            for (var i = 0; i < widgets.length; i++) {
              state.setProp(widgets[i].id, 'src', assetId);
            }
          });
        });
      };
      reader.readAsDataURL(file);
    }

    // function: upload button plus the hidden file input it clicks.
    function uploadRow(state, widgets, accept) {
      var row = el('div', 'cc-panel-media-upload');
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.className = 'cc-panel-media-file';
      input.style.display = 'none';
      var btn = el('button', 'cc-panel-media-btn', 'Upload');
      btn.type = 'button';
      btn.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () {
        if (input.files && input.files[0]) uploadFile(state, widgets, input.files[0]);
      });
      row.appendChild(btn);
      row.appendChild(input);
      return row;
    }

    // function: url field. media.embed only. Writes props.src on change.
    function urlRow(state, widgets) {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'cc-panel-field cc-panel-media-url';
      input.value = widgets[0].props.src || '';
      var ids = widgets.map(function (w) { return w.id; });
      input.addEventListener('change', function () {
        var url = embedUrl(input.value);
        input.value = url;
        writeProp(state, ids, 'src', url);
      });
      return labelWrap('URL', input);
    }

    // function: alt text. media.image only.
    function altRow(state, widgets) {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'cc-panel-field cc-panel-media-alt';
      input.value = widgets[0].props.alt || '';
      var ids = widgets.map(function (w) { return w.id; });
      input.addEventListener('change', function () {
        writeProp(state, ids, 'alt', input.value);
      });
      return labelWrap('Alt', input);
    }

    // function: the Media tool. Upload on image and video, URL on embed.
    function buildMediaTool(widgets, state) {
      var box = el('div', 'cc-panel-tool');
      box.appendChild(el('div', 'cc-panel-tool-title', 'Media'));
      var type = widgets[0].type;
      if (type === 'media.embed') {
        box.appendChild(urlRow(state, widgets));
      } else {
        box.appendChild(uploadRow(state, widgets,
          type === 'media.video' ? VIDEO_ACCEPT : IMAGE_ACCEPT));
      }
      if (type === 'media.image') box.appendChild(altRow(state, widgets));
      return box;
    }

    Kit.registerTool('media', buildMediaTool);

    Kit.register([
      {
        type: 'media.image',
        taxonomy: 'media',
        label: 'Image',
        tools: TOOLS,
        animatable: ANIMATABLE,
        defaults: baseDefaults({ alt: '' }),
        box: { w: 480, h: 320 },
        filler: { kind: 'image', count: 1 },
        content: 'none',
        children: false,
        html: '<img class="cc-media-gray" data-id="{{id}}" src="{{src}}" alt="{{alt}}">',
        css: BASE_CSS,
        js: ''
      },
      {
        type: 'media.video',
        taxonomy: 'media',
        label: 'Video',
        tools: TOOLS,
        animatable: ANIMATABLE,
        defaults: baseDefaults(),
        box: { w: 640, h: 360 },
        filler: { kind: 'image', count: 1 },
        content: 'none',
        children: false,
        html: '<video class="cc-media-gray" data-id="{{id}}" src="{{src}}" controls></video>',
        css: BASE_CSS,
        js: ''
      },
      {
        type: 'media.embed',
        taxonomy: 'media',
        label: 'Embed',
        tools: TOOLS,
        animatable: ANIMATABLE,
        defaults: baseDefaults(),
        box: { w: 640, h: 360 },
        filler: { kind: 'image', count: 1 },
        content: 'none',
        children: false,
        html: '<iframe class="cc-media-gray" data-id="{{id}}" src="{{src}}" allowfullscreen></iframe>',
        css: BASE_CSS,
        js: ''
      }
    ]);
  }

  // ---- container taxonomy ---------------------------------------------

  function registerContainer(Kit) {
    var TOOLS = ['box', 'color', 'link', 'notes', 'container'];
    var ANIMATABLE = ['opacity', 'offset', 'fill'];

    // state: kit css. Box keys match text.block's, then display/direction/gap/columns.
    // position: relative lets percent-positioned children resolve inside.
    var CSS = '[data-id="{{id}}"] { position: relative; ' +
      'color: {{text}}; background: {{fill}}; border: 1px solid {{border}}; ' +
      'padding: {{padding}}px; margin: {{margin}}px; border-radius: {{corner}}px; ' +
      'box-shadow: {{shadow}}; display: {{display}}; ' +
      'flex-direction: {{direction}}; gap: {{gap}}px; ' +
      'grid-template-columns: repeat({{columns}}, 1fr); }';

    Kit.register([
      {
        type: 'container.box',
        taxonomy: 'container',
        label: 'Container',
        tools: TOOLS,
        animatable: ANIMATABLE,
        // layout: flow lays children out; free is absolute behavior.
        defaults: {
          fill: 'none', text: 'ink', border: 'none',
          padding: 8, margin: 0, corner: 0, shadow: 'none',
          layout: 'flow', display: 'block', direction: 'row', gap: 8, columns: 2
        },
        box: { w: 400, h: 300 },
        filler: { kind: 'words', count: 0 },
        content: 'none',
        children: true,
        html: '<div data-id="{{id}}"></div>',
        css: CSS,
        js: ''
      }
    ]);

    // function: a select field, one option list, writes on change.
    function selectField(state, label, options, current, ids, key) {
      var select = document.createElement('select');
      select.className = 'cc-panel-field';
      options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (opt === current) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', function () {
        writeProp(state, ids, key, select.value);
      });
      return labelWrap(label, select);
    }

    // function: debounce typing, 500ms.
    var timers = {};
    function bindNumber(input, key, writeFn) {
      function schedule() {
        if (timers[key]) clearTimeout(timers[key]);
        timers[key] = setTimeout(function () {
          timers[key] = null;
          writeFn(input.value);
        }, 500);
      }
      input.addEventListener('input', schedule);
      input.addEventListener('blur', function () {
        if (timers[key]) { clearTimeout(timers[key]); timers[key] = null; writeFn(input.value); }
      });
    }

    // function: a number field, debounced write, floor to 0 on a bad value.
    function numberField(state, label, current, ids, key) {
      var input = document.createElement('input');
      input.type = 'number';
      input.className = 'cc-panel-field';
      input.value = current;
      bindNumber(input, key, function (v) {
        var n = parseFloat(v);
        writeProp(state, ids, key, isNaN(n) ? 0 : n);
      });
      return labelWrap(label, input);
    }

    // function: container tool. layout, display, direction, gap, columns.
    function buildContainerTool(widgets, state) {
      var box = el('div', 'cc-panel-tool');
      box.appendChild(el('div', 'cc-panel-tool-title', 'Container'));
      var first = widgets[0];
      var ids = widgets.map(function (w) { return w.id; });

      box.appendChild(selectField(state, 'Layout', ['flow', 'free'], first.props.layout, ids, 'layout'));
      box.appendChild(selectField(state, 'Display', ['block', 'flex', 'grid'], first.props.display, ids, 'display'));
      box.appendChild(selectField(state, 'Direction', ['row', 'column'], first.props.direction, ids, 'direction'));
      box.appendChild(numberField(state, 'Gap', first.props.gap, ids, 'gap'));
      box.appendChild(numberField(state, 'Columns', first.props.columns, ids, 'columns'));

      return box;
    }

    Kit.registerTool('container', buildContainerTool);
  }

  // ---- input taxonomy --------------------------------------------------

  function registerInput(Kit) {
    var TOOLS_PLAIN = ['input', 'box', 'color', 'notes'];
    var TOOLS_TEXTLIKE = ['input', 'text', 'box', 'color', 'notes'];
    var TOOLS_BUTTON = ['input', 'text', 'box', 'color', 'link', 'notes'];
    var ANIMATABLE = ['opacity', 'offset'];

    // state: css for field/checkbox. Box and color props only, no text tool.
    var PLAIN_CSS = '[data-id="{{id}}"] { background: {{fill}}; color: {{text}}; ' +
      'border: 1px solid {{border}}; padding: {{padding}}px; margin: {{margin}}px; ' +
      'border-radius: {{corner}}px; box-shadow: {{shadow}}; }';

    // state: css for textarea/select/button. Adds text tool props.
    var TEXTLIKE_CSS = '[data-id="{{id}}"] { font-size: {{size}}px; ' +
      'font-weight: {{weight}}; text-align: {{align}}; font-family: {{font}}; ' +
      'color: {{text}}; background: {{fill}}; border: 1px solid {{border}}; ' +
      'padding: {{padding}}px; margin: {{margin}}px; ' +
      'border-radius: {{corner}}px; box-shadow: {{shadow}}; }';

    // function: box/color defaults shared by field and checkbox.
    function plainDefaults(overrides) {
      var d = { name: '', value: '', fill: 'none', text: 'ink', border: 'none',
        padding: 8, margin: 0, corner: 0, shadow: 'none' };
      for (var k in overrides) d[k] = overrides[k];
      return d;
    }

    // function: box/color/text defaults shared by textarea, select, button.
    function textlikeDefaults(overrides) {
      var d = { name: '', value: '', size: 'md', weight: 'normal', align: 'left',
        font: 'sans', fill: 'none', text: 'ink', border: 'none', padding: 8,
        margin: 0, corner: 0, shadow: 'none' };
      for (var k in overrides) d[k] = overrides[k];
      return d;
    }

    Kit.register([
      {
        type: 'input.field',
        taxonomy: 'input',
        label: 'Field',
        tools: TOOLS_PLAIN,
        animatable: ANIMATABLE,
        defaults: plainDefaults({ kind: 'text' }),
        box: { w: 240, h: 40 },
        filler: { kind: 'words', count: 1 },
        content: 'none',
        children: false,
        html: '<input data-id="{{id}}" type="{{kind}}" name="{{name}}" value="{{value}}">',
        css: PLAIN_CSS,
        js: ''
      },
      {
        type: 'input.textarea',
        taxonomy: 'input',
        label: 'Textarea',
        tools: TOOLS_TEXTLIKE,
        animatable: ANIMATABLE,
        defaults: textlikeDefaults({}),
        box: { w: 320, h: 120 },
        filler: { kind: 'lines', count: 2 },
        content: 'text',
        children: false,
        html: '<textarea data-id="{{id}}" name="{{name}}" value="{{value}}">{{content}}</textarea>',
        css: TEXTLIKE_CSS,
        js: ''
      },
      {
        type: 'input.select',
        taxonomy: 'input',
        label: 'Select',
        tools: TOOLS_TEXTLIKE,
        animatable: ANIMATABLE,
        defaults: textlikeDefaults({}),
        box: { w: 240, h: 40 },
        filler: { kind: 'list', count: 3 },
        content: 'options',
        children: false,
        html: '<select data-id="{{id}}" name="{{name}}" value="{{value}}">{{content}}</select>',
        css: TEXTLIKE_CSS,
        js: ''
      },
      {
        type: 'input.checkbox',
        taxonomy: 'input',
        label: 'Checkbox',
        tools: TOOLS_PLAIN,
        animatable: ANIMATABLE,
        defaults: plainDefaults({}),
        box: { w: 24, h: 24 },
        filler: { kind: 'words', count: 1 },
        content: 'none',
        children: false,
        html: '<input data-id="{{id}}" type="checkbox" name="{{name}}" value="{{value}}">',
        css: PLAIN_CSS,
        js: ''
      },
      {
        type: 'input.button',
        taxonomy: 'input',
        label: 'Button',
        tools: TOOLS_BUTTON,
        animatable: ANIMATABLE,
        defaults: textlikeDefaults({}),
        box: { w: 120, h: 40 },
        filler: { kind: 'words', count: 2 },
        content: 'text',
        children: false,
        html: '<button data-id="{{id}}" name="{{name}}" value="{{value}}">{{content}}</button>',
        css: TEXTLIKE_CSS,
        js: ''
      }
    ]);

    // function: debounce typing, 500ms.
    var timers = {};
    function bindTyping(input, key, writeFn) {
      function schedule() {
        if (timers[key]) clearTimeout(timers[key]);
        timers[key] = setTimeout(function () {
          timers[key] = null;
          writeFn(input.value);
        }, 500);
      }
      input.addEventListener('input', schedule);
      input.addEventListener('blur', function () {
        if (timers[key]) { clearTimeout(timers[key]); timers[key] = null; writeFn(input.value); }
      });
    }

    // function: text field, label + input, debounced write.
    function textField(state, label, current, ids, key) {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'cc-panel-field';
      input.value = current;
      bindTyping(input, key, function (v) { writeProp(state, ids, key, v); });
      return labelWrap(label, input);
    }

    // function: kind select, field-only. text email number.
    function kindField(state, current, ids) {
      var select = document.createElement('select');
      select.className = 'cc-panel-field';
      ['text', 'email', 'number'].forEach(function (k) {
        var opt = document.createElement('option');
        opt.value = k; opt.textContent = k;
        if (k === current) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', function () { writeProp(state, ids, 'kind', select.value); });
      return labelWrap('Kind', select);
    }

    // function: input tool. name, value, kind (input.field only).
    function buildInputTool(widgets, state) {
      var box = el('div', 'cc-panel-tool');
      box.appendChild(el('div', 'cc-panel-tool-title', 'Input'));
      var first = widgets[0];
      var ids = widgets.map(function (w) { return w.id; });

      box.appendChild(textField(state, 'Name', first.props.name, ids, 'name'));
      box.appendChild(textField(state, 'Value', first.props.value, ids, 'value'));

      var allField = widgets.every(function (w) { return w.type === 'input.field'; });
      if (allField) box.appendChild(kindField(state, first.props.kind, ids));

      return box;
    }

    Kit.registerTool('input', buildInputTool);
  }

  // ---- reveal taxonomy -------------------------------------------------

  function registerReveal(Kit) {
    var TOOLS = ['text', 'box', 'color', 'notes'];
    var ANIMATABLE = ['opacity', 'offset'];

    // state: text+box+color css, plus position: relative so children
    // (the details panel) can resolve inside.
    var CSS = '[data-id="{{id}}"] { position: relative; font-size: {{size}}px; ' +
      'font-weight: {{weight}}; text-align: {{align}}; font-family: {{font}}; ' +
      'color: {{text}}; background: {{fill}}; border: 1px solid {{border}}; ' +
      'padding: {{padding}}px; margin: {{margin}}px; ' +
      'border-radius: {{corner}}px; box-shadow: {{shadow}}; }';

    Kit.register([
      {
        type: 'reveal.details',
        taxonomy: 'reveal',
        label: 'Details',
        tools: TOOLS,
        animatable: ANIMATABLE,
        // state: content is the summary text. open fills as its key name
        // when true, empty when false.
        defaults: {
          size: 'md', weight: 'normal', align: 'left', font: 'sans',
          fill: 'none', text: 'ink', border: 'none', padding: 8, margin: 0,
          corner: 0, shadow: 'none', open: false
        },
        box: { w: 320, h: 80 },
        filler: { kind: 'words', count: 3 },
        content: 'text',
        children: true,
        html: '<details data-id="{{id}}" {{open}}><summary>{{content}}</summary></details>',
        css: CSS,
        js: ''
      }
    ]);
  }

  // ---- navigation taxonomy ---------------------------------------------

  function registerNavigation(Kit) {
    Kit.register([]);
  }

  // ---- status taxonomy -------------------------------------------------

  function registerStatus(Kit) {
    var FULL_TOOLS = ['text', 'box', 'color', 'notes'];
    var ANIMATABLE = ['opacity', 'offset', 'fill'];

    // state: text+box+color css, badge and alert.
    var TEXT_CSS = '[data-id="{{id}}"] { font-size: {{size}}px; ' +
      'font-weight: {{weight}}; text-align: {{align}}; font-family: {{font}}; ' +
      'color: {{text}}; background: {{fill}}; border: 1px solid {{border}}; ' +
      'padding: {{padding}}px; margin: {{margin}}px; ' +
      'border-radius: {{corner}}px; box-shadow: {{shadow}}; }';

    // state: box+color css, progress. No text-tool keys.
    var PROGRESS_CSS = '[data-id="{{id}}"] { background: {{fill}}; ' +
      'color: {{text}}; border: 1px solid {{border}}; padding: {{padding}}px; ' +
      'margin: {{margin}}px; border-radius: {{corner}}px; box-shadow: {{shadow}}; }';

    // function: default props shared by badge and alert.
    function textDefaults(overrides) {
      var d = { size: 'md', weight: 'normal', align: 'left', font: 'sans',
        fill: 'none', text: 'ink', border: 'none', padding: 8, margin: 0,
        corner: 0, shadow: 'none' };
      for (var k in overrides) d[k] = overrides[k];
      return d;
    }

    Kit.register([
      {
        type: 'status.progress',
        taxonomy: 'status',
        label: 'Progress',
        tools: ['status', 'box', 'color', 'notes'],
        animatable: ANIMATABLE,
        // state: max is fixed in the template, not a prop.
        defaults: { value: 50, fill: 'none', text: 'ink', border: 'none',
          padding: 8, margin: 0, corner: 0, shadow: 'none' },
        box: { w: 320, h: 24 },
        filler: { kind: 'words', count: 1 },
        content: 'none',
        children: false,
        html: '<progress data-id="{{id}}" value="{{value}}" max="100"></progress>',
        css: PROGRESS_CSS,
        js: ''
      },
      {
        type: 'status.badge',
        taxonomy: 'status',
        label: 'Badge',
        tools: FULL_TOOLS,
        animatable: ANIMATABLE,
        defaults: textDefaults({}),
        box: { w: 120, h: 32 },
        filler: { kind: 'words', count: 1 },
        content: 'text',
        children: false,
        html: '<span data-id="{{id}}">{{content}}</span>',
        css: TEXT_CSS,
        js: ''
      },
      {
        type: 'status.alert',
        taxonomy: 'status',
        label: 'Alert',
        tools: FULL_TOOLS,
        animatable: ANIMATABLE,
        defaults: textDefaults({}),
        box: { w: 480, h: 60 },
        filler: { kind: 'lines', count: 1 },
        content: 'text',
        children: false,
        // state: role="alert" is fixed in the template, not a prop.
        html: '<div data-id="{{id}}" role="alert">{{content}}</div>',
        css: TEXT_CSS,
        js: ''
      }
    ]);

    // function: status tool. One number field, value.
    function buildStatusTool(widgets, state) {
      var box = el('div', 'cc-panel-tool');
      box.appendChild(el('div', 'cc-panel-tool-title', 'Status'));
      var first = widgets[0];
      var input = document.createElement('input');
      input.type = 'number';
      input.className = 'cc-panel-field';
      input.value = first.props.value;
      input.addEventListener('change', function () {
        var v = Number(input.value);
        state.batch(function () {
          for (var i = 0; i < widgets.length; i++) state.setProp(widgets[i].id, 'value', v);
        });
      });
      box.appendChild(labelWrap('Value', input));
      return box;
    }

    Kit.registerTool('status', buildStatusTool);
  }

  // ---- the kit ---------------------------------------------------------

  function buildKit() {
    var Kit = {
      kit: 'Code Canvas',
      version: 2,
      palettes: {
        default: {
          ink: '#1a1a1a', paper: '#ffffff', muted: '#6b6b6b',
          line: '#d0d0d0', accent: '#2a6df4', none: 'transparent'
        }
      },
      sizes: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 40 },
      fonts: {
        sans: 'system-ui, sans-serif', serif: 'Georgia, serif',
        mono: 'ui-monospace, monospace'
      },
      shadows: {
        none: 'none',
        sm: '0 1px 2px rgba(0,0,0,.15)',
        md: '0 2px 6px rgba(0,0,0,.18)',
        lg: '0 6px 16px rgba(0,0,0,.22)'
      },
      widgets: [],
      tools: []
    };

    // function: queue a tool builder. Rejects a dup name. 3C drains it.
    Kit.registerTool = function (name, builder) {
      for (var i = 0; i < this.tools.length; i++) {
        if (this.tools[i].name === name) throw new Error('duplicate tool name: ' + name);
      }
      this.tools.push({ name: name, builder: builder });
    };

    // function: append widget entries. Rejects a duplicate type, appends none.
    Kit.register = function (list) {
      var entries = list || [];
      var seen = {};
      for (var i = 0; i < this.widgets.length; i++) seen[this.widgets[i].type] = true;
      for (var j = 0; j < entries.length; j++) {
        var type = entries[j].type;
        if (seen[type]) throw new Error('duplicate widget type: ' + type);
        seen[type] = true;
      }
      for (var n = 0; n < entries.length; n++) this.widgets.push(entries[n]);
      return this.widgets.length;
    };

    // function: widget definition by type, throws when absent
    Kit.get = function (type) {
      for (var i = 0; i < this.widgets.length; i++) {
        if (this.widgets[i].type === type) return this.widgets[i];
      }
      throw new Error('unknown widget type: ' + type);
    };

    // function: list of every widget type
    Kit.types = function () {
      var out = [];
      for (var i = 0; i < this.widgets.length; i++) out.push(this.widgets[i].type);
      return out;
    };

    // function: widgets grouped by taxonomy
    Kit.byTaxonomy = function () {
      var out = {};
      for (var i = 0; i < this.widgets.length; i++) {
        var w = this.widgets[i];
        if (!out[w.taxonomy]) out[w.taxonomy] = [];
        out[w.taxonomy].push(w);
      }
      return out;
    };

    // function: filler text for a hint, deterministic per widget id.
    Kit.makeFiller = makeFiller;

    // register order matches the app's script order
    registerText(Kit);
    registerMedia(Kit);
    registerContainer(Kit);
    registerInput(Kit);
    registerReveal(Kit);
    registerNavigation(Kit);
    registerStatus(Kit);

    return Kit;
  }

  var _kit = null;

  MX.canvasKit = function () {
    if (!_kit) _kit = buildKit();
    return _kit;
  };
})();
