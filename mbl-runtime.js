/* Maldives Business Ledger — preview runtime.
   Renders each page from its template, keeps buttons, tabs, switches and
   scheduling working, and gives every other button a clear response. */
(function () {
  var page = (location.pathname.split('/').pop() || 'index.html');
  var isDV = /^DV-/.test(page);
  var device = /iPad-/.test(page) ? 'iPad-' : /Mobile-/.test(page) ? 'Mobile-' : '';
  var langPrefix = isDV ? 'DV-' : '';
  var categoryPage = langPrefix + device + 'Category.html';
  var articlePage = langPrefix + device + 'Article.html';
  var homePage = isDV ? langPrefix + device + 'Home.html' : (device ? device + 'Home.html' : 'Main.html');

  /* ---------- toast ---------- */
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:min(560px,90vw);background:#16181D;color:#fff;padding:12px 18px;border-radius:8px;font:600 14px/1.4 "Source Sans 3",system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:99999;opacity:0;transition:opacity .2s';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.dir = isDV ? 'rtl' : 'ltr';
    toastEl.style.fontFamily = isDV ? "Faruma,'Noto Sans Thaana',sans-serif" : '"Source Sans 3",system-ui,sans-serif';
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 3200);
  }
  window.MBLtoast = toast;

  /* ---------- template engine ---------- */
  function get(scope, p) { return p.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, scope); }
  function sub(str, scope) {
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, p) {
      p = p.trim(); if (p === 'true' || p === 'false') return p;
      var v = get(scope, p);
      return (v == null || typeof v === 'function' || typeof v === 'object') ? '' : String(v);
    });
  }
  function walk(node, scope) {
    var kids = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var ch = kids[i];
      if (ch.nodeType === 3) { if (ch.data.indexOf('{{') > -1) ch.data = sub(ch.data, scope); continue; }
      if (ch.nodeType !== 1) continue;
      var tag = ch.tagName.toLowerCase();
      if (tag === 'sc-for') {
        var list = get(scope, ch.getAttribute('list').replace(/[{}]/g, '').trim()) || [];
        var as = ch.getAttribute('as'); var frag = document.createDocumentFragment();
        for (var j = 0; j < list.length; j++) {
          var holder = document.createElement('div'); holder.innerHTML = ch.innerHTML;
          var sc = Object.assign({}, scope); sc[as] = list[j]; sc.index = j;
          walk(holder, sc);
          while (holder.firstChild) frag.appendChild(holder.firstChild);
        }
        ch.parentNode.replaceChild(frag, ch); continue;
      }
      if (tag === 'sc-if') {
        var v = ch.getAttribute('value').replace(/[{}]/g, '').trim();
        var ok = v === 'true' ? true : v === 'false' ? false : !!get(scope, v);
        if (!ok) { ch.parentNode.removeChild(ch); continue; }
        walk(ch, scope);
        while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
        ch.parentNode.removeChild(ch); continue;
      }
      var attrs = Array.prototype.slice.call(ch.attributes);
      for (var a = 0; a < attrs.length; a++) {
        var at = attrs[a];
        if (/^on/i.test(at.name)) {
          var fn = get(scope, at.value.replace(/[{}]/g, '').trim());
          ch.removeAttribute(at.name);
          if (typeof fn === 'function') {
            var ev = at.name.slice(2).toLowerCase();
            ch.addEventListener(ev, (function (f) { return function (e) { if (ev === 'click' && ch.tagName === 'A') e.preventDefault(); f(e); }; })(fn));
            ch.setAttribute('data-bound', '1');
          }
          continue;
        }
        if (at.value.indexOf('{{') > -1) ch.setAttribute(at.name, sub(at.value, scope));
      }
      walk(ch, scope);
    }
  }

  /* ---------- keep what people typed across re-renders ---------- */
  function fieldKey(el, i) {
    return el.tagName + '|' + (el.id || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || ('#' + i));
  }
  function capture(root) {
    var saved = {};
    var els = root.querySelectorAll('input, textarea, select, [contenteditable="true"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], k = fieldKey(el, i);
      if (el.isContentEditable) saved[k] = { html: el.innerHTML };
      else if (el.type === 'checkbox' || el.type === 'radio') saved[k] = { checked: el.checked };
      else saved[k] = { value: el.value };
    }
    return saved;
  }
  function restore(root, saved) {
    var els = root.querySelectorAll('input, textarea, select, [contenteditable="true"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], s = saved[fieldKey(el, i)]; if (!s) continue;
      if ('html' in s) el.innerHTML = s.html;
      else if ('checked' in s) el.checked = s.checked;
      else el.value = s.value;
    }
  }

  /* ---------- what unbound buttons and links do ---------- */
  var SECTIONS = ['business', 'travel', 'tech', 'politics', 'lifestyle', 'report', 'opinion', 'technology', 'sports',
    'ވިޔަފާރި', 'ދަތުރު', 'ސިޔާސީ', 'ދިރިއުޅުން', 'ރިޕޯޓް', 'ޚިޔާލު', 'ޓެކް', 'އިތުރު ޚަބަރު'];
  function label(el) { return (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim(); }
  function dvOr(en, dv) { return isDV ? dv : en; }
  function fmtWhen(d, t) {
    if (!d) return '';
    var dt = new Date(d + 'T' + (t || '00:00'));
    if (isNaN(dt)) return d + ' ' + (t || '');
    return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + (t || '00:00');
  }
  function scheduleMessage(root, what) {
    var d = root.querySelector('input[type="date"]'), t = root.querySelector('input[type="time"]');
    if (d && t) return what + ' scheduled for ' + fmtWhen(d.value, t.value) + ' (Maldives time). It will go live automatically.';
    return what + ' published.';
  }
  var MESSAGES = {
    'save changes': 'Settings saved.', 'save': 'Saved.', 'save campaign': 'Campaign saved. It will start on its start date.',
    'save draft': 'Draft saved.', 'save section': 'Section saved.', 'save rules': 'Comment rules saved.',
    'send for review': 'Sent to an editor for review.', '+ new campaign': 'Fill in the “Add a campaign” form below.',
    '+ new author': 'New author added — fill in their details.', '+ invite someone': 'Invitation email sent.',
    '+ new section': 'New section added — give it a name.', '+ add': 'Tag added.', 'hide section': 'Section hidden from the menu.',
    'merge': 'Tags merged.', 'approve all shown': 'All shown comments approved.', 'block this reader': 'Reader blocked.',
    'export': 'Report downloaded as a spreadsheet.', 'upload': 'Choose photos or videos to upload.', 'add tags': 'Tags added.',
    'set credit': 'Photo credit set.', 'download': 'Download started.', 'delete': 'Moved to the bin.', 'crop': 'Crop saved.',
    'change photo': 'Choose a new photo.', 'upload logo': 'Choose a logo file (SVG or PNG).', 'choose file': 'Choose the phone image.',
    'add file': 'Choose a subtitle (.srt) file.', 'browse': 'Choose a video file.', '+': 'Choose a cover image.',
    'pin a different lead story': 'Choose the story to pin as the lead.', 'pin reels': 'Choose the reels to pin.',
    'search': 'Search opens here on the real site.', 'post comment': 'Thanks — your comment will appear after a moderator approves it.',
    'reply': 'Write your reply below.', 'share': 'Share menu opened.', 'manage': 'Connection settings opened.', 'connect': 'Connected.',
    'disconnect': 'Disconnected.', 'ހޯދާ': 'ހޯދުން ހުޅުވޭނީ ހަގީގީ ސައިޓުގައި.', 'ކޮމެންޓް ފޮނުވާ': 'ޝުކުރިއްޔާ! ކޮމެންޓް ފެންނާނީ ބަލައިގަތުމަށްފަހު.',
    'ޖަވާބު ދޭ': 'ޖަވާބު ތިރީގައި ލިޔުއްވާ.', 'ޝެއާ ކުރޭ': 'ޝެއާ ކުރުން ހުޅުވިއްޖެ.'
  };
  function handleUnbound(el, e, root) {
    var txt = label(el), low = txt.toLowerCase();
    var href = el.getAttribute('href');
    // Real links keep working.
    if (el.tagName === 'A' && href && href !== '#' && href.indexOf('javascript') !== 0) return;
    e.preventDefault();
    // Section names → the category page for this device and language.
    if (SECTIONS.indexOf(low) > -1) { location.href = categoryPage; return; }
    // Pagination and "more" links.
    if (/^(\d+|next →|← previous|load more|all →|all videos →|ކުރިއަށް ←|ހުރިހާ ←|ހުރިހާ ވީޑިއޯއެއް ←)$/i.test(txt)) {
      if (/video|ވީޑިއޯ|^all|ހުރިހާ/i.test(txt)) { toast(dvOr('The full videos page opens here on the real site.', 'ހުރިހާ ވީޑިއޯއެއް ފެންނާނީ ހަގީގީ ސައިޓުގައި.')); return; }
      toast(dvOr('Page ' + (/^\d+$/.test(txt) ? txt : 'changed') + ' — more stories load here.', 'އިތުރު ޚަބަރުތައް މިތަނުން ފެންނާނެ.')); return;
    }
    // Admin specifics.
    if (/^Admin-Articles/.test(page) && (low === '' || low === 'edit')) { location.href = 'Admin-Editor.html'; return; }
    if (low === 'preview') { location.href = (root.querySelector('[dir="rtl"][contenteditable]') ? 'DV-Article.html' : 'Article.html'); return; }
    if (low === 'publish now') { toast(dvOr('Published. It is now live on the site and shared to social media.', 'ޝާއިޢު ކުރެވިއްޖެ.')); return; }
    if (low === 'schedule') { toast(scheduleMessage(root, /^Admin-Video/.test(page) ? 'Video' : 'Article')); return; }
    if (/link the (dhivehi|english) version/i.test(low)) { toast('Pick the matching article in the other language.'); return; }
    if (/^edit$/.test(low)) { toast('Editing opened.'); return; }
    if (/^frame \d/.test(low)) { toast('Cover image set to that frame.'); return; }
    if (/^reply as /.test(low)) { toast('Reply posted under the site’s name.'); return; }
    if (MESSAGES[low]) { toast(MESSAGES[low]); return; }
    // Footer and info links.
    if (el.tagName === 'A') { toast(dvOr('“' + (txt || 'This link') + '” opens a page on the real site.', '“' + (txt || 'މި ލިންކު') + '” ހުޅުވޭނީ ހަގީގީ ސައިޓުގައި.')); return; }
    toast((txt || 'Done') + ' — done.');
  }

  /* ---------- article editor formatting ---------- */
  function editorCommand(cmd) {
    var ed = document.querySelector('.ed-body'); if (!ed) return;
    ed.focus();
    if (cmd === 'h2' || cmd === 'blockquote') document.execCommand('formatBlock', false, cmd);
    else if (cmd === 'link') { var url = window.prompt('Link address', 'https://'); if (url) document.execCommand('createLink', false, url); }
    else if (cmd === 'photo') toast('Choose a photo from the Media library to place here.');
    else if (cmd === 'video') toast('Choose a video or paste a YouTube link to place here.');
    else if (cmd === 'embed') toast('Paste a post, map or tweet link to embed it.');
    else document.execCommand(cmd, false, null);
  }
  function insertToken(btn, tok) {
    var card = btn.closest('div[style*="flex-direction: column"]');
    var ta = null;
    for (var n = btn; n && !ta; n = n.parentElement) ta = n.querySelector && n.querySelector('textarea');
    if (!ta) return;
    var s = ta.selectionStart || ta.value.length;
    ta.value = ta.value.slice(0, s) + tok + ta.value.slice(ta.selectionEnd || s);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length;
  }

  /* ---------- boot ---------- */
  window.MBL = {
    boot: function (Component, propsDef) {
      var props = {};
      Object.keys(propsDef || {}).forEach(function (k) { if (propsDef[k] && 'default' in propsDef[k]) props[k] = propsDef[k].default; });
      props.showAdColors = false;
      var tpl = document.getElementById('dc-template').innerHTML;
      var root = document.getElementById('dc-root');
      var comp;
      function render() {
        var saved = capture(root);
        var scroll = window.scrollY;
        var holder = document.createElement('div');
        holder.innerHTML = tpl;
        walk(holder, comp.renderVals());
        root.innerHTML = '';
        while (holder.firstChild) root.appendChild(holder.firstChild);
        restore(root, saved);
        window.scrollTo(0, scroll);
      }
      window.DCLogic.prototype.setState = function (patch) { this.state = Object.assign({}, this.state || {}, patch); render(); };
      comp = new Component();
      comp.props = props;
      render();
      root.addEventListener('input', function (e) {
        if (!e.target.classList || !e.target.classList.contains('ed-body')) return;
        var words = (e.target.innerText.trim().match(/\S+/g) || []).length;
        var spans = root.querySelectorAll('span');
        for (var i = 0; i < spans.length; i++) if (/^\d+ words?( · about \d+ min read)?$/.test(spans[i].textContent.trim())) { spans[i].textContent = words + (words === 1 ? ' word' : ' words') + ' · about ' + Math.max(1, Math.round(words / 220)) + ' min read'; break; }
      });
      root.addEventListener('mousedown', function (e) { if (e.target.closest('[data-cmd]')) e.preventDefault(); });
      root.addEventListener('click', function (e) {
        var cmdBtn = e.target.closest('[data-cmd]');
        if (cmdBtn) { e.preventDefault(); editorCommand(cmdBtn.getAttribute('data-cmd')); return; }
        var tokBtn = e.target.closest('[data-insert]');
        if (tokBtn) { e.preventDefault(); insertToken(tokBtn, tokBtn.getAttribute('data-insert')); return; }
        var el = e.target.closest('a, button');
        if (!el || el.getAttribute('data-bound')) return;
        handleUnbound(el, e, root);
      });
    }
  };
  window.DCLogic = function DCLogic() { this.props = {}; this.state = null; };
})();
