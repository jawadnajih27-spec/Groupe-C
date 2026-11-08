/* طبقة المشاركة الحية داخل موقع المحاكمة.
   تعمل فقط إذا كان config.js مضبوطاً. حين يفتح المقدّم جولة من اللوحة، يظهر داخل نشاطها في الموقع
   زر لإرسال نتيجة المشارك (موقع المؤشر، أو توزيع مهام المصفوفة، أو اختياره). */
(function () {
  'use strict';
  var CFG = window.MT_CONFIG || {}, ACTS = window.MT_ACTIVITIES || [];
  function cleanUrl(u) { u = String(u || '').trim(); var m = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i); if (m) return 'https://' + m[1] + '.supabase.co'; try { return new URL(u).origin; } catch (e) { return u; } }
  CFG = { url: cleanUrl(CFG.url), anonKey: String(CFG.anonKey || '').trim() };
  if (!CFG.url || !CFG.anonKey || /YOUR-/i.test(CFG.url + CFG.anonKey) || !window.supabase) return;
  var sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---------- أدوات ----------
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v === false || v == null) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return e;
  }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function say(t) { if (window.MT_TOAST) window.MT_TOAST(t); }
  function actOf(r) { return ACTS.filter(function (a) { return a.key === r.activity; })[0] || null; }
  function doneIds() { try { return JSON.parse(ls('mt_done') || '[]'); } catch (e) { return []; } }
  function markDone(id) { var d = doneIds(); if (d.indexOf(id) < 0) d.push(id); ls('mt_done', JSON.stringify(d.slice(-40))); }

  // ---------- الحالة ----------
  var qs = new URLSearchParams(location.search), urlPin = (qs.get('p') || qs.get('pin') || '').trim();
  var S = { pin: urlPin || ls('mt_pin') || '', device: ls('mt_device') || uuid(), round: null, open: false, busy: false, online: true, msg: '' };
  ls('mt_device', S.device);
  if (urlPin) { ls('mt_pin', urlPin); try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { } }
  var ydTouched = false;
  var yd = document.getElementById('ydRange');
  if (yd) yd.addEventListener('input', function () { ydTouched = true; refreshPanels(); });
  if (window.MT_MX) window.MT_MX.onChange = function () { refreshPanels(); };
  else window.addEventListener('load', function () { if (window.MT_MX) window.MT_MX.onChange = function () { refreshPanels(); }; });

  // ---------- الإرسال ----------
  function send(round, value, ui) {
    if (S.busy) return; S.busy = true; ui.setBusy(true);
    sb.rpc('submit_response', { p_pin: S.pin, p_round: round.id, p_device: S.device, p_payload: { v: value } }).then(function (res) {
      if (res.error) throw res.error;
      var c = res.data;
      if (c === 'ok' || c === 'duplicate') { markDone(round.id); S.msg = ''; say('وصلت إجابتك إلى القاعة'); }
      else if (c === 'closed') { S.msg = 'انتهت هذه الجولة.'; poll(); }
      else if (c === 'forbidden') { ls('mt_pin', null); S.pin = ''; S.round = null; S.msg = 'رمز الجلسة غير صحيح.'; }
      else if (c === 'full') S.msg = 'اكتمل عدد المشاركين في هذه الجولة.';
      else S.msg = 'تعذّر قبول الإجابة. حاول مرة أخرى.';
    }).catch(function () { S.online = false; S.msg = 'تعذّر الاتصال. حاول مرة أخرى.'; })
      .then(function () { S.busy = false; render(); });
  }

  // ---------- نماذج الإدخال حسب النوع ----------
  // تُرجع { el, ready(), value() } وتستدعي onChange عند أي تغيير
  function formFor(r, act, onChange) {
    var spec = r.spec || {}, val = null, ok = false;
    function set(v, o) { val = v; ok = o; onChange(); }
    if (act && act.driver === 'yd') {
      return { el: h('p', { class: 'lv-hint' }, ['حرّك المؤشر في الرسم إلى موقعك الحقيقي، ثم أرسل.']),
        ready: function () { return !!document.getElementById('ydRange') && ydTouched; },
        value: function () { return +document.getElementById('ydRange').value; },
        label: function () { return ydTouched ? 'أرسل موقعي (' + document.getElementById('ydRange').value + ')' : 'حرّك المؤشر أولاً'; } };
    }
    if (act && act.driver === 'matrix' && window.MT_MX) {
      var left = function () { return window.MT_MX.get().filter(function (x) { return x === null; }).length; };
      return { el: h('p', { class: 'lv-hint' }, [h('span', { 'data-mxleft': '' }, [left() ? 'ضع المهام الأربع في خاناتها بالأعلى ثم أرسل. المتبقي: ' + left() : 'اكتملت المهام. يمكنك الإرسال.'])]),
        ready: function () { return left() === 0; },
        value: function () { return window.MT_MX.get(); },
        label: function () { return left() ? 'بقيت ' + left() + ' مهام' : 'أرسل ترتيبي'; } };
    }
    if (r.type === 'scale') {
      var min = +spec.min, max = +spec.max; if (isNaN(min)) min = 0; if (isNaN(max)) max = 100;
      var out = h('div', { class: 'lv-big', 'aria-hidden': 'true' }, ['—']), band = h('div', { class: 'lv-band' });
      var rg = h('input', { type: 'range', min: min, max: max, step: 1, value: Math.round((min + max) / 2), 'aria-label': r.title });
      rg.addEventListener('input', function () {
        var n = +rg.value; out.textContent = n;
        var b = (spec.bands || []).filter(function (x) { return n >= x.from && n <= x.to; })[0]; band.textContent = b ? b.label : '';
        set(n, true);
      });
      return { el: h('div', {}, [out, band, rg, h('div', { class: 'lv-ends' }, [h('span', {}, [spec.minLabel || min]), h('span', {}, [spec.maxLabel || max])])]),
        ready: function () { return ok; }, value: function () { return val; }, label: function () { return ok ? 'أرسل إجابتي' : 'حرّك الشريط أولاً'; } };
    }
    if (r.type === 'choice') {
      var opts = (spec.options || []).map(function (t, i) {
        var b = h('button', { class: 'lv-opt', type: 'button', 'aria-pressed': 'false' }, [h('span', { class: 'mk' }), h('span', {}, [t])]);
        b.addEventListener('click', function () { opts.forEach(function (o) { o.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); set(i, true); });
        return b;
      });
      return { el: h('div', { class: 'lv-opts', role: 'group', 'aria-label': r.title }, opts),
        ready: function () { return ok; }, value: function () { return val; }, label: function () { return ok ? 'أرسل إجابتي' : 'اختر إجابة أولاً'; } };
    }
    if (r.type === 'matrix') {   // نموذج احتياطي حين لا تتوفر مصفوفة الموقع
      var items = spec.items || [], quads = spec.quadrants || [], picks = items.map(function () { return null; });
      var cards = items.map(function (it, i) {
        var chips = quads.map(function (q, j) {
          var c = h('button', { class: 'lv-opt', type: 'button', 'aria-pressed': 'false' }, [h('span', {}, [q])]);
          c.addEventListener('click', function () {
            picks[i] = j; Array.prototype.forEach.call(c.parentNode.children, function (x) { x.setAttribute('aria-pressed', 'false'); }); c.setAttribute('aria-pressed', 'true');
            var all = picks.every(function (p) { return p !== null; }); set(all ? picks.slice() : null, all);
          });
          return c;
        });
        return h('div', { class: 'lv-item' }, [h('b', {}, [it]), h('div', { class: 'lv-opts' }, chips)]);
      });
      return { el: h('div', {}, cards), ready: function () { return ok; }, value: function () { return val; }, label: function () { return ok ? 'أرسل ترتيبي' : 'أكمل كل المهام'; } };
    }
    return { el: h('p', { class: 'lv-hint' }, ['نوع نشاط غير معروف.']), ready: function () { return false; }, value: function () { return null; }, label: function () { return 'أرسل'; } };
  }

  // ---------- لوحة النشاط داخل الأداة ----------
  var panels = [];   // { host, round, box, form, btn, msg }
  function buildPanel(host, act, r) {
    var box = h('div', { class: 'lv', 'data-round': r.id, role: 'group', 'aria-label': 'نشاط مباشر' });
    var msg = h('p', { class: 'lv-msg', role: 'alert' });
    var btn = h('button', { class: 'btn pri lv-send', type: 'button' }, ['أرسل']);
    var P = { host: host, round: r, box: box, msg: msg, btn: btn };
    P.form = formFor(r, act, function () { refreshPanels(); });
    var ui = { setBusy: function (b) { btn.disabled = b; if (b) btn.textContent = 'جارٍ الإرسال…'; } };
    btn.addEventListener('click', function () { if (P.form.ready()) send(r, P.form.value(), ui); });
    box.appendChild(h('div', { class: 'lv-head' }, [h('span', { class: 'lv-live' }, ['نشاط مباشر']), h('b', {}, [r.title])]));
    box.appendChild(P.form.el); box.appendChild(msg); box.appendChild(btn);
    host.appendChild(box);
    return P;
  }
  function refreshPanels() {
    panels.forEach(function (P) {
      var sent = doneIds().indexOf(P.round.id) >= 0;
      P.box.classList.toggle('sent', sent);
      if (sent) {
        P.box.replaceChildren(h('div', { class: 'lv-head' }, [h('span', { class: 'lv-live' }, ['نشاط مباشر']), h('b', {}, [P.round.title])]),
          h('p', { class: 'lv-ok' }, ['✓ وصلت إجابتك. انتظر النتيجة على الشاشة.']));
        return;
      }
      P.btn.textContent = S.busy ? 'جارٍ الإرسال…' : P.form.label(); P.btn.disabled = S.busy || !P.form.ready();
      P.msg.textContent = S.msg;
      var left = P.box.querySelector('[data-mxleft]'); if (left && window.MT_MX) { var n = window.MT_MX.get().filter(function (x) { return x === null; }).length; left.textContent = n ? 'ضع المهام الأربع في خاناتها بالأعلى ثم أرسل. المتبقي: ' + n : 'اكتملت المهام. يمكنك الإرسال.'; }
    });
  }
  function syncPanels() {
    var r = S.round;
    panels = panels.filter(function (P) { if (r && P.round.id === r.id) return true; P.box.remove(); return false; });
    if (r && !panels.length) {
      var act = actOf(r), host = act && act.widget && document.getElementById(act.widget);
      if (host) panels.push(buildPanel(host, act, r));
    }
    refreshPanels();
  }

  // ---------- الزر العائم والبطاقة ----------
  var dock = h('div', { class: 'lv-dock', id: 'mtlive', dir: 'rtl' });
  var pill = h('button', { class: 'lv-pill', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'mtlive-card' });
  var card = h('div', { class: 'lv-card', id: 'mtlive-card', hidden: true });
  dock.appendChild(card); dock.appendChild(pill); document.body.appendChild(dock);
  var cardOpen = false, fallback = null;
  pill.addEventListener('click', function () {
    if (S.round && S.pin && panels.length && !cardOpen) { panels[0].host.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    cardOpen = !cardOpen; renderDock();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cardOpen) { cardOpen = false; renderDock(); } });

  function renderDock() {
    var open = !!S.round, joined = !!S.pin;
    pill.classList.toggle('on', open && joined); pill.classList.toggle('off', !S.online);
    pill.replaceChildren(h('i', { class: 'lv-dot' }), h('span', {}, [!joined ? 'شارك مع القاعة' : (!S.online ? 'انقطع الاتصال' : (open ? 'نشاط مفتوح · اذهب إليه' : 'متصل بالقاعة'))]));
    pill.setAttribute('aria-expanded', String(cardOpen));
    card.hidden = !cardOpen; if (!cardOpen) return;
    var kids = [];
    if (!joined) {
      var inp = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '12', placeholder: 'رمز الجلسة', 'aria-label': 'رمز الجلسة' });
      var go = function () { var v = inp.value.trim(); if (!v) return; S.pin = v; S.msg = ''; ls('mt_pin', v); poll(); render(); };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      kids.push(h('b', {}, ['المشاركة المباشرة']), h('p', { class: 'lv-hint' }, ['أدخل الرمز الظاهر على شاشة العرض لتصلك أنشطة القاعة هنا.']), inp,
        h('p', { class: 'lv-msg', role: 'alert' }, [S.msg]), h('button', { class: 'btn pri lv-send', type: 'button', onclick: go }, ['انضم']));
      setTimeout(function () { inp.focus(); }, 0);
    } else {
      kids.push(h('b', {}, ['المشاركة المباشرة']), h('p', { class: 'lv-hint' }, [S.online ? (S.round ? 'نشاط مفتوح الآن: ' + S.round.title : 'متصل. سيظهر النشاط هنا فور فتحه.') : 'انقطع الاتصال، نعيد المحاولة تلقائياً.']));
      if (S.round && !panels.length) {   // نشاط بلا أداة في الصفحة: نموذج احتياطي داخل البطاقة
        var act = actOf(S.round), f = formFor(S.round, act, function () { upd(); });
        var b = h('button', { class: 'btn pri lv-send', type: 'button' }, ['أرسل']), m = h('p', { class: 'lv-msg', role: 'alert' }, [S.msg]);
        var upd = function () { b.textContent = S.busy ? 'جارٍ الإرسال…' : f.label(); b.disabled = S.busy || !f.ready(); m.textContent = S.msg; };
        if (doneIds().indexOf(S.round.id) >= 0) kids.push(h('p', { class: 'lv-ok' }, ['✓ وصلت إجابتك.']));
        else { b.addEventListener('click', function () { if (f.ready()) send(S.round, f.value(), { setBusy: function () { } }); }); kids.push(f.el, m, b); upd(); }
      }
      kids.push(h('button', { class: 'lv-link', type: 'button', onclick: function () { ls('mt_pin', null); S.pin = ''; S.round = null; S.msg = ''; cardOpen = true; render(); } }, ['تغيير رمز الجلسة']));
    }
    card.replaceChildren.apply(card, kids);
  }
  function render() { syncPanels(); renderDock(); }

  // ---------- الاستطلاع ----------
  var polling = false;
  function poll() {
    if (!S.pin || polling) return; polling = true;
    sb.rpc('get_open_round', { p_pin: S.pin }).then(function (res) {
      if (res.error) throw res.error;
      S.online = true;
      var r = (res.data && res.data[0]) || null, was = S.round && S.round.id, now = r && r.id;
      S.round = r;
      if (now && now !== was && doneIds().indexOf(now) < 0) say('فتح المقدّم نشاطاً: ' + r.title);
      if (now !== was || !S.online) render();
      else renderDock();
    }).catch(function () { S.online = false; renderDock(); }).then(function () { polling = false; });
  }
  render(); poll();
  setInterval(poll, 3500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
})();
