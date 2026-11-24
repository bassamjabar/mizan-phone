/*
  ميزان — تطبيق الموبايل v3 (PWA، آيفون وأندرويد)
  - الملخص ينقرا من سوبابيس (mizan_phone_get) وينحفظ آخر واحد حتى يبين بلا نت.
  - البيع والطلبات: التطبيق يحط بصندوق (mizan_phone_push) والبرنامج بالصيدلية يسحبه وينفّذه خلال ثواني،
    والتطبيق يسأل عن النتيجة (mizan_phone_results). البيعة تحتاج رمز المدير.
  - الباركود: BarcodeDetector إذا موجود (أندرويد)، وإلا مكتبة ZXing (الآيفون).
  الرمز السري والمفتاح العام يجون من رابط الـQR (#t=..&k=..)، ينحفظون بالجهاز وينشالون من الرابط.
*/
(function () {
  const $app = document.getElementById('app');
  const LS = { token: 'mz_token', key: 'mz_key', snap: 'mz_snap', tab: 'mz_tab', pend: 'mz_pend3', cart: 'mz_cart3' };
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
  const lsJson = (k, d) => {
    try {
      return JSON.parse(lsGet(k) || 'null') ?? d;
    } catch {
      return d;
    }
  };

  const mt = location.hash.match(/t=([a-f0-9]{32,})/i);
  const mk = location.hash.match(/k=([A-Za-z0-9._-]{20,})/);
  if (mt) lsSet(LS.token, mt[1]);
  if (mk) lsSet(LS.key, mk[1]);
  if (mt || mk) history.replaceState(null, '', location.pathname + location.search);
  const demo = /demo/.test(location.search);
  const KEY = lsGet(LS.key) || '';
  const TOKEN = lsGet(LS.token) || '';

  const TABS = ['home', 'orders', 'sale', 'stock', 'more'];
  const state = {
    snap: null,
    updated: null,
    tab: TABS.includes(lsGet(LS.tab)) && lsGet(LS.tab) !== 'sale' ? lsGet(LS.tab) : 'home',
    day: 'today',
    more: null,
    loading: false,
    error: '',
    sheets: [],
    q: '',
    pq: '',
    sq: '',
    filter: 'all',
    limit: 60,
    ordTab: 'new',
    cart: lsJson(LS.cart, []),
    pend: lsJson(LS.pend, []),
    reqOv: {},
    info: {},
    co: null,
    toast: null,
  };
  try {
    const c = JSON.parse(lsGet(LS.snap) || 'null');
    if (c && c.data) (state.snap = c.data), (state.updated = c.updated_at);
  } catch {
    /* */
  }

  /* ===== أدوات ===== */
  const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US').format(Math.round(Number(n) || 0)));
  const qty = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const short = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '')} مليون`;
    return fmt(v);
  };
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
  const toDate = (v) => (v ? new Date(/T|Z/.test(String(v)) ? v : String(v).replace(' ', 'T')) : null);
  const ago = (v) => {
    const d = toDate(v);
    if (!d || isNaN(d)) return '';
    const m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'هسه';
    if (m < 60) return `قبل ${m} دقيقة`;
    const h = Math.floor(m / 60);
    if (h < 24) return `قبل ${h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`}`;
    const dd = Math.floor(h / 24);
    return `قبل ${dd === 1 ? 'يوم' : dd === 2 ? 'يومين' : `${dd} أيام`}`;
  };
  const greet = () => {
    const h = new Date().getHours();
    return h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء الخير';
  };
  const uidNew = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const alertDays = () => (state.snap && state.snap.alert_days) || 30;
  function expInfo(date) {
    if (!date) return null;
    const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const days = Math.round((d - now) / 86400000);
    const level = days < 0 ? 'red' : days <= alertDays() ? 'violet' : 'gray';
    const text = days < 0 ? `منتهي من ${-days} يوم` : days === 0 ? 'ينتهي اليوم' : `باقي ${days} يوم`;
    return { days, level, text, date: String(date).slice(0, 7).split('-').reverse().join('/') };
  }

  const P = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const ICON = {
    home: P('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    orders: P('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>'),
    scan: P('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>'),
    box: P('<path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>'),
    grid: P('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
    refresh: P('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>'),
    close: P('<path d="M6 6l12 12M18 6 6 18"/>'),
    back: P('<path d="m9 6 6 6-6 6"/>'),
    chev: P('<path d="m15 6-6 6 6 6"/>'),
    search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    check: P('<path d="M5 12.5 10 17 19 7"/>'),
    user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
    truck: P('<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
    trash: P('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    flash: P('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    cam: P('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    receipt: P('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    wallet: P('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>'),
    people: P('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11h4M19 9v4"/>'),
    alert: P('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'),
    star: P('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
    phone: P('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>'),
    undo: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  };
  const ic = (n) => `<i class="ic">${ICON[n] || ''}</i>`;

  /* ===== التنبيه الصغير ===== */
  let toastT = null;
  function toast(msg, bad) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);z-index:60;display:flex;justify-content:center;pointer-events:none';
      document.body.appendChild(el);
    }
    el.innerHTML = `<span style="background:${bad ? '#b91c1c' : '#0f172a'};color:#fff;padding:11px 16px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:520px;text-align:center">${esc(msg)}</span>`;
    clearTimeout(toastT);
    toastT = setTimeout(() => (el.innerHTML = ''), 2800);
  }

  /* ===== الخادم ===== */
  async function rpc(name, body) {
    const r = await fetch(`${window.SB_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (/bad token/.test(t)) throw new Error('الربط انلغى. اربط من جديد من البرنامج');
      if (/Could not find|does not exist|PGRST202/.test(t)) throw new Error('البيع من الموبايل مو مفعّل بسوبابيس بعد (سكربت v3)');
      if (/too many pending/.test(t)) throw new Error('اكو هواية عمليات تنتظر البرنامج. شغّل البرنامج بالصيدلية');
      throw new Error(`خطأ من الخادم (${r.status})`);
    }
    return r.json();
  }

  async function load() {
    if (demo) {
      if (!state.snap || !state.snap.__demo) {
        const r = await fetch('demo.json');
        state.snap = { ...(await r.json()), __demo: true };
        indexCatalog();
      }
      state.updated = new Date(Date.now() - 12000).toISOString();
      return render();
    }
    if (!TOKEN || !KEY) return render();
    state.loading = true;
    state.error = '';
    paintSync();
    try {
      const j = await rpc('mizan_phone_get', { p_token: TOKEN });
      if (!j || !j.data || !Object.keys(j.data).length) {
        state.snap = null;
        state.error = 'الربط انلغى أو الكود قديم. اربط من جديد من البرنامج بالحاسبة';
        lsSet(LS.snap, null);
      } else {
        state.snap = j.data;
        state.updated = j.updated_at;
        lsSet(LS.snap, JSON.stringify(j));
        indexCatalog();
        // الطلب اللي تغيّرت حالته وصل للملخص: ما نحتاج التغيير المؤقت بعد
        for (const r of state.snap.requests || []) if (state.reqOv[r.id] === r.state) delete state.reqOv[r.id];
      }
    } catch (e) {
      state.error = navigator.onLine === false ? 'ما اكو نت. هذا آخر ملخص انحفظ' : e.message;
    } finally {
      state.loading = false;
      // ما نعيد الرسم وانت تكتب أو فاتح الكاميرا أو تدفع (حتى ما ينقطع شغلك)
      if (quiet()) paintSync();
      else render();
    }
  }
  const quiet = () => state.tab === 'sale' || state.sheets.some((s) => s.type === 'checkout' || s.type === 'newreq' || s.type === 'scan') || /^(q|pq|sq|cq|paid|names|rq)$/.test(document.activeElement?.id || '');

  /* ===== الصندوق: يحط عملية وينتظر نتيجتها ===== */
  const demoBox = {};
  async function push(kind, payload) {
    const cid = uidNew();
    if (demo) {
      demoBox[cid] = { at: Date.now(), kind, payload };
      return cid;
    }
    await rpc('mizan_phone_push', { p_token: TOKEN, p_kind: kind, p_client: cid, p_payload: payload });
    return cid;
  }
  function demoResult(cid) {
    const x = demoBox[cid];
    if (!x || Date.now() - x.at < 1100) return { client_id: cid, status: 'pending' };
    if (x.kind === 'sale') {
      if (x.payload.pin !== '1111') return { client_id: cid, status: 'error', result: { error: 'رمز المدير غلط' } };
      const total = x.payload.items.reduce((a, i) => a + i.qty * i.price, 0);
      return { client_id: cid, status: 'done', result: { number: 1048, total, change: Math.max(0, (x.payload.paid || 0) - total) } };
    }
    if (x.kind === 'product') {
      const r = catRow(x.payload.id) || [];
      const series = Array.from({ length: 30 }, (_, i) => [0, 1, 2, 1, 0, 3, 1][i % 7]);
      return { client_id: cid, status: 'done', result: { id: r[0], name: r[1], qty: r[2], price: r[3], cost: r[9], unit: r[5], batches: r[4] ? [{ exp: r[4], qty: r[2] }] : [], sups: [], min: r[8], units: (r[7] || []).map((u) => ({ name: u[1], factor: u[2] })), sold30: series.reduce((a, b) => a + b, 0), series, buys: [{ sup: 'مذخر النور', qty: 10, unit: r[5], cost: r[9], at: '2026-11-02' }] } };
    }
    return { client_id: cid, status: 'done', result: { ok: true } };
  }
  async function results(cids) {
    if (!cids.length) return [];
    if (demo) return cids.map(demoResult);
    return rpc('mizan_phone_results', { p_token: TOKEN, p_clients: cids });
  }
  async function waitFor(cid, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const [r] = await results([cid]);
        if (r && r.status !== 'pending') return r;
      } catch {
        /* نكمّل نحاول */
      }
    }
    return null;
  }
  const savePend = () => lsSet(LS.pend, JSON.stringify(state.pend.slice(-30)));
  // بيعات تنتظر البرنامج (انرسلت والحاسبة مطفية): نسأل عنها بالخلفية
  async function checkPend() {
    const open = state.pend.filter((p) => p.status === 'pending');
    if (!open.length) return;
    try {
      const rs = await results(open.map((p) => p.cid));
      let changed = false;
      for (const r of rs) {
        const p = state.pend.find((x) => x.cid === r.client_id);
        if (p && r.status !== 'pending') {
          p.status = r.status;
          p.result = r.result;
          changed = true;
          toast(r.status === 'done' ? `انسجلت بيعة الموبايل: فاتورة #${r.result?.number ?? ''}` : `بيعة الموبايل ما انسجلت: ${r.result?.error || ''}`, r.status !== 'done');
        }
      }
      if (changed) {
        savePend();
        load();
      }
    } catch {
      /* */
    }
  }

  /* ===== المخزون (من الملخص) ===== */
  // [id, الاسم, الكمية, السعر, الاكسباير, الوحدة, [[باركود, وحدة]], [[وحدة, اسم, كم, سعر]], الحد الأدنى, الكلفة]
  let byId = new Map();
  let byCode = new Map();
  function indexCatalog() {
    byId = new Map();
    byCode = new Map();
    for (const r of (state.snap && state.snap.stock && state.snap.stock.all) || []) {
      byId.set(r[0], r);
      for (const c of r[6] || []) byCode.set(String(c[0]), { row: r, uid: c[1] || 0 });
    }
  }
  const catRow = (id) => byId.get(Number(id));
  const level = (r) => (r[2] <= 0 ? 'out' : r[8] > 0 && r[2] <= r[8] ? 'low' : 'ok');
  const soon = (r) => {
    const e = expInfo(r[4]);
    return e && e.days <= alertDays();
  };
  function splitQ(q, base, units) {
    q = Number(q) || 0;
    if (q <= 0) return 'خلص';
    const big = (units || []).filter((u) => u[2] > 1).sort((a, b) => b[2] - a[2])[0];
    if (!big || q < big[2]) return `${qty(q)} ${base || ''}`.trim();
    const w = Math.floor(q / big[2] + 1e-9);
    const rest = Math.round((q - w * big[2]) * 100) / 100;
    return `${qty(w)} ${big[1]}${rest > 0 ? ` و${qty(rest)} ${base || ''}` : ''}`;
  }
  const qText = (r) => splitQ(r[2], r[5], r[7]);
  const unitPrice = (r, uid) => (uid ? ((r[7] || []).find((u) => u[0] === uid) || [])[3] ?? r[3] : r[3]);
  const unitName = (r, uid) => (uid ? ((r[7] || []).find((u) => u[0] === uid) || [])[1] || r[5] : r[5]);
  const unitFactor = (r, uid) => (uid ? ((r[7] || []).find((u) => u[0] === uid) || [])[2] || 1 : 1);

  /* ===== السلة ===== */
  const saveCart = () => lsSet(LS.cart, JSON.stringify(state.cart));
  const cartTotal = () => state.cart.reduce((a, l) => a + Math.round((Number(l.qty) || 0) * (Number(l.price) || 0)), 0);
  function addToCart(r, uid = 0) {
    const same = state.cart.find((l) => l.pid === r[0] && (l.uid || 0) === (uid || 0));
    if (same) same.qty = Math.round((Number(same.qty) + 1) * 1000) / 1000;
    else state.cart.unshift({ key: uidNew(), pid: r[0], uid: uid || 0, qty: 1, price: unitPrice(r, uid) });
    saveCart();
  }

  /* ===== الكاميرا والباركود ===== */
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.muted = true;
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1';
  const cam = { stream: null, mode: 'sale', det: null, zx: null, timer: null, last: '', lastAt: 0, torch: false, canTorch: false, msg: null, msgT: null, starting: false, error: '' };
  let audio = null;
  function beep(ok = true) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = ok ? 1750 : 320;
      g.gain.value = 0.08;
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + (ok ? 0.08 : 0.2));
    } catch {
      /* */
    }
    if (navigator.vibrate) navigator.vibrate(ok ? 40 : [60, 40, 60]);
  }
  function loadZx() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/zxing-0.21.3.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('ما انحمّل قارئ الباركود'));
      document.head.appendChild(s);
    });
  }
  async function camStart(mode) {
    if (cam.starting) return;
    cam.mode = mode;
    cam.error = '';
    if (cam.stream) return render();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cam.error = 'الكاميرا ما تشتغل هنا. افتح التطبيق من أيقونته (أو بسفاري/كروم)';
      return render();
    }
    cam.starting = true;
    render();
    try {
      cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = cam.stream;
      const track = cam.stream.getVideoTracks()[0];
      try {
        cam.canTorch = Boolean(track.getCapabilities && track.getCapabilities().torch);
      } catch {
        cam.canTorch = false;
      }
      cam.det = null;
      if ('BarcodeDetector' in window) {
        try {
          const f = await window.BarcodeDetector.getSupportedFormats();
          const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'].filter((x) => f.includes(x));
          if (want.includes('ean_13')) cam.det = new window.BarcodeDetector({ formats: want });
        } catch {
          cam.det = null;
        }
      }
      if (!cam.det) {
        await loadZx();
        const Z = window.ZXing;
        const hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF, Z.BarcodeFormat.QR_CODE]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        cam.zx = new Z.MultiFormatReader();
        cam.zx.setHints(hints);
      }
      loop();
    } catch (e) {
      camStop();
      cam.error = /NotAllowed|Permission/i.test(e.name || e.message) ? 'ما سمحت بالكاميرا. من إعدادات الموبايل اسمح للتطبيق (أو سفاري) بالكاميرا' : e.message || 'ما اشتغلت الكاميرا';
    } finally {
      cam.starting = false;
      render();
    }
  }
  function camStop() {
    clearTimeout(cam.timer);
    cam.timer = null;
    if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
    cam.stream = null;
    cam.torch = false;
    video.srcObject = null;
    video.remove();
  }
  const canvas = document.createElement('canvas');
  async function scanOnce() {
    if (!cam.stream || video.readyState < 2) return null;
    if (cam.det) {
      const r = await cam.det.detect(video);
      return r && r[0] ? r[0].rawValue : null;
    }
    // ZXing: نقص النص (منطقة الإطار) ونصغّرها حتى يصير سريع
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const cw = Math.round(vw * 0.8);
    const ch = Math.round(vh * 0.5);
    const scale = Math.min(1, 900 / cw);
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    const Z = window.ZXing;
    try {
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return cam.zx.decode(bmp).getText();
    } catch {
      return null;
    } finally {
      cam.zx.reset();
    }
  }
  function loop() {
    clearTimeout(cam.timer);
    if (!cam.stream) return;
    cam.timer = setTimeout(async () => {
      let code = null;
      try {
        code = await scanOnce();
      } catch {
        code = null;
      }
      if (code) onCode(String(code).trim());
      loop();
    }, cam.det ? 120 : 160);
  }
  function camMsg(text, bad) {
    cam.msg = { text, bad };
    clearTimeout(cam.msgT);
    cam.msgT = setTimeout(() => ((cam.msg = null), paintCamMsg()), 2200);
    paintCamMsg();
  }
  function paintCamMsg() {
    const el = document.querySelector('.cam-toast');
    if (el) el.innerHTML = cam.msg ? `<span class="${cam.msg.bad ? 'bad' : ''}">${ic(cam.msg.bad ? 'alert' : 'check')}${esc(cam.msg.text)}</span>` : '';
  }
  function onCode(code) {
    if (code === cam.last && Date.now() - cam.lastAt < 1800) return;
    cam.last = code;
    cam.lastAt = Date.now();
    const hit = byCode.get(code) || byCode.get(code.replace(/^0+/, ''));
    if (cam.mode === 'find') {
      beep(Boolean(hit));
      if (!hit) return camMsg(`ما لگيت دواء بهالباركود (${code})`, true);
      camStop();
      state.sheets = state.sheets.filter((s) => s.type !== 'scan');
      history.replaceState(snapView(), '');
      return openSheet({ type: 'drug', id: hit.row[0] });
    }
    if (!hit) {
      beep(false);
      return camMsg(`باركود مو موجود بالمخزن: ${code}`, true);
    }
    beep(true);
    addToCart(hit.row, hit.uid);
    render();
    camMsg(`انضاف: ${hit.row[1]}${hit.uid ? ` (${unitName(hit.row, hit.uid)})` : ''}`);
  }
  async function toggleTorch() {
    const t = cam.stream && cam.stream.getVideoTracks()[0];
    if (!t) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !cam.torch }] });
      cam.torch = !cam.torch;
    } catch {
      cam.canTorch = false;
    }
    render();
  }
  // بعد كل رسم: الفيديو يرجع لمكانه (العنصر نفسه، فالكاميرا ما تنقطع)
  function attachCam() {
    const host = document.querySelector('[data-cam]');
    if (!host || !cam.stream) {
      if (cam.stream && !host) camStop();
      return;
    }
    if (video.parentNode !== host) host.prepend(video);
    video.play().catch(() => {});
  }

  /* ===== الأجزاء ===== */
  const snap = () => state.snap || {};
  const day = () => (state.day === 'yesterday' ? snap().yesterday : snap().today) || {};
  const hp = () => Boolean(snap().hide_profit);
  const reqs = () => (snap().requests || []).map((r) => (state.reqOv[r.id] ? { ...r, state: state.reqOv[r.id] } : r)).filter((r) => r.state !== 'removed');
  const newReqs = () => reqs().filter((r) => r.state === 'new');
  function compare(cur, prev) {
    if (!prev || prev <= 0 || cur == null) return '';
    const p = Math.round(((cur - prev) / prev) * 100);
    if (!p) return '<span class="cmp">نفس أمس</span>';
    return `<span class="cmp">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% عن أمس</span>`;
  }
  const old = () => state.updated && Date.now() - new Date(state.updated).getTime() > 30 * 60000;
  const syncPill = () => `<span class="sync ${old() ? 'old' : ''} ${state.loading ? 'busy' : ''}" id="sync"><i></i>${state.loading ? 'جاي يتحدّث' : old() ? `آخر تحديث ${esc(ago(state.updated))}` : `محدّث ${esc(ago(state.updated))}`}</span>`;
  function paintSync() {
    const el = document.getElementById('sync');
    if (el) el.outerHTML = syncPill();
  }
  const segDay = () => `<div class="seg"><button class="${state.day === 'today' ? 'on' : ''}" data-day="today">اليوم</button><button class="${state.day === 'yesterday' ? 'on' : ''}" data-day="yesterday">أمس</button></div>`;

  /* التثبيت كتطبيق كامل */
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    if (!quiet()) render();
  });
  function installCard() {
    if (standalone() || demo || lsGet('mz_hide_install') === '1') return '';
    if (installEvt) return `<div class="card install"><img src="icon-192.png" alt="" /><div class="grow"><b>ثبّت ميزان كتطبيق</b><br /><small>ينفتح بلا متصفح، وزر الرجوع يمشي داخله</small></div><button class="btn sm" data-act="install">ثبّت</button></div>`;
    if (isIOS) return `<div class="card install col"><b>حتى يصير تطبيق كامل بلا سفاري</b><small>زر المشاركة (المربع بسهم لفوق) ← «إضافة إلى الشاشة الرئيسية» ← إضافة، وافتحه من أيقونته</small><button class="link" data-act="hide-install" style="align-self:flex-start">تمام، لا تبين</button></div>`;
    return `<div class="card install col"><b>انت فاتحه من المتصفح</b><small>حتى يصير تطبيق كامل: بكروم دوس ⋮ ← «تثبيت التطبيق»</small><button class="link" data-act="hide-install" style="align-self:flex-start">تمام، لا تبين</button></div>`;
  }

  /* ===== الرئيسية ===== */
  function homeTab() {
    const s = snap();
    const d = day();
    const prev = state.day === 'today' ? s.yesterday : null;
    const all = (s.stock && s.stock.all) || [];
    const low = all.filter((r) => level(r) === 'low').length;
    const exp = all.filter((r) => r[2] > 0 && soon(r)).length;
    const nr = newReqs();
    const pend = state.pend.filter((p) => p.status === 'pending');
    const chart = (s.daily || []).slice(-14);
    const max = Math.max(1, ...chart.map((x) => x.sales || 0));
    const margin = !hp() && d.sales > 0 && d.profit != null ? Math.round((d.profit / Math.max(1, d.sales - d.profit)) * 100) : null;
    return `
      <div class="head">
        <div class="hello grow"><small>${greet()}</small><b class="ell">${esc(s.shop || 'ميزان')}</b></div>
        ${syncPill()}
        <button class="iconbtn ghost ${state.loading ? 'spin' : ''}" data-act="refresh" aria-label="تحديث">${ic('refresh')}</button>
      </div>
      ${state.error ? `<div class="err">${esc(state.error)}</div>` : ''}
      ${installCard()}
      ${segDay()}
      <button class="hero" data-more="invoices">
        <small>مبيعات ${state.day === 'today' ? 'اليوم' : 'أمس'}</small>
        <div class="big"><b class="num">${fmt(d.sales)}</b><em>د.ع</em></div>
        ${compare(d.sales, prev && prev.sales)}
        <div class="trio">
          ${hp() ? `<div><small>المصاريف</small><b class="num">${fmt(d.expenses)}</b></div>` : `<div><small>الربح</small><b class="num">${fmt(d.profit)}</b></div>`}
          <div><small>الفواتير</small><b class="num">${fmt(d.count)}</b></div>
          ${margin != null ? `<div><small>نسبة الربح</small><b class="num">${margin}%</b></div>` : `<div><small>المعدّل</small><b class="num">${fmt(d.avg)}</b></div>`}
        </div>
      </button>
      ${pend.length ? `<button class="note blue section" data-more="psales" style="width:100%">${ic('clock')}<span class="grow" style="text-align:start">${pend.length === 1 ? 'بيعة من الموبايل' : `${pend.length} بيعات من الموبايل`} تنتظر البرنامج بالصيدلية</span>${ic('chev')}</button>` : ''}
      <div class="duo">
        <button class="card tile" data-sheet="cash"><span class="lab"><span class="badge-ic g">${ic('wallet')}</span>بالقاصة هسه</span><b class="num">${s.cash ? fmt(s.cash.iqd) : '—'}</b><small>${s.cash ? `من ${esc(t12(s.cash.since))}` : 'الدوام مسكّر'}</small></button>
        <button class="card tile" data-sheet="debts"><span class="lab"><span class="badge-ic a">${ic('people')}</span>ديون الزبائن</span><b class="num">${fmt(s.debts && s.debts.customers)}</b><small>${fmt(s.debts && s.debts.customers_n)} زبون</small></button>
      </div>
      ${
        nr.length
          ? `<button class="card ord-card" data-tab="orders"><div class="top"><b><span class="badge-ic r" style="width:28px;height:28px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center">${ic('orders')}</span>${nr.length === 1 ? 'طلب جديد' : `${fmt(nr.length)} طلبات جديدة`}</b><span class="link">شوف الكل</span></div>
            ${nr.slice(0, 3).map((r) => `<div class="oline"><span class="ell">${esc(reqTitle(r))}</span>${reqPill(r)}</div>`).join('')}</button>`
          : ''
      }
      <div class="trio-s">
        <button class="card" data-stock="out"><b class="num red">${fmt(s.stock && s.stock.out_n)}</b><small>خلصت</small></button>
        <button class="card" data-stock="low"><b class="num amber">${fmt(low)}</b><small>قربت تخلص</small></button>
        <button class="card" data-stock="exp"><b class="num violet">${fmt(exp)}</b><small>اكسباير قريب</small></button>
      </div>
      ${s.odd ? `<div class="note red section">${ic('alert')}<span><b>${fmt(s.odd)}</b> أرقام غريبة (كميات أو أسعار خيالية). صلّحها من البرنامج: فحص الأرقام</span></div>` : ''}
      <div class="h3"><b>المبيعات آخر 14 يوم</b><small>دوس على أي يوم</small></div>
      <div class="card"><div class="bars">${chart
        .map((x, i) => {
          const h = Math.round(((x.sales || 0) / max) * 100);
          const wd = DAYS[new Date(`${x.day}T12:00:00`).getDay()].replace('ال', '').slice(0, 2);
          return `<button class="bar ${i === chart.length - 1 ? 'last' : ''}" data-sheet="day" data-day-of="${esc(x.day)}" aria-label="${esc(dmy(x.day))}"><i style="height:${Math.max(h, x.sales ? 4 : 0)}%"></i><small>${esc(wd)}</small></button>`;
        })
        .join('')}</div></div>
      ${
        (s.top || []).length
          ? `<div class="h3"><b>الأكثر مبيعاً</b><small>آخر 7 أيام</small></div><div class="card list">${s.top
              .slice(0, 6)
              .map((p, i) => `<button class="row" data-sheet="drug" data-id="${p.id}"><span class="rank num">${i + 1}</span><span class="two"><b class="ell">${esc(p.name)}</b><small class="num">${qty(p.qty)} ${esc(p.unit || '')} · ${fmt(p.invoices)} فاتورة</small></span><b class="num">${fmt(p.sales)}</b></button>`)
              .join('')}</div>`
          : ''
      }`;
  }

  /* ===== الطلبات ===== */
  const reqTitle = (r) => (r.pid ? r.name : String(r.name).includes('\n') ? 'مو موجودة بالمخزن' : r.name);
  function reqPill(r) {
    if (!r.pid) return String(r.name).includes('\n') ? `<span class="pill violet">${String(r.name).split('\n').length} أدوية</span>` : '<span class="pill violet">مو موجود</span>';
    const row = catRow(r.pid);
    if (!row) return `<span class="pill gray">${esc(r.stock)}</span>`;
    return row[2] <= 0 ? '<span class="pill red">خلص</span>' : `<span class="pill ${level(row) === 'low' ? 'amber' : 'green'}">باقي ${esc(qText(row))}</span>`;
  }
  function reqCard(r) {
    const multi = !r.pid && String(r.name).includes('\n');
    const acts =
      r.state === 'new'
        ? `<div class="acts"><button class="btn" data-req="${r.id}" data-st="ordered">انطلب</button><button class="btn gray" data-req="${r.id}" data-st="removed">شيل</button></div>`
        : r.state === 'ordered'
          ? `<div class="acts"><button class="btn" data-req="${r.id}" data-st="arrived">وصل</button><button class="btn gray" data-req="${r.id}" data-st="new" aria-label="رجّعه جديد">${ic('undo')}</button></div>`
          : `<div class="meta green">${ic('check')}وصل ${esc(ago(r.state_at))}</div>`;
    return `<div class="card req ${state.reqOv[r.id] && state.reqOv[r.id] !== r.state ? 'busy' : ''}">
      <div class="top"><b>${esc(reqTitle(r))}</b>${reqPill(r)}</div>
      ${multi ? `<div class="names">${String(r.name).split('\n').map(esc).join(' · ')}</div>` : ''}
      <div class="meta">${ic('user')}${r.by ? `طلبه ${esc(r.by)}` : 'طلب'} · ${esc(ago(r.at))}</div>
      ${r.buy && r.buy.sup ? `<div class="meta">${ic('truck')}آخر مرة من ${esc(r.buy.sup)}${r.buy.cost != null && !hp() ? ` · <span class="num">${fmt(r.buy.cost)}</span> د.ع` : ''}</div>` : ''}
      ${r.state === 'ordered' && r.state_at ? `<div class="meta">${ic('clock')}انطلب ${esc(ago(r.state_at))}</div>` : ''}
      ${acts}
    </div>`;
  }
  function ordersTab() {
    const all = reqs();
    const by = (st) => all.filter((r) => r.state === st);
    const list = by(state.ordTab);
    const label = { new: 'جديدة', ordered: 'انطلبت', arrived: 'وصلت' };
    return `
      <div class="head"><h1 class="grow">الطلبات</h1><button class="iconbtn primary" data-sheet="newreq" aria-label="طلب جديد">${ic('plus')}</button></div>
      <div class="seg">${['new', 'ordered', 'arrived'].map((k) => `<button class="${state.ordTab === k ? 'on' : ''}" data-ord="${k}">${label[k]}${by(k).length ? ` · ${by(k).length}` : ''}</button>`).join('')}</div>
      ${list.length ? list.map(reqCard).join('') : `<div class="empty">${ic('orders')}<b>${state.ordTab === 'new' ? 'ما اكو طلبات جديدة' : state.ordTab === 'ordered' ? 'ما اكو شي انطلب وينتظر' : 'ما وصل شي آخر 7 أيام'}</b><small>${state.ordTab === 'new' ? 'لما الصيدلي يضغط «طلب» يم الدواء بالبرنامج، يوصل هنا' : ''}</small></div>`}`;
  }

  /* ===== المخزون ===== */
  function stockTab() {
    const all = (snap().stock && snap().stock.all) || [];
    const q = norm(state.pq);
    const counts = { out: 0, low: 0, exp: 0 };
    let cost = 0;
    let sell = 0;
    let hasCost = false;
    for (const r of all) {
      const l = level(r);
      if (l === 'out') counts.out++;
      if (l === 'low') counts.low++;
      if (r[2] > 0 && soon(r)) counts.exp++;
      if (r[2] > 0) {
        sell += r[2] * r[3];
        if (r[9] != null) (cost += r[2] * r[9]), (hasCost = true);
      }
    }
    let list = all;
    if (state.filter === 'out') list = list.filter((r) => level(r) === 'out');
    else if (state.filter === 'low') list = list.filter((r) => level(r) === 'low');
    else if (state.filter === 'exp') list = list.filter((r) => r[2] > 0 && soon(r)).sort((a, b) => String(a[4]).localeCompare(String(b[4])));
    if (q) list = list.filter((r) => norm(r[1]).includes(q) || (r[6] || []).some((c) => String(c[0]).includes(q)));
    const shown = list.slice(0, state.limit);
    const chip = (k, l, n, col) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-filter="${k}">${col ? `<span class="dot" style="background:var(--${col})"></span>` : ''}${l}${n != null ? ` <span class="num">${fmt(n)}</span>` : ''}</button>`;
    return `
      <div class="head"><h1 class="grow">المخزون</h1><span class="sub num">${fmt(all.length)} دواء</span></div>
      <div class="search-row"><label class="search">${ic('search')}<input id="pq" value="${esc(state.pq)}" placeholder="ابحث بالاسم أو الباركود" autocomplete="off" /></label><button class="scanmini" data-act="scan-find" aria-label="ابحث بالكاميرا">${ic('scan')}</button></div>
      <div class="chips">${chip('all', 'الكل')}${chip('out', 'خلصت', counts.out, 'red')}${chip('low', 'قربت تخلص', counts.low, 'amber')}${chip('exp', 'اكسباير', counts.exp, 'violet')}</div>
      ${!q && state.filter === 'all' ? `<div class="card summary3">${hasCost && !hp() ? `<div><small>بسعر الشراء</small><b class="num">${short(cost)}</b></div>` : ''}<div><small>بسعر البيع</small><b class="num">${short(sell)}</b></div>${hasCost && !hp() && cost > 0 ? `<div><small>الربح</small><b class="num green">${Math.round(((sell - cost) / cost) * 100)}%</b></div>` : `<div><small>خلصت</small><b class="num red">${fmt(counts.out)}</b></div>`}</div>` : ''}
      ${
        shown.length
          ? `<div class="card list section">${shown
              .map((r) => {
                const e = expInfo(r[4]);
                const l = level(r);
                return `<button class="row" data-sheet="drug" data-id="${r[0]}"><span class="two"><b class="ell">${esc(r[1])}</b><small class="num ${e && e.days <= alertDays() ? 'violet' : ''}">${fmt(r[3])} د.ع${e ? ` · ${e.days <= alertDays() ? esc(e.text) : `اكسباير ${esc(e.date)}`}` : ''}</small></span><span class="qty ${l} num">${esc(qText(r))}</span></button>`;
              })
              .join('')}${list.length > shown.length ? `<button class="more-btn" data-act="more-rows">اعرض أكثر (${fmt(list.length - shown.length)})</button>` : ''}</div>`
          : `<div class="empty">${ic('box')}<b>${q ? 'ما لگيت دواء' : 'ما اكو'}</b></div>`
      }`;
  }

  /* ===== البيع ===== */
  function saleTab() {
    const q = norm(state.sq);
    const found = q ? ((snap().stock && snap().stock.all) || []).filter((r) => norm(r[1]).includes(q) || (r[6] || []).some((c) => String(c[0]) === state.sq.trim())).slice(0, 8) : [];
    const live = Boolean(cam.stream) && cam.mode === 'sale';
    const n = state.cart.length;
    return `
      <div class="cam ${live ? 'live' : ''}" ${live ? 'data-cam' : ''}>
        <div class="cam-tools"><button data-act="sale-close" aria-label="رجوع">${ic('close')}</button><b>بيعة جديدة</b>${live && cam.canTorch ? `<button class="${cam.torch ? 'on' : ''}" data-act="torch" aria-label="ضوء">${ic('flash')}</button>` : live ? `<button data-act="cam-off" aria-label="طفّي الكاميرا">${ic('cam')}</button>` : '<span style="width:44px"></span>'}</div>
        ${
          live
            ? '<div class="cam-frame" aria-hidden="true"><span class="c1"></span><span class="c2"></span><span class="c3"></span><span class="c4"></span><i class="laser"></i></div><div class="cam-toast"></div>'
            : `<div class="cam-off">${ic('scan')}<div>${cam.error ? esc(cam.error) : cam.starting ? 'جاي يفتح الكاميرا...' : 'وجّه الكاميرا على باركود الدواء وينضاف وحده'}</div>${cam.starting ? '' : `<button class="btn" data-act="cam-on">${ic('cam')}شغّل الكاميرا</button>`}</div>`
        }
      </div>
      <div class="sale-search">
        <label class="search">${ic('search')}<input id="sq" value="${esc(state.sq)}" placeholder="أو ابحث باسم الدواء" autocomplete="off" /></label>
        ${q ? `<div class="card list results">${found.length ? found.map((r) => `<button class="row" data-add="${r[0]}"><span class="two"><b class="ell">${esc(r[1])}</b><small class="num">${fmt(r[3])} د.ع · ${esc(qText(r))}</small></span><span class="iconbtn ghost" style="color:var(--blue)">${ic('plus')}</span></button>`).join('') : '<div class="empty" style="padding:20px">ما لگيت</div>'}</div>` : ''}
      </div>
      <div class="h3"><b>السلة</b>${n ? `<button class="link" data-act="clear-cart">فرّغ السلة</button>` : '<small>فارغة</small>'}</div>
      <div class="cart">${n ? state.cart.map(lineHtml).join('') : `<div class="empty" style="padding:28px 20px">${ic('receipt')}<b>امسح باركود أو ابحث عن دواء</b></div>`}</div>
      <div class="paybar"><div class="inner"><div class="tot"><small>المجموع${n ? ` · ${n} ${n === 1 ? 'مادة' : 'مواد'}` : ''}</small><b class="num">${fmt(cartTotal())} <small>د.ع</small></b></div><button class="btn" data-act="checkout" ${n ? '' : 'disabled'}>إكمال البيع</button></div></div>`;
  }
  function lineHtml(l) {
    const r = catRow(l.pid);
    if (!r) return '';
    const need = (Number(l.qty) || 0) * unitFactor(r, l.uid);
    const short_ = need > r[2] + 1e-9;
    const units = [[0, r[5]], ...(r[7] || []).map((u) => [u[0], u[1]])];
    return `<div class="line">
      <div class="top"><div class="name"><b class="ell">${esc(r[1])}</b><small class="num">${fmt(l.price)} د.ع${short_ ? ` · <span class="red">${r[2] <= 0 ? 'خلص بالمخزن' : `باقي ${esc(qText(r))} بس`}</span>` : ''}</small></div>
        <div class="step"><button data-qty="${l.key}" data-d="1" aria-label="زيادة">+</button><input class="num" inputmode="decimal" id="q-${l.key}" data-qin="${l.key}" value="${qty(l.qty)}" aria-label="الكمية" /><button data-qty="${l.key}" data-d="-1" aria-label="تنقيص">−</button></div></div>
      <div class="bot"><div class="unitsel">${units.length > 1 ? units.map(([id, nm]) => `<button class="${(l.uid || 0) === id ? 'on' : ''}" data-unit="${l.key}" data-uid="${id}">${esc(nm)}</button>`).join('') : `<span class="muted" style="font-size:13px">${esc(r[5] || '')}</span>`}</div><b class="price num">${fmt(Math.round(l.qty * l.price))}</b><button class="x" data-rm="${l.key}" aria-label="شيل">${ic('trash')}</button></div>
    </div>`;
  }

  /* ===== المزيد ===== */
  function moreTab() {
    if (state.more) return moreSub();
    const s = snap();
    const pend = state.pend.filter((p) => p.status === 'pending').length;
    const item = (attr, icon, cls, label, sub) => `<button class="row" ${attr}><span class="ic ${cls}" style="width:36px;height:36px;padding:8px;border-radius:11px">${ICON[icon]}</span><span class="two"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><i class="ic chev">${ICON.chev}</i></button>`;
    return `
      <div class="head"><h1 class="grow">المزيد</h1>${syncPill()}</div>
      <div class="card list menu">
        ${item('data-more="shifts"', 'clock', 'b', 'الشفتات', 'منو اشتغل اليوم وشكد باع')}
        ${item('data-more="invoices"', 'receipt', 'b', 'الفواتير', 'كل فاتورة بأدويتها')}
        ${item('data-sheet="debts"', 'people', 'a', 'الديون', `على الزبائن ${fmt(s.debts && s.debts.customers)}`)}
        ${item('data-sheet="cash"', 'wallet', 'g', 'القاصة', s.cash ? `هسه ${fmt(s.cash.iqd)}` : 'الدوام مسكّر')}
        ${item('data-more="top"', 'star', 'v', 'الأكثر مبيعاً', 'آخر 7 أيام')}
        ${item('data-more="psales"', 'phone', 'b', 'بيعات الموبايل', pend ? `${pend} تنتظر البرنامج` : 'اللي بعتها من هنا')}
      </div>
      <div class="card list section">${item('data-act="refresh"', 'refresh', 'g', 'حدّث هسه', `آخر تحديث ${esc(ago(state.updated))}`)}</div>
      <div class="foot">ميزان · تطبيق الموبايل v3</div>`;
  }
  function subHead(title, withDay) {
    return `<div class="head"><button class="iconbtn" data-act="back" aria-label="رجوع">${ic('back')}</button><h1 class="grow" style="font-size:22px">${esc(title)}</h1></div>${withDay ? segDay() : ''}`;
  }
  function moreSub() {
    const s = snap();
    const d = day();
    if (state.more === 'shifts') {
      const list = d.shifts || [];
      return `${subHead('الشفتات', true)}${list.length ? list.map(shiftCard).join('') : `<div class="empty">${ic('clock')}<b>ما اكو شفتات بهاليوم</b></div>`}`;
    }
    if (state.more === 'invoices') {
      const q = norm(state.q);
      const list = (d.invoices || []).map((i, idx) => ({ i, idx })).filter(({ i }) => !q || String(i.n).includes(q) || norm(i.customer).includes(q) || norm(i.by).includes(q) || (i.items || []).some((x) => norm(x.name).includes(q)));
      return `${subHead('الفواتير', true)}<div class="section"><label class="search">${ic('search')}<input id="q" value="${esc(state.q)}" placeholder="رقم الفاتورة، الزبون، أو الدواء" autocomplete="off" /></label></div>
        ${list.length ? `<div class="card list section">${list.map(({ i, idx }) => invRow(i, idx)).join('')}</div>` : `<div class="empty">${ic('receipt')}<b>${q ? 'ما لگيت فاتورة' : 'ما اكو فواتير'}</b></div>`}
        ${!q && (d.expenses_list || []).length ? `<div class="h3"><b>المصاريف</b></div><div class="card list">${d.expenses_list.map((e) => `<div class="row"><span class="t num">${esc(t12(e.at))}</span><span class="two"><b>${esc(e.category)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</span><b class="num red">${fmt(e.iqd)}</b></div>`).join('')}</div>` : ''}
        ${!q && (d.returns_list || []).length ? `<div class="h3"><b>المرتجعات</b></div><div class="card list">${d.returns_list.map((r) => `<div class="row"><span class="t num">${esc(t12(r.at))}</span><span class="two"><b>مرتجع #${esc(r.n)}</b><small>${esc(r.by)}</small></span><b class="num red">${fmt(r.total)}</b></div>`).join('')}</div>` : ''}`;
    }
    if (state.more === 'top') {
      return `${subHead('الأكثر مبيعاً')}<div class="card list section">${(s.top || []).map((p, i) => `<button class="row" data-sheet="drug" data-id="${p.id}"><span class="rank num">${i + 1}</span><span class="two"><b class="ell">${esc(p.name)}</b><small class="num">${qty(p.qty)} ${esc(p.unit || '')} · ${fmt(p.invoices)} فاتورة${hp() || p.profit == null ? '' : ` · ربح ${fmt(p.profit)}`}</small></span><b class="num">${fmt(p.sales)}</b></button>`).join('') || '<div class="empty">ما اكو</div>'}</div>`;
    }
    if (state.more === 'psales') {
      const list = state.pend.slice().reverse();
      return `${subHead('بيعات الموبايل')}${
        list.length
          ? `<div class="card list section">${list
              .map((p) => `<div class="row"><span class="two"><b>${esc(p.label)}</b><small>${esc(ago(p.at))}${p.status === 'error' ? ` · ${esc((p.result && p.result.error) || '')}` : ''}</small></span>${p.status === 'done' ? `<span class="pill green">فاتورة #${esc((p.result && p.result.number) || '')}</span>` : p.status === 'error' ? '<span class="pill red">ما انسجلت</span>' : '<span class="pill amber">تنتظر</span>'}</div>`)
              .join('')}</div><div class="foot">البيعة اللي «تنتظر» تنسجل أول ما البرنامج بالصيدلية يشتغل وبيه نت</div>`
          : `<div class="empty">${ic('phone')}<b>ما بعت شي من الموبايل بعد</b></div>`
      }`;
    }
    return '';
  }
  function shiftCard(x) {
    return `<button class="card shift ${x.live ? 'live' : ''}" data-sheet="shift" data-id="${esc(x.id)}">
      <div class="top"><span class="ava">${esc((x.name || '؟').trim().charAt(0))}</span>
        <span class="two"><b>${esc(x.name)}</b><small>${esc(t12(x.start))} ← ${x.live ? '<span class="green">شغّال هسه</span>' : esc(t12(x.end))}${x.parts > 1 ? ` · دخل ${x.parts} مرات` : ''}</small></span>
        <span class="two" style="flex:none;align-items:flex-end"><small>المبيعات</small><b class="num">${fmt(x.sales)}</b></span></div>
      <div class="pills">${hp() ? '' : `<span>الربح <b class="num">${fmt(x.profit)}</b></span>`}<span>فواتير <b class="num">${fmt(x.count)}</b></span><span>القاصة <b class="num">${fmt(x.cash)}</b></span>${x.returns ? `<span>مرتجعات <b class="num">${fmt(x.returns)}</b></span>` : ''}</div>
    </button>`;
  }
  function invRow(i, idx) {
    return `<button class="row" data-sheet="inv" data-idx="${idx}">
      <span class="t num">${esc(t12(i.at))}</span>
      <span class="two"><b class="num">#${esc(i.n)} <small class="muted">${esc(i.customer || 'نقدي')}</small></b><small class="ell">${esc((i.items || []).map((x) => x.name).slice(0, 2).join('، '))}${(i.items || []).length > 2 ? '...' : ''}</small></span>
      ${i.cancelled ? '<span class="pill red">ملغية</span>' : i.credit ? '<span class="pill amber">دين</span>' : ''}
      <b class="num">${fmt(i.total)}</b>
    </button>`;
  }

  /* ===== النوافذ من تحت ===== */
  function drugSheet(sh) {
    const s = snap();
    const st = s.stock || {};
    const r = catRow(sh.id);
    const p = [...(st.soon || []), ...(st.out || [])].find((y) => y.id === sh.id) || (s.products || {})[sh.id] || null;
    const info = state.info[sh.id];
    const full = info && info.data;
    const name = (full && full.name) || (r && r[1]) || (p && p.name) || 'الدواء';
    if (!r && !p && !full) return [name, '<div class="empty">ما لگيته بالمخزون</div>', ''];
    const qn = full ? full.qty : r ? r[2] : p.qty;
    const unit = (full && full.unit) || (r && r[5]) || (p && p.unit) || '';
    const units = r ? r[7] : (full && full.units ? full.units.map((u, i) => [i + 1, u.name, u.factor, 0]) : []);
    const min = full ? full.min : r ? r[8] : 0;
    const price = full ? full.price : r ? r[3] : p.price;
    const cost = hp() ? null : full ? full.cost : r ? r[9] : p.cost;
    const lv = qn <= 0 ? 'out' : min > 0 && qn <= min ? 'low' : 'ok';
    const batches = (full && full.batches) || (p && p.batches) || (r && r[4] ? [{ exp: r[4], qty: r[2] }] : []);
    const sups = (full && full.sups) || (p && p.sups) || [];
    const codes = r && r[6] && r[6].length ? r[6][0][0] : '';
    const series = full && full.series;
    const sMax = series ? Math.max(1, ...series) : 1;
    const perDay = full && full.sold30 ? full.sold30 / 30 : 0;
    const lasts = perDay > 0 && qn > 0 ? Math.floor(qn / perDay) : null;
    const body = `
      ${codes ? `<div class="muted num" style="margin:-6px 2px 10px;font-size:13px;direction:ltr;text-align:right">${esc(codes)}</div>` : ''}
      <div class="box stockhero"><div><small class="muted" style="font-weight:700;font-size:13px">الموجود هسه</small><br /><b class="num ${lv === 'out' ? 'red' : lv === 'low' ? 'amber' : ''}">${esc(splitQ(qn, unit, units))}</b>${units && units.length && qn > 0 ? `<br /><small class="muted num">= ${qty(qn)} ${esc(unit)}${min ? ` · الحد الأدنى ${qty(min)}` : ''}</small>` : min ? `<br /><small class="muted num">الحد الأدنى ${qty(min)}</small>` : ''}</div>${lv === 'out' ? '<span class="pill red">خلص</span>' : lv === 'low' ? '<span class="pill amber">قربت تخلص</span>' : '<span class="pill green">موجود</span>'}</div>
      <div class="grid3 section">${cost != null ? `<div class="cell"><small>الشراء</small><b class="num">${fmt(cost)}</b></div>` : ''}<div class="cell"><small>البيع</small><b class="num">${fmt(price)}</b></div>${cost != null && cost > 0 ? `<div class="cell"><small>الربح</small><b class="num green">${Math.round(((price - cost) / cost) * 100)}%</b></div>` : ''}${(units || []).map((u) => `<div class="cell"><small>${esc(u[1])}</small><b class="num">${u[3] ? fmt(u[3]) : `${qty(u[2])} ${esc(unit)}`}</b></div>`).join('')}</div>
      ${info && info.loading ? '<div class="loading-line"></div><div class="muted" style="font-size:13px;text-align:center">جاي يجيب التفاصيل الكاملة من البرنامج...</div>' : ''}
      ${info && info.failed ? '<div class="note section">البرنامج بالصيدلية ما رد (مطفي أو بلا نت). هذي آخر معلومات معروفة</div>' : ''}
      ${batches.length ? `<div class="lbl"><span>الاكسباير</span></div><div class="box" style="padding:4px 16px">${batches.map((b) => { const e = expInfo(b.exp); return `<div class="kv"><b class="num ${e && e.days <= alertDays() ? (e.days < 0 ? 'red' : 'violet') : ''}">${e ? `${esc(e.date)}${e.days <= alertDays() ? ` · ${esc(e.text)}` : ''}` : 'بلا اكسباير'}</b><span class="num">${qty(b.qty)} ${esc(unit)}</span></div>`; }).join('')}</div>` : ''}
      ${series ? `<div class="lbl"><span>المبيع آخر 30 يوم</span><b class="num" style="color:var(--text)">${qty(full.sold30)} ${esc(unit)}</b></div><div class="box"><div class="spark" aria-hidden="true">${series.map((v, i) => `<i class="${i === series.length - 1 ? 'on' : ''}" style="height:${Math.max(3, Math.round((v / sMax) * 100))}%"></i>`).join('')}</div><div class="muted" style="font-size:13px;margin-top:8px">${perDay > 0 ? `بمعدّل ${qty(Math.round(perDay * 10) / 10)} ${esc(unit)} باليوم${lasts != null ? `: الموجود يكفي ${lasts <= 0 ? 'أقل من يوم' : `${fmt(lasts)} يوم تقريباً`}` : ''}` : 'ما انباع آخر 30 يوم'}</div></div>` : ''}
      ${full && full.buys && full.buys.length ? `<div class="lbl"><span>آخر شراء</span></div><div class="box" style="padding:4px 16px">${full.buys.map((b) => `<div class="kv"><b>${esc(b.sup || 'بلا مذخر')}</b><span class="num">${qty(b.qty)} ${esc(b.unit)}${b.cost != null ? ` · ${fmt(b.cost)}` : ''} · ${esc(dmy(b.at))}</span></div>`).join('')}</div>` : sups.length ? `<div class="lbl"><span>الموجود من كل مذخر</span></div><div class="box" style="padding:4px 16px">${sups.map((g) => `<div class="kv"><b>${esc(g.name)}</b><span class="num">${qty(g.qty)} ${esc(unit)}${g.cost != null && !hp() ? ` · ${fmt(g.cost)}` : ''}</span></div>`).join('')}</div>` : ''}
      ${p && p.last_sold ? `<div class="muted" style="font-size:13px;margin-top:12px">آخر بيع: ${esc(dmy(p.last_sold))} ${esc(t12(p.last_sold))}</div>` : ''}`;
    const foot = r ? `<button class="btn soft" data-reqdrug="${r[0]}">اطلبه</button><button class="btn" data-sell="${r[0]}">بيع</button>` : '';
    return [name, body, foot];
  }
  async function fetchInfo(id) {
    const cur = state.info[id];
    if (cur && (cur.loading || (cur.data && Date.now() - cur.at < 60000))) return;
    state.info[id] = { loading: true };
    try {
      const cid = await push('product', { id });
      const r = await waitFor(cid, 15000);
      state.info[id] = r && r.status === 'done' ? { data: r.result, at: Date.now() } : { failed: true, at: Date.now() };
    } catch {
      state.info[id] = { failed: true, at: Date.now() };
    }
    if (state.sheets.some((s) => s.type === 'drug' && s.id === id)) render();
  }

  function checkoutSheet() {
    const co = state.co;
    const total = cartTotal();
    const s = snap();
    if (!co) return ['', '', ''];
    if (co.phase === 'done') {
      const r = co.result || {};
      return ['', `<div class="done-art"><span class="circle g">${ic('check')}</span><b>انسجلت فاتورة #${esc(r.number)}</b><span class="muted num">${fmt(r.total)} د.ع${r.change ? ` · الباقي للزبون ${fmt(r.change)}` : ''}${r.credit ? ` · دين ${fmt(r.credit)}` : ''}</span></div>`, '<button class="btn wide" data-act="co-new">بيعة جديدة</button>'];
    }
    if (co.phase === 'queued') {
      return ['', `<div class="done-art"><span class="circle a">${ic('clock')}</span><b>البيعة وصلت وتنتظر البرنامج</b><span class="muted">البرنامج بالصيدلية مطفي أو بلا نت. تنسجل وحدها أول ما يشتغل، ويطلعلك تنبيه</span></div>`, '<button class="btn wide" data-act="co-new">تمام</button>'];
    }
    if (co.phase === 'wait' || co.phase === 'sending') {
      return ['', `<div class="done-art"><span class="circle b"><i class="ic" style="animation:spin 1s linear infinite">${ICON.refresh}</i></span><b>${co.phase === 'sending' ? 'جاي يرسل...' : 'البرنامج جاي يسجّلها...'}</b><span class="muted num">${fmt(total)} د.ع</span></div>`, ''];
    }
    const credit = co.pay === 'credit';
    const paid = Number(co.paid) || 0;
    const change = !credit && paid > total ? paid - total : 0;
    const cust = co.customer ? (s.customers || []).find((c) => c[0] === co.customer) : null;
    const cq = norm(co.cq);
    const custs = credit && !cust ? (s.customers || []).filter((c) => !cq || norm(c[1]).includes(cq) || String(c[2]).includes(cq)).slice(0, 6) : [];
    const noPin = !s.sale || !s.sale.pin;
    const body = `
      <div class="box">
        <div class="kv big"><span>المجموع · ${state.cart.length} ${state.cart.length === 1 ? 'مادة' : 'مواد'}</span><b class="num">${fmt(total)} <small class="muted" style="font-size:13px">د.ع</small></b></div>
        <div class="seg" style="margin:6px 0 4px"><button class="${!credit ? 'on' : ''}" data-pay="cash">نقد</button><button class="${credit ? 'on' : ''}" data-pay="credit">دين على زبون</button></div>
        ${
          credit
            ? cust
              ? `<div class="kv"><span>الزبون</span><b>${esc(cust[1])} <button class="link" data-act="co-cust-clear">غيّر</button></b></div>`
              : `<div style="margin-top:8px"><input class="input" id="cq" value="${esc(co.cq || '')}" placeholder="ابحث عن الزبون" autocomplete="off" /></div>${custs.map((c) => `<button class="row" style="padding:10px 4px;min-height:48px" data-cust="${c[0]}"><span class="two"><b>${esc(c[1])}</b>${c[2] ? `<small class="num">${esc(c[2])}</small>` : ''}</span></button>`).join('')}`
            : ''
        }
        <div class="kv"><span>${credit ? 'دفع هسه (اختياري)' : 'استلمت (اختياري)'}</span><input class="input num" id="paid" inputmode="numeric" value="${co.paid ? esc(co.paid) : ''}" placeholder="${credit ? '0' : fmt(total)}" style="width:140px;text-align:center;padding:8px 10px" /></div>
        ${change ? `<div class="kv"><span>الباقي للزبون</span><b class="num green">${fmt(change)}</b></div>` : ''}
        ${credit && cust ? `<div class="kv"><span>ينكتب دين</span><b class="num amber">${fmt(Math.max(0, total - paid))}</b></div>` : ''}
        ${!credit || paid > 0 ? `<div class="kv"><span>الفلوس</span><div class="seg" style="width:190px"><button class="${co.cash !== 'drawer' ? 'on' : ''}" data-cashat="hand">بيدي</button><button class="${co.cash === 'drawer' ? 'on' : ''}" data-cashat="drawer">بالقاصة</button></div></div>` : ''}
      </div>
      ${co.error ? `<div class="note red section">${ic('alert')}${esc(co.error)}</div>` : ''}
      ${
        noPin
          ? `<div class="note section">${ic('alert')}حط رمز البيع من البرنامج بالحاسبة: الإعدادات ← تطبيق الموبايل</div>`
          : `<div class="pin"><small>${s.sale.pin === 'admin' ? 'رمز المدير حتى تتسجّل البيعة' : 'رمز البيع من الموبايل'}</small><div class="dots ${co.shake ? 'shake' : ''}">${[0, 1, 2, 3].map((i) => `<i class="${co.pin.length > i ? 'on' : ''}"></i>`).join('')}</div></div>
             <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<button data-key="${k}">${k}</button>`).join('')}<button class="fn" data-key="c">مسح</button><button data-key="0">0</button><button class="fn" data-key="b" aria-label="مسح رقم">⌫</button></div>
             ${credit && !cust ? '<div class="muted" style="text-align:center;font-size:13px;margin-top:10px">اختار الزبون أول</div>' : ''}`
      }
      <div class="note blue section" style="margin-top:14px">${ic('clock')}إذا البرنامج بالصيدلية مطفي، البيعة تنتظر وتنسجل أول ما يشتغل</div>`;
    return ['تأكيد البيع', body, ''];
  }
  async function submitSale() {
    const co = state.co;
    const s = snap();
    if (co.pay === 'credit' && !co.customer) {
      co.pin = '';
      co.error = 'اختار الزبون أول';
      return render();
    }
    const total = cartTotal();
    const payload = {
      items: state.cart.map((l) => ({ product_id: l.pid, unit_id: l.uid || null, qty: Number(l.qty) || 0, price: Number(l.price) || 0 })),
      pay: co.pay,
      customer_id: co.pay === 'credit' ? co.customer : null,
      paid: Number(co.paid) || 0,
      cash: co.cash === 'drawer' ? 'drawer' : 'hand',
      pin: co.pin,
    };
    co.phase = 'sending';
    co.error = '';
    render();
    let cid;
    try {
      cid = await push('sale', payload);
    } catch (e) {
      co.phase = 'form';
      co.pin = '';
      co.error = navigator.onLine === false ? 'ما اكو نت. البيعة ما انرسلت، جرّب مرة ثانية' : e.message;
      return render();
    }
    const n = state.cart.length;
    const entry = { cid, kind: 'sale', label: `${n} ${n === 1 ? 'مادة' : 'مواد'} · ${fmt(total)} د.ع${co.pay === 'credit' ? ` · دين ${((s.customers || []).find((c) => c[0] === co.customer) || [])[1] || ''}` : ''}`, at: new Date().toISOString(), status: 'pending' };
    state.pend.push(entry);
    savePend();
    co.phase = 'wait';
    render();
    const r = await waitFor(cid, 12000);
    if (!state.co || state.co !== co) return;
    if (r && r.status === 'done') {
      entry.status = 'done';
      entry.result = r.result;
      co.phase = 'done';
      co.result = r.result;
      state.cart = [];
      saveCart();
      setTimeout(load, 1200);
    } else if (r && r.status === 'error') {
      entry.status = 'error';
      entry.result = r.result;
      co.phase = 'form';
      co.pin = '';
      co.error = (r.result && r.result.error) || 'ما انسجلت';
      co.shake = /رمز/.test(co.error);
    } else {
      co.phase = 'queued';
      state.cart = [];
      saveCart();
    }
    savePend();
    render();
    if (co.shake) setTimeout(() => ((co.shake = false), render()), 400);
  }

  function newReqSheet() {
    const q = norm(state.rq || '');
    const found = q ? ((snap().stock && snap().stock.all) || []).filter((r) => norm(r[1]).includes(q)).slice(0, 6) : [];
    return [
      'طلب جديد',
      `<div class="lbl"><span>دواء موجود بالمخزن</span></div>
       <label class="search">${ic('search')}<input id="rq" value="${esc(state.rq || '')}" placeholder="ابحث عن الدواء" autocomplete="off" /></label>
       ${found.length ? `<div class="box section" style="padding:0 12px">${found.map((r) => `<button class="row" style="padding:10px 2px" data-reqdrug="${r[0]}"><span class="two"><b class="ell">${esc(r[1])}</b><small class="num">${esc(qText(r))}</small></span><span class="pill blue">اطلب</span></button>`).join('')}</div>` : ''}
       <div class="lbl"><span>أو أدوية مو موجودة (كل اسم بسطر)</span></div>
       <textarea class="input" id="names" rows="4" dir="auto" placeholder="مثلاً:&#10;اوغمنتين 1غ&#10;نيكسيوم 40">${esc(state.names || '')}</textarea>`,
      '<button class="btn wide" data-act="send-names">اطلب</button>',
    ];
  }

  function sheetBody(sh) {
    const s = snap();
    const d = day();
    if (sh.type === 'drug') return drugSheet(sh);
    if (sh.type === 'checkout') return checkoutSheet();
    if (sh.type === 'newreq') return newReqSheet();
    if (sh.type === 'scan') {
      const live = Boolean(cam.stream);
      return [
        'ابحث بالكاميرا',
        `<div class="cam ${live ? 'live' : ''}" ${live ? 'data-cam' : ''} style="margin:0;border-radius:20px;height:320px;padding-top:0">${live ? '<div class="cam-frame" aria-hidden="true"><span class="c1"></span><span class="c2"></span><span class="c3"></span><span class="c4"></span><i class="laser"></i></div><div class="cam-toast"></div>' : `<div class="cam-off">${ic('scan')}<div>${cam.error ? esc(cam.error) : 'جاي يفتح الكاميرا...'}</div></div>`}</div><div class="muted" style="text-align:center;margin-top:10px;font-size:13px">وجّه الكاميرا على باركود الدواء</div>`,
        '',
      ];
    }
    if (sh.type === 'inv') {
      const i = (d.invoices || [])[sh.idx];
      if (!i) return ['الفاتورة', '<div class="empty">ما لگيتها</div>', ''];
      const sub = (i.items || []).reduce((a, x) => a + x.total, 0);
      return [
        `فاتورة #${i.n}`,
        `<div class="grid2"><div class="cell"><small>الوقت</small><b>${esc(t12(i.at))}</b></div><div class="cell"><small>الزبون</small><b class="ell">${esc(i.customer || 'نقدي')}</b></div><div class="cell"><small>منو باع</small><b class="ell">${esc(i.by || '—')}</b></div><div class="cell"><small>الدفع</small><b>${i.cancelled ? '<span class="red">ملغية</span>' : i.credit ? `<span class="amber">دين ${fmt(i.credit)}</span>` : '<span class="green">نقد</span>'}</b></div></div>
        <div class="lbl"><span>شنو انباع (${(i.items || []).length})</span></div>
        <div class="box" style="padding:2px 16px">${(i.items || [])
          .map((x) => {
            const e = expInfo(x.exp);
            return `<div class="item"><div class="a1"><b>${esc(x.name)}</b><b class="num">${fmt(x.total)}</b></div><div class="a2"><span class="num">${qty(x.qty)} ${esc(x.unit)} × ${fmt(x.price)}</span>${x.foc ? `<span class="pill green">+${qty(x.foc)} بونص</span>` : ''}${hp() || x.profit == null ? '' : `<span class="green">ربح ${fmt(x.profit)}</span>`}</div><div class="a2">${e ? `<span class="pill ${e.level}">${esc(e.date)}</span>` : ''}${x.src ? `<span>من ${esc(x.src)}</span>` : ''}</div></div>`;
          })
          .join('')}</div>
        <div class="box section">${i.discount ? `<div class="kv"><span>قبل الخصم</span><b class="num">${fmt(sub)}</b></div><div class="kv"><span>الخصم</span><b class="num red">- ${fmt(i.discount)}</b></div>` : ''}<div class="kv big"><span>المجموع</span><b class="num">${fmt(i.total)}</b></div>${i.paid ? `<div class="kv"><span>الواصل</span><b class="num">${fmt(i.paid)}</b></div>` : ''}${i.change ? `<div class="kv"><span>الباقي للزبون</span><b class="num">${fmt(i.change)}</b></div>` : ''}${hp() || i.profit == null ? '' : `<div class="kv"><span>ربح الفاتورة</span><b class="num green">${fmt(i.profit)}</b></div>`}</div>`,
        '',
      ];
    }
    if (sh.type === 'shift') {
      const x = (d.shifts || []).find((y) => String(y.id) === String(sh.id));
      if (!x) return ['الشفت', '', ''];
      const list = (d.invoices || []).map((i, idx) => ({ i, idx })).filter(({ i }) => String(i.sid) === String(x.id));
      return [
        /^(ال)?شفت/.test(x.name || '') ? x.name : `شفت ${x.name}`,
        `<div class="grid2"><div class="cell"><small>دخل</small><b>${esc(t12(x.start))}</b></div><div class="cell"><small>طلع</small><b>${x.live ? '<span class="green">شغّال هسه</span>' : esc(t12(x.end))}</b></div><div class="cell"><small>المبيعات</small><b class="num">${fmt(x.sales)}</b></div>${hp() ? '' : `<div class="cell"><small>الربح</small><b class="num green">${fmt(x.profit)}</b></div>`}<div class="cell"><small>القاصة</small><b class="num">${fmt(x.cash)}</b></div><div class="cell"><small>المرتجعات</small><b class="num">${fmt(x.returns)}</b></div></div>
        <div class="lbl"><span>فواتيره (${list.length})</span></div><div class="box" style="padding:0">${list.map(({ i, idx }) => invRow(i, idx)).join('') || '<div class="empty" style="padding:16px">ما اكو</div>'}</div>`,
        '',
      ];
    }
    if (sh.type === 'debts') {
      const db = s.debts || {};
      return [
        'الديون',
        `<div class="grid2"><div class="cell"><small>على الزبائن</small><b class="num amber">${fmt(db.customers)}</b></div><div class="cell"><small>علينا للمذاخر</small><b class="num">${fmt(db.suppliers)}</b></div></div>
        <div class="lbl"><span>أكثر الزبائن عليهم</span></div><div class="box" style="padding:2px 16px">${(db.customers_top || []).map((c) => `<div class="kv"><span>${esc(c.name)}${c.phone ? ` <small class="num">${esc(c.phone)}</small>` : ''}</span><b class="num amber">${fmt(c.iqd)}</b></div>`).join('') || '<div class="kv"><span>ما اكو</span></div>'}</div>
        <div class="lbl"><span>اللي علينا للمذاخر</span></div><div class="box" style="padding:2px 16px">${(db.suppliers_top || []).map((c) => `<div class="kv"><span>${esc(c.name)}</span><b class="num">${fmt(c.iqd)}</b></div>`).join('') || '<div class="kv"><span>ما اكو</span></div>'}</div>`,
        '',
      ];
    }
    if (sh.type === 'cash') {
      return [
        'القاصة',
        s.cash
          ? `<div class="box"><div class="kv big"><span>المفروض بالقاصة هسه</span><b class="num">${fmt(s.cash.iqd)}</b></div>${s.cash.usd ? `<div class="kv"><span>دولار</span><b class="num">$${qty(s.cash.usd)}</b></div>` : ''}<div class="kv"><span>الدوام مفتوح من</span><b>${esc(dmy(s.cash.since))} ${esc(t12(s.cash.since))}</b></div></div><div class="grid2 section"><div class="cell"><small>مبيعات اليوم</small><b class="num">${fmt(s.today.sales)}</b></div><div class="cell"><small>مصاريف اليوم</small><b class="num red">${fmt(s.today.expenses)}</b></div></div>`
          : '<div class="empty">دوام القاصة مسكّر هسه</div>',
        '',
      ];
    }
    if (sh.type === 'day') {
      const x = (s.daily || []).find((y) => y.day === sh.day) || {};
      const canOpen = sh.day === (s.today || {}).date || sh.day === (s.yesterday || {}).date;
      return [
        `${DAYS[new Date(`${sh.day}T12:00:00`).getDay()]} ${dmy(sh.day)}`,
        `<div class="grid3"><div class="cell"><small>المبيعات</small><b class="num">${fmt(x.sales)}</b></div>${hp() ? '' : `<div class="cell"><small>الربح</small><b class="num green">${fmt(x.profit)}</b></div>`}<div class="cell"><small>الفواتير</small><b class="num">${fmt(x.count)}</b></div></div>`,
        canOpen ? `<button class="btn wide" data-openday="${sh.day === s.today.date ? 'today' : 'yesterday'}">شوف فواتير هاليوم</button>` : '',
      ];
    }
    return ['', '', ''];
  }
  function sheets() {
    if (!state.sheets.length) return '';
    const sh = state.sheets[state.sheets.length - 1];
    const [title, body, foot] = sheetBody(sh);
    const busy = sh.type === 'checkout' && state.co && (state.co.phase === 'sending' || state.co.phase === 'wait');
    // الحركة بس أول ما تنفتح النافذة (مو ويّا كل رسم، حتى ما ترمش وانت تكتب الرمز)
    const anim = state.sheetAnim;
    state.sheetAnim = false;
    return `<div class="sheet-bg ${anim ? 'anim' : ''}" ${busy ? '' : 'data-act="close"'}></div>
      <div class="sheet ${anim ? 'anim' : ''} ${sh.type === 'drug' ? 'full' : ''}" role="dialog" aria-label="${esc(title)}">
        <div class="grab"></div>
        <div class="sheet-h">${state.sheets.length > 1 ? `<button class="iconbtn" data-act="back" aria-label="رجوع">${ic('back')}</button>` : ''}<b class="grow ell">${esc(title)}</b>${busy ? '' : `<button class="iconbtn" data-act="close" aria-label="سد">${ic('close')}</button>`}</div>
        <div class="sheet-b">${body}</div>
        ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
      </div>`;
  }

  function nav() {
    const nr = newReqs().length;
    const t = (k, label, icon, extra = '') => `<button class="tab ${state.tab === k ? 'on' : ''}" data-tab="${k}">${extra || ic(icon)}<span>${label}</span></button>`;
    return `<nav class="tabbar" aria-label="القائمة">
      ${t('home', 'الرئيسية', 'home')}
      ${t('orders', 'الطلبات', 'orders', `<span class="wrap">${ic('orders')}${nr ? `<span class="badge num">${nr > 99 ? '99+' : nr}</span>` : ''}</span>`)}
      ${t('sale', 'بيع', 'scan', `<span class="scanbtn">${ic('scan')}</span>`)}
      ${t('stock', 'المخزون', 'box')}
      ${t('more', 'المزيد', 'grid')}
    </nav>`;
  }

  function welcome(msg, btn) {
    return `<div class="welcome"><img src="icon-512.png" alt="" /><h1>ميزان</h1><p>${msg}</p>${btn || ''}</div>`;
  }

  function render() {
    if ((!TOKEN || !KEY) && !demo) {
      $app.innerHTML = welcome('ملخص صيدليتك، والطلبات، والبيع بالكاميرا', `<ol><li>بالبرنامج بالحاسبة: الإعدادات ← تطبيق الموبايل ← «اربط الموبايل»</li><li>وجّه كاميرا الموبايل على الكود ودوس الرابط</li><li>آيفون: زر المشاركة ← «إضافة إلى الشاشة الرئيسية». أندرويد: ⋮ ← «تثبيت التطبيق»</li></ol>`);
      return;
    }
    if (!state.snap) {
      $app.innerHTML = welcome(state.loading ? 'جاي يجيب الملخص...' : esc(state.error || 'ما وصل ملخص بعد. تأكد إن البرنامج بالحاسبة مفتوح وبيه نت'), state.loading ? '' : '<button class="btn" data-act="refresh">جرّب مرة ثانية</button>');
      return;
    }
    const focus = document.activeElement && document.activeElement.id;
    const caret = focus && document.activeElement.selectionStart;
    const body = state.tab === 'orders' ? ordersTab() : state.tab === 'sale' ? saleTab() : state.tab === 'stock' ? stockTab() : state.tab === 'more' ? moreTab() : homeTab();
    if (video.parentNode) video.remove();
    $app.className = state.tab === 'sale' ? 'sale-mode' : '';
    $app.innerHTML = `${body}${state.tab === 'sale' ? '' : nav()}${sheets()}`;
    document.body.classList.toggle('locked', state.sheets.length > 0);
    attachCam();
    paintCamMsg();
    if (focus) {
      const el = document.getElementById(focus);
      if (el && el.tagName !== 'BUTTON') {
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(caret, caret);
        } catch {
          /* */
        }
      }
    }
  }

  /* ===== زر الرجوع مثل التطبيقات ===== */
  const snapView = () => ({ mz: 3, tab: state.tab, day: state.day, more: state.more, sheets: state.sheets.map((s) => ({ type: s.type, id: s.id, idx: s.idx, day: s.day })) });
  history.replaceState(snapView(), '');
  const go = (fn) => {
    fn();
    history.pushState(snapView(), '');
    render();
  };
  function openSheet(x) {
    state.sheetAnim = true;
    go(() => state.sheets.push(x));
    if (x.type === 'drug') fetchInfo(x.id).then(() => {}, () => {});
  }
  function leaveCamIfNeeded() {
    const wants = state.tab === 'sale' || state.sheets.some((s) => s.type === 'scan');
    if (!wants && cam.stream) camStop();
  }
  window.addEventListener('popstate', (e) => {
    const v = e.state;
    if (v && v.mz) {
      state.tab = v.tab;
      state.day = v.day;
      state.more = v.more || null;
      state.sheets = v.sheets || [];
    } else {
      state.sheets = [];
      state.more = null;
      state.tab = 'home';
    }
    if (!state.sheets.some((s) => s.type === 'checkout')) state.co = state.co && (state.co.phase === 'wait' || state.co.phase === 'sending') ? state.co : null;
    leaveCamIfNeeded();
    render();
  });
  const closeSheets = () => (state.sheets.length ? history.go(-state.sheets.length) : null);

  /* ===== الأحداث ===== */
  $app.addEventListener('click', (e) => {
    const b = e.target.closest('button,[data-act]');
    if (!b) return;
    const ds = b.dataset;
    if (ds.act === 'refresh') return void load();
    if (ds.act === 'install' && installEvt) {
      installEvt.prompt();
      installEvt.userChoice.finally(() => ((installEvt = null), render()));
      return undefined;
    }
    if (ds.act === 'hide-install') return void (lsSet('mz_hide_install', '1'), render());
    if (ds.act === 'close') {
      if (state.sheets.some((s) => s.type === 'scan')) camStop();
      return void closeSheets();
    }
    if (ds.act === 'back') return void history.back();
    if (ds.tab) {
      if (ds.tab === state.tab && !state.sheets.length && !state.more) return void window.scrollTo({ top: 0, behavior: 'smooth' });
      go(() => {
        state.tab = ds.tab;
        state.more = null;
        state.sheets = [];
        if (ds.tab !== 'sale') lsSet(LS.tab, ds.tab);
        window.scrollTo(0, 0);
      });
      leaveCamIfNeeded();
      // البيع: الكاميرا تشتغل وحدها إذا انسمحت قبل
      if (ds.tab === 'sale' && !cam.stream && lsGet('mz_cam_ok') === '1') camStart('sale');
      return undefined;
    }
    if (ds.more) return go(() => ((state.tab = 'more'), (state.more = ds.more), (state.sheets = []), window.scrollTo(0, 0)));
    if (ds.stock) return go(() => ((state.tab = 'stock'), (state.filter = ds.stock), (state.limit = 60), (state.sheets = []), window.scrollTo(0, 0)));
    if (ds.openday) return go(() => ((state.day = ds.openday), (state.tab = 'more'), (state.more = 'invoices'), (state.sheets = [])));
    if (ds.day) {
      state.day = ds.day;
      history.replaceState(snapView(), '');
      return void render();
    }
    if (ds.ord) return void ((state.ordTab = ds.ord), render());
    if (ds.filter) return void ((state.filter = ds.filter), (state.limit = 60), render());
    if (ds.act === 'more-rows') return void ((state.limit += 120), render());
    // الطلبات
    if (ds.req) {
      const id = Number(ds.req);
      const st = ds.st;
      const prevSt = (reqs().find((r) => r.id === id) || {}).state;
      state.reqOv[id] = st;
      render();
      push('req_state', { id, state: st }).then(
        () => toast(st === 'ordered' ? 'انعلّم «انطلب»' : st === 'arrived' ? 'انعلّم «وصل»' : st === 'removed' ? 'انشال الطلب' : 'رجع جديد'),
        (err) => {
          if (prevSt) state.reqOv[id] = prevSt;
          else delete state.reqOv[id];
          toast(err.message, true);
          render();
        }
      );
      return undefined;
    }
    if (ds.reqdrug) {
      const r = catRow(ds.reqdrug);
      push('request', { product_id: Number(ds.reqdrug) }).then(
        () => {
          toast(`انطلب «${r ? r[1] : ''}». يبين بالطلبات خلال ثواني`);
          setTimeout(load, 4000);
        },
        (err) => toast(err.message, true)
      );
      if (state.sheets.some((s) => s.type === 'newreq')) (state.rq = ''), closeSheets();
      return undefined;
    }
    if (ds.act === 'send-names') {
      const names = String(state.names || '').trim();
      if (!names) return void toast('اكتب اسم الدواء', true);
      push('request', { names }).then(
        () => {
          state.names = '';
          toast('انرسل الطلب. يبين بالطلبات خلال ثواني');
          setTimeout(load, 4000);
        },
        (err) => toast(err.message, true)
      );
      return void closeSheets();
    }
    // البيع
    if (ds.act === 'cam-on') {
      lsSet('mz_cam_ok', '1');
      return void camStart('sale');
    }
    if (ds.act === 'cam-off') return void (camStop(), lsSet('mz_cam_ok', '0'), render());
    if (ds.act === 'torch') return void toggleTorch();
    if (ds.act === 'scan-find') {
      openSheet({ type: 'scan' });
      return void camStart('find');
    }
    if (ds.act === 'sale-close') {
      camStop();
      return go(() => ((state.tab = lsGet(LS.tab) && lsGet(LS.tab) !== 'sale' ? lsGet(LS.tab) : 'home'), (state.sheets = [])));
    }
    if (ds.add) {
      const r = catRow(ds.add);
      if (r) addToCart(r, 0);
      state.sq = '';
      document.activeElement && document.activeElement.blur();
      return void render();
    }
    if (ds.sell) {
      const r = catRow(ds.sell);
      if (r) addToCart(r, 0);
      return go(() => ((state.tab = 'sale'), (state.sheets = []), window.scrollTo(0, 0)));
    }
    if (ds.qty) {
      const l = state.cart.find((x) => x.key === ds.qty);
      if (l) {
        l.qty = Math.max(0, Math.round((Number(l.qty) + Number(ds.d)) * 1000) / 1000);
        if (l.qty <= 0) state.cart = state.cart.filter((x) => x !== l);
        saveCart();
      }
      return void render();
    }
    if (ds.unit) {
      const l = state.cart.find((x) => x.key === ds.unit);
      const r = l && catRow(l.pid);
      if (r) {
        l.uid = Number(ds.uid) || 0;
        l.price = unitPrice(r, l.uid);
        saveCart();
      }
      return void render();
    }
    if (ds.rm) return void ((state.cart = state.cart.filter((x) => x.key !== ds.rm)), saveCart(), render());
    if (ds.act === 'clear-cart') return void ((state.cart = []), saveCart(), render());
    if (ds.act === 'checkout') {
      if (!state.cart.length) return undefined;
      state.co = { phase: 'form', pay: 'cash', paid: '', cash: 'hand', customer: null, cq: '', pin: '', error: '' };
      return openSheet({ type: 'checkout' });
    }
    if (ds.pay && state.co) return void ((state.co.pay = ds.pay), (state.co.error = ''), render());
    if (ds.cashat && state.co) return void ((state.co.cash = ds.cashat), render());
    if (ds.cust && state.co) return void ((state.co.customer = Number(ds.cust)), (state.co.error = ''), render());
    if (ds.act === 'co-cust-clear' && state.co) return void ((state.co.customer = null), render());
    if (ds.key && state.co && state.co.phase === 'form') {
      const co = state.co;
      if (ds.key === 'c') co.pin = '';
      else if (ds.key === 'b') co.pin = co.pin.slice(0, -1);
      else if (co.pin.length < 4) co.pin += ds.key;
      co.error = co.pin ? co.error : '';
      render();
      if (co.pin.length === 4) submitSale();
      return undefined;
    }
    if (ds.act === 'co-new') {
      state.co = null;
      return void closeSheets();
    }
    if (ds.sheet) {
      const x = { type: ds.sheet };
      if (ds.idx != null) x.idx = Number(ds.idx);
      if (ds.id) x.id = /^\d+$/.test(ds.id) ? Number(ds.id) : ds.id;
      if (ds.dayOf) x.day = ds.dayOf;
      if (x.type === 'newreq') state.rq = '';
      return openSheet(x);
    }
    return undefined;
  });
  $app.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'q') (state.q = e.target.value), render();
    else if (id === 'pq') (state.pq = e.target.value), (state.limit = 60), render();
    else if (id === 'sq') {
      state.sq = e.target.value;
      // باركود انكتب أو انلصق كامل: يضيفه مباشرة
      const hit = byCode.get(state.sq.trim());
      if (hit) {
        addToCart(hit.row, hit.uid);
        state.sq = '';
      }
      render();
    } else if (id === 'rq') (state.rq = e.target.value), render();
    else if (id === 'names') state.names = e.target.value;
    else if (id === 'cq' && state.co) (state.co.cq = e.target.value), render();
    else if (id === 'paid' && state.co) (state.co.paid = e.target.value.replace(/[^\d]/g, '')), render();
    else if (e.target.dataset.qin) {
      const l = state.cart.find((x) => x.key === e.target.dataset.qin);
      const v = Number(String(e.target.value).replace(/[^\d.]/g, ''));
      if (l && v > 0) {
        l.qty = v;
        saveCart();
        const tot = document.querySelector('.paybar .tot b');
        if (tot) tot.innerHTML = `${fmt(cartTotal())} <small>د.ع</small>`;
      }
    }
  });
  $app.addEventListener('change', (e) => {
    if (e.target.dataset.qin) render();
  });

  indexCatalog();
  render();
  load();
  // يتحدّث وحده كل 20 ثانية وهو مفتوح، والبيعات اللي تنتظر يسأل عنها كل 6 ثواني
  setInterval(() => document.visibilityState === 'visible' && !quiet() && !state.sheets.length && load(), 20000);
  setInterval(() => document.visibilityState === 'visible' && checkPend(), 6000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') load();
    else if (cam.stream) (camStop(), render());
  });
  if ('serviceWorker' in navigator && !demo) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
