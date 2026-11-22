/*
  ميزان — ملخص المحل على الآيفون (PWA).
  الرمز السري يجي من الـQR بالرابط (#t=...)، ينحفظ بالجهاز، وينشال من الرابط.
  الملخص ينقرا من سوبابيس (دالة mizan_phone_get) وينحفظ آخر واحد حتى يبين بلا نت.
  للقراءة بس.
*/
(function () {
  const $app = document.getElementById('app');
  const LS = { token: 'mz_token', key: 'mz_key', snap: 'mz_snap', tab: 'mz_tab' };
  const get = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const set = (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* */
    }
  };

  // الرمز من الرابط
  // الرابط من الـQR: #t=<الرمز السري>&k=<مفتاح سوبابيس العام>
  const m = location.hash.match(/t=([a-f0-9]{32,})/i);
  const k = location.hash.match(/k=([A-Za-z0-9._-]{20,})/);
  if (m) set(LS.token, m[1]);
  if (k) set(LS.key, k[1]);
  if (m || k) history.replaceState(null, '', location.pathname + location.search);
  const KEY = get(LS.key) || '';
  const demo = /demo/.test(location.search);

  const state = {
    token: get(LS.token),
    snap: null,
    updated: null,
    tab: get(LS.tab) || 'home',
    day: 'today',
    loading: false,
    error: '',
  };
  try {
    const c = JSON.parse(get(LS.snap) || 'null');
    if (c && c.data) (state.snap = c.data), (state.updated = c.updated_at);
  } catch {
    /* */
  }

  const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US').format(Math.round(Number(n) || 0)));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ago = (iso) => {
    if (!iso) return '';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'هسه';
    if (m < 60) return `قبل ${m} دقيقة`;
    const h = Math.floor(m / 60);
    if (h < 24) return `قبل ${h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`}`;
    const d = Math.floor(h / 24);
    return `قبل ${d === 1 ? 'يوم' : d === 2 ? 'يومين' : `${d} أيام`}`;
  };
  const t12 = (hhmm) => {
    if (!hhmm) return '';
    const [h, mi] = String(hhmm).slice(-8).split(':').map(Number);
    return `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h >= 12 ? 'م' : 'ص'}`;
  };
  const dmy = (s) => (s ? String(s).slice(0, 10).split('-').reverse().map(Number).join('/') : '');
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  async function load() {
    if (demo) {
      const r = await fetch('demo.json');
      state.snap = await r.json();
      state.updated = new Date().toISOString();
      return render();
    }
    if (!state.token || !KEY) return render();
    state.loading = true;
    state.error = '';
    render();
    try {
      const r = await fetch(`${window.SB_URL}/rest/v1/rpc/mizan_phone_get`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: state.token }),
      });
      if (!r.ok) throw new Error(`خطأ من الخادم (${r.status})`);
      const j = await r.json();
      if (!j || !j.data || !Object.keys(j.data).length) {
        state.snap = null;
        state.error = 'الربط انلغى أو الكود قديم. اربط من جديد من البرنامج بالحاسبة';
        set(LS.snap, null);
      } else {
        state.snap = j.data;
        state.updated = j.updated_at;
        set(LS.snap, JSON.stringify(j));
      }
    } catch (e) {
      state.error = navigator.onLine === false ? 'ما اكو نت. هذا آخر ملخص انحفظ' : e.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  /* ===== الرسم ===== */
  function header(s) {
    const old = state.updated && Date.now() - new Date(state.updated).getTime() > 30 * 60000;
    return `<header class="top">
      <div class="top-row">
        <img src="icon-192.png" alt="" class="logo" />
        <div class="ttl"><b>${esc(s.shop || 'ميزان')}</b><small class="${old ? 'stale' : ''}">آخر تحديث ${esc(ago(state.updated))}${old ? ' · الحاسبة بلا نت؟' : ''}</small></div>
        <button class="refresh ${state.loading ? 'spin' : ''}" data-act="refresh" aria-label="تحديث">⟳</button>
      </div>
      ${state.error ? `<div class="err">${esc(state.error)}</div>` : ''}
      <div class="days">
        <button class="${state.day === 'today' ? 'on' : ''}" data-day="today">اليوم</button>
        <button class="${state.day === 'yesterday' ? 'on' : ''}" data-day="yesterday">أمس</button>
      </div>
    </header>`;
  }

  function big(label, value, tone, foot) {
    return `<div class="big ${tone}"><small>${label}</small><b class="num">${fmt(value)}</b><span>د.ع${foot ? ` · ${foot}` : ''}</span></div>`;
  }

  function homeTab(s, d) {
    const hp = s.hide_profit;
    const chart = (s.daily || []).slice(-14);
    const max = Math.max(1, ...chart.map((x) => x.sales || 0));
    const alerts = [];
    if (s.odd) alerts.push(`<div class="alert bad">⚠ اكو ${fmt(s.odd)} أرقام غريبة (كميات أو أسعار خيالية). شوفها من البرنامج: فحص الأرقام</div>`);
    if (s.stock && s.stock.out_n) alerts.push(`<button class="alert warn" data-tab="stock">خلصت ${fmt(s.stock.out_n)} مادة من المخزون ←</button>`);
    if (s.stock && s.stock.soon && s.stock.soon.length) alerts.push(`<button class="alert warn" data-tab="stock">${fmt(s.stock.soon.length)} مادة قربت تنتهي صلاحيتها ←</button>`);
    return `
      <section class="grid2">
        ${big('المبيعات', d.sales, 'blue', `${fmt(d.count)} فاتورة`)}
        ${hp ? '' : big('الربح', d.profit, 'green')}
        ${big('المصاريف', d.expenses, 'amber')}
        ${hp ? '' : big('الصافي', d.net, d.net < 0 ? 'red' : 'green', 'بعد المصاريف')}
      </section>
      <div class="chips">
        <span>مرتجعات <b>${fmt(d.returns_count)}</b>${d.returns ? ` (${fmt(d.returns)})` : ''}</span>
        <span>ملغية <b>${fmt(d.cancelled)}</b></span>
        <span>خصومات <b>${fmt(d.discounts)}</b></span>
      </div>
      ${alerts.join('')}
      <section class="card">
        <h3>القاصة هسه</h3>
        ${s.cash ? `<div class="kv"><span>المفروض بالقاصة</span><b class="num">${fmt(s.cash.iqd)} د.ع${s.cash.usd ? ` + $${fmt(s.cash.usd)}` : ''}</b></div><div class="kv sm"><span>الدوام مفتوح من</span><span>${esc(dmy(s.cash.since))} ${esc(t12(s.cash.since))}</span></div>` : '<div class="muted">ما اكو دوام صندوق مفتوح</div>'}
      </section>
      <section class="card">
        <h3>الديون</h3>
        <div class="kv"><span>على الزبائن (${fmt(s.debts.customers_n)})</span><b class="num red">${fmt(s.debts.customers)}</b></div>
        <div class="kv"><span>علينا للمذاخر (${fmt(s.debts.suppliers_n)})</span><b class="num amber">${fmt(s.debts.suppliers)}</b></div>
      </section>
      <section class="card">
        <h3>المبيعات آخر 14 يوم</h3>
        <div class="bars">${chart
          .map((x) => {
            const h = Math.round(((x.sales || 0) / max) * 100);
            const wd = DAYS[new Date(`${x.day}T12:00:00`).getDay()].replace('ال', '').slice(0, 2);
            return `<div class="bar" title="${esc(dmy(x.day))}: ${fmt(x.sales)}"><i style="height:${Math.max(h, x.sales ? 4 : 0)}%"></i><small>${esc(wd)}</small></div>`;
          })
          .join('')}</div>
      </section>
      ${
        s.top && s.top.length
          ? `<section class="card"><h3>الأكثر مبيعاً (7 أيام)</h3>${s.top
              .map((p, i) => `<div class="row"><span class="n">${i + 1}</span><span class="grow ell">${esc(p.name)}</span><span class="muted num">${fmt(p.qty)} ${esc(p.unit || '')}</span><b class="num">${fmt(p.sales)}</b></div>`)
              .join('')}</section>`
          : ''
      }`;
  }

  function shiftsTab(s, d) {
    if (!d.shifts || !d.shifts.length) return `<div class="empty">ما اكو شفتات بهاليوم<br><small>الشفت ينحسب لما الموظف يدخل برمزه</small></div>`;
    return d.shifts
      .map(
        (x) => `<section class="card shift ${x.live ? 'live' : ''}">
        <div class="shift-top"><span class="ava">${esc((x.name || '؟').trim().charAt(0))}</span><div class="grow"><b>${esc(x.name)}</b><small>${esc(t12(x.start))} ← ${x.live ? '<em>شغّال هسه</em>' : esc(t12(x.end))}${x.parts > 1 ? ` · دخل ${x.parts} مرات` : ''}</small></div><div class="shift-sales"><small>المبيعات</small><b class="num">${fmt(x.sales)}</b></div></div>
        <div class="chips">${s.hide_profit ? '' : `<span class="ok">الربح <b>${fmt(x.profit)}</b></span>`}<span>الفواتير <b>${fmt(x.count)}</b></span><span>المرتجعات <b>${fmt(x.returns)}</b></span><span>القاصة <b>${fmt(x.cash)}</b></span></div>
      </section>`
      )
      .join('');
  }

  function invoicesTab(s, d) {
    const list = d.invoices || [];
    const exp = d.expenses_list || [];
    return `${
      list.length
        ? `<section class="card list"><h3>الفواتير (${fmt(d.count)})</h3>${list
            .map(
              (i) => `<div class="row inv ${i.cancelled ? 'cancel' : ''}"><span class="num muted">${esc(t12(i.at))}</span><span class="grow"><b class="num">#${esc(i.n)}</b> <small>${esc(i.customer || 'نقدي')}${i.by ? ` · ${esc(i.by)}` : ''}</small></span>${i.cancelled ? '<em class="tag bad">ملغية</em>' : i.credit ? '<em class="tag warn">دين</em>' : ''}<b class="num">${fmt(i.total)}</b></div>`
            )
            .join('')}</section>`
        : '<div class="empty">ما اكو فواتير بهاليوم</div>'
    }${
      exp.length
        ? `<section class="card list"><h3>المصاريف</h3>${exp.map((e) => `<div class="row"><span class="num muted">${esc(t12(e.at))}</span><span class="grow">${esc(e.category)}${e.note ? ` <small>${esc(e.note)}</small>` : ''}</span><b class="num red">${fmt(e.iqd)}</b></div>`).join('')}</section>`
        : ''
    }`;
  }

  function stockTab(s) {
    const st = s.stock || { out: [], soon: [] };
    return `<section class="card list"><h3>قربت تنتهي صلاحيتها (${fmt(st.soon.length)})</h3>${
      st.soon.length ? st.soon.map((p) => `<div class="row"><span class="grow ell">${esc(p.name)}</span><span class="muted num">${fmt(p.qty)} ${esc(p.unit || '')}</span><b class="num amber">${esc(dmy(p.exp))}</b></div>`).join('') : '<div class="muted">ما اكو</div>'
    }</section>
    <section class="card list"><h3>خلصت من المخزون (${fmt(st.out_n)})</h3>${
      st.out.length ? st.out.map((n) => `<div class="row"><span class="grow ell">${esc(n)}</span><em class="tag bad">خلصت</em></div>`).join('') + (st.out_n > st.out.length ? `<div class="muted">و${fmt(st.out_n - st.out.length)} غيرها</div>` : '') : '<div class="muted">ما اكو</div>'
    }</section>`;
  }

  function nav() {
    const tabs = [
      ['home', 'الملخص', '◉'],
      ['shifts', 'الشفتات', '⏱'],
      ['invoices', 'الفواتير', '▤'],
      ['stock', 'المخزون', '▦'],
    ];
    return `<nav class="tabs">${tabs.map(([k, l, i]) => `<button class="${state.tab === k ? 'on' : ''}" data-tab="${k}"><span>${i}</span>${l}</button>`).join('')}</nav>`;
  }

  function render() {
    if ((!state.token || !KEY) && !demo) {
      $app.innerHTML = `<div class="welcome"><img src="icon-512.png" alt="" /><h1>ميزان</h1><p>ملخص محلك على الموبايل</p><ol><li>بالبرنامج بالحاسبة: الإعدادات ← تطبيق الآيفون ← «اربط الآيفون»</li><li>وجّه كاميرا الآيفون على الكود ودوس الرابط</li><li>بسفاري: زر المشاركة ← «إضافة إلى الشاشة الرئيسية»</li></ol></div>`;
      return;
    }
    const s = state.snap;
    if (!s) {
      $app.innerHTML = `<div class="welcome"><img src="icon-512.png" alt="" /><h1>ميزان</h1><p>${state.loading ? 'جاي يجيب الملخص...' : esc(state.error || 'ما وصل ملخص بعد. تأكد إن البرنامج بالحاسبة مفتوح وبيه نت')}</p>${state.loading ? '' : '<button class="btn" data-act="refresh">جرّب مرة ثانية</button>'}</div>`;
      return;
    }
    const d = state.day === 'yesterday' ? s.yesterday : s.today;
    const body = state.tab === 'shifts' ? shiftsTab(s, d) : state.tab === 'invoices' ? invoicesTab(s, d) : state.tab === 'stock' ? stockTab(s) : homeTab(s, d);
    $app.innerHTML = `${header(s)}<main>${body}<div class="foot">${esc(DAYS[new Date(`${d.date}T12:00:00`).getDay()])} ${esc(dmy(d.date))} · للقراءة بس</div></main>${nav()}`;
  }

  $app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab],[data-day],[data-act]');
    if (!b) return;
    if (b.dataset.tab) (state.tab = b.dataset.tab), set(LS.tab, state.tab), window.scrollTo(0, 0);
    if (b.dataset.day) state.day = b.dataset.day;
    if (b.dataset.act === 'refresh') return load();
    render();
  });

  render();
  load();
  // يتحدّث وحده كل 20 ثانية وهو مفتوح (البيعة توصل خلال ثواني)، ولما يرجع للتطبيق
  setInterval(() => document.visibilityState === "visible" && load(), 20000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load());
  if ('serviceWorker' in navigator && !demo) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
