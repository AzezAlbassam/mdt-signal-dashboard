;(() => {
  const SERVER = 'Trading view MCP'
  const T = { batch: 'mcp-tv-get-symbol-data-batch', fin: 'mcp-tv-get-financial-history', px: 'mcp-tv-get-ohlcv', search: 'mcp-tv-search-symbols', news: 'mcp-tv-get-news' }
  const STALE_DAYS = 14
  const COLS = ['description', 'close', 'currency', 'type', 'sector', 'market_cap_basic', 'price_earnings_ttm', 'non_gaap_price_to_earnings_per_share_forecast_next_fy',
    'earnings_per_share_forecast_next_fy', 'earnings_per_share_diluted_ttm', 'enterprise_value_ebitda_ttm', 'price_free_cash_flow_ttm', 'price_sales_current',
    'price_book_fq', 'return_on_invested_capital_fy', 'return_on_equity', 'piotroski_f_score_ttm', 'altman_z_score_ttm', 'price_target_1y', 'gross_margin',
    'debt_to_equity', 'net_debt_fq', 'revenue_forecast_next_fy', 'total_revenue_ttm', 'earnings_release_next_date', 'eps_surprise_percent_fq', 'revenue_surprise_percent_fq', 'industry']
  const METHOD_NAMES = { pe: 'P/E مقارنة بتاريخه', peg: 'PEG', dcf: 'DCF (التدفق النقدي)', graham: 'رقم Graham', ev: 'EV/EBITDA مقارنة بتاريخه', ps: 'P/S مقارنة بتاريخه',
    pb: 'P/B مقارنة بتاريخه', pbj: 'P/B من العائد على حقوق المساهمين', cash: 'الكاش الصافي للسهم', pen: 'P/E على متوسط ربح 5 سنوات' }
  const PROFILE_AR = { 'Mature / profitable': 'ناضجة ورابحة', 'Growth / tech': 'نمو وتقنية', 'Heavy / cyclical': 'ثقيلة ودورية', Financial: 'مالية',
    'Unprofitable growth': 'تنمو وتخسر', 'Pre-revenue': 'بدون إيرادات' }

  // The largest US companies (TradingView screener, 18 Oct 2026, one share class each, no
  // preferreds or foreign OTC listings). The tab shows the 25 biggest by today's market value.
  const BIG = ['NASDAQ:NVDA', 'NASDAQ:AAPL', 'NASDAQ:GOOGL', 'NASDAQ:MSFT', 'NASDAQ:AMZN', 'NASDAQ:SPCX', 'NASDAQ:META', 'NASDAQ:AVGO', 'NASDAQ:TSLA',
    'NYSE:LLY', 'NYSE:BRK.B', 'NASDAQ:MU', 'NASDAQ:WMT', 'NYSE:JPM', 'NASDAQ:AMD', 'NYSE:V', 'NYSE:XOM', 'NYSE:JNJ', 'NYSE:MA', 'NYSE:ABBV', 'NASDAQ:INTC',
    'NASDAQ:PLTR', 'NYSE:CVX', 'NASDAQ:COST', 'NASDAQ:CSCO', 'NYSE:KO', 'NYSE:ORCL', 'NYSE:PG', 'NYSE:UNH']
  const MAG7 = new Set(['NASDAQ:AAPL', 'NASDAQ:MSFT', 'NASDAQ:GOOGL', 'NASDAQ:AMZN', 'NASDAQ:NVDA', 'NASDAQ:META', 'NASDAQ:TSLA'])
  // Sector and industry P/E history, built by scripts/sector-pe.js (inlined at build time).
  const SECTOR_PE = /*SECTORS*/null
  const SECTOR_AR = {
    'Technology Services': 'خدمات التقنية (برمجيات وإنترنت)', 'Electronic Technology': 'التقنية الإلكترونية (رقائق وأجهزة)', Finance: 'المالية (بنوك وتأمين ومدفوعات)',
    'Health Technology': 'التقنية الصحية (أدوية وأجهزة طبية)', 'Retail Trade': 'التجزئة', 'Consumer Non-Durables': 'السلع الاستهلاكية الأساسية',
    'Consumer Services': 'الخدمات الاستهلاكية (سفر ومطاعم وترفيه)', 'Consumer Durables': 'السلع المعمرة (سيارات وأجهزة)', 'Producer Manufacturing': 'التصنيع والمعدات',
    'Energy Minerals': 'الطاقة (نفط وغاز)', 'Non-Energy Minerals': 'التعدين والمعادن', 'Process Industries': 'الكيماويات والمواد', 'Industrial Services': 'الخدمات الصناعية',
    Transportation: 'النقل', Utilities: 'المرافق (كهرباء ومياه)', Communications: 'الاتصالات', 'Commercial Services': 'الخدمات التجارية',
    'Health Services': 'الخدمات الصحية (تأمين صحي ومستشفيات)', 'Distribution Services': 'التوزيع', Miscellaneous: 'متنوع',
    'Other Metals/Minerals': 'معادن أخرى', 'Precious Metals': 'المعادن الثمينة (ذهب وفضة)', 'Industrial Machinery': 'المعدات الصناعية', 'Integrated Oil': 'شركات النفط الكبرى',
    'Electrical Products': 'المنتجات الكهربائية', Semiconductors: 'الرقائق (أشباه الموصلات)', 'Telecommunications Equipment': 'معدات الاتصالات والأجهزة', Biotechnology: 'التقنية الحيوية',
    'Packaged Software': 'البرمجيات', 'Finance/Rental/Leasing': 'التمويل والمدفوعات (فيزا وماستركارد)', 'Data Processing Services': 'خدمات معالجة البيانات',
    'Pharmaceuticals: Major': 'شركات الأدوية الكبرى', 'Aerospace & Defense': 'الطيران والفضاء والدفاع', 'Medical Specialties': 'الأجهزة الطبية',
    'Miscellaneous Commercial Services': 'خدمات تجارية متنوعة', 'Investment Banks/Brokers': 'بنوك الاستثمار والوساطة', 'Food: Specialty/Candy': 'الأغذية والحلويات',
    'Specialty Stores': 'المتاجر الكبرى والمتخصصة', Restaurants: 'المطاعم', 'Engineering & Construction': 'الهندسة والإنشاءات', 'Electronic Equipment/Instruments': 'الأجهزة الإلكترونية',
    'Information Technology Services': 'خدمات تقنية المعلومات', 'Internet Software/Services': 'الإنترنت (قوقل وميتا)', 'Real Estate Investment Trusts': 'صناديق العقار (ريت)',
    'Major Banks': 'البنوك الكبرى', 'Electric Utilities': 'الكهرباء', 'Investment Managers': 'إدارة الاستثمار', 'Property/Casualty Insurance': 'تأمين الممتلكات',
    'Multi-Line Insurance': 'التأمين المتعدد',
  }
  const nameAr = (key) => SECTOR_AR[key] ?? key

  const $ = (id) => document.getElementById(id)
  const state = { market: 'us', lists: { us: [], sa: [], big: BIG }, groups: { us: [], sa: [], big: [] }, secKind: 'sector', quotes: {}, cache: {}, scores: {}, fair: {}, exp: {}, proj: {}, projOpen: false, news: {}, ideas: {}, errors: {},
    open: null, sort: { key: 'sym', dir: 1 }, filter: '', group: '' }
  let db = null
  let mcp = null

  const marketOf = (sym) => (sym.startsWith('TADAWUL:') ? 'sa' : 'us')
  const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—')
  const pct = (x, d = 0) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(100 * x).toFixed(d)}%` : '—')
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const NO_FIN = 'ما فيه بيانات مالية سنوية لهذا السهم'

  function notice(text, bad = false) {
    const n = $('notice')
    n.hidden = !text
    n.className = bad ? 'notice bad' : 'notice'
    n.textContent = text || ''
  }

  function explainError(e) {
    switch (e?.code) {
      case 'server_not_connected': return 'ربط TradingView غير موجود في حسابك. أضفه من claude.ai ← Settings ← Connectors، وبعدها افتح الصفحة من جديد.'
      case 'needs_reauth': return 'انتهى تسجيل الدخول في ربط TradingView. أعد ربطه من claude.ai ← Settings ← Connectors.'
      case 'selection_required': return 'عندك أكثر من ربط باسم TradingView. اختر واحد من الرسالة اللي تطلع لك فوق الصفحة.'
      case 'not_in_manifest': return 'الصفحة ما عندها إذن تستخدم TradingView. اسمح لها من قائمة الصلاحيات في الصفحة.'
      case 'approval_required': return 'الطلب يحتاج موافقتك. اضغط "تحديث الأسعار" ووافق.'
      case 'not_granted': case 'capability_disabled': case 'capability_removed': return 'الصفحة ما تقدر توصل لـ TradingView هنا. افتحها من claude.ai.'
      case 'tool_error': return `TradingView رد بخطأ: ${e.message || ''}`
      case 'server_unavailable': return 'TradingView ما رد الحين. جرّب بعد شوي.'
      default: return `صار خطأ (${e?.code || 'غير معروف'}).`
    }
  }

  async function call(tool, input, cache) {
    const opts = cache ? { cache } : undefined
    try {
      return (await mcp.callTool(SERVER, tool, input, opts)).payload
    } catch (e) {
      if (!e?.retryable) throw e
      await new Promise((ok) => setTimeout(ok, Math.min(60000, e.retryAfterMs ?? 800 + Math.random() * 1200)))
      return (await mcp.callTool(SERVER, tool, input, opts)).payload
    }
  }

  async function pool(items, worker, limit) {
    let i = 0
    const next = async () => {
      while (i < items.length) await worker(items[i++])
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
  }

  // ---------------------------------------------------------------- data

  async function loadQuotes(symbols, fresh = false) {
    const chunks = []
    for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50))
    let firstError = null
    await pool(chunks, async (chunk) => {
      try {
        const p = await call(T.batch, { symbols: chunk, columns: COLS }, fresh ? { staleTime: 0, refresh: true } : { staleTime: 300000, gcTime: 3600000 })
        for (const [sym, row] of Object.entries(p?.data ?? {})) state.quotes[sym] = row
        for (const m of p?.missing ?? []) state.errors[m.symbol] = 'TradingView ما لقى السهم'
        chunk.forEach(compute)
        scheduleRender()
      } catch (e) {
        firstError ??= e
      }
    }, 3)
    if (firstError && !Object.keys(state.quotes).length) throw firstError
  }

  // All saved histories in pages of 150, so a long list is not 700 separate reads.
  async function loadCacheFromDb() {
    if (!db) return
    let last = ''
    for (let guard = 0; guard < 40; guard += 1) {
      let q = db.collection('cache').orderBy('sym').limit(150)
      if (last) q = q.where('sym', '>', last)
      const snap = await q.get()
      for (const d of snap.docs) {
        const v = d.data()
        const sym = v.sym ?? d.id
        state.cache[sym] = v
        if (v.sym) last = v.sym
      }
      if (snap.size < 150) break
    }
  }

  // Fresh = fetched in the last 14 days AND holding monthly prices (or the page already tried
  // to get them). Stored histories without prices are fetched again, once.
  const fresh = (d) => d && Date.now() - d.fetchedAt < STALE_DAYS * 864e5 && (d.missing || d.px?.t?.length > 0 || d.pxTried)

  async function loadHistory(sym) {
    const [fin, px] = await Promise.all([
      call(T.fin, { symbol: sym, period: 'fy', date_from: '2000-01-01' }).catch((e) => (e?.code === 'tool_error' ? null : Promise.reject(e))),
      call(T.px, { symbol: sym, interval: 'M', count: 72, format: 'columns' }).catch(() => null),
    ])
    const doc = fin?.labels
      ? { sym, fin: { labels: fin.labels, series: fin.series }, px: { t: px?.bars?.t ?? [], c: px?.bars?.c ?? [] }, pxTried: true, fetchedAt: Date.now() }
      : { sym, missing: true, fetchedAt: Date.now() }
    state.cache[sym] = doc
    if (db) await db.doc(`cache/${sym}`).set(doc).catch(() => {})
  }

  function liveFairValues(fv, q, funds) {
    const v = { ...fv.values }
    const close = q.close
    const bvps = q.price_book_fq > 0 ? close / q.price_book_fq : null
    const eps = q.earnings_per_share_diluted_ttm
    const roe = Number.isFinite(q.return_on_equity) ? q.return_on_equity / 100 : null
    const shares = q.market_cap_basic > 0 && close > 0 ? q.market_cap_basic / close : null
    if (eps > 0 && bvps > 0) v.graham = Math.sqrt(22.5 * eps * bvps)
    if (bvps > 0 && roe != null) {
      const x = bvps * Math.min(4, (roe - PARAMS.termGrowth) / (PARAMS.discount - PARAMS.termGrowth))
      v.pbj = x > 0 ? x : null
    }
    if (Number.isFinite(q.net_debt_fq) && shares) {
      const x = -q.net_debt_fq / shares
      v.cash = x > 0 ? x : null
    }
    const weights = WEIGHTS[fv.profile]
    const b = blend(v, weights)
    const used = METHODS.filter((m, i) => weights[i] > 0 && v[m] > 0).map((m) => v[m])
    return { values: v, weights, profile: fv.profile, fair: b?.fair ?? null, coverage: b?.coverage ?? 0,
      low: used.length ? Math.min(...used) : null, high: used.length ? Math.max(...used) : null }
  }

  function compute(sym) {
    const d = state.cache[sym]
    const q = state.quotes[sym]
    if (!d || !q) return
    if (d.missing || !d.fin) { state.errors[sym] = NO_FIN; return }
    const funds = parseFundamentals(d.fin)
    // Net income ÷ EPS misses the share count when preferred dividends or a near-zero EPS
    // distort it (MCHP showed twice its shares); then the quote's count is used for the last year.
    const qShares = q.market_cap_basic > 0 && q.close > 0 ? q.market_cap_basic / q.close : null
    const last = funds[funds.length - 1]
    if (qShares && last && !(last.shares > qShares / 1.5 && last.shares < qShares * 1.5)) last.shares = qShares
    const closes = new Map()
    ;(d.px?.t ?? []).forEach((t, i) => { if (Number.isFinite(d.px.c[i])) closes.set(monthKey(t), d.px.c[i]) })
    const month = monthKey(Math.floor(Date.now() / 1000))
    if (Number.isFinite(q.close)) closes.set(month, q.close)
    // live: every fiscal year TradingView returns is already reported (MSFT, MU, COST… end
    // theirs mid-year), not only those the backtests' "May of the next year" rule allows.
    const s = scoreAt(funds, closes, q.sector, month, true)
    state.scores[sym] = { ...s, f0: last, known: funds }
    const fv = fairValuesAt(funds, closes, q.sector, month, true)
    state.fair[sym] = fv ? liveFairValues(fv, q, funds) : null
    // A bank's free cash flow moves with deposits and loans, so no implied growth for financials.
    state.exp[sym] = q.sector === 'Finance' ? null : expectationsAt(funds, closes, month, true)
    state.proj[sym] = projectAt(funds, closes, month, { revGrowthNext: analysts(q).rev, revNow: q.total_revenue_ttm })
  }

  let busy = false
  let again = false
  async function refresh(opts = {}) {
    if (!mcp || state.market === 'sectors') return
    if (busy) { again = true; return }
    busy = true
    try { await doRefresh(opts) } finally { busy = false }
    if (again) { again = false; refresh() }
  }

  async function doRefresh({ fresh: freshQuotes = false } = {}) {
    const syms = state.lists[state.market]
    if (!syms.length) { render(); return }
    $('refresh').disabled = true
    $('status').textContent = `جاري تحميل الأسعار (${syms.length} سهم)…`
    notice('')
    try {
      await loadQuotes(syms, freshQuotes)
    } catch (e) {
      notice(explainError(e), true)
      $('status').textContent = ''
      $('refresh').disabled = false
      render()
      return
    }
    const todo = syms.filter((s) => !fresh(state.cache[s]))
    let done = 0
    let authError = null
    await pool(todo, async (s) => {
      if (authError) return
      try { await loadHistory(s) } catch (e) {
        if (['server_not_connected', 'needs_reauth', 'not_in_manifest', 'not_granted'].includes(e?.code)) authError = e
        else state.errors[s] = explainError(e)
      }
      compute(s)
      done += 1
      $('status').textContent = `جاري تحديث البيانات المالية: ${done} من ${todo.length}`
      scheduleRender()
    }, 3)
    if (authError) notice(explainError(authError), true)
    syms.forEach(compute)
    $('refresh').disabled = false
    $('status').textContent = `آخر تحديث للأسعار: ${new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })} · البيانات المالية تتجدد كل ${STALE_DAYS} يوم`
    render()
  }

  // ---------------------------------------------------------------- lists

  async function saveList(m) {
    if (!db) return
    try { await db.doc(`lists/${m}`).set({ symbols: state.lists[m] }) }
    catch (e) { notice('ما قدرت أحفظ القائمة. الحفظ متاح لصاحب الصفحة بس.', true) }
  }

  async function addSymbol(sym) {
    const m = marketOf(sym)
    $('results').hidden = true
    $('q').value = ''
    if (state.lists[m].includes(sym)) {
      notice(`${sym} موجود في القائمة.`)
      if (m !== state.market) setMarket(m)
      state.filter = sym.split(':')[1]
      $('filter').value = state.filter
      render()
      return
    }
    state.lists[m] = [...state.lists[m], sym]
    if (m !== state.market) setMarket(m)
    render()
    await saveList(m)
    try {
      await loadQuotes([sym])
      if (!fresh(state.cache[sym])) await loadHistory(sym)
      compute(sym)
    } catch (e) { state.errors[sym] = explainError(e) }
    render()
  }

  async function removeSymbol(sym) {
    const m = marketOf(sym)
    state.lists[m] = state.lists[m].filter((s) => s !== sym)
    if (state.open === sym) state.open = null
    render()
    await saveList(m)
  }

  async function search(q) {
    if (!mcp || !q.trim()) return
    const ul = $('results')
    ul.hidden = false
    ul.innerHTML = '<li class="dim" style="padding:8px 10px">جاري البحث…</li>'
    try {
      const p = await call(T.search, { query: q.trim(), type_filter: 'stock' }, { staleTime: 300000 })
      const list = (p?.data?.symbols ?? []).filter((s) => /^(NASDAQ|NYSE|AMEX|TADAWUL|CBOE):/.test(s.symbol) && s.type === 'stock')
      ul.innerHTML = list.length
        ? list.slice(0, 12).map((s) => `<li><button type="button" data-add="${esc(s.symbol)}"><span>${esc(s.description)}</span><span class="sym">${esc(s.symbol)}</span></button></li>`).join('')
        : '<li class="dim" style="padding:8px 10px">ما لقيت أسهم أمريكية أو سعودية بهذا الاسم.</li>'
    } catch (e) {
      ul.innerHTML = `<li class="dim" style="padding:8px 10px">${esc(explainError(e))}</li>`
    }
  }

  // ---------------------------------------------------------------- render

  // The score's five parts: key, name, colour, what it measures (one line each).
  const PARTS = [
    ['A', 'السعر', '--seg-a', 'هل السهم أرخص من عادته في آخر 5 سنوات، وهل النمو اللي يفترضه سعره معقول مقارنة بنموه الفعلي.'],
    ['B', 'الجودة', '--seg-b', 'هامش الربح، وكم من الأرباح يتحول لكاش فعلي.'],
    ['C', 'النمو', '--seg-c', 'نمو الإيرادات وربح السهم سنوياً في آخر 3 سنوات.'],
    ['D', 'الأمان', '--seg-d', 'الدين مقارنة بالأرباح، وكم سنة خسارة في آخر 5 سنوات.'],
    ['E', 'الاتجاه', '--seg-e', 'هل أرقام الشركة (ربح، كاش، إيراد، هوامش، دين) تحسنت عن السنة اللي قبلها.'],
  ]
  const tone = (x) => (x >= 7 ? 'hi' : x >= 4 ? 'md' : 'lo')
  const upside = (sym) => {
    const f = state.fair[sym]
    const q = state.quotes[sym]
    return f?.fair && q?.close ? f.fair / q.close - 1 : null
  }

  function sortValue(sym, key) {
    const q = state.quotes[sym] || {}
    const s = state.scores[sym] || {}
    switch (key) {
      case 'sym': return sym.split(':')[1]
      case 'price': return q.close
      case 'mcap': return q.market_cap_basic
      case 'fair': return state.fair[sym]?.fair
      case 'upside': return upside(sym)
      case 'score': return s.total
      case 'gstar': return s.detail?.gStar
      case 'greal': return s.detail?.revG
      case 'pe': return q.price_earnings_ttm
      case 'fpe': return q.non_gaap_price_to_earnings_per_share_forecast_next_fy
      case 'z': return q.altman_z_score_ttm
      case 'gap': return state.exp[sym]?.gap
    }
  }

  // Biggest first; null market values (quotes not loaded yet) last.
  const byCap = (a, b) => (state.quotes[b]?.market_cap_basic ?? -1) - (state.quotes[a]?.market_cap_basic ?? -1)

  function visible() {
    let syms = [...state.lists[state.market]]
    if (state.market === 'big') syms = syms.sort(byCap).slice(0, 25)
    const [gKind, gKey] = state.group.split(/:(.*)/)
    if (gKind === 'sector' || gKind === 'industry') {
      syms = syms.filter((s) => state.quotes[s]?.[gKind] === gKey)
    } else if (state.group) {
      const g = (state.groups[state.market] ?? []).find((x) => x.name === state.group)
      const set = new Set(g?.symbols ?? [])
      syms = syms.filter((s) => set.has(s))
    }
    const f = state.filter.trim().toLowerCase()
    if (f) syms = syms.filter((s) => s.toLowerCase().includes(f) || String(state.quotes[s]?.description ?? '').toLowerCase().includes(f))
    const { key, dir } = state.sort
    // The big-companies tab is grouped by sector (largest sector first); the sort applies inside.
    const sectorCap = {}
    if (state.market === 'big') for (const s of syms) { const q = state.quotes[s]; if (q?.sector) sectorCap[q.sector] = (sectorCap[q.sector] ?? 0) + (q.market_cap_basic ?? 0) }
    return syms.sort((a, b) => {
      if (state.market === 'big') {
        const sa = state.quotes[a]?.sector ?? ''
        const sb = state.quotes[b]?.sector ?? ''
        if (sa !== sb) return (sectorCap[sb] ?? 0) - (sectorCap[sa] ?? 0) || (sa < sb ? -1 : 1)
      }
      const x = sortValue(a, key)
      const y = sortValue(b, key)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (x < y ? -1 : x > y ? 1 : 0) * dir
    })
  }

  function scoreCell(sym) {
    const s = state.scores[sym]
    if (!s) return state.errors[sym] ? `<span class="dim">${esc(state.errors[sym])}</span>` : '<span class="skel"></span>'
    if (s.total == null) {
      const why = { 'pre-revenue': 'إيراداته أقل من 1% من قيمته السوقية', 'stale fundamentals': 'بيانات مالية قديمة' }[s.reason] || 'بيانات ناقصة'
      return `<span class="dim">${why}</span>`
    }
    const segs = PARTS.map(([k, , c]) => `<i><b style="height:${(s.parts[k] / 2) * 100}%;background:var(${c})"></b></i>`).join('')
    return `<div class="score"><span class="big n ${tone(s.total)}">${fmt(s.total, 1)}</span><span class="segs">${segs}</span></div>`
  }

  // Hover box over a score: every part with its colour, value and what it measures.
  function scoreTip(sym) {
    const s = state.scores[sym]
    if (!s?.parts) return ''
    return `<b>الدرجة <span class="n ${tone(s.total)}">${fmt(s.total, 1)}</span> من 10 = مجموع 5 أجزاء، كل جزء من 0 إلى 2</b>
      ${PARTS.map(([k, name, c, what]) => `<div class="tip-row"><i style="background:var(${c})"></i><span><b>${name}</b> ${what}</span><b class="n">${fmt(s.parts[k], 1)} / 2</b></div>`).join('')}
      <span class="dim">اضغط على السهم تشوف أرقام كل جزء.</span>`
  }

  let pending = false
  function scheduleRender() {
    if (pending) return
    pending = true
    requestAnimationFrame(() => { pending = false; render() })
  }

  function renderGroups() {
    const sel = $('group')
    const groups = state.groups[state.market] ?? []
    const secs = state.market === 'us' && SECTOR_PE ? SECTOR_PE.groups : []
    const opts = ['<option value="">كل الأسهم</option>', ...groups.map((g) => `<option value="${esc(g.name)}">${esc(g.name)} (${g.symbols.length})</option>`),
      ...['sector', 'industry'].map((k) => secs.some((g) => g.kind === k) ? `<optgroup label="${k === 'sector' ? 'القطاعات' : 'الصناعات'}">${secs.filter((g) => g.kind === k).map((g) => `<option value="${k}:${esc(g.key)}">${esc(nameAr(g.key))}</option>`).join('')}</optgroup>` : '')]
    sel.innerHTML = opts.join('')
    sel.value = groups.some((g) => g.name === state.group) || secs.some((g) => `${g.kind}:${g.key}` === state.group) ? state.group : ''
    sel.hidden = !groups.length && !secs.length
  }

  function render() {
    for (const m of ['us', 'sa']) $(`cnt-${m}`).textContent = state.lists[m].length ? ` ${state.lists[m].length}` : ''
    for (const m of ['us', 'sa', 'big', 'sectors']) $(`tab-${m}`).setAttribute('aria-selected', String(m === state.market))
    document.querySelector('.wrap').dataset.view = state.market
    $('sectorsView').hidden = state.market !== 'sectors'
    if (state.market === 'sectors') { renderSectors(); return }
    const sortVal = `${state.sort.key}:${state.sort.dir}`
    if ([...$('sortSel').options].some((o) => o.value === sortVal)) $('sortSel').value = sortVal
    const body = $('rows')
    const syms = visible()
    $('shown').textContent = state.lists[state.market].length ? `يظهر ${syms.length} من ${state.lists[state.market].length}` : ''
    if (!state.lists[state.market].length) {
      body.innerHTML = '<tr><td colspan="12" class="dim">القائمة فاضية. اكتب رمز سهم أو اسمه فوق واضغط بحث.</td></tr>'
      return
    }
    if (!syms.length) {
      body.innerHTML = '<tr><td colspan="12" class="dim">ما فيه أسهم تطابق الفلترة.</td></tr>'
      return
    }
    let lastSector = null
    body.innerHTML = syms.map((sym) => {
      const q = state.quotes[sym]
      let head = ''
      if (state.market === 'big' && (q?.sector ?? '') !== lastSector) {
        lastSector = q?.sector ?? ''
        const n = syms.filter((x) => (state.quotes[x]?.sector ?? '') === lastSector).length
        head = `<tr class="grp"><td colspan="12">${esc(lastSector ? nameAr(lastSector) : 'جاري التحميل…')} <span class="dim n">${n}</span></td></tr>`
      }
      const s = state.scores[sym]
      const f = state.fair[sym]
      const up = upside(sym)
      const main = `<tr class="row" data-sym="${esc(sym)}" tabindex="0" aria-expanded="${state.open === sym}">
        <td class="stock c-stock"><b>${esc(sym.split(':')[1])}${MAG7.has(sym) ? ' <em class="mag" title="من السبعة العظماء">★ السبعة العظماء</em>' : ''}</b><span>${esc(q?.description ?? '')}</span></td>
        <td class="n" data-label="السعر">${q ? fmt(q.close, 2) : '<span class="skel"></span>'}</td>
        <td class="n" data-label="القيمة العادلة">${f?.fair ? fmt(f.fair, 2) : q && state.cache[sym] ? '—' : '<span class="skel"></span>'}</td>
        <td class="n ${up == null ? '' : up >= 0 ? 'hi' : 'lo'}" data-label="الفرق">${pct(up)}</td>
        <td class="c-wide" data-label="الدرجة من 10">${scoreCell(sym)}</td>
        <td class="c-wide c-exp">${expCell(sym)}</td>
        <td class="n c-more">${s?.detail ? pct(s.detail.gStar) : '—'}</td>
        <td class="n c-more">${s?.detail ? pct(s.detail.revG) : '—'}</td>
        <td class="n" data-label="مكرر الربح P/E">${fmt(q?.price_earnings_ttm)}</td>
        <td class="n" data-label="المكرر المتوقع Fwd P/E">${fmt(q?.non_gaap_price_to_earnings_per_share_forecast_next_fy)}</td>
        <td class="n c-more">${fmt(q?.altman_z_score_ttm)}</td>
        <td class="c-del"><button class="x" type="button" data-del="${esc(sym)}" aria-label="احذف ${esc(sym)}">×</button></td>
      </tr>`
      return head + main + (state.open === sym ? `<tr class="detail"><td colspan="12">${detail(sym)}</td></tr>` : '')
    }).join('')
  }

  // Analysts' next fiscal year against the last 12 months (information only: no history to test).
  // Banks: TradingView's revenue is gross interest income, analysts forecast net revenue, so
  // the two are not compared (they showed −30% to −45% for every bank).
  function analysts(q) {
    const rev = q.sector !== 'Finance' && q.revenue_forecast_next_fy > 0 && q.total_revenue_ttm > 0 ? q.revenue_forecast_next_fy / q.total_revenue_ttm - 1 : null
    const eps = Number.isFinite(q.earnings_per_share_forecast_next_fy) && q.earnings_per_share_diluted_ttm > 0 ? q.earnings_per_share_forecast_next_fy / q.earnings_per_share_diluted_ttm - 1 : null
    return { rev, eps, falling: (rev != null && rev < 0) || (eps != null && eps < -0.1) }
  }

  function expCell(sym) {
    const e = state.exp[sym]
    const q = state.quotes[sym]
    const chips = []
    if (e?.flag === 'red') chips.push('<span class="chip red" title="سعره يفترض نمو أسرع بكثير من اللي تسويه الشركة فعلاً، ونموها قاعد يبطّي. انتبه وراجع قبل تشتري، مو إشارة بيع.">سعره أعلى من أدائه</span>')
    if (e?.flag === 'green') chips.push('<span class="chip green" title="السوق مسعّره كأنه بينمو أبطأ بكثير من اللي يسويه فعلاً، ونموه مستمر. يستاهل تدرسه، مو إشارة شراء.">سعره أقل من أدائه</span>')
    if (q && analysts(q).falling) chips.push('<span class="chip amber" title="المحللين متوقعين إن إيراداته تنزل، أو أرباحه تنزل أكثر من 10%، السنة المالية الجاية.">المحللين متوقعين نزول</span>')
    return chips.join(' ') || '<span class="dim">—</span>'
  }

  const dateOf = (sec) => (Number.isFinite(sec) ? new Date(sec * 1000).toISOString().slice(0, 10) : '—')

  function expBlock(sym) {
    const e = state.exp[sym]
    const q = state.quotes[sym] || {}
    const a = analysts(q)
    const fin = q.sector === 'Finance'
    const flagTxt = !e ? (fin ? 'ما ينحسب للبنوك والشركات المالية: تدفقها النقدي يتحرك مع الودائع والقروض، فما يدل على شي.' : 'ما ينحسب (التدفق النقدي الحر سالب).')
      : e.flag === 'red' ? '<b class="lo">سعره أعلى من أدائه:</b> السعر الحالي يفترض إن الشركة بتنمو أسرع بكثير من اللي تسويه فعلاً، ونموها قاعد يبطّي. لو طلعت نتايجها أقل من المتوقع ممكن ينزل بقوة. انتبه وراجع قبل تشتري، بس مو إشارة بيع.'
      : e.flag === 'green' ? '<b class="hi">سعره أقل من أدائه:</b> السوق مسعّره كأن الشركة بتنمو أبطأ بكثير من اللي تسويه فعلاً، ونموها مستمر. ممكن تكون فرصة تستاهل تدرسها، بس مو إشارة شراء.'
      : 'ما فيه تنبيه: السعر ماشي مع أداء الشركة تقريباً.'
    const news = state.news[sym]
    const newsHtml = news === undefined ? '<p class="dim">جاري جلب الأخبار…</p>'
      : news?.error ? `<p class="dim">${esc(news.error)}</p>`
      : news.length ? `<ul class="news">${news.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="dim n">${dateOf(n.published)} · ${esc(n.provider?.name ?? '')}</span></li>`).join('')}</ul>`
      : '<p class="dim">ما فيه أخبار حديثة.</p>'
    return `<div class="part" style="grid-column:1/-1">
      <h3><span>التوقعات والمحفزات</span><span class="dim">التقرير الجاي <span class="n">${dateOf(q.earnings_release_next_date)}</span></span></h3>
      <p>${flagTxt}</p>
      ${fin ? '' : `<p>السعر يفترض نمو <b class="n">${pct(e?.gStar)}</b> سنوياً · الشركة حققت <b class="n">${pct(e?.revG)}</b> (3 سنوات) و<b class="n">${pct(e?.yoy)}</b> آخر سنة · الفرق <b class="n">${pct(e?.gap)}</b></p>`}
      <p>المحللين للسنة المالية الجاية: ${fin ? '' : `الإيرادات <b class="n ${a.rev < 0 ? 'lo' : ''}">${pct(a.rev)}</b> · `}ربح السهم <b class="n ${a.eps < 0 ? 'lo' : ''}">${pct(a.eps)}</b> مقارنة بآخر 12 شهر. آخر تقرير: مفاجأة الربح <b class="n">${Number.isFinite(q.eps_surprise_percent_fq) ? pct(q.eps_surprise_percent_fq / 100) : '—'}</b>، الإيرادات <b class="n">${Number.isFinite(q.revenue_surprise_percent_fq) ? pct(q.revenue_surprise_percent_fq / 100) : '—'}</b></p>
      <p class="dim">جربنا الأحمر والأخضر على 819 سهم من 2012 لين 2025: الأحمر ما نزل أكثر من غيره، والأخضر ما طلع أكثر من غيره، في المتوسط. فخذها كتنبيه تسأل عنه، مو قرار شراء أو بيع.</p>
      <h3 style="margin-top:6px"><span>آخر الأخبار</span></h3>${newsHtml}
    </div>`
  }

  function ideasBlock(sym) {
    const list = (state.ideas[sym] ?? []).slice().sort((x, y) => (x.date < y.date ? 1 : -1))
    const q = state.quotes[sym] || {}
    if (!list.length) return '<div class="part" style="grid-column:1/-1"><h3><span>أفكار منشورة</span></h3><p class="dim">ما فيه أفكار مسجلة لهذا السهم للحين. يتم البحث في Value Investors Club يوم 1 و15 من كل شهر.</p></div>'
    return `<div class="part" style="grid-column:1/-1"><h3><span>أفكار منشورة</span><span class="n dim">${list.length}</span></h3>
      <ul class="ideas">${list.map((i) => {
        // Split-adjusted close of the idea's month from TradingView when we have it; the
        // price the source quotes can predate a split.
        const px = state.cache[sym]?.px
        let adj = null
        if (i.date && px?.t?.length) {
          const k = px.t.findIndex((t) => monthKey(t) === i.date.slice(0, 7))
          if (k >= 0 && px.c[k] > 0) adj = px.c[k]
        }
        const base = adj ?? i.priceThen
        const since = base > 0 && q.close > 0 ? q.close / base - 1 : null
        return `<li><div><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title || i.source)}</a> <span class="dim">${esc(i.source)} · <span class="n">${esc(i.date || 'تاريخ غير معروف')}</span>${i.side ? ' · ' + (i.side === 'short' ? 'بيع' : 'شراء') : ''}</span></div>
          ${i.summary ? `<p>${esc(i.summary)}</p>` : ''}
          ${base ? `<p class="dim">السعر وقتها <span class="n">${fmt(base, 2)}</span>${adj ? ' (معدّل للتقسيمات، إغلاق ذاك الشهر)' : ' (كما ذكره المصدر)'} · من وقتها <b class="n ${since >= 0 ? 'hi' : 'lo'}">${pct(since)}</b></p>` : ''}</li>`
      }).join('')}</ul></div>`
  }

  async function loadNews(sym) {
    if (!mcp || state.news[sym] !== undefined) return
    try {
      const p = await call(T.news, { symbol: sym, limit: 6 }, { staleTime: 300000, gcTime: 3600000 })
      state.news[sym] = (p?.data?.headlines ?? []).slice(0, 6)
    } catch (e) {
      state.news[sym] = { error: explainError(e) }
    }
    if (state.open === sym) render()
  }

  function fairBlock(sym) {
    const f = state.fair[sym]
    const q = state.quotes[sym] || {}
    if (!f) return '<div class="part"><h3><span>القيمة العادلة</span><span class="n dim">—</span></h3><p>ما تكفي البيانات لحسابها.</p></div>'
    const rows = METHODS.map((m, i) => {
      const w = f.weights[i]
      const v = f.values[m]
      if (!(w > 0) && !(v > 0)) return ''
      const used = w > 0 && v > 0
      return `<div class="${used ? '' : 'off'}"><span>${METHOD_NAMES[m]}${w > 0 ? ` · ${Math.round(w * 100)}%` : ''}</span><b class="n">${v > 0 ? fmt(v, 2) : '—'}</b></div>`
    }).join('')
    return `<div class="part" style="grid-column:1/-1">
      <h3><span>القيمة العادلة · ${esc(PROFILE_AR[f.profile] || f.profile)}</span><span class="n">${f.fair ? fmt(f.fair, 2) : '—'} <span class="${upside(sym) == null ? 'dim' : upside(sym) >= 0 ? 'hi' : 'lo'}">${pct(upside(sym))}</span></span></h3>
      <p>متوسط موزون للطرق المناسبة لنوع الشركة. الطرق اللي بدون بيانات تنشال وتتوزع أوزانها على الباقي (تغطية البيانات <b class="n">${Math.round(f.coverage * 100)}%</b>). مدى الطرق: <b class="n">${fmt(f.low, 2)} – ${fmt(f.high, 2)}</b>، والسعر <b class="n">${fmt(q.close, 2)}</b>.</p>
      <div class="fair-list">${rows}</div>
    </div>`
  }

  const big = (x) => (!Number.isFinite(x) ? '—' : Math.abs(x) >= 1e9 ? `${fmt(x / 1e9, 1)} مليار` : `${fmt(x / 1e6, 0)} مليون`)

  function projBlock(sym) {
    const p = state.proj[sym]
    if (!p) return ''
    const q = state.quotes[sym] || {}
    const cur = q.currency === 'SAR' ? 'ريال' : q.currency === 'USD' ? 'دولار' : esc(q.currency ?? '')
    const y0 = new Date().getFullYear()
    let body
    if (p.kind === 'pre') {
      const cash = state.fair[sym]?.values?.cash
      body = `<p>الشركة بدون إيرادات كافية نرسم لها مسار سعر (إيراداتها <b class="n">${big(p.rev)}</b> ${cur}). بدل التخمين: عشان سعرها اليوم يكون منطقي، تحتاج إيرادات سنوية حوالي <b class="n">${big(p.revNeeded)}</b> ${cur} بعد 5 سنوات${p.rev > 0 ? ` (<b class="n">${fmt(p.revNeeded / p.rev, 0)}×</b> إيرادات اليوم)` : ''}.</p>
        <p class="dim">الحسبة: القيمة السوقية اليوم تكبر 9% سنوياً (العائد اللي تطلبه) لـ 5 سنوات، وتقسم على 3 (شركة ناضجة: مكرر ربح 20 × هامش ربح 15%).${cash ? ` الكاش الصافي للسهم اليوم: <b class="n">${fmt(cash, 2)}</b>.` : ''}</p>`
    } else {
      const cell = (x, cls = '') => `<td class="n ${cls}">${x}</td>`
      const row = (label, xs, f = (x) => fmt(x, 2), cls = () => '') => `<tr><th>${label}</th>${xs.map((x) => cell(f(x), cls(x))).join('')}</tr>`
      const years = p.rows.map((r) => `<tr><th class="n">${y0 + r.t}</th>${cell(fmt(r.bear, 2))}${cell(fmt(r.base, 2))}${cell(fmt(r.bull, 2))}</tr>`).join('')
      const multName = (b) => (b === 'pe' ? 'P/E' : 'P/S')
      body = `<table class="ptable"><thead><tr><th></th><th>متشائم</th><th>أساسي</th><th>متفائل</th></tr></thead><tbody>
          <tr class="now"><th>اليوم</th>${cell(fmt(p.price, 2)).repeat(3)}</tr>${years}
          <tr class="sum"><th>العائد سنوياً</th>${p.yearly.map((x) => cell(pct(x, 1), x >= 0 ? 'hi' : 'lo')).join('')}</tr>
          ${row('قيمتها اليوم بخصم 9%', p.today)}
          <tr class="grp"><th colspan="4">الافتراضات</th></tr>
          ${row('نمو الإيرادات أول سنة', p.growth, ([a]) => pct(a))}
          ${row('نمو الإيرادات السنة الخامسة', p.growth, ([, b]) => pct(b))}
          ${p.margin ? row('هامش صافي الربح', p.margin, (x) => pct(x, 1)) : ''}
          ${row('المكرر بالسنة الخامسة', p.exitMult.map((x, i) => [x, p.basis[i]]), ([x, b]) => `${multName(b)} ${fmt(x, 1)}`)}
        </tbody></table>
        <p>النمو الأساسي من ${p.growthFrom === 'analysts' ? 'توقع المحللين لإيرادات السنة الجاية' : 'نمو الإيرادات آخر 3 سنوات'}، ويهدأ تدريجياً. ${p.margin ? 'الهامش: أقل ومتوسط وأعلى هامش في آخر 3 سنوات.' : 'الشركة ما تربح، فالسعر = المبيعات للسهم × مكرر المبيعات.'} المكرر يتحرك من مكرر اليوم إلى ${p.own == null ? `مكرر عام (<b class="n">${fmt(p.normal, 1)}</b>) لأن تاريخ السهم ما يكفي` : p.own > p.normal ? `متوسط السهم آخر 5 سنوات (<b class="n">${fmt(p.own, 1)}</b>، حدّيناه بـ <b class="n">${fmt(p.normal, 1)}</b> لأن النمو يهدأ مع الوقت)` : p.own < p.normal ? `<b class="n">${fmt(p.normal, 1)}</b> (متوسط السهم <b class="n">${fmt(p.own, 1)}</b> أقل من الحد الأدنى)` : `متوسط السهم نفسه آخر 5 سنوات (<b class="n">${fmt(p.normal, 1)}</b>)`} × 0.75 / 1 / 1.25.${p.basis.includes('ps') && p.margin ? ' السيناريو اللي هامشه صفر أو سالب مسعّر على المبيعات.' : ''}</p>
        <p class="dim">"قيمتها اليوم" = سعر ${y0 + 5} مخصوم 9% سنوياً: لو أعلى من سعر اليوم، السيناريو يعطي أكثر من 9% بالسنة. عدد الأسهم ثابت (ما حسبنا إعادة الشراء ولا الإصدار)، والتوزيعات مو داخلة.</p>`
    }
    return `<details class="part proj" style="grid-column:1/-1"${state.projOpen ? ' open' : ''}><summary><span>توقع السعر لـ 5 سنوات</span><span class="dim">اضغط للعرض</span></summary>
      ${body}
      <p class="dim">سيناريوهات من الافتراضات المكتوبة، مو توقع مجرّب: ما اختبرناها على الماضي. الشركات الدورية (رقائق، سلع، بتروكيماويات) يطلع المدى عندها واسع لأن هامشها يتقلب.</p>
    </details>`
  }

  function detail(sym) {
    const q = state.quotes[sym] || {}
    const s = state.scores[sym]
    if (!s || !s.detail) return `<div class="dgrid">${fairBlock(sym)}${projBlock(sym)}${expBlock(sym)}${ideasBlock(sym)}</div><p class="dim" style="margin-top:10px">${esc(state.errors[sym] || (s?.reason === 'pre-revenue' ? 'الدرجة ما تنحسب لما تكون الإيرادات أقل من 1% من القيمة السوقية (يعني السهم يتداول بأكثر من 100 ضعف مبيعاته، أو الشركة بدون إيرادات). هذي قاعدة الاختبار نفسه.' : 'بيانات الدرجة ناقصة لهذا السهم.'))}</p>`
    const d = s.detail
    const f0 = s.f0 || {}
    const last3 = (s.known || []).slice(-3).filter((f) => Number.isFinite(f.ni) && Number.isFinite(f.fcf))
    const sNi = last3.reduce((a, f) => a + f.ni, 0)
    const sFcf = last3.reduce((a, f) => a + f.fcf, 0)
    const margin = Number.isFinite(f0.ebitda) ? f0.ebitda / f0.rev : Number.isFinite(f0.ni) ? f0.ni / f0.rev : null
    const marginName = Number.isFinite(f0.ebitda) ? 'هامش EBITDA' : 'هامش صافي الربح'
    const debtX = Number.isFinite(f0.ebitda) && f0.ebitda > 0 ? (f0.debt ?? 0) / f0.ebitda : null
    const pcts = ['pe', 'ps', 'ev', 'pfcf'].map((k) => d[`pct_${k}`]).filter(Number.isFinite)
    const cheaper = pcts.length ? 1 - pcts.reduce((a, b) => a + b, 0) / pcts.length : null
    const p = s.parts || {}
    const part = (title, val, html) => `<div class="part"><h3><span><i class="sw" style="background:var(${PARTS.find((x) => x[1] === title)[2]})"></i>${title}</span><span class="n ${val == null ? 'dim' : ''}">${val == null ? '—' : fmt(val, 1) + ' / 2'}</span></h3>${html}</div>`
    const growthNext = Number.isFinite(q.earnings_per_share_forecast_next_fy) && q.earnings_per_share_diluted_ttm > 0 ? q.earnings_per_share_forecast_next_fy / q.earnings_per_share_diluted_ttm - 1 : null
    const growthFy = Number.isFinite(q.earnings_per_share_forecast_next_fy) && f0.eps > 0 ? q.earnings_per_share_forecast_next_fy / f0.eps - 1 : null
    const pegs = q.price_earnings_ttm > 0 ? [growthNext, growthFy].filter((g) => g > 0).map((g) => q.price_earnings_ttm / (100 * g)).filter(Number.isFinite) : []
    const pegTxt = pegs.length ? (pegs.length === 2 ? `${fmt(Math.min(...pegs), 2)}–${fmt(Math.max(...pegs), 2)}` : fmt(pegs[0], 2)) : '—'
    const ctx = [
      ['Fwd P/E', fmt(q.non_gaap_price_to_earnings_per_share_forecast_next_fy), 'السعر ÷ توقع المحللين لربح السنة المالية الجاية. ضعفه: توقعات، والمحللين غالباً متفائلين.'],
      ['PEG', pegTxt, 'P/E ÷ النمو المتوقع. معروض كمدى لأنه يتغير كثير حسب سنة الأساس. ضعفه: كله على رقم النمو.'],
      ['EV/EBITDA', fmt(q.enterprise_value_ebitda_ttm), 'يحسب الدين. ضعفه: قبل الإنفاق الرأسمالي، فيجامل الشركات اللي تصرف كثير.'],
      ['FCF yield', q.price_free_cash_flow_ttm > 0 ? pct(1 / q.price_free_cash_flow_ttm, 1) : '—', 'كاش فعلي ÷ القيمة السوقية. ضعفه: ينزل مؤقتاً وقت الإنفاق الكبير.'],
      ['P/S', fmt(q.price_sales_current), 'للشركات اللي ما تربح. ضعفه: يتجاهل الهامش.'],
      ['P/B · ROE', `${fmt(q.price_book_fq)} · ${fmt(q.return_on_equity, 0)}%`, 'للبنوك والتأمين. ضعفه: ما له معنى لشركات أصولها غير ملموسة.'],
      ['ROIC', Number.isFinite(q.return_on_invested_capital_fy) ? `${fmt(q.return_on_invested_capital_fy, 1)}%` : '—', 'العائد على رأس المال المستثمر: هل النمو مربح فعلاً؟'],
      ['Altman Z', fmt(q.altman_z_score_ttm), 'خطر الإفلاس: فوق 3 آمن، تحت 1.8 خطر. ما يصلح للبنوك.'],
      ['Piotroski', Number.isFinite(q.piotroski_f_score_ttm) ? `${q.piotroski_f_score_ttm}/9` : '—', '9 فحوصات لتحسن الأساسيات. الاستثمار الضخم ينزّله.'],
      ['هدف المحللين', Number.isFinite(q.price_target_1y) ? `${fmt(q.price_target_1y, 2)} (${pct(q.price_target_1y / q.close - 1)})` : '—', 'متوسط السعر المستهدف خلال سنة. مرجع فقط.'],
    ]
    return `<div class="dgrid">
      ${fairBlock(sym)}
      ${projBlock(sym)}
      ${expBlock(sym)}
      ${ideasBlock(sym)}
      ${part('السعر', p.A, `<p>أرخص من <b class="n">${cheaper == null ? '—' : pct(cheaper).replace('+', '')}</b> من شهوره في آخر 5 سنوات (P/E، P/S، EV/EBITDA، P/FCF).</p>
        <p>${q.sector === 'Finance' ? 'للبنوك والمالية: السعر مقارنة بتاريخه بس، بدون النمو المفترض من التدفق النقدي.' : `السعر يفترض نمو تدفق نقدي <b class="n">${pct(d.gStar)}</b> سنوياً، والشركة نمت إيراداتها <b class="n">${pct(d.revG)}</b> سنوياً آخر 3 سنوات.`}</p>`)}
      ${part('الجودة', p.B, `<p>${marginName}: <b class="n">${pct(margin, 1)}</b></p><p>الكاش من الأرباح (آخر 3 سنوات): <b class="n">${q.sector === 'Finance' ? 'ما ينحسب للمالية' : sNi > 0 ? fmt(sFcf / sNi, 2) + '×' : sFcf > 0 ? 'كاش موجب مع خسائر' : 'سالب'}</b></p>`)}
      ${part('النمو', p.C, `<p>نمو الإيراد السنوي: <b class="n">${pct(d.revG, 1)}</b></p><p>نمو ربح السهم السنوي: <b class="n">${d.epsG == null ? 'غير محسوب (خسارة)' : pct(d.epsG, 1)}</b></p>`)}
      ${part('الأمان', p.D, `<p>الدين ÷ EBITDA: <b class="n">${d.d1 == null ? 'لا يُحسب للمالية' : debtX == null ? '—' : fmt(debtX, 1) + '×'}</b></p><p>سنوات خسارة في آخر 5: <b class="n">${d.losses ?? '—'}</b></p>`)}
      ${part('الاتجاه', p.E, `<p>نجح في <b class="n">${d.passed ?? '—'} من ${d.checks ?? '—'}</b> فحوصات تحسن (${q.sector === 'Finance' ? 'ربح، إيراد، ربح السهم، هوامش' : 'ربح، كاش، إيراد، هوامش، دين'}) مقارنة بالسنة اللي قبلها.</p>`)}
    </div>
    <p class="ctx-t">مقاييس للمعلومة، ما تدخل في الدرجة. وقّف الماوس على أي واحد يطلع لك ضعفه. السنة المالية المعتمدة: <span class="n">${esc(s.fiscalYear ?? '—')}</span>.</p>
    <div class="ctx">${ctx.map(([k, v, tip]) => `<div title="${esc(tip)}"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`
  }

  function renderLatestIdeas(all) {
    const box = $('latestIdeas')
    if (!box) return
    const list = all.filter((i) => i.date).sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 25)
    box.innerHTML = list.length
      ? `<ul class="ideas">${list.map((i) => `<li><div><b class="n">${esc((i.sym || '').split(':')[1] || i.sym)}</b> · <a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title || i.source)}</a> <span class="dim">${esc(i.source)} · <span class="n">${esc(i.date)}</span></span></div>${i.summary ? `<p>${esc(i.summary)}</p>` : ''}</li>`).join('')}</ul>`
      : '<p class="dim">ما فيه أفكار مسجلة للحين.</p>'
  }

  function setMarket(m) {
    state.market = m
    state.open = null
    state.group = ''
    if (m === 'big') state.sort = { key: 'mcap', dir: -1 }
    else if (state.sort.key === 'mcap') state.sort = { key: 'sym', dir: 1 }
    renderGroups()
    render()
    refresh()
  }

  // ---------------------------------------------------------------- sectors tab

  const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  const monthAr = (m) => `${MONTHS_AR[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`
  const CH = { h: 190, l: 8, r: 64, t: 10, b: 22 }

  // One sector's P/E history: the line, the historically cheap (bottom 10%) and expensive
  // (top 10%) zones, and the median. Drawn at the card's real width so text stays readable.
  function sectorChart(g, w) {
    const months = SECTOR_PE.months
    const ys = g.pe.filter((v) => v != null)
    const lo = Math.max(0, Math.min(...ys, g.p10) * 0.9)
    const hi = Math.max(...ys, g.p90) * 1.06
    const X = (i) => CH.l + (i / (months.length - 1)) * (w - CH.l - CH.r)
    const Y = (v) => CH.t + (1 - (v - lo) / (hi - lo)) * (CH.h - CH.t - CH.b)
    let d = ''
    let pen = false
    g.pe.forEach((v, i) => { if (v == null) { pen = false; return } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true })
    const ticks = months.map((m, i) => [m, i]).filter(([m]) => m.endsWith('-01') && Number(m.slice(0, 4)) % 3 === 0)
    const ref = (v, label) => `<line x1="${CH.l}" x2="${w - CH.r}" y1="${Y(v)}" y2="${Y(v)}" class="ref"/><text x="${w - CH.r + 6}" y="${Y(v) + 4}" class="axis">${label} ${v}</text>`
    const last = g.pe.length - 1
    return `<svg class="sc" width="${w}" height="${CH.h}" viewBox="0 0 ${w} ${CH.h}" data-w="${w}" role="img" aria-label="مكرر الربح لـ ${esc(nameAr(g.key))} من ${SECTOR_PE.first.slice(0, 4)} لين اليوم">
      <rect x="${CH.l}" y="${CH.t}" width="${w - CH.l - CH.r}" height="${Y(g.p90) - CH.t}" class="zone-hi"/>
      <rect x="${CH.l}" y="${Y(g.p10)}" width="${w - CH.l - CH.r}" height="${CH.h - CH.b - Y(g.p10)}" class="zone-lo"/>
      ${ref(g.p90, 'قمة')}${ref(g.p50, 'وسط')}${ref(g.p10, 'قاع')}
      ${ticks.map(([m, i]) => `<text x="${X(i)}" y="${CH.h - 6}" class="axis" text-anchor="middle">${m.slice(0, 4)}</text>`).join('')}
      <path d="${d}" class="pe-line"/>
      <circle cx="${X(last)}" cy="${Y(g.pe[last])}" r="4" class="pe-dot"/>
      <line class="cross" x1="0" x2="0" y1="${CH.t}" y2="${CH.h - CH.b}" visibility="hidden"/>
      <rect x="${CH.l}" y="0" width="${w - CH.l - CH.r}" height="${CH.h}" fill="transparent" class="hit"/>
    </svg>`
  }

  function renderSectors() {
    const box = $('sectorsView')
    if (!SECTOR_PE) { box.innerHTML = '<p class="dim">بيانات القطاعات مو موجودة في هذي النسخة.</p>'; return }
    const groups = SECTOR_PE.groups.filter((g) => g.kind === state.secKind).sort((a, b) => a.rank - b.rank)
    const count = (k) => SECTOR_PE.groups.filter((g) => g.kind === k).length
    const width = Math.min(560, Math.max(260, (box.querySelector('.secgrid')?.firstElementChild?.clientWidth ?? box.clientWidth) - 30))
    const verdict = (g) => (g.rank <= 0.1 ? '<span class="chip green">قريب من القاع: رخيص مقارنة بتاريخه</span>'
      : g.rank >= 0.9 ? '<span class="chip red">قريب من القمة: غالي مقارنة بتاريخه</span>'
      : '<span class="chip">في النطاق الطبيعي لتاريخه</span>')
    const where = (g) => (g.rank < 0.5 ? `أرخص من <b class="n">${Math.round(100 * (1 - g.rank))}%</b> من شهوره` : `أغلى من <b class="n">${Math.round(100 * g.rank)}%</b> من شهوره`)
    box.innerHTML = `<div class="secintro">
        <h2>القطاعات: وين كل قطاع من تاريخه؟</h2>
        <p>مكرر الربح (P/E) لكل قطاع في السوق الأمريكي، شهر بشهر من ${SECTOR_PE.first.slice(0, 4)} لين اليوم. مكرر القطاع = القيمة السوقية لشركاته الرابحة ÷ أرباحها. <b class="hi">المنطقة الخضراء تحت</b> = أرخص 10% من تاريخه (القاع)، و<b class="lo">الحمراء فوق</b> = أغلى 10% (القمة). مرتبة من الأرخص للأغلى مقارنة بتاريخها.</p>
        <p class="dim">هذا وصف لتاريخ كل قطاع، ما اختبرناه كإشارة شراء وبيع: القطاع ممكن يقعد في القمة أو القاع سنين. محسوب من ${SECTOR_PE.stocks} شركة أمريكية موجودة اليوم، فالشركات اللي طلعت من السوق مو داخلة. آخر تحديث: ${monthAr(SECTOR_PE.asOf)}.</p>
        <div class="seg" role="group" aria-label="نوع التقسيم">
          <button type="button" data-kind="sector" aria-pressed="${state.secKind === 'sector'}">القطاعات (${count('sector')})</button>
          <button type="button" data-kind="industry" aria-pressed="${state.secKind === 'industry'}">الصناعات (${count('industry')}، أدق)</button>
        </div>
      </div>
      <div class="secgrid">${groups.map((g) => `<article class="sec" data-key="${esc(g.kind)}:${esc(g.key)}">
        <header><h3>${esc(nameAr(g.key))}</h3><span class="pe-now"><span class="dim">P/E</span> <b class="n">${fmt(g.pe.at(-1), 1)}</b></span></header>
        <p>${verdict(g)} ${where(g)} منذ ${SECTOR_PE.first.slice(0, 4)}</p>
        <div class="chart" dir="ltr">${sectorChart(g, width)}<div class="ctip" dir="rtl" hidden></div></div>
        <p class="dim">القاع (أرخص 10%): <b class="n">${g.p10}</b> · الوسط: <b class="n">${g.p50}</b> · القمة (أغلى 10%): <b class="n">${g.p90}</b></p>
        <p class="dim">${g.n} شركة · أكبرها: <span class="n">${g.top.map((x) => esc(x.split(':')[1])).join('، ')}</span></p>
        <button class="btn" type="button" data-show="${esc(g.kind)}:${esc(g.key)}">شوف أسهمه في قائمتك</button>
      </article>`).join('')}</div>`
  }

  $('sectorsView').addEventListener('click', (e) => {
    const k = e.target.closest('button[data-kind]')
    if (k) { state.secKind = k.dataset.kind; renderSectors(); return }
    const b = e.target.closest('button[data-show]')
    if (b) { setMarket('us'); state.group = b.dataset.show; renderGroups(); render(); window.scrollTo({ top: 0 }) }
  })
  // Crosshair and readout: the pointer picks the nearest month.
  $('sectorsView').addEventListener('pointermove', (e) => {
    const svg = e.target.closest('svg.sc')
    if (!svg) return
    const card = svg.closest('.sec')
    const [kind, key] = card.dataset.key.split(/:(.*)/)
    const g = SECTOR_PE.groups.find((x) => x.kind === kind && x.key === key)
    const w = Number(svg.dataset.w)
    const x = e.clientX - svg.getBoundingClientRect().left
    const n = SECTOR_PE.months.length
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - CH.l) / (w - CH.l - CH.r)) * (n - 1))))
    const cx = CH.l + (i / (n - 1)) * (w - CH.l - CH.r)
    const line = svg.querySelector('.cross')
    line.setAttribute('x1', cx)
    line.setAttribute('x2', cx)
    line.setAttribute('visibility', 'visible')
    const tip = card.querySelector('.ctip')
    tip.hidden = false
    tip.textContent = `${monthAr(SECTOR_PE.months[i])} · P/E ${g.pe[i] ?? '—'}`
    tip.style.left = `${Math.min(Math.max(0, cx - tip.offsetWidth / 2), w - tip.offsetWidth)}px`
  })
  $('sectorsView').addEventListener('pointerleave', (e) => {
    for (const l of $('sectorsView').querySelectorAll('.cross')) l.setAttribute('visibility', 'hidden')
    for (const t of $('sectorsView').querySelectorAll('.ctip')) t.hidden = true
  }, true)
  let resizeT = 0
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (state.market === 'sectors') renderSectors() }, 150) })

  // ---------------------------------------------------------------- events

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-m]')
    if (b && b.dataset.m !== state.market) setMarket(b.dataset.m)
  })
  $('addForm').addEventListener('submit', (e) => { e.preventDefault(); search($('q').value) })
  $('results').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-add]')
    if (b) addSymbol(b.dataset.add)
  })
  document.addEventListener('click', (e) => { if (!e.target.closest('.add')) $('results').hidden = true })
  $('refresh').addEventListener('click', () => refresh({ fresh: true }))
  $('filter').addEventListener('input', (e) => { state.filter = e.target.value; render() })
  $('group').addEventListener('change', (e) => { state.group = e.target.value; render() })
  // Phones hide the table header, so sorting there goes through this menu.
  $('sortSel').addEventListener('change', (e) => { const [key, dir] = e.target.value.split(':'); state.sort = { key, dir: Number(dir) }; render() })
  const tip = $('tip')
  const canHover = matchMedia('(hover: hover)').matches
  $('rows').addEventListener('mouseover', (e) => {
    const el = canHover && e.target.closest('.score')
    if (!el) { tip.hidden = true; return }
    tip.innerHTML = scoreTip(el.closest('tr.row')?.dataset.sym)
    tip.hidden = !tip.innerHTML
    const r = el.getBoundingClientRect()
    const top = r.bottom + 8 + tip.offsetHeight > innerHeight ? r.top - 8 - tip.offsetHeight : r.bottom + 8
    tip.style.top = `${Math.max(8, top)}px`
    tip.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2), innerWidth - tip.offsetWidth - 8)}px`
  })
  $('rows').addEventListener('mouseleave', () => { tip.hidden = true })
  addEventListener('scroll', () => { tip.hidden = true }, { passive: true })
  // Re-renders rebuild the panel, so the forecast keeps whatever open/closed state was chosen.
  $('rows').addEventListener('toggle', (e) => { if (e.target.matches('details.proj')) state.projOpen = e.target.open }, true)
  const toggle = (sym) => { state.open = state.open === sym ? null : sym; render(); if (state.open) loadNews(sym) }
  $('rows').addEventListener('click', (e) => {
    const del = e.target.closest('button[data-del]')
    if (del) { e.stopPropagation(); if (state.market !== 'big') removeSymbol(del.dataset.del); return }
    const row = e.target.closest('tr.row')
    if (row) toggle(row.dataset.sym)
  })
  $('rows').addEventListener('keydown', (e) => {
    const row = e.target.closest('tr.row')
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(row.dataset.sym) }
  })
  document.querySelector('thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]')
    if (!b) return
    const k = b.dataset.sort
    state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === 'sym' ? 1 : -1 }
    render()
  })

  // ---------------------------------------------------------------- boot

  async function boot() {
    render()
    ;[db, mcp] = await Promise.all([window.claude?.use?.('db') ?? null, window.claude?.use?.('mcp') ?? null])
    if (!mcp) {
      $('status').textContent = ''
      notice('الصفحة تحتاج ربط TradingView من claude.ai عشان تجيب الأرقام. افتحها من claude.ai وهي مسجّلة دخول.', true)
    }
    if (!db) {
      notice('الحفظ غير متاح في هذا العرض، فالقائمة ما بتنحفظ.', true)
      return
    }
    $('status').textContent = 'جاري قراءة البيانات المحفوظة…'
    await loadCacheFromDb().catch(() => {})
    try {
      db.collection('ideas').limit(1000).onSnapshot((snap) => {
        const by = {}
        for (const d of snap.docs) { const v = d.data(); (by[v.sym] ??= []).push(v) }
        state.ideas = by
        renderLatestIdeas(snap.docs.map((d) => d.data()))
        render()
      }, () => renderLatestIdeas([]))
    } catch { renderLatestIdeas([]) }
    db.doc('meta/watchlists').onSnapshot((snap) => {
      const d = snap.exists ? snap.data() : {}
      state.groups = { us: d.us ?? [], sa: d.sa ?? [] }
      renderGroups()
      render()
    }, () => {})
    for (const m of ['us', 'sa']) {
      db.doc(`lists/${m}`).onSnapshot((snap) => {
        const syms = snap.exists ? snap.data().symbols ?? [] : []
        const changed = JSON.stringify(syms) !== JSON.stringify(state.lists[m])
        state.lists[m] = [...syms]
        if (changed && m === state.market) refresh()
        else render()
      }, () => notice('ما قدرت أقرأ القائمة المحفوظة.', true))
    }
  }
  boot()
})()
