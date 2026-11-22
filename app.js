/*
  ميزان — ملخص المحل على الموبايل (PWA، آيفون وأندرويد). للقراءة بس.
  الرمز السري والمفتاح العام يجون من رابط الـQR (#t=..&k=..)، ينحفظون بالجهاز وينشالون من الرابط.
  الملخص ينقرا من سوبابيس (mizan_phone_get) وينحفظ آخر واحد حتى يبين بلا نت.
  كل شي ينداس يفتح تفاصيله بنافذة من تحت (فاتورة بأدويتها واكسبايرها، شفت بفواتيره، دواء بوجباته ومذاخره...).
*/
(function () {
  const $app = document.getElementById('app');
  const LS = { token: 'mz_token', key: 'mz_key', snap: 'mz_snap', tab: 'mz_tab' };
  const lsGet = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const lsSet = (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* */
    }
  };

  const mt = location.hash.match(/t=([a-f0-9]{32,})/i);
  const mk = location.hash.match(/k=([A-Za-z0-9._-]{20,})/);
  if (mt) lsSet(LS.token, mt[1]);
  if (mk) lsSet(LS.key, mk[1]);
  if (mt || mk) history.replaceState(null, '', location.pathname + location.search);
  const demo = /demo/.test(location.search);
  const KEY = lsGet(LS.key) || '';

  const state = { token: lsGet(LS.token), snap: null, updated: null, tab: lsGet(LS.tab) || 'home', day: 'today', loading: false, error: '', sheets: [], q: '', pq: '' };
  try {
    const c = JSON.parse(lsGet(LS.snap) || 'null');
    if (c && c.data) (state.snap = c.data), (state.updated = c.updated_at);
  } catch {
    /* */
  }

  /* ===== أدوات ===== */
  const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US').format(Math.round(Number(n) || 0)));
  const qty = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const norm = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dmy = (s) => (s ? String(s).slice(0, 10).split('-').reverse().map(Number).join('/') : '');
  const t12 = (v) => {
    if (!v) return '';
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    if (!m) return '';
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'م' : 'ص'}`;
  };
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
  // الاكسباير: كم باقي ولونه
  function expInfo(date) {
    if (!date) return null;
    const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const days = Math.round((d - now) / 86400000);
    const alert = (state.snap && state.snap.alert_days) || 30;
    const level = days < 0 ? 'bad' : days <= alert ? 'warn' : 'ok';
    const text = days < 0 ? `منتهي من ${days * -1} يوم` : days === 0 ? 'ينتهي اليوم' : `باقي ${days} يوم`;
    return { days, level, text, date: dmy(date) };
  }
  const expChip = (date) => {
    const e = expInfo(date);
    return e ? `<span class="exp ${e.level}">${esc(e.date)}<small>${esc(e.text)}</small></span>` : '<span class="exp none">بلا اكسباير</span>';
  };
  const ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    receipt: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  };
  const ic = (n) => `<i class="ic">${ICON[n] || ''}</i>`;

  /* ===== التحميل ===== */
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
    renderTop();
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
        lsSet(LS.snap, null);
      } else {
        state.snap = j.data;
        state.updated = j.updated_at;
        lsSet(LS.snap, JSON.stringify(j));
      }
    } catch (e) {
      state.error = navigator.onLine === false ? 'ما اكو نت. هذا آخر ملخص انحفظ' : e.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  /* ===== الأجزاء ===== */
  const day = () => (state.snap ? (state.day === 'yesterday' ? state.snap.yesterday : state.snap.today) : null);
  function compare(cur, prev) {
    if (!prev || prev <= 0 || cur == null) return '';
    const p = Math.round(((cur - prev) / prev) * 100);
    if (!p) return '<span class="cmp eq">نفس أمس</span>';
    return `<span class="cmp ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% عن أمس</span>`;
  }

  function header() {
    const s = state.snap || {};
    const old = state.updated && Date.now() - new Date(state.updated).getTime() > 30 * 60000;
    return `<header class="top" id="top">
      <div class="top-row">
        <img src="icon-192.png" alt="" class="logo" />
        <div class="ttl"><b>${esc(s.shop || 'ميزان')}</b><small class="${old ? 'stale' : ''}">${state.loading ? 'جاي يتحدّث...' : `آخر تحديث ${esc(ago(state.updated))}`}${old ? ' · الحاسبة بلا نت؟' : ''}</small></div>
        <button class="iconbtn ${state.loading ? 'spin' : ''}" data-act="refresh" aria-label="تحديث">${ic('refresh')}</button>
      </div>
      ${state.error ? `<div class="err">${esc(state.error)}</div>` : ''}
      ${state.tab === 'stock' ? '' : `<div class="seg"><button class="${state.day === 'today' ? 'on' : ''}" data-day="today">اليوم</button><button class="${state.day === 'yesterday' ? 'on' : ''}" data-day="yesterday">أمس</button></div>`}
    </header>`;
  }

  function homeTab() {
    const s = state.snap;
    const d = day();
    const prev = state.day === 'today' ? s.yesterday : null;
    const hp = s.hide_profit;
    const chart = (s.daily || []).slice(-14);
    const max = Math.max(1, ...chart.map((x) => x.sales || 0));
    const alerts = [];
    if (s.odd) alerts.push(`<div class="alert bad"><span><b>${fmt(s.odd)}</b> أرقام غريبة (كميات أو أسعار خيالية). صلّحها من البرنامج: فحص الأرقام</span></div>`);
    if (s.stock?.soon?.length) alerts.push(`<button class="alert warn" data-go="stock">${ic('box')}<span><b>${fmt(s.stock.soon.length)}</b> دواء قربت تنتهي صلاحيته</span>${ic('chev')}</button>`);
    if (s.stock?.out_n) alerts.push(`<button class="alert warn" data-go="stock">${ic('box')}<span><b>${fmt(s.stock.out_n)}</b> دواء خلص من المخزن</span>${ic('chev')}</button>`);
    return `
      <button class="hero" data-go="invoices">
        <small>مبيعات ${state.day === 'today' ? 'اليوم' : 'أمس'}</small>
        <b class="num">${fmt(d.sales)}<em>د.ع</em></b>
        <div class="hero-sub"><span>${fmt(d.count)} فاتورة · المعدل ${fmt(d.avg)}</span>${compare(d.sales, prev?.sales)}</div>
      </button>
      <section class="trio">
        ${hp ? '' : `<div class="mini green"><small>الربح</small><b class="num">${fmt(d.profit)}</b>${compare(d.profit, prev?.profit)}</div>`}
        <div class="mini amber"><small>المصاريف</small><b class="num">${fmt(d.expenses)}</b></div>
        ${hp ? '' : `<div class="mini ${d.net < 0 ? 'red' : 'blue'}"><small>الصافي</small><b class="num">${fmt(d.net)}</b></div>`}
      </section>
      <div class="pills"><span>مرتجعات <b>${fmt(d.returns_count)}</b></span><span>ملغية <b>${fmt(d.cancelled)}</b></span><span>خصومات <b>${fmt(d.discounts)}</b></span></div>
      ${alerts.join('')}
      <section class="card two">
        <button class="half" data-sheet="cash"><small>القاصة هسه</small><b class="num">${s.cash ? fmt(s.cash.iqd) : '—'}</b><span>${s.cash ? `من ${esc(t12(s.cash.since))}` : 'الدوام مسكّر'}</span></button>
        <button class="half" data-sheet="debts"><small>على الزبائن</small><b class="num red">${fmt(s.debts.customers)}</b><span>${fmt(s.debts.customers_n)} زبون · علينا ${fmt(s.debts.suppliers)}</span></button>
      </section>
      <section class="card">
        <div class="card-h"><h3>المبيعات آخر 14 يوم</h3><small class="muted">دوس على أي يوم</small></div>
        <div class="bars">${chart
          .map((x, i) => {
            const h = Math.round(((x.sales || 0) / max) * 100);
            const wd = DAYS[new Date(`${x.day}T12:00:00`).getDay()].replace('ال', '').slice(0, 2);
            return `<button class="bar ${i === chart.length - 1 ? 'last' : ''}" data-sheet="day" data-day-of="${esc(x.day)}"><i style="height:${Math.max(h, x.sales ? 5 : 0)}%"></i><small>${esc(wd)}</small></button>`;
          })
          .join('')}</div>
      </section>
      ${
        s.top?.length
          ? `<section class="card"><div class="card-h"><h3>الأكثر مبيعاً</h3><small class="muted">آخر 7 أيام</small></div>${s.top
              .slice(0, 8)
              .map((p, i) => `<button class="row" data-sheet="top" data-i="${i}"><span class="rank">${i + 1}</span><span class="grow ell">${esc(p.name)}</span><span class="muted num">${qty(p.qty)}</span><b class="num">${fmt(p.sales)}</b>${ic('chev')}</button>`)
              .join('')}</section>`
          : ''
      }`;
  }

  function shiftCard(x) {
    const s = state.snap;
    return `<button class="card shift ${x.live ? 'live' : ''}" data-sheet="shift" data-id="${esc(x.id)}">
      <div class="shift-top"><span class="ava">${esc((x.name || '؟').trim().charAt(0))}</span>
        <div class="grow"><b>${esc(x.name)}</b><small>${esc(t12(x.start))} ← ${x.live ? '<em>شغّال هسه</em>' : esc(t12(x.end))}${x.parts > 1 ? ` · دخل ${x.parts} مرات` : ''}</small></div>
        <div class="shift-sales"><small>المبيعات</small><b class="num">${fmt(x.sales)}</b></div></div>
      <div class="pills">${s.hide_profit ? '' : `<span class="ok">الربح <b>${fmt(x.profit)}</b></span>`}<span>فواتير <b>${fmt(x.count)}</b></span><span>القاصة <b>${fmt(x.cash)}</b></span>${x.returns ? `<span>مرتجعات <b>${fmt(x.returns)}</b></span>` : ''}</div>
    </button>`;
  }
  function shiftsTab() {
    const d = day();
    if (!d.shifts?.length) return `<div class="empty">${ic('clock')}<b>ما اكو شفتات بهاليوم</b><small>الشفت ينحسب لما الموظف يدخل برمزه بالبرنامج</small></div>`;
    return d.shifts.map(shiftCard).join('');
  }

  function invRow(i, idx) {
    return `<button class="row inv ${i.cancelled ? 'cancel' : ''}" data-sheet="inv" data-n="${esc(i.n)}" data-idx="${idx}">
      <span class="t num">${esc(t12(i.at))}</span>
      <span class="grow"><b class="num">#${esc(i.n)}</b> <small class="ell">${esc(i.customer || 'نقدي')} · ${esc((i.items || []).map((x) => x.name).slice(0, 2).join('، '))}${(i.items || []).length > 2 ? '...' : ''}</small></span>
      ${i.cancelled ? '<em class="tag bad">ملغية</em>' : i.credit ? '<em class="tag warn">دين</em>' : ''}
      <b class="num">${fmt(i.total)}</b>${ic('chev')}
    </button>`;
  }
  function invoicesTab() {
    const d = day();
    const q = norm(state.q);
    const list = (d.invoices || []).map((i, idx) => ({ i, idx })).filter(({ i }) => !q || String(i.n).includes(q) || norm(i.customer).includes(q) || norm(i.by).includes(q) || (i.items || []).some((x) => norm(x.name).includes(q)));
    return `<div class="search">${ic('search')}<input id="q" value="${esc(state.q)}" placeholder="ابحث برقم الفاتورة، الزبون، أو اسم الدواء" /></div>
      ${list.length ? `<section class="card list">${list.map(({ i, idx }) => invRow(i, idx)).join('')}</section>` : `<div class="empty">${ic('receipt')}<b>${q ? 'ما لگيت فاتورة' : 'ما اكو فواتير بهاليوم'}</b></div>`}
      ${
        !q && d.returns_list?.length
          ? `<section class="card list"><div class="card-h"><h3>المرتجعات</h3></div>${d.returns_list.map((r) => `<div class="row"><span class="t num">${esc(t12(r.at))}</span><span class="grow">مرتجع <b class="num">#${esc(r.n)}</b> <small>${esc(r.by)}</small></span><b class="num red">${fmt(r.total)}</b></div>`).join('')}</section>`
          : ''
      }
      ${
        !q && d.expenses_list?.length
          ? `<section class="card list"><div class="card-h"><h3>المصاريف</h3></div>${d.expenses_list.map((e) => `<div class="row"><span class="t num">${esc(t12(e.at))}</span><span class="grow">${esc(e.category)}${e.note ? ` <small>${esc(e.note)}</small>` : ''}</span><b class="num red">${fmt(e.iqd)}</b></div>`).join('')}</section>`
          : ''
      }`;
  }

  function drugRow(p, kind) {
    const e = expInfo(p.exp);
    return `<button class="row drug" data-sheet="drug" data-kind="${kind}" data-id="${p.id}">
      <span class="grow"><b class="ell">${esc(p.name)}</b><small>${kind === 'out' ? 'خلص' : `${qty(p.qty)} ${esc(p.unit || '')}`}${p.batches?.length > 1 ? ` · ${p.batches.length} اكسباير` : ''}</small></span>
      ${kind === 'out' ? '<em class="tag bad">خلص</em>' : e ? `<span class="exp ${e.level}">${esc(e.date)}</span>` : ''}${ic('chev')}
    </button>`;
  }
  function stockTab() {
    const st = state.snap.stock || {};
    const q = norm(state.pq);
    const found = q ? (st.all || []).filter((r) => norm(r[1]).includes(q)).slice(0, 60) : [];
    return `<div class="search">${ic('search')}<input id="pq" value="${esc(state.pq)}" placeholder="ابحث عن دواء: كم باقي منه وسعره واكسبايره" /></div>
      ${
        q
          ? found.length
            ? `<section class="card list">${found.map((r) => `<button class="row drug" data-sheet="drug" data-kind="all" data-id="${r[0]}"><span class="grow"><b class="ell">${esc(r[1])}</b><small>${r[2] > 0 ? `${qty(r[2])} ${esc(r[5] || '')}` : 'خلص'} · ${fmt(r[3])} د.ع</small></span>${r[4] ? `<span class="exp ${expInfo(r[4]).level}">${esc(dmy(r[4]))}</span>` : ''}${ic('chev')}</button>`).join('')}</section>`
            : `<div class="empty">${ic('box')}<b>ما لگيت دواء بهالاسم</b></div>`
          : `<section class="card list"><div class="card-h"><h3>قربت تنتهي صلاحيتها</h3><small class="muted">${fmt((st.soon || []).length)}</small></div>${(st.soon || []).length ? st.soon.map((p) => drugRow(p, 'soon')).join('') : '<div class="muted pad">ما اكو</div>'}</section>
             <section class="card list"><div class="card-h"><h3>خلصت من المخزن</h3><small class="muted">${fmt(st.out_n)}</small></div>${(st.out || []).length ? st.out.map((p) => drugRow(p, 'out')).join('') + (st.out_n > st.out.length ? `<div class="muted pad">و${fmt(st.out_n - st.out.length)} غيرها</div>` : '') : '<div class="muted pad">ما اكو</div>'}</section>`
      }`;
  }

  /* ===== نوافذ التفاصيل (من تحت) ===== */
  function sheetBody(sh) {
    const s = state.snap;
    const d = day();
    const hp = s.hide_profit;
    if (sh.type === 'inv') {
      const i = (d.invoices || [])[sh.idx] || (d.invoices || []).find((x) => String(x.n) === String(sh.n));
      if (!i) return ['الفاتورة', '<div class="muted pad">ما لگيتها</div>'];
      const sub = (i.items || []).reduce((a, x) => a + x.total, 0);
      return [
        `فاتورة #${i.n}`,
        `<div class="kvs">
          <div><small>الوقت</small><b>${esc(t12(i.at))}</b></div>
          <div><small>الزبون</small><b>${esc(i.customer || 'نقدي')}</b></div>
          <div><small>منو باع</small><b>${esc(i.by || '—')}</b></div>
          <div><small>الدفع</small><b>${i.cancelled ? '<em class="tag bad">ملغية</em>' : i.credit ? `<em class="tag warn">دين ${fmt(i.credit)}</em>` : '<em class="tag ok">نقد</em>'}</b></div>
        </div>
        <h4>شنو انباع (${(i.items || []).length})</h4>
        ${(i.items || [])
          .map(
            (x) => `<div class="item">
            <div class="item-top"><b>${esc(x.name)}</b><b class="num">${fmt(x.total)}</b></div>
            <div class="item-sub"><span class="num">${qty(x.qty)} ${esc(x.unit)} × ${fmt(x.price)}</span>${x.foc ? `<span class="tag ok">+${qty(x.foc)} بونص</span>` : ''}${hp || x.profit == null ? '' : `<span class="green">ربح ${fmt(x.profit)}</span>`}</div>
            <div class="item-sub">${expChip(x.exp)}${x.src ? `<span class="muted">من ${esc(x.src)}</span>` : ''}</div>
          </div>`
          )
          .join('')}
        <div class="sum">
          ${i.discount ? `<div><span>المجموع قبل الخصم</span><b class="num">${fmt(sub)}</b></div><div><span>الخصم</span><b class="num red">- ${fmt(i.discount)}</b></div>` : ''}
          <div class="big"><span>المجموع</span><b class="num">${fmt(i.total)} د.ع</b></div>
          ${i.paid ? `<div><span>الواصل</span><b class="num">${fmt(i.paid)}</b></div>` : ''}
          ${i.change ? `<div><span>الباقي للزبون</span><b class="num">${fmt(i.change)}</b></div>` : ''}
          ${hp || i.profit == null ? '' : `<div><span>ربح الفاتورة</span><b class="num green">${fmt(i.profit)}</b></div>`}
        </div>`,
      ];
    }
    if (sh.type === 'shift') {
      const x = (d.shifts || []).find((y) => String(y.id) === String(sh.id));
      if (!x) return ['الشفت', ''];
      const list = (d.invoices || []).map((i, idx) => ({ i, idx })).filter(({ i }) => String(i.sid) === String(x.id));
      return [
        /^(ال)?شفت/.test(x.name || '') ? x.name : `شفت ${x.name}`,
        `<div class="kvs">
          <div><small>دخل</small><b>${esc(t12(x.start))}</b></div>
          <div><small>طلع</small><b>${x.live ? '<em class="green">شغّال هسه</em>' : esc(t12(x.end))}</b></div>
          <div><small>المبيعات</small><b class="num">${fmt(x.sales)}</b></div>
          ${hp ? '' : `<div><small>الربح</small><b class="num green">${fmt(x.profit)}</b></div>`}
          <div><small>القاصة من شغله</small><b class="num">${fmt(x.cash)}</b></div>
          <div><small>المرتجعات</small><b class="num">${fmt(x.returns)}</b></div>
        </div>
        <h4>فواتيره (${list.length})</h4>
        <div class="list">${list.map(({ i, idx }) => invRow(i, idx)).join('') || '<div class="muted pad">ما اكو</div>'}</div>`,
      ];
    }
    if (sh.type === 'drug') {
      const st = s.stock || {};
      const p = (sh.kind === 'soon' ? st.soon : sh.kind === 'out' ? st.out : null)?.find((y) => y.id === sh.id) || (s.products || {})[sh.id] || [...(st.soon || []), ...(st.out || [])].find((y) => y.id === sh.id);
      const r = (st.all || []).find((y) => y[0] === sh.id);
      if (!p && !r) return ['الدواء', '<div class="muted pad">ما لگيته</div>'];
      const name = p ? p.name : r[1];
      const unit = p ? p.unit : r[5];
      const q = p ? p.qty : r[2];
      const price = p ? p.price : r[3];
      return [
        name,
        `<div class="kvs">
          <div><small>الموجود</small><b class="num ${q > 0 ? '' : 'red'}">${q > 0 ? `${qty(q)} ${esc(unit || '')}` : 'خلص'}</b></div>
          <div><small>سعر البيع</small><b class="num">${fmt(price)} د.ع</b></div>
          ${p && !hp && p.cost != null ? `<div><small>سعر الشراء</small><b class="num">${fmt(p.cost)} د.ع</b></div>` : ''}
          ${p && p.last_sold ? `<div><small>آخر بيع</small><b>${esc(dmy(p.last_sold))} ${esc(t12(p.last_sold))}</b></div>` : ''}
        </div>
        <h4>الاكسباير</h4>
        ${
          p && p.batches?.length
            ? p.batches.map((b) => `<div class="row"><span class="grow">${expChip(b.exp)}</span><b class="num">${qty(b.qty)} ${esc(unit || '')}</b></div>`).join('')
            : `<div class="row"><span class="grow">${expChip(p ? p.exp : r[4])}</span></div>`
        }
        ${p && p.sups?.length ? `<h4>من يا مذخر</h4>${p.sups.map((g) => `<div class="row"><span class="grow">${esc(g.name)}</span><span class="muted num">${qty(g.qty)} ${esc(unit || '')}</span>${hp || g.cost == null ? '' : `<b class="num">${fmt(g.cost)}</b>`}</div>`).join('')}` : ''}
        ${!p ? '<div class="muted pad">التفاصيل الكاملة (المذاخر وكل اكسباير) تبين للأدوية اللي بالقوائم. هذا اللي معروف عنه من البحث.</div>' : ''}`,
      ];
    }
    if (sh.type === 'top') {
      const t = s.top[sh.i];
      const p = (s.products || {})[t.id];
      return [
        t.name,
        `<div class="kvs">
          <div><small>انباع (7 أيام)</small><b class="num">${qty(t.qty)} ${esc(t.unit || '')}</b></div>
          <div><small>المبيعات</small><b class="num">${fmt(t.sales)}</b></div>
          ${hp ? '' : `<div><small>الربح</small><b class="num green">${fmt(t.profit)}</b></div>`}
          <div><small>بكم فاتورة</small><b class="num">${fmt(t.invoices)}</b></div>
          ${p ? `<div><small>الباقي هسه</small><b class="num ${p.qty > 0 ? '' : 'red'}">${p.qty > 0 ? `${qty(p.qty)} ${esc(p.unit)}` : 'خلص'}</b></div>` : ''}
        </div>
        ${p && p.batches?.length ? `<h4>الاكسباير</h4>${p.batches.map((b) => `<div class="row"><span class="grow">${expChip(b.exp)}</span><b class="num">${qty(b.qty)}</b></div>`).join('')}` : ''}`,
      ];
    }
    if (sh.type === 'debts') {
      const db = s.debts;
      return [
        'الديون',
        `<div class="kvs"><div><small>على الزبائن</small><b class="num red">${fmt(db.customers)}</b></div><div><small>علينا للمذاخر</small><b class="num amber">${fmt(db.suppliers)}</b></div></div>
        <h4>أكثر الزبائن عليهم</h4>${(db.customers_top || []).map((c) => `<div class="row"><span class="grow"><b>${esc(c.name)}</b>${c.phone ? ` <small class="num">${esc(c.phone)}</small>` : ''}</span><b class="num red">${fmt(c.iqd)}</b></div>`).join('') || '<div class="muted pad">ما اكو</div>'}
        <h4>اللي النا عليه للمذاخر</h4>${(db.suppliers_top || []).map((c) => `<div class="row"><span class="grow">${esc(c.name)}</span><b class="num amber">${fmt(c.iqd)}</b></div>`).join('') || '<div class="muted pad">ما اكو</div>'}`,
      ];
    }
    if (sh.type === 'cash') {
      return [
        'القاصة',
        s.cash
          ? `<div class="kvs"><div><small>المفروض بالقاصة هسه</small><b class="num">${fmt(s.cash.iqd)} د.ع</b></div>${s.cash.usd ? `<div><small>دولار</small><b class="num">$${qty(s.cash.usd)}</b></div>` : ''}<div><small>الدوام مفتوح من</small><b>${esc(dmy(s.cash.since))} ${esc(t12(s.cash.since))}</b></div></div>
             <h4>اليوم</h4><div class="kvs"><div><small>المبيعات</small><b class="num">${fmt(s.today.sales)}</b></div><div><small>المصاريف</small><b class="num red">${fmt(s.today.expenses)}</b></div></div>`
          : '<div class="muted pad">دوام القاصة مسكّر هسه</div>',
      ];
    }
    if (sh.type === 'day') {
      const x = (s.daily || []).find((y) => y.day === sh.day) || {};
      return [
        `${DAYS[new Date(`${sh.day}T12:00:00`).getDay()]} ${dmy(sh.day)}`,
        `<div class="kvs"><div><small>المبيعات</small><b class="num">${fmt(x.sales)}</b></div>${hp ? '' : `<div><small>الربح</small><b class="num green">${fmt(x.profit)}</b></div>`}<div><small>الفواتير</small><b class="num">${fmt(x.count)}</b></div></div>
        ${sh.day === s.today.date || sh.day === s.yesterday.date ? `<button class="btn wide" data-openday="${sh.day === s.today.date ? 'today' : 'yesterday'}">شوف فواتير هاليوم</button>` : ''}`,
      ];
    }
    return ['', ''];
  }

  function sheets() {
    if (!state.sheets.length) return '';
    const sh = state.sheets[state.sheets.length - 1];
    const [title, body] = sheetBody(sh);
    return `<div class="sheet-bg" data-act="close"></div>
      <div class="sheet" role="dialog">
        <div class="grab"></div>
        <div class="sheet-h">${state.sheets.length > 1 ? `<button class="iconbtn" data-act="back">${ic('back')}</button>` : ''}<b class="grow ell">${esc(title)}</b><button class="iconbtn" data-act="close">${ic('close')}</button></div>
        <div class="sheet-b">${body}</div>
      </div>`;
  }

  function nav() {
    const tabs = [
      ['home', 'الملخص', 'home'],
      ['shifts', 'الشفتات', 'clock'],
      ['invoices', 'الفواتير', 'receipt'],
      ['stock', 'المخزون', 'box'],
    ];
    return `<nav class="tabs">${tabs.map(([k, l, i]) => `<button class="${state.tab === k ? 'on' : ''}" data-tab="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</nav>`;
  }

  function welcome(msg, btn) {
    return `<div class="welcome"><img src="icon-512.png" alt="" /><h1>ميزان</h1><p>${msg}</p>${btn || ''}</div>`;
  }

  function renderTop() {
    const el = document.getElementById('top');
    if (el) el.outerHTML = header();
    else render();
  }

  function render() {
    if ((!state.token || !KEY) && !demo) {
      $app.innerHTML = welcome('ملخص محلك على الموبايل', `<ol><li>بالبرنامج بالحاسبة: الإعدادات ← تطبيق الموبايل ← «اربط الموبايل»</li><li>وجّه كاميرا الموبايل على الكود ودوس الرابط</li><li>آيفون: زر المشاركة ← «إضافة إلى الشاشة الرئيسية». أندرويد: ⋮ ← «تثبيت التطبيق»</li></ol>`);
      return;
    }
    if (!state.snap) {
      $app.innerHTML = welcome(state.loading ? 'جاي يجيب الملخص...' : esc(state.error || 'ما وصل ملخص بعد. تأكد إن البرنامج بالحاسبة مفتوح وبيه نت'), state.loading ? '' : '<button class="btn" data-act="refresh">جرّب مرة ثانية</button>');
      return;
    }
    const d = day();
    if (!d) return;
    const body = state.tab === 'shifts' ? shiftsTab() : state.tab === 'invoices' ? invoicesTab() : state.tab === 'stock' ? stockTab() : homeTab();
    const focus = document.activeElement && document.activeElement.id;
    const caret = focus && document.activeElement.selectionStart;
    $app.innerHTML = `${header()}<main>${body}<div class="foot">${state.tab === 'stock' ? 'المخزون هسه' : `${esc(DAYS[new Date(`${d.date}T12:00:00`).getDay()])} ${esc(dmy(d.date))}`} · للقراءة بس</div></main>${nav()}${sheets()}`;
    document.body.classList.toggle('locked', state.sheets.length > 0);
    if (focus === 'q' || focus === 'pq') {
      const el = document.getElementById(focus);
      if (el) (el.focus(), el.setSelectionRange(caret, caret));
    }
  }

  /* ===== زر الرجوع (أندرويد والسحب بالآيفون) مثل التطبيقات =====
     كل تبويب أو نافذة تفاصيل تنفتح تنحط بتاريخ المتصفح، فالرجوع يسد آخر نافذة أو يرجع للتبويب القبله،
     وما يطلع من التطبيق إلا من الملخص الرئيسي. */
  const snapView = () => ({ mz: 1, tab: state.tab, day: state.day, sheets: state.sheets.slice() });
  history.replaceState(snapView(), '');
  const go = (fn) => {
    fn();
    history.pushState(snapView(), '');
    render();
  };
  window.addEventListener('popstate', (e) => {
    const v = e.state;
    if (v && v.mz) {
      state.tab = v.tab;
      state.day = v.day;
      state.sheets = v.sheets || [];
      lsSet(LS.tab, state.tab);
    } else {
      // أول صفحة: الرجوع يقفل النوافذ ويرجع للملخص قبل ما يطلع
      state.sheets = [];
      state.tab = 'home';
    }
    render();
  });

  /* ===== الأحداث ===== */
  $app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab],[data-day],[data-act],[data-sheet],[data-go],[data-openday]');
    if (!b) return;
    if (b.dataset.act === 'refresh') return void load();
    // السد والرجوع بنفس طريق زر الرجوع حتى التاريخ يبقى مضبوط
    if (b.dataset.act === 'close') return void (state.sheets.length ? history.go(-state.sheets.length) : null);
    if (b.dataset.act === 'back') return void history.back();
    if (b.dataset.tab) {
      if (b.dataset.tab === state.tab && !state.sheets.length) return void window.scrollTo({ top: 0, behavior: 'smooth' });
      return go(() => ((state.tab = b.dataset.tab), lsSet(LS.tab, state.tab), (state.sheets = []), window.scrollTo(0, 0)));
    }
    if (b.dataset.go) return go(() => ((state.tab = b.dataset.go), lsSet(LS.tab, state.tab), (state.sheets = []), window.scrollTo(0, 0)));
    if (b.dataset.openday) return go(() => ((state.day = b.dataset.openday), (state.tab = 'invoices'), (state.sheets = [])));
    if (b.dataset.day) {
      state.day = b.dataset.day;
      history.replaceState(snapView(), '');
      return void render();
    }
    if (b.dataset.sheet) {
      const x = { type: b.dataset.sheet };
      if (b.dataset.idx != null) x.idx = Number(b.dataset.idx);
      if (b.dataset.n) x.n = b.dataset.n;
      if (b.dataset.id) x.id = /^\d+$/.test(b.dataset.id) ? Number(b.dataset.id) : b.dataset.id;
      if (b.dataset.kind) x.kind = b.dataset.kind;
      if (b.dataset.i) x.i = Number(b.dataset.i);
      if (b.dataset.dayOf) x.day = b.dataset.dayOf;
      return go(() => state.sheets.push(x));
    }
    render();
  });
  $app.addEventListener('input', (e) => {
    if (e.target.id === 'q') (state.q = e.target.value), render();
    if (e.target.id === 'pq') (state.pq = e.target.value), render();
  });

  render();
  load();
  // يتحدّث وحده كل 20 ثانية وهو مفتوح (البيعة توصل خلال ثواني)، ولما يرجع للتطبيق. ما يتحدّث وانت فاتح تفاصيل أو تكتب بحث
  setInterval(() => document.visibilityState === 'visible' && !state.sheets.length && !/^(q|pq)$/.test(document.activeElement?.id || '') && load(), 20000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load());
  if ('serviceWorker' in navigator && !demo) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
