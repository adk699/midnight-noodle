/* =========================================================
   深夜面馆 —— 放置经营 H5
   纯原生 JS，无第三方依赖；渲染走 DOM + CSS 动画。
   结构：配置 → 状态 → 计算 → 主循环 → 渲染 → 交互 → 存档
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 配置 ---------------- */
  const SAVE_KEY = 'midnightNoodle.v1';
  const OFFLINE_CAP_H = 4;            // 离线收益最多结算 4 小时
  const OFFLINE_MIN_SEC = 60;         // 少于 60 秒不弹离线结算

  const UPGRADES = {
    stove: { name: '灶台', icon: 'flame',     base: 50,  mult: 1.55, max: 40 },
    menu:  { name: '菜谱', icon: 'soup',      base: 55,  mult: 1.50, max: 40 },
    seat:  { name: '座位', icon: 'armchair',  base: 110, mult: 1.70, max: 40 },
    chef:  { name: '伙计', icon: 'chef-hat',  base: 220, mult: 1.80, max: 12 },
    decor: { name: '装修', icon: 'lamp',      base: 140, mult: 1.60, max: 40 }
  };

  const DISHES = [
    { name: '阳春面',   base: 10, cook: 1.00, unlock: 1 },
    { name: '春笋面',   base: 10, cook: 1.00, unlock: 1, season: 'spring' },
    { name: '凉面',     base: 10, cook: 1.00, unlock: 1, season: 'summer' },
    { name: '蟹粉面',   base: 14, cook: 1.05, unlock: 1, season: 'autumn' },
    { name: '羊肉汤面', base: 12, cook: 1.10, unlock: 1, season: 'winter' },
    { name: '牛肉面',   base: 18, cook: 1.15, unlock: 3 },
    { name: '酸辣粉',   base: 26, cook: 1.25, unlock: 5 },
    { name: '小馄饨',   base: 36, cook: 1.35, unlock: 7 },
    { name: '炸酱面',   base: 48, cook: 1.45, unlock: 9 },
    { name: '葱油拌面', base: 62, cook: 1.55, unlock: 12 },
    /* 节日限定小食：只在对应节日那几天出现在菜单里 */
    { name: '年糕',     base: 10, cook: 1.00, unlock: 1, fest: 'chunjie' },
    { name: '汤圆',     base: 10, cook: 1.00, unlock: 1, fest: 'yuanxiao' },
    { name: '粽子',     base: 12, cook: 1.05, unlock: 1, fest: 'duanwu' },
    { name: '巧果',     base: 10, cook: 1.00, unlock: 1, fest: 'qixi' },
    { name: '月饼',     base: 14, cook: 1.05, unlock: 1, fest: 'zhongqiu' },
    { name: '饺子',     base: 12, cook: 1.05, unlock: 1, fest: 'dongzhi' }
  ];
  const LOOKS = 8; // 像素顾客变体数（assets/customers/citizens_idle.png）

  /* ---------------- 四季与节日 ---------------- */
  /* 四季按真实月份：3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬
     预览：?season=spring|summer|autumn|winter；兼容旧链接 ?summer=1 / ?summer=0 */
  const SEASONS = {
    spring: { name: '春', key: 'spring' },
    summer: { name: '夏', key: 'summer' },
    autumn: { name: '秋', key: 'autumn' },
    winter: { name: '冬', key: 'winter' }
  };
  const seasonKey = (() => {
    const q = new URLSearchParams(location.search).get('season');
    if (q && SEASONS[q]) return q;
    const legacy = new URLSearchParams(location.search).get('summer');
    if (legacy === '1') return 'summer';
    if (legacy === '0') return 'spring';
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  })();
  const season = SEASONS[seasonKey];

  /* 节日：用固定日期窗口近似农历节日，保证相邻节日不重叠
     预览：?date=09-20（只看节日，不改季节） */
  const FESTIVALS = [
    { id: 'chunjie',   name: '春节', from: [1, 20],  to: [2, 5] },
    { id: 'yuanxiao',  name: '元宵', from: [2, 6],   to: [2, 20] },
    { id: 'duanwu',    name: '端午', from: [6, 1],   to: [6, 15] },
    { id: 'qixi',      name: '七夕', from: [8, 1],   to: [8, 15] },
    { id: 'zhongqiu',  name: '中秋', from: [9, 10],  to: [9, 25] },
    { id: 'dongzhi',   name: '冬至', from: [12, 15], to: [12, 25] }
  ];
  function todayMD() {
    const q = new URLSearchParams(location.search).get('date');
    if (q && /^\d{1,2}-\d{1,2}$/.test(q)) {
      const [m, d] = q.split('-').map(Number);
      return { m, d };
    }
    const n = new Date();
    return { m: n.getMonth() + 1, d: n.getDate() };
  }
  const festival = (() => {
    const md = todayMD();
    const v = md.m * 100 + md.d;
    return FESTIVALS.find(f => v >= f.from[0] * 100 + f.from[1] && v <= f.to[0] * 100 + f.to[1]) || null;
  })();

  /* 顾客留言：出餐后写进店铺页的留言墙 */
  const CUSTOMER_LINES = [
    '今天也辛苦啦。',
    '这碗面，像家里的味道。',
    '雨停了再走。',
    '夜班下班，先吃口热的。',
    '一个人吃面，也挺好。',
    '明天还要早起。',
    '汤热，心也热。',
    '老板，多加一份葱花。',
    '路过，就想进来坐坐。',
    '吃完这碗，就回家。',
    '夜里风大，慢慢吃。',
    '这盏灯，真暖。',
    '一口面，一口汤。',
    '今天没什么事，就是想坐坐。',
    '下次还来。',
    '面要趁热，话要慢慢说。'
  ];
  const SEASON_LINES = {
    spring: ['春风一吹，就想吃碗面。', '花开的时候，正好路过。', '燕子回来了。'],
    summer: ['夏夜的风，吹得人不想回家。', '西瓜很甜，夜还长。', '风铃响了，再来一碗。'],
    autumn: ['秋天了，加件外套再来。', '落叶铺了一地。', '夜里有点凉，吃口热的。'],
    winter: ['外面好冷，进来暖暖手。', '下雪了，慢慢吃。', '汤冒着热气，真好。']
  };
  const FESTIVAL_LINES = {
    chunjie:  ['过年好，吃口热的再走。', '新的一年，顺顺利利。'],
    yuanxiao: ['汤圆甜，灯也亮。', '今晚的月亮，真圆。'],
    duanwu:   ['艾草香，粽子刚出锅。', '河边鼓声，听着就热闹。'],
    qixi:     ['今晚的星星，真好看。', '牛郎织女，也该见面了。'],
    zhongqiu: ['月亮圆了，人也该团圆。', '月饼分你一半。'],
    dongzhi:  ['冬至夜，吃碗热饺子。', '天最短，夜最长。']
  };
  function pickLine() {
    const pool = CUSTOMER_LINES.concat(SEASON_LINES[seasonKey] || []);
    if (festival && FESTIVAL_LINES[festival.id]) pool.push(...FESTIVAL_LINES[festival.id]);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* 门店扩张：按本周目进账自动升级，永久提升单价 */
  const STORES = [
    { name: '路边摊',   at: 0,      mul: 1.00 },
    { name: '小面馆',   at: 20000,  mul: 1.15 },
    { name: '深夜食堂', at: 60000,  mul: 1.30 },
    { name: '老字号',   at: 150000, mul: 1.50 },
    { name: '连锁总店', at: 400000, mul: 1.75 }
  ];
  const PRESTIGE_MIN = 200000;   // 本周目进账满这个数才可转生
  const PRESTIGE_STEP = 200000;  // 每 20 万进账换 1 碗老汤
  const BROTH_BONUS = 0.08;      // 每碗老汤永久 +8% 收益

  /* ---------------- 状态 ---------------- */
  function freshState() {
    return {
      v: 1,
      money: 30,
      totalEarned: 0,
      runEarned: 0,      // 本周目进账（转生清零，用于门店/老汤）
      broth: 0,          // 老汤：转生获得的永久货币
      rep: 0,
      orders: 0,
      lv: { stove: 1, menu: 1, seat: 1, chef: 0, decor: 1 },
      lastSave: Date.now(),
      cd: { peak: 0, gift: 0, rush: 0 },      // 各促销下次可用时间戳
      boost: { peakUntil: 0, rushUntil: 0 },  // 生效中的加成
      adsWatched: 0,
      sfx: true,
      bgm: true,
      tutorialDone: false,
      daily: { date: '', orders: 0, earn: 0, upg: 0, claimed: {} },
      wall: []
    };
  }

  /* ---------------- 每日任务 ---------------- */
  const DAILY_TASKS = [
    { id: 'orders', icon: 'soup',     name: '今日出餐 40 碗', target: 40, value: () => st.daily.orders, gold: () => Math.max(300, Math.floor(unitPrice() * 35)), rep: 1 },
    { id: 'earn',   icon: 'coins',    name: '今日进账',       target: 800, value: () => st.daily.earn,  gold: () => Math.max(400, Math.floor(unitPrice() * 60)), rep: 2 },
    { id: 'upg',    icon: 'arrow-up', name: '今日升级 3 次',  target: 3,   value: () => st.daily.upg,   gold: () => Math.max(500, Math.floor(unitPrice() * 80)), rep: 3 }
  ];

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function checkDaily() {
    if (!st.daily || st.daily.date !== todayKey()) {
      // 只重置每日任务，不写存档：saveState 会把 lastSave 改成现在，吃掉离线收益
      st.daily = { date: todayKey(), orders: 0, earn: 0, upg: 0, claimed: {} };
    }
  }

  let st = loadState();
  let lastStore = -1;      // 上次看到的门店等级，用于升级提示
  let cook = 0;            // 当前锅里的进度（秒）
  let spawnT = 0;          // 客流计时
  let rafLast = performance.now();
  let currentTab = 'upgrade';
  let panelLock = null;    // 弹窗打开时暂停交互
  const custs = [];        // 顾客队列（运行时）
  let custSeq = 0;
  const nodes = new Map(); // 顾客 id → DOM

  /* ---------------- 存档 ---------------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return freshState();
      const s = JSON.parse(raw);
      const base = freshState();
      const merged = Object.assign(base, s, { lv: Object.assign(base.lv, s.lv || {}), cd: Object.assign(base.cd, s.cd || {}), boost: Object.assign(base.boost, s.boost || {}) });
      /* 存档字段校验：手改坏档/旧档不能把界面变成 NaN 或 Lv.x */
      const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
      merged.money = Math.max(0, num(s.money, 30));
      merged.totalEarned = Math.max(0, num(s.totalEarned, 0));
      merged.runEarned = Math.max(0, num(s.runEarned, merged.totalEarned));  // 老存档没有本周目进账
      merged.rep = Math.max(0, num(s.rep, 0));
      merged.orders = Math.max(0, num(s.orders, 0));
      merged.broth = Math.max(0, num(s.broth, 0));
      for (const k of Object.keys(UPGRADES)) {
        const min = k === 'chef' ? 0 : 1;
        const v = Math.floor(num(s.lv && s.lv[k], base.lv[k]));
        merged.lv[k] = Math.min(UPGRADES[k].max, Math.max(min, v));
      }
      if (!merged.daily || typeof merged.daily !== 'object') merged.daily = base.daily;
      if (!merged.daily.claimed || typeof merged.daily.claimed !== 'object') merged.daily.claimed = {};
      merged.wall = Array.isArray(merged.wall) ? merged.wall.filter(x => x && typeof x.text === 'string') : [];
      if (!merged.cd || typeof merged.cd !== 'object') merged.cd = base.cd;
      if (!merged.boost || typeof merged.boost !== 'object') merged.boost = base.boost;
      return merged;
    } catch (e) {
      return freshState();
    }
  }

  function saveState() {
    // 页面在后台时不要把 lastSave 刷新成“现在”，否则回来时离线收益会被吃掉
    if (!document.hidden) st.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ---------------- 数值 ---------------- */
  const cost = key => Math.ceil(UPGRADES[key].base * Math.pow(UPGRADES[key].mult, st.lv[key] - 1));
  const cookTime = () => 1.9 / Math.pow(1.18, st.lv.stove - 1);
  const autoRate = () => 0.45 + st.lv.chef * 0.5;                 // 每秒推进倍率

  const dishPool = () => DISHES.filter(d =>
    st.lv.menu >= d.unlock &&
    (!d.season || d.season === seasonKey) &&
    (!d.fest || (festival && d.fest === festival.id)));

  /* 门店与老汤的永久加成 */
  function storeIndex() {
    let i = 0;
    for (let k = 0; k < STORES.length; k++) if (st.runEarned >= STORES[k].at) i = k;
    return i;
  }
  const store = () => STORES[storeIndex()];
  const storeMul = () => store().mul;
  const brothMul = () => 1 + (st.broth || 0) * BROTH_BONUS;
  const brothGain = () => Math.floor(st.runEarned / PRESTIGE_STEP);

  function addMoney(g) {
    st.money += g;
    st.totalEarned += g;
    st.runEarned += g;
  }

  const priceMul = () => (1 + (st.lv.seat - 1) * 0.02) * (1 + (st.lv.decor - 1) * 0.05) * (1 + st.rep * 0.02) * storeMul() * brothMul();
  const priceFor = c => c.dish.base * priceMul();
  const cookTimeFor = c => 1.9 * c.dish.cook / Math.pow(1.18, st.lv.stove - 1);

  function unitPrice() {                    // 全部已解锁菜品的均价，用于离线估算与促销奖励
    const pool = dishPool().filter(d => !d.season && !d.fest);  // 季节/节日限定菜不参与均价，避免影响数值
    const avg = pool.reduce((s, d) => s + d.base, 0) / pool.length;
    return avg * priceMul();
  }
  /* 店面越大：队伍能排更长、客人来得更勤（单价加成在 storeMul 里） */
  const queueCap = () => 3 + (st.lv.seat - 1) + storeIndex();
  /* 座位越多，客人越坐得住：队伍变长时不至于因为看不见而白白掉声望 */
  const patienceSec = () => 22 + (st.lv.decor - 1) * 1.5 + (st.lv.seat - 1) * 6;

  function spawnInterval() {
    const peak = Date.now() < st.boost.peakUntil ? 3 : 1;
    const crowd = 1 + storeIndex() * 0.16;   // 每升一级店面，来客速度 +16%
    return Math.max(0.7, 2.9 / crowd / (1 + (st.lv.seat - 1) * 0.35 + (st.lv.decor - 1) * 0.08) / peak);
  }

  function rateNow() {
    const rush = Date.now() < st.boost.rushUntil ? 2 : 1;
    return autoRate() * rush;
  }

  function fmt(n) {
    n = Math.floor(n);
    if (n < 10000) return String(n);
    if (n < 100000000) return (n / 10000).toFixed(n < 100000 ? 1 : 0) + '万';
    return (n / 100000000).toFixed(2) + '亿';
  }

  /* ---------------- 音效（WebAudio 合成，无音频文件） ---------------- */
  let actx = null;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, delay) {
    if (!st.sfx) return;
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  const sfx = {
    serve() { tone(880, 0.09, 'triangle', 0.05); tone(1320, 0.12, 'triangle', 0.045, 0.07); tone(1760, 0.08, 'sine', 0.022, 0.14); },
    tap() { tone(520, 0.05, 'square', 0.02); },
    buy() { tone(660, 0.1, 'triangle', 0.05); tone(990, 0.16, 'triangle', 0.05, 0.09); },
    bad() { tone(180, 0.16, 'sawtooth', 0.035); },
    arrive() { tone(660, 0.08, 'sine', 0.022); tone(990, 0.12, 'sine', 0.018, 0.08); },
    reward() { tone(740, 0.1, 'sine', 0.05); tone(1100, 0.1, 'sine', 0.05, 0.1); tone(1480, 0.22, 'sine', 0.05, 0.2); tone(1760, 0.3, 'sine', 0.035, 0.3); },
    seasonChime() {
      if (seasonKey === 'summer') {
        tone(1568, 0.7, 'sine', 0.012); tone(2093, 0.8, 'sine', 0.010, 0.25); tone(2637, 0.9, 'sine', 0.008, 0.55);
      } else if (seasonKey === 'spring') {
        tone(1760, 0.16, 'sine', 0.008); tone(2093, 0.2, 'sine', 0.006, 0.12); tone(2349, 0.14, 'sine', 0.005, 0.26);
      } else if (seasonKey === 'autumn') {
        tone(523, 0.6, 'sine', 0.010); tone(659, 0.7, 'sine', 0.008, 0.3); tone(392, 0.9, 'sine', 0.006, 0.6);
      } else {
        tone(392, 0.9, 'sine', 0.012); tone(784, 0.5, 'sine', 0.006, 0.15);
      }
    }
  };

  let seasonTimer = null;
  function startSeasonAmbience() {
    if (seasonTimer) return;
    seasonTimer = setInterval(() => {
      if (!document.hidden && st.sfx) sfx.seasonChime();
    }, 32000);
  }

  /* ---------------- 背景音乐（合成 loop） ---------------- */
  const BGM_FILES = ['assets/audio/bgm_night.ogg?v=15', 'assets/audio/bgm_night.mp3?v=15'];
  const bgm = {
    buffer: null,
    source: null,
    gain: null,
    loading: null,
    volume: 0.15,
    load() {
      if (this.buffer || this.loading) return this.loading;
      this.loading = (async () => {
        const a = audio();
        if (!a) return null;
        for (const file of BGM_FILES) {
          try {
            const res = await fetch(file);
            if (!res.ok) continue;
            const raw = await res.arrayBuffer();
            const buf = await new Promise((ok, fail) => {
              const p = a.decodeAudioData(raw, ok, fail);
              if (p && p.then) p.then(ok, fail);
            });
            if (buf) { this.buffer = buf; return buf; }
          } catch (e) { /* 换下一种格式 */ }
        }
        return null;
      })();
      return this.loading;
    },
    start() {
      if (!st.bgm) return;
      const a = audio();
      if (!a || this.source) return;
      const play = () => {
        if (!this.buffer || !st.bgm || this.source) return;
        const g = a.createGain();
        g.gain.value = 0;
        g.connect(a.destination);
        const s = a.createBufferSource();
        s.buffer = this.buffer;
        s.loop = true;
        s.connect(g);
        s.onended = () => {
          if (this.source === s) { this.source = null; this.gain = null; }
        };
        s.start();
        this.source = s;
        this.gain = g;
        g.gain.setTargetAtTime(this.volume, a.currentTime, 0.8);
      };
      if (this.buffer) play();
      else this.load().then(play);
    },
    stop() {
      const s = this.source, g = this.gain;
      this.source = null;
      this.gain = null;
      if (g && actx) g.gain.setTargetAtTime(0, actx.currentTime, 0.25);
      if (s) setTimeout(() => { try { s.stop(); } catch (e) { /* 已停止 */ } }, 700);
    }
  };

  /* ---------------- DOM ---------------- */
  const $ = id => document.getElementById(id);
  const queueEl = $('queue'), emptyEl = $('queueEmpty'), queueCount = $('queueCount'), potEl = $('pot'), mainBtn = $('mainBtn');
  const cookFill = $('cookFill'), cookHint = $('cookHint');
  const moneyText = $('moneyText'), repText = $('repText'), statusText = $('statusText');
  const muteBtn = $('muteBtn'), muteIcon = $('muteIcon');

  function syncMuteUI() {
    if (!muteBtn || !muteIcon) return;
    const anyOn = st.sfx || st.bgm;
    muteBtn.classList.toggle('is-muted', !anyOn);
    muteBtn.setAttribute('aria-pressed', anyOn ? 'false' : 'true');
    muteBtn.setAttribute('aria-label', anyOn ? '全部静音' : '恢复声音');
    muteIcon.src = anyOn ? 'assets/icons/volume-2.svg' : 'assets/icons/volume-x.svg';
  }

  function toggleMute() {
    const on = !(st.sfx || st.bgm);
    st.sfx = on;
    st.bgm = on;
    saveState();
    if (st.bgm) { audio(); bgm.start(); } else bgm.stop();
    syncMuteUI();
    if (st.sfx) sfx.buy();
    if (currentTab === 'shop') updatePanel();
  }
  const tabBody = $('tabBody'), floatLayer = $('floatLayer'), toastEl = $('toast');
  const modalMask = $('modalMask'), modalTitle = $('modalTitle'), modalBody = $('modalBody'), modalBtn = $('modalBtn');

  /* ---------------- 星空 ---------------- */
  (function stars() {
    const box = $('stars');
    let html = '';
    for (let i = 0; i < 28; i++) {
      const x = Math.random() * 100, y = Math.random() * 55, d = (Math.random() * 5).toFixed(1);
      html += `<i style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;animation-delay:${d}s;opacity:${(0.15 + Math.random() * 0.35).toFixed(2)}"></i>`;
    }
    box.innerHTML = html;
  })();

  /* ---------------- 顾客 ---------------- */
  function addCustomer() {
    const pool = dishPool();
    const c = {
      id: ++custSeq,
      look: Math.floor(Math.random() * LOOKS),
      dish: pool[Math.floor(Math.random() * pool.length)],
      line: pickLine(),
      patience: patienceSec(),
      max: patienceSec(),
      mood: 'happy'
    };
    const wasEmpty = custs.length === 0;
    custs.push(c);
    syncQueue();
    if (wasEmpty) sfx.arrive();
  }

  function syncQueue() {
    // 新增
    for (const c of custs) {
      if (!nodes.has(c.id)) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cust mood-happy';
        el.dataset.id = String(c.id);
        el.setAttribute('aria-label', `为顾客加速：${c.dish.name}`);
        el.innerHTML = `<div class="cust-face"><i class="cust-sprite" style="--look:${c.look}"></i></div><div class="cust-patience"><i></i></div><div class="cust-dish">${c.dish.name}</div>`;
        el.addEventListener('click', () => tapCook(el));
        nodes.set(c.id, { el, bar: el.querySelector('.cust-patience i') });
        queueEl.appendChild(el);
      }
    }
    // 移除
    for (const [id, n] of nodes) {
      if (!custs.some(c => c.id === id)) {
        n.el.classList.add('served');
        setTimeout(() => { n.el.remove(); }, 360);
        nodes.delete(id);
      }
    }
    emptyEl.style.display = custs.length ? 'none' : 'block';
    if (queueCount) {
      const show = custs.length > 4;
      queueCount.hidden = !show;
      if (show) {
        const more = queueEl.scrollWidth > queueEl.clientWidth + 1;
        queueCount.textContent = `${custs.length} 人${more ? ' ›' : ''}`;
      }
    }
  }

  function serve() {
    const c = custs.shift();
    if (!c) return;
    const gain = priceFor(c);
    addMoney(gain);
    st.orders++;
    if (st.daily) { st.daily.orders++; st.daily.earn += gain; }
    const before = Math.floor((st.orders - 1) / 12);
    const after = Math.floor(st.orders / 12);
    if (after > before && st.rep < 300) {
      st.rep = Math.min(300, st.rep + (after - before));
      popText(`声望 +${after - before}`, '#ffd27a', 0.5, 0.36);
    }
    cook = 0;
    const n = nodes.get(c.id);
    if (n) popAt(n.el, `+${fmt(gain)}`, false);
    else popText(`+${fmt(gain)}`, null, 0.5, 0.42);
    sfx.serve();
    rememberLine(c.line);
    dropBubble(c);
    syncQueue();
  }

  function dropBubble(c) {
    if (c && c.bubble) { c.bubble.remove(); c.bubble = null; }
  }

  function rememberLine(text) {
    if (!text) return;
    if (!Array.isArray(st.wall)) st.wall = [];
    if (st.wall.slice(-3).some(x => x.text === text)) return;
    st.wall.push({ text, t: Date.now() });
    if (st.wall.length > 30) st.wall = st.wall.slice(-30);
    saveState();
    if (currentTab === 'shop') updatePanel();
  }

  function angry(c) {
    const i = custs.indexOf(c);
    if (i >= 0) custs.splice(i, 1);
    if (st.rep > 0) st.rep = Math.max(0, st.rep - 2);
    const n = nodes.get(c.id);
    if (n) popAt(n.el, '差评 -2', true);
    dropBubble(c);
    sfx.bad();
    syncQueue();
    toast('客人等急了，甩门走了…');
  }

  /* ---------------- 飘字 ---------------- */
  function popText(text, color, xR, yR, bad) {
    const el = document.createElement('div');
    el.className = 'coin-pop' + (bad ? ' bad' : '');
    el.textContent = text;
    el.style.left = (xR * 100).toFixed(1) + '%';
    el.style.top = (yR * 100).toFixed(1) + '%';
    if (color) el.style.color = color;
    floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function popAt(node, text, bad) {
    const r = node.getBoundingClientRect();
    const app = $('app').getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'coin-pop' + (bad ? ' bad' : '');
    el.textContent = text;
    el.style.left = (r.left - app.left + r.width / 2) + 'px';
    el.style.top = (r.top - app.top - 6) + 'px';
    floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  let toastTimer = 0;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 1800);
  }

  /* ---------------- 交互 ---------------- */
  function tapCook(el) {
    audio();
    mainBtn.classList.remove('is-hint');
    if (el && el.classList.contains('cust')) {
      const c = custs.find(x => x.id === Number(el.dataset.id));
      if (c) sayBubble(el, c);
    }
    if (!custs.length) return;
    const target = cookTimeFor(custs[0]);
    cook += target * 0.09;          // 每点一下推进约 9%
    sfx.tap();
    if (cook >= target) serve();
  }

  /* 点顾客冒一句小气泡：每人同时只留一个，重复点击只换内容不叠加 */
  function sayBubble(el, c) {
    if (!c || !c.line) return;
    if (c.bubble && c.bubble.parentNode) c.bubble.remove();
    const appR = $('app').getBoundingClientRect();
    const face = el.querySelector('.cust-face') || el;
    const f = face.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = 'cust-bubble';
    b.setAttribute('aria-hidden', 'true');
    b.textContent = c.line;
    floatLayer.appendChild(b);
    const bw = b.offsetWidth, bh = b.offsetHeight;
    const pad = 8;
    const cx = f.left - appR.left + f.width / 2;
    const left = Math.max(pad, Math.min(appR.width - bw - pad, cx - bw / 2));
    let bottom = f.top - appR.top - 8;   // 气泡底边贴顾客头顶
    // 空间被压到进度条上时（极矮窗口），把气泡抬到进度条上方
    const track = document.querySelector('.cook-track');
    if (track) {
      const t = track.getBoundingClientRect();
      const tTop = t.top - appR.top, tBot = t.bottom - appR.top;
      if (bottom > tTop - 10 && bottom - bh < tBot + 10) bottom = Math.min(bottom, tTop - 4);
    }
    bottom = Math.max(bh + 4, bottom);
    if (f.top - appR.top - bottom > 26) b.classList.add('no-tail');
    b.style.left = left + 'px';
    b.style.top = bottom + 'px';
    b.style.setProperty('--tail-x', Math.max(12, Math.min(bw - 12, cx - left)) + 'px');
    c.bubble = b;
    setTimeout(() => {
      b.remove();
      if (c.bubble === b) c.bubble = null;
    }, 2300);
  }

  /* ---------------- 主循环 ---------------- */
  function update(dt) {
    // 客流
    spawnT += dt;
    const interval = spawnInterval();
    if (spawnT >= interval) {
      if (custs.length < queueCap()) { spawnT = 0; addCustomer(); }
      else spawnT = Math.min(spawnT, interval * 1.5);
    } else if (custs.length >= queueCap()) {
      spawnT = Math.min(spawnT, interval * 1.5);
    }

    // 耐心（排队中的人，不含正在做的那位）
    for (let i = 1; i < custs.length; i++) {
      const c = custs[i];
      c.patience -= dt;
      if (c.patience <= 0) { angry(c); i--; }
    }

    // 出餐（耗时取决于当前这碗面的复杂度）
    if (custs.length) {
      const target = cookTimeFor(custs[0]);
      cook += rateNow() * dt;
      if (cook >= target) serve();
    } else {
      cook = 0;
    }
  }

  let hudT = 0;
  let moneyAnim = null;
  function render(dt) {
    // 锅
    const ct = custs.length ? cookTimeFor(custs[0]) : cookTime();
    const pct = custs.length ? Math.min(100, (cook / ct) * 100) : 0;
    cookFill.style.transform = `scaleX(${Math.max(0, Math.min(1, pct / 100)).toFixed(3)})`;
    potEl.classList.toggle('is-cooking', custs.length > 0);
    const hasCust = custs.length > 0;
    if (mainBtn.disabled !== !hasCust) mainBtn.disabled = !hasCust;
    mainBtn.classList.toggle('is-ready', hasCust);
    const btnLabel = mainBtn.querySelector('.main-btn-cn');
    const btnText = hasCust ? '下面' : '等客';
    if (btnLabel.textContent !== btnText) {
      btnLabel.textContent = btnText;
      mainBtn.setAttribute('aria-label', hasCust ? '下面，加速出餐' : '等客中');
    }
    cookHint.textContent = !custs.length ? '等你开工' : (cook / ct > 0.6 ? '快出锅了' : custs[0].dish.name);

    // 顾客耐心条
    for (const c of custs) {
      const n = nodes.get(c.id);
      if (!n) continue;
      const ratio = Math.max(0, c.patience / c.max);
      n.bar.style.transform = `scaleX(${ratio.toFixed(3)})`;
      const mood = ratio > 0.6 ? 'happy' : ratio > 0.3 ? 'mid' : 'angry';
      if (n.el.dataset.mood !== mood) {
        n.el.dataset.mood = mood;
        n.el.classList.toggle('mood-happy', mood === 'happy');
        n.el.classList.toggle('mood-angry', mood === 'angry');
      }
    }

    // HUD 每 0.25s 刷一次
    hudT += dt;
    if (hudT > 0.25) {
      hudT = 0;
      const mTxt = fmt(st.money);
      if (moneyText.textContent !== mTxt) {
        moneyText.textContent = mTxt;
        if (typeof moneyText.animate === 'function') {
          if (moneyAnim) moneyAnim.cancel();
          moneyAnim = moneyText.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.38 }, { transform: 'scale(1)' }],
            { duration: 340, easing: 'cubic-bezier(.2,.9,.3,1)' }
          );
        } else {
          moneyText.classList.remove('bump');
          moneyText.classList.add('bump');
          setTimeout(() => moneyText.classList.remove('bump'), 360);
        }
      }
      repText.textContent = st.rep;
      const seasonLabel = festival ? festival.name : season.name;
      statusText.textContent = `${seasonLabel} · ${store().name} · ${1 + Math.floor(st.orders / 50)} 天`;
      const tier = storeIndex();
      if (tier !== lastStore) {
        const rising = tier > lastStore;
        lastStore = tier;
        const app = document.getElementById('app');
        app.dataset.tier = String(tier);
        if (rising) {
          toast(`店面升级 · ${store().name}`, 2600);
          sfx.reward();
        }
      }
      checkDaily();
      updatePanel();
    }
  }

  function loop(now) {
    const dt = Math.min(0.12, (now - rafLast) / 1000);
    rafLast = now;
    if (!panelLock) update(dt);
    render(dt);
    requestAnimationFrame(loop);
  }

  /* ---------------- 面板 ---------------- */
  let refs = {};

  function buildPanel() {
    refs = {};
    if (currentTab === 'upgrade') {
      tabBody.innerHTML = Object.keys(UPGRADES).map(k => {
        const u = UPGRADES[k];
        return `<button class="card" type="button" data-k="${k}">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/${u.icon}.svg" alt="" width="24" height="24"></div>
          <div class="card-main">
            <div class="card-name">${u.name} <span class="card-lv"></span></div>
            <div class="card-desc"></div>
          </div>
          <div class="card-cost"></div>
        </button>`;
      }).join('');
      Object.keys(UPGRADES).forEach(k => {
        const card = tabBody.querySelector(`[data-k="${k}"]`);
        refs[k] = {
          card,
          lv: card.querySelector('.card-lv'),
          desc: card.querySelector('.card-desc'),
          cost: card.querySelector('.card-cost')
        };
      });
      tabBody.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => buyUpgrade(card.dataset.k));
      });
    } else if (currentTab === 'daily') {
      tabBody.innerHTML = DAILY_TASKS.map(t => `
        <button class="card" type="button" data-d="${t.id}">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/${t.icon}.svg" alt="" width="24" height="24"></div>
          <div class="card-main">
            <div class="card-name">${t.name} <span class="card-lv"></span></div>
            <div class="card-desc"></div>
          </div>
          <div class="card-cost"></div>
        </button>`).join('') + `<div class="card is-max card-note">
          <div class="card-desc" style="white-space:normal;text-align:center;line-height:1.7">
            每日 0 点刷新。
          </div>
        </div>`;
      tabBody.querySelectorAll('[data-d]').forEach(card => {
        card.addEventListener('click', () => claimDaily(card.dataset.d));
      });
    } else if (currentTab === 'boost') {
      tabBody.innerHTML = `
        <button class="card" type="button" data-b="peak">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/moon.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">夜市高峰</div><div class="card-desc">客流 ×3</div></div>
          <div class="card-cost"><span class="ad-tag">广告</span><small>5 分钟</small></div>
        </button>
        <button class="card" type="button" data-b="gift">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/gift.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">免费食材</div><div class="card-desc">立刻送金币</div></div>
          <div class="card-cost"><span class="ad-tag">广告</span></div>
        </button>
        <button class="card" type="button" data-b="rush">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/zap.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">宵夜冲刺</div><div class="card-desc">出餐 ×2</div></div>
          <div class="card-cost"><span class="ad-tag">广告</span><small>90 秒</small></div>
        </button>
        <div class="card is-max card-note">
          <div class="card-desc" style="white-space:normal;text-align:center;line-height:1.7">
            当前为模拟广告。
          </div>
        </div>`;
      tabBody.querySelectorAll('[data-b]').forEach(card => {
        card.addEventListener('click', () => boostAction(card.dataset.b));
      });
    } else if (currentTab === 'shop') {
      tabBody.innerHTML = `
        <div class="card" data-s="store">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/house.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">店面 <span class="card-lv"></span></div><div class="card-desc"></div></div>
          <div class="card-cost"></div>
        </div>
        <button class="card" type="button" data-s="broth">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/cooking-pot.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">老汤转生 <span class="card-lv"></span></div><div class="card-desc"></div></div>
          <div class="card-cost"></div>
        </button>
        <div class="card card-wall">
          <div class="wall-head">
            <img class="wall-ico" src="assets/icons/moon.svg" alt="" width="16" height="16">
            <span>留言墙</span>
            <span class="wall-count"></span>
          </div>
          <div class="wall-list"></div>
        </div>
        <button class="card" type="button" data-m="sfx">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/volume-2.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">音效</div></div>
          <div class="card-cost"></div>
        </button>
        <button class="card" type="button" data-m="bgm">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/music.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">音乐</div></div>
          <div class="card-cost"></div>
        </button>
        <button class="card" type="button" data-m="help">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/book-open.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">玩法说明</div><div class="card-desc">一分钟看懂</div></div>
          <div class="card-cost"></div>
        </button>
        <button class="card" type="button" data-m="reset">
          <div class="card-ico"><img class="card-ico-img" src="assets/icons/rotate-ccw.svg" alt="" width="24" height="24"></div>
          <div class="card-main"><div class="card-name">重置进度</div><div class="card-desc">清空存档</div></div>
          <div class="card-cost"></div>
        </button>`;
      tabBody.querySelector('[data-s="broth"]').addEventListener('click', confirmPrestige);
      tabBody.querySelector('[data-m="sfx"]').addEventListener('click', () => {
        st.sfx = !st.sfx; saveState(); syncMuteUI(); updatePanel();
        if (st.sfx) sfx.buy();
      });
      tabBody.querySelector('[data-m="bgm"]').addEventListener('click', () => {
        st.bgm = !st.bgm; saveState();
        if (st.bgm) { audio(); bgm.start(); sfx.buy(); } else bgm.stop();
        syncMuteUI();
        updatePanel();
      });
      tabBody.querySelector('[data-m="help"]').addEventListener('click', showHelp);
      tabBody.querySelector('[data-m="reset"]').addEventListener('click', confirmReset);
    }
  }

  function updatePanel() {
    if (currentTab === 'upgrade') {
      for (const k of Object.keys(UPGRADES)) {
        const r = refs[k];
        if (!r) continue;
        const u = UPGRADES[k], lv = st.lv[k], max = lv >= u.max;
        r.lv.textContent = 'Lv.' + lv;
        r.desc.textContent = descFor(k, lv);
        r.cost.innerHTML = max ? '<span class="card-max">MAX</span>' : `${fmt(cost(k))}<span class="cost-unit">金</span>`;
        r.card.classList.toggle('is-max', max);
        r.card.classList.toggle('can-buy', !max && st.money >= cost(k));
      }
    } else if (currentTab === 'daily') {
      tabBody.querySelectorAll('[data-d]').forEach(card => {
        const t = DAILY_TASKS.find(x => x.id === card.dataset.d);
        if (!t) return;
        const v = Math.min(t.target, Math.floor(t.value()));
        const done = v >= t.target;
        const claimed = !!st.daily.claimed[t.id];
        card.querySelector('.card-lv').textContent = `${v}/${t.target}`;
        card.querySelector('.card-desc').textContent = `${fmt(t.gold())} 金币 · 声望 +${t.rep}`;
        const costEl = card.querySelector('.card-cost');
        costEl.innerHTML = claimed ? '已领' : done ? '领取' : `<small>还差 ${t.target - v}</small>`;
        card.classList.toggle('is-max', claimed);
        card.classList.toggle('can-buy', done && !claimed);
      });
    } else if (currentTab === 'boost') {
      const now = Date.now();
      const cdMap = { peak: st.cd.peak, gift: st.cd.gift, rush: st.cd.rush };
      tabBody.querySelectorAll('[data-b]').forEach(card => {
        const k = card.dataset.b;
        const left = Math.max(0, Math.ceil((cdMap[k] - now) / 1000));
        const tag = card.querySelector('.ad-tag');
        if (!tag) return;
        if (left > 0) {
          tag.textContent = `冷却 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
          card.classList.add('is-max');
          card.classList.remove('can-buy');
        } else {
          tag.textContent = '广告';
          card.classList.remove('is-max');
          card.classList.add('can-buy');
        }
      });
    } else if (currentTab === 'shop') {
      const sCard = tabBody.querySelector('[data-s="store"]');
      const next = STORES[storeIndex() + 1];
      sCard.querySelector('.card-lv').textContent = 'Lv.' + (storeIndex() + 1);
      sCard.querySelector('.card-desc').textContent = next
        ? `距下一店 ${fmt(next.at - st.runEarned)}`
        : '已是最高店面';
      const crowdPct = storeIndex() * 16;
      sCard.querySelector('.card-cost').innerHTML =
        `收益 ×${store().mul.toFixed(2)}` + (crowdPct ? `<small>来客 +${crowdPct}%</small>` : '');
      sCard.classList.toggle('is-max', !next);

      const bCard = tabBody.querySelector('[data-s="broth"]');
      const gain = brothGain();
      const need = Math.max(0, PRESTIGE_MIN - st.runEarned);
      bCard.querySelector('.card-lv').textContent = '×' + (st.broth || 0);
      bCard.querySelector('.card-desc').textContent =
        `永久 +${Math.round((brothMul() - 1) * 100)}% · 本次 +${gain} 碗`;
      const bCost = bCard.querySelector('.card-cost');
      if (need > 0) {
        bCost.innerHTML = `<small>还差 ${fmt(need)}</small>`;
        bCard.classList.remove('can-buy');
      } else {
        bCost.textContent = '转生';
        bCard.classList.add('can-buy');
      }

      const wall = tabBody.querySelector('.card-wall');
      if (wall) {
        const all = Array.isArray(st.wall) ? st.wall : [];
        const recent = all.slice(-3).reverse();
        wall.querySelector('.wall-count').textContent = all.length ? `${all.length} 条` : '';
        const list = wall.querySelector('.wall-list');
        list.innerHTML = '';
        if (recent.length) {
          for (const item of recent) {
            const line = document.createElement('div');
            line.className = 'wall-line';
            line.textContent = `「${item.text}」`;
            list.appendChild(line);
          }
        } else {
          const empty = document.createElement('div');
          empty.className = 'wall-empty';
          empty.textContent = '今晚还没有人留下话。';
          list.appendChild(empty);
        }
      }
      const sfxCard = tabBody.querySelector('[data-m="sfx"]');
      if (sfxCard) {
        sfxCard.querySelector('.card-cost').innerHTML = `<span class="sw${st.sfx ? ' is-on' : ''}"><i></i></span>`;
      }
      const bgmCard = tabBody.querySelector('[data-m="bgm"]');
      if (bgmCard) {
        bgmCard.querySelector('.card-cost').innerHTML = `<span class="sw${st.bgm ? ' is-on' : ''}"><i></i></span>`;
      }
    } else {
      const sfxCard = tabBody.querySelector('[data-m="sfx"]');
      if (sfxCard) {
        sfxCard.querySelector('.card-cost').innerHTML = `<span class="sw${st.sfx ? ' is-on' : ''}"><i></i></span>`;
      }
    }
  }

  function claimDaily(id) {
    const t = DAILY_TASKS.find(x => x.id === id);
    if (!t) return;
    if (st.daily.claimed[t.id]) { toast('今天已领过'); return; }
    if (t.value() < t.target) { toast(`还差 ${t.target - Math.floor(t.value())}`); return; }
    const gold = t.gold();
    addMoney(gold);
    st.rep = Math.min(300, st.rep + t.rep);
    st.daily.claimed[t.id] = true;
    saveState();
    sfx.reward();
    updatePanel();
    toast(`+${fmt(gold)} 金币 · 声望 +${t.rep}`);
  }

  function descFor(k, lv) {
    switch (k) {
      case 'stove': return `出餐 ${cookTime().toFixed(1)}s 起`;
      case 'menu': {
        const next = DISHES.find(d => d.unlock > lv);
        return next ? `Lv.${next.unlock} ${next.name}` : '菜品全解锁';
      }
      case 'seat': return `可排队 ${queueCap()} 人`;
      case 'chef': return `自动 ×${autoRate().toFixed(2)}`;
      case 'decor': return `单价 +${(lv - 1) * 5}%`;
      default: return '';
    }
  }

  function buyUpgrade(k) {
    const u = UPGRADES[k];
    if (st.lv[k] >= u.max) { toast('已满级'); return; }
    const c = cost(k);
    if (st.money < c) { toast(`还差 ${fmt(c - st.money)} 金币`); return; }
    st.money -= c;
    st.lv[k]++;
    if (st.daily) st.daily.upg++;
    saveState();
    sfx.buy();
    updatePanel();
    toast(`${u.name} 升到 Lv.${st.lv[k]}`);
  }

  /* ---------------- 促销（广告位） ---------------- */
  const AD_MOCK_SEC = 5;

  function playAd(onDone) {
    panelLock = 'ad';
    lastFocus = document.activeElement;
    modalMask.querySelectorAll('.modal-btn.ghost').forEach(b => b.remove());
    modalTitle.textContent = '激励视频（模拟）';
    modalBody.innerHTML = `广告播放中… <span id="adSec">${AD_MOCK_SEC}</span>s<div class="ad-progress"><i id="adBar"></i></div>`;
    modalMask.hidden = false;
    setBackgroundInert(true);
    modalBtn.textContent = '请稍候';
    modalBtn.disabled = true;
    modalMask.querySelector('.modal').focus({ preventScroll: true });
    let left = AD_MOCK_SEC;
    const t = setInterval(() => {
      left--;
      const sec = $('adSec'), bar = $('adBar');
      if (sec) sec.textContent = Math.max(0, left);
      if (bar) bar.style.width = ((AD_MOCK_SEC - left) / AD_MOCK_SEC * 100).toFixed(0) + '%';
      if (left <= 0) {
        clearInterval(t);
        modalBtn.disabled = false;
        modalBtn.textContent = '领取奖励';
        modalBtn.focus({ preventScroll: true });
        modalBtn.onclick = () => {
          closeModal();
          st.adsWatched++;
          sfx.reward();
          onDone();
        };
      }
    }, 1000);
  }

  function boostAction(k) {
    const now = Date.now();
    if (st.cd[k] > now) return;
    if (k === 'peak') {
      playAd(() => {
        st.boost.peakUntil = Date.now() + 5 * 60 * 1000;
        st.cd.peak = Date.now() + 20 * 60 * 1000;
        saveState(); toast('客流 ×3 · 5 分钟');
      });
    } else if (k === 'gift') {
      playAd(() => {
        const g = Math.max(50, unitPrice() * 25);
        addMoney(g);
        st.cd.gift = Date.now() + 30 * 60 * 1000;
        saveState();
        popText(`+${fmt(g)}`, '#ffd27a', 0.5, 0.4);
        toast(`+${fmt(g)} 金币`);
      });
    } else if (k === 'rush') {
      playAd(() => {
        st.boost.rushUntil = Date.now() + 90 * 1000;
        st.cd.rush = Date.now() + 10 * 60 * 1000;
        saveState(); toast('出餐 ×2 · 90 秒');
      });
    }
  }

  /* ---------------- 弹窗 ---------------- */
  let lastFocus = null;

  function setBackgroundInert(on) {
    const app = $('app');
    if (!app) return;
    Array.from(app.children).forEach(el => {
      if (!el.classList.contains('modal-mask')) el.inert = on;
    });
  }

  function closeModal() {
    modalMask.hidden = true;
    setBackgroundInert(false);
    panelLock = null;
    modalBtn.disabled = false;
    modalBtn.onclick = null;
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function openModal(title, html, btnText, onClick, ghostText) {
    panelLock = 'modal';
    lastFocus = document.activeElement;
    modalMask.querySelectorAll('.modal-btn.ghost').forEach(b => b.remove());
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modalBtn.textContent = btnText;
    modalBtn.disabled = false;
    modalBtn.onclick = onClick;
    modalMask.hidden = false;
    setBackgroundInert(true);
    modalBtn.focus({ preventScroll: true });
    if (ghostText) {
      const g = document.createElement('button');
      g.className = 'modal-btn ghost';
      g.textContent = ghostText;
      g.onclick = closeModal;
      modalMask.querySelector('.modal').appendChild(g);
    }
  }

  function showHelp() {
    openModal('玩法说明', `
      <div style="text-align:left">
        · 点「下面」加速出锅<br>
        · 雇「伙计」可全自动出餐<br>
        · 客人等太久会走，扣声望<br>
        · 升级设施提升效率<br>
        · 进账越多，店面越大：来客更快、队伍更长、单价更高<br>
        · 四季会自动换装饰和限定菜；节日那几天还有节日小食<br>
        · 进账满 20 万可「老汤转生」，老汤永久加成<br>
        · 客人出餐后会留下一句话，去店铺页看看留言墙<br>
        · 关掉页面也照常营业，回来领离线收益
      </div>`, '知道了', closeModal);
  }

  /* ---------------- 老汤转生 ---------------- */
  function confirmPrestige() {
    const gain = brothGain();
    if (!gain) { toast(`进账满 ${fmt(PRESTIGE_MIN)} 可转生`); return; }
    const to = (st.broth || 0) + gain;
    openModal('老汤转生',
      `重开一店，老汤永久加成：<br>
       · +<b>${gain}</b> 碗老汤 · 收益 +${Math.round(gain * BROTH_BONUS * 100)}%<br>
       · 金币/等级/声望/店面清零<br>
       · 老汤 ${st.broth || 0} → ${to} · 起始金币 ${fmt(30 + to * 10)}`,
      `转生 +${gain} 碗`, doPrestige, '再想想');
  }

  function doPrestige() {
    const gain = brothGain();
    const broth = (st.broth || 0) + gain;
    const sfxOn = st.sfx;
    const bgmOn = st.bgm;
    const wall = Array.isArray(st.wall) ? st.wall.slice() : [];
    const claimed = st.daily && st.daily.claimed ? Object.assign({}, st.daily.claimed) : {};
    st = freshState();
    st.broth = broth;
    st.money = 30 + broth * 10;
    st.sfx = sfxOn;
    st.bgm = bgmOn;
    st.wall = wall;                       // 留言是回忆，转生不抹
    st.daily = { date: todayKey(), orders: 0, earn: 0, upg: 0, claimed };
    custs.length = 0;
    nodes.forEach(n => n.el.remove());
    nodes.clear();
    cook = 0; spawnT = 0;
    syncQueue();
    saveState();
    closeModal();
    sfx.reward();
    moneyText.textContent = fmt(st.money);
    repText.textContent = st.rep;
    toast(`老汤 ×${st.broth} · 收益 +${Math.round((brothMul() - 1) * 100)}%`, 2600);
  }

  function confirmReset() {
    openModal('重置进度', '清空存档？', '确定重置', () => {
      localStorage.removeItem(SAVE_KEY);
      const sfxOn = st.sfx, bgmOn = st.bgm;
      st = freshState();
      st.sfx = sfxOn;
      st.bgm = bgmOn;
      custs.length = 0;
      nodes.forEach(n => n.el.remove());
      nodes.clear();
      cook = 0; spawnT = 0;
      syncQueue();
      closeModal();
      toast('已重置');
      syncMuteUI();
    }, '算了');
  }

  /* ---------------- 离线收益 ---------------- */
  function idleIncome(sec) {
    const capped = Math.min(sec, OFFLINE_CAP_H * 3600);
    const perSec = Math.min(rateNow() / cookTime(), 1 / spawnInterval()) * unitPrice() * 0.85;
    return { sec: capped, gain: Math.floor(perSec * capped) };
  }

  function settleOffline() {
    const sec = (Date.now() - st.lastSave) / 1000;
    if (sec < OFFLINE_MIN_SEC) return;
    const { sec: capped, gain } = idleIncome(sec);
    if (gain < 10) return;
    const mins = Math.floor(capped / 60);
    const money = fmt(gain);
    addMoney(gain);
    saveState();

    openModal('打烊期间',
      `离开 ${mins >= 60 ? Math.floor(mins / 60) + ' 小时 ' + (mins % 60) + ' 分' : mins + ' 分钟'}，店里赚了 <b>${money}</b> 金币`,
      '看广告翻倍',
      () => {
        closeModal();
        playAd(() => {
          addMoney(gain);
          saveState();
          popText(`+${money}`, '#ffd27a', 0.5, 0.4);
          toast(`双倍 +${money}`);
        });
      },
      '只领基础');
    // ghost 按钮同时兑现基础收益（已在上面加了）
  }

  /* ---------------- 启动 ---------------- */
  function bindUI() {
    const tabs = Array.from(document.querySelectorAll('.tab'));
    function activateTab(t) {
      tabs.forEach(x => {
        const on = x === t;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
      });
      currentTab = t.dataset.tab;
      try { history.replaceState(null, '', '#tab-' + currentTab); } catch (e) { /* 忽略 */ }
      buildPanel();
      updatePanel();
    }
    tabs.forEach(t => t.addEventListener('click', () => activateTab(t)));
    document.querySelector('.tabs').addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      tabs[j].focus();
      activateTab(tabs[j]);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modalMask.hidden && panelLock !== 'ad') closeModal();
    });
    modalMask.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const items = Array.from(modalMask.querySelectorAll('.modal-btn:not(:disabled)'));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    const unlockAudio = () => { audio(); if (st.bgm) bgm.start(); startSeasonAmbience(); };
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    mainBtn.addEventListener('click', () => tapCook());
    muteBtn.addEventListener('click', toggleMute);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { saveState(); bgm.stop(); }
      else { settleOffline(); saveState(); bgm.start(); rafLast = performance.now(); }
    });
    window.addEventListener('pagehide', saveState);
    setInterval(saveState, 3000);
  }

  function boot() {
    const app = document.getElementById('app');
    app.classList.add('is-' + seasonKey);
    if (festival) {
      app.classList.add('is-festival');
      app.dataset.fest = festival.id;
    }
    app.dataset.tier = String(storeIndex());
    lastStore = storeIndex();
    startSeasonAmbience();
    bindUI();
    syncMuteUI();
    checkDaily();
    const hashTab = (location.hash.match(/^#tab-(upgrade|daily|boost|shop)/) || [])[1];
    if (hashTab) {
      currentTab = hashTab;
      document.querySelectorAll('.tab').forEach(x => {
        const on = x.dataset.tab === currentTab;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
      });
    }
    buildPanel();
    updatePanel();
    moneyText.textContent = fmt(st.money);
    repText.textContent = st.rep;
    if (!custs.length) addCustomer();
    settleOffline();
    requestAnimationFrame(t => { rafLast = t; loop(t); });
    if (!st.tutorialDone) {
      mainBtn.classList.add('is-hint');
      setTimeout(() => {
        toast('点「下面」加速出锅', 3200);
        st.tutorialDone = true;
        saveState();
      }, 1200);
      setTimeout(() => mainBtn.classList.remove('is-hint'), 4600);
    }
  }

  boot();
})();
