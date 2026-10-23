;(() => {
  const SERVER = 'Trading view MCP'
  const T = { batch: 'mcp-tv-get-symbol-data-batch', px: 'mcp-tv-get-ohlcv', search: 'mcp-tv-search-symbols', news: 'mcp-tv-get-news' }
  // TradingView caps tool calls per day (shared with Claude sessions; resets 00:00 UTC), so the
  // background work is event-driven: fundamentals only when a stock's quote shows a newer fiscal
  // period (50 stocks per call); monthly prices for favourites once a month, other stocks every
  // three months (at most PX_OTHERS per visit) or when opened. Each saved doc records when it was
  // last answered (fundsAt, pxAt), so other tabs and devices skip it too.
  const PX_OTHERS = 10
  const RETRY_MS = 20 * 3600e3 // a stock TradingView answered is not asked again for 20 hours
  const FAIL_MS = 10 * 60e3 // after a failed call, not before 10 minutes
  const BG_MS = 20 * 60e3 // background updates at most every 20 minutes per list (quotes always)
  const COLS = ['description', 'close', 'currency', 'type', 'sector', 'market_cap_basic', 'price_earnings_ttm', 'non_gaap_price_to_earnings_per_share_forecast_next_fy',
    'earnings_per_share_forecast_next_fy', 'earnings_per_share_diluted_ttm', 'enterprise_value_ebitda_ttm', 'price_free_cash_flow_ttm', 'price_sales_current',
    'price_book_fq', 'return_on_invested_capital_fy', 'return_on_equity', 'piotroski_f_score_ttm', 'altman_z_score_ttm', 'price_target_1y', 'gross_margin',
    'debt_to_equity', 'net_debt_fq', 'revenue_forecast_next_fy', 'total_revenue_ttm', 'earnings_release_next_date', 'eps_surprise_percent_fq', 'revenue_surprise_percent_fq', 'industry',
    'total_revenue_fq', 'fiscal_period_end_fq', 'fiscal_period_end_fy', 'earnings_per_share_fy', 'total_revenue_fy', 'fiscal_period_fy', 'free_cash_flow_ttm',
    'piotroski_f_score_fy', 'change', 'price_52_week_high', 'price_52_week_low', 'dividends_yield', 'beta', 'total_shares_outstanding', 'net_income_ttm', 'cash_n_short_term_invest_fq', 'oper_income_ttm', 'beta_5_year', 'total_debt_fq']
  // Revenue, net income and EPS histories for the SVR chart (newest first; 32 quarters, 20 years).
  const H_COLS = ['total_revenue_fq_h', 'net_income_fq_h', 'earnings_per_share_diluted_fq_h', 'total_revenue_fy_h', 'net_income_fy_h',
    'earnings_per_share_diluted_fy_h', 'fiscal_period_end_fq']
  const METHOD_NAMES = { pe: 'P/E مقارنة بتاريخه', peg: 'مكرر = النمو (قاعدة Lynch، نمو ربح السهم 3 سنين، أو المبيعات لو فيه خسارة، بحد 25%)', dcf: 'DCF (التدفق النقدي)', graham: 'سقف Graham للمستثمر المتحفظ (فحص، مو قيمة عادلة)', ev: 'EV/EBITDA مقارنة بتاريخه', ps: 'P/S مقارنة بتاريخه',
    pb: 'P/B مقارنة بتاريخه', pbj: 'P/B من العائد على حقوق المساهمين', cash: 'أرضية الكاش (الكاش الصافي للسهم)', pen: 'P/E على متوسط ربح 5 سنوات' }
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
  // Target operating margins for the revenue DCF (scripts/build-peer-margins.js).
  const PEERS = /*PEERS*/null
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
  // The rest of the industries in pages/peer-margins.json (the revenue DCF names its industry).
  const INDUSTRY_AR = {
    'Advertising/Marketing Services': 'الإعلان والتسويق', 'Agricultural Commodities/Milling': 'السلع الزراعية والمطاحن', 'Air Freight/Couriers': 'الشحن الجوي والبريد السريع', 'Airlines': 'الطيران',
    'Apparel/Footwear Retail': 'متاجر الملابس والأحذية', 'Apparel/Footwear': 'الملابس والأحذية', 'Auto Parts: OEM': 'قطع غيار السيارات', 'Beverages: Alcoholic': 'المشروبات الكحولية',
    'Beverages: Non-Alcoholic': 'المشروبات', 'Broadcasting': 'البث الإذاعي والتلفزيوني', 'Building Products': 'مواد ومنتجات البناء', 'Cable/Satellite TV': 'تلفزيون الكيبل والأقمار',
    'Casinos/Gaming': 'الكازينوهات والألعاب', 'Chemicals: Agricultural': 'الكيماويات الزراعية', 'Chemicals: Major Diversified': 'شركات الكيماويات الكبرى', 'Chemicals: Specialty': 'الكيماويات المتخصصة',
    'Commercial Printing/Forms': 'الطباعة التجارية', 'Computer Peripherals': 'ملحقات الكمبيوتر', 'Computer Processing Hardware': 'أجهزة الكمبيوتر والخوادم', 'Construction Materials': 'مواد البناء',
    'Containers/Packaging': 'التغليف والعبوات', 'Contract Drilling': 'الحفر بالعقود', 'Department Stores': 'المتاجر الكبرى', 'Electronic Components': 'المكونات الإلكترونية',
    'Electronic Production Equipment': 'معدات تصنيع الإلكترونيات', 'Electronics Distributors': 'موزعو الإلكترونيات', 'Environmental Services': 'الخدمات البيئية', 'Financial Publishing/Services': 'البيانات والخدمات المالية',
    'Food Distributors': 'موزعو الأغذية', 'Food Retail': 'متاجر الأغذية', 'Food: Major Diversified': 'شركات الأغذية الكبرى', 'Food: Meat/Fish/Dairy': 'اللحوم والأسماك والألبان',
    'Gas Distributors': 'توزيع الغاز', 'Home Furnishings': 'الأثاث المنزلي', 'Homebuilding': 'بناء المنازل', 'Hospital/Nursing Management': 'إدارة المستشفيات ودور الرعاية',
    'Hotels/Resorts/Cruise lines': 'الفنادق والمنتجعات والرحلات البحرية', 'Household/Personal Care': 'المنتجات المنزلية والعناية الشخصية', 'Industrial Specialties': 'المواد الصناعية المتخصصة', 'Insurance Brokers/Services': 'وسطاء وخدمات التأمين',
    'Internet Retail': 'التجارة الإلكترونية', 'Life/Health Insurance': 'تأمين الحياة والصحة', 'Major Telecommunications': 'شركات الاتصالات الكبرى', 'Managed Health Care': 'التأمين الصحي',
    'Marine Shipping': 'الشحن البحري', 'Medical/Nursing Services': 'الخدمات الطبية والتمريضية', 'Metal Fabrication': 'تصنيع المعادن', 'Miscellaneous Manufacturing': 'تصنيع متنوع',
    'Motor Vehicles': 'السيارات', 'Movies/Entertainment': 'الأفلام والترفيه', 'Oil & Gas Pipelines': 'أنابيب النفط والغاز', 'Oil & Gas Production': 'إنتاج النفط والغاز',
    'Oil Refining/Marketing': 'تكرير وتسويق النفط', 'Oilfield Services/Equipment': 'خدمات ومعدات حقول النفط', 'Other Consumer Services': 'خدمات استهلاكية أخرى', 'Other Transportation': 'نقل آخر',
    'Personnel Services': 'خدمات التوظيف', 'Railroads': 'السكك الحديدية', 'Real Estate Development': 'التطوير العقاري', 'Recreational Products': 'المنتجات الترفيهية',
    'Regional Banks': 'البنوك الإقليمية', 'Specialty Insurance': 'التأمين المتخصص', 'Steel': 'الحديد والصلب', 'Trucking': 'النقل بالشاحنات',
    'Trucks/Construction/Farm Machinery': 'الشاحنات ومعدات البناء والزراعة', 'Wholesale Distributors': 'تجارة الجملة', 'Wireless Telecommunications': 'الاتصالات اللاسلكية',
  }
  const nameAr = (key) => SECTOR_AR[key] ?? INDUSTRY_AR[key] ?? key

  const $ = (id) => document.getElementById(id)
  const state = { market: 'us', lists: { us: [], sa: [], big: BIG, fav: [] }, groups: { us: [], sa: [], big: [], fav: [] }, svrMean: {}, underCap: false, secKind: 'sector', quotes: {}, cache: {}, quarters: {}, hist: {}, scores: {}, fair: {}, exp: {}, proj: {}, rdcf: {}, projOpen: false, ctxOpen: new Set(), news: {}, ideas: {}, errors: {},
    open: null, sort: { key: 'sym', dir: 1 }, filter: '', group: '' }
  let db = null
  let mcp = null

  const marketOf = (sym) => (sym.startsWith('TADAWUL:') ? 'sa' : 'us')
  // Rounded first, so a tiny negative prints 0, not -0 (ZETA's ROE −0.27 showed "-0%", RTX's change "-0.0%").
  const fmt = (x, d = 1) => (Number.isFinite(x) ? (+x.toFixed(d) || 0).toFixed(d) : '—')
  // Decimals for the stock's price-level numbers: 4 under $1, as brokers quote (DVLT 0.1338 showed 0.13).
  const dp = (q) => (q?.close > 0 && q.close < 1 ? 4 : 2)
  // A price with its currency: $ before dollars, a small ر.س after riyals (outside the number font).
  const money = (q, x) => (!Number.isFinite(x) ? '—' : q?.currency === 'USD' ? `$${x.toFixed(dp(q))}` : `${x.toFixed(dp(q))}${q?.currency ? `<span class="cur">${q.currency === 'SAR' ? 'ر.س' : esc(q.currency)}</span>` : ''}`)
  // TradingView's quarter label in Arabic: "Q2 2026" → "الربع الثاني 2026".
  const qAr = (l) => String(l ?? '').replace(/^Q([1-4]) (\d{4})$/, (_, n, y) => `الربع ${['الأول', 'الثاني', 'الثالث', 'الرابع'][n - 1]} ${y}`)
  // A sign only when the rounded value is not zero, so it never contradicts the colour taken from the raw value.
  const pct = (x, d = 0) => { if (!Number.isFinite(x)) return '—'; const v = +(100 * x).toFixed(d) || 0; return `${v > 0 ? '+' : ''}${v.toFixed(d)}%` }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  // A signed number inside plain Arabic text (the tiles' tips), isolated LTR so '-66%' does not show as '66%-'.
  const ltr = (s) => `\u2066${s}\u2069`
  const NO_FIN = 'ما فيه بيانات مالية سنوية لهذا السهم'

  function notice(text, bad = false) {
    const n = $('notice')
    n.hidden = !text
    n.className = bad ? 'notice bad' : 'notice'
    n.textContent = text || ''
  }

  function explainError(e) {
    if (/quota/i.test(`${e?.code} ${e?.message}`)) return 'وصلنا حد TradingView اليومي لعدد الطلبات. يرجع بعد منتصف الليل بتوقيت غرينتش (3 الفجر بتوقيت السعودية).'
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

  // A fetch saves only the fields it fetched (update merges; a missing doc is created), so it can
  // never drop the rest of a saved doc, nor rebuild one from a page that has not read it yet.
  // One write at a time per doc (db.d.ts), so a first update that creates the doc is seen by the next.
  const saving = {}
  function save(path, fields) {
    if (!db) return Promise.resolve()
    return (saving[path] = (saving[path] ?? Promise.resolve()).then(() => db.doc(path).update(fields)
      .catch((e) => (e?.code === 'invalid_argument' ? db.doc(path).set(fields) : Promise.reject(e))).catch(() => {})))
  }
  const recent = (at, ms) => Date.now() - (at ?? 0) < ms
  const failedAt = {} // symbol (fundamentals) or 'px:'+symbol → time of the last failed call

  async function pool(items, worker, limit) {
    let i = 0
    const next = async () => {
      while (i < items.length) await worker(items[i++])
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
  }

  // ---------------------------------------------------------------- data

  // Returns the stocks whose batch failed; throws when every batch of this call did. A stock another
  // tab quoted in the last 5 minutes (the host cache's staleTime) is not asked again: the Big and
  // favourites tabs' batches never match the US list's, so the cache could not answer them.
  const quotedAt = {}
  async function loadQuotes(symbols, fresh = false) {
    if (!fresh) symbols = symbols.filter((s) => !recent(quotedAt[s], 300000))
    const chunks = []
    for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50))
    let firstError = null
    const lost = []
    await pool(chunks, async (chunk) => {
      try {
        const p = await call(T.batch, { symbols: chunk, columns: COLS }, fresh ? { staleTime: 0, refresh: true } : { staleTime: 300000, gcTime: 3600000 })
        if (p?.success === false) throw { code: 'server_unavailable' } // 429/5xx come back this way (see loadHist)
        for (const [sym, row] of Object.entries(p?.data ?? {})) { state.quotes[sym] = row; quotedAt[sym] = Date.now() }
        for (const m of p?.missing ?? []) state.errors[m.symbol] = 'TradingView ما لقى السهم'
        chunk.forEach(compute)
        scheduleRender()
      } catch (e) {
        firstError ??= e
        lost.push(...chunk)
      }
    }, 3)
    if (firstError && lost.length === symbols.length) throw firstError // was: no quote in any tab yet
    return lost
  }

  // All saved histories (`cache`: fiscal years and monthly prices; `q`: the last 16 quarters; `h`:
  // the SVR chart's revenue histories) in
  // pages of 150, so a long list is not 700 separate reads.
  async function loadCollection(name, into) {
    if (!db) return
    let last = ''
    for (let guard = 0; guard < 40; guard += 1) {
      let q = db.collection(name).orderBy('sym').limit(150)
      if (last) q = q.where('sym', '>', last)
      const snap = await q.get()
      for (const d of snap.docs) {
        const v = d.data()
        const sym = v.sym ?? d.id
        into[sym] = v
        if (v.sym) last = v.sym
      }
      if (snap.size < 150) break
    }
  }
  const loadCacheFromDb = () => Promise.all([loadCollection('cache', state.cache), loadCollection('q', state.quarters), loadCollection('h', state.hist)])

  // Fundamentals (fiscal years → cache/<sym>, quarters → q/<sym>) are fetched again only when the
  // quote shows a fiscal year or quarter newer than the saved one: docs saved from now on keep the
  // period ends they hold (fyEnd, fqEnd), older docs are compared by their last label. Also while the
  // newest saved period lacks a figure the one before it has and ended recently: TradingView adds
  // the cash flow and balance sheet days to weeks after the results (JNJ's Q3 2026 sat without them
  // until January). fundsDue still waits 20 hours between asks.
  const qNum = (x) => {
    if (typeof x === 'number') { const d = new Date(x * 1000); return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3) + 1 }
    const m = /^Q([1-4]) (\d{4})$/.exec(x ?? '')
    return m ? Number(m[2]) * 4 + Number(m[1]) : -1
  }
  const partial = (h, end, days) => {
    const n = h?.labels?.length ?? 0
    return n > 1 && Date.now() - end * 1000 < days * 864e5 && Object.values(h.series).some((a) => a?.[n - 1]?.value == null && a?.[n - 2]?.value != null)
  }
  function fyDue(s) {
    const q = state.quotes[s]
    const d = state.cache[s]
    return !!q && (partial(d?.fin, q.fiscal_period_end_fy, 200) || (d?.fyEnd != null ? q.fiscal_period_end_fy > d.fyEnd : !d || Number(q.fiscal_period_fy) > Number(d.fin?.labels?.at(-1) ?? 0)))
  }
  function fqDue(s) {
    const q = state.quotes[s]
    const d = state.quarters[s]
    return !!q && (partial(d?.fq, q.fiscal_period_end_fq, 120) || (d?.fqEnd != null ? q.fiscal_period_end_fq > d.fqEnd : Number.isFinite(q.fiscal_period_end_fq) && qNum(q.fiscal_period_end_fq) > qNum(d?.fq?.labels?.at(-1))))
  }
  const fundsDue = (s) => !recent(state.cache[s]?.fundsAt, RETRY_MS) && !recent(failedAt[s], FAIL_MS) && (fyDue(s) || fqDue(s))

  // Both periods for up to 50 stocks in one call: TradingView's *_fy_h / *_fq_h screener columns in
  // the financial-history shape the engine reads (histFromBatch, 16 points as before). An empty or
  // failed answer never replaces saved figures (PG's and V's quarters were saved as null on 19 Oct).
  // A failed call throws with the stocks it covered (e.syms).
  async function loadFunds(syms) {
    const lost = []
    for (let i = 0; i < syms.length; i += 50) {
      const chunk = syms.slice(i, i + 50)
      let p
      try {
        p = await call(T.batch, { symbols: chunk, columns: HIST_COLS })
        if (p?.success === false) throw { code: 'server_unavailable' }
      } catch (e) {
        chunk.forEach((x) => { failedAt[x] = Date.now() })
        throw { code: e?.code, message: e?.message, syms: chunk }
      }
      const now = Date.now()
      const unknown = new Set((p?.missing ?? []).map((m) => m.symbol))
      for (const sym of chunk) {
        const row = p?.data?.[sym]
        if (!row && !unknown.has(sym)) { failedAt[sym] = now; lost.push(sym); continue } // a market that did not answer (partial)
        const fin = row && histFromBatch(row, 'fy')
        const fq = row && histFromBatch(row, 'fq')
        const old = state.cache[sym] ?? {}
        const c = fin && parseFundamentals(fin).length ? { sym, fin, fyEnd: row.fiscal_period_end_fy, missing: false, fundsAt: now, fetchedAt: now }
          // Nothing saved and nothing returned: remember the quote's period, so it is asked again
          // only once the quote shows a newer one (a recent IPO with no full fiscal year yet).
          : { sym, fundsAt: now, ...(cacheOk && !old.fin ? { missing: true, fyEnd: state.quotes[sym]?.fiscal_period_end_fy ?? null } : {}) }
        state.cache[sym] = { ...old, ...c }
        await save(`cache/${sym}`, c)
        if (fq) {
          state.quarters[sym] = { sym, fq, fqEnd: row.fiscal_period_end_fq, fetchedAt: now }
          await save(`q/${sym}`, state.quarters[sym])
        } else if (cacheOk && !state.quarters[sym]?.fq && Number.isFinite(state.quotes[sym]?.fiscal_period_end_fq)) {
          state.quarters[sym] = { sym, fqEnd: state.quotes[sym].fiscal_period_end_fq, fetchedAt: now }
          await save(`q/${sym}`, state.quarters[sym])
        }
        compute(sym)
      }
    }
    if (lost.length) throw { code: 'server_unavailable', syms: lost }
  }

  // Monthly prices (cache/<sym>.px): favourites once a calendar month, other stocks every three
  // months or when opened, ones with no bars every three months (older code saved a failed call so:
  // CRCL), and at most weekly while a saved close of the last 52 weeks is outside today's 52-week
  // range (TradingView has adjusted a split since: DKI, Oct 2026). A saved 240+ month series takes
  // the last 6 bars, kept when the first (a finished month) matches the saved close within 1%;
  // otherwise (bars are split-adjusted only, so a split, or a gap over 5 months) all 252 again. A
  // shorter series is a young listing and gets all 252 (same one call).
  function pxDue(s, opened = false) {
    const d = state.cache[s]
    if (!state.quotes[s] || recent(d?.pxAt, opened ? FAIL_MS : RETRY_MS) || recent(failedAt[`px:${s}`], FAIL_MS)) return false
    const px = d?.px
    if (!px?.t?.length) return opened || !recent(d?.pxAt, 90 * 864e5)
    const q = state.quotes[s]
    const yr = px.c.filter((c, i) => c > 0 && px.t[i] > Date.now() / 1000 - 335 * 86400)
    if ((Math.min(...yr) < q.price_52_week_low * 0.97 || Math.max(...yr) > q.price_52_week_high * 1.03) && !recent(d.pxAt, 7 * 864e5)) return true
    const cur = monthKey(Date.now() / 1000)
    // when TradingView was last asked counts too: a suspended stock gets no new bars
    const seen = Math.max(px.t.at(-1), (d.pxAt ?? 0) / 1000)
    return monthKey(seen) < (opened || state.lists.fav.includes(s) ? cur : addMonths(cur, -2))
  }
  async function loadPx(s) {
    const old = state.cache[s]?.px?.t?.length >= 240 ? state.cache[s].px : null
    const get = async (count) => (await call(T.px, { symbol: s, interval: 'M', count, format: 'columns' }))?.bars
    let b
    try {
      b = await get(old ? 6 : 252)
      if (old && b?.t?.length) {
        const k = old.t.findIndex((t) => monthKey(t) === monthKey(b.t[0]))
        if (k >= 0 && Math.abs(b.c[0] / old.c[k] - 1) < 0.01) b = { t: [...old.t.slice(0, k), ...b.t].slice(-252), c: [...old.c.slice(0, k), ...b.c].slice(-252) }
        else b = await get(252)
      }
    } catch (e) {
      failedAt[`px:${s}`] = Date.now()
      throw { code: e?.code, message: e?.message, syms: [s] }
    }
    const f = { sym: s, pxTried: true, pxAt: Date.now(), ...(b?.t?.length ? { px: { t: b.t, c: b.c } } : {}) }
    state.cache[s] = { ...(state.cache[s] ?? {}), ...f }
    await save(`cache/${s}`, f)
    compute(s)
  }

  // Fetched when a stock is opened, and again once its quote shows a newer quarter; after a failed
  // or empty answer, not before 10 minutes (the batch tool reports 429/5xx as success: false rather
  // than throwing). Monthly prices come from loadPx when the stock is opened (older docs' px is still read).
  async function loadHist(sym) {
    const doc = state.hist[sym]
    const stale = !doc || doc.error || state.quotes[sym]?.fiscal_period_end_fq > (doc.h?.fiscal_period_end_fq ?? -Infinity)
    if (!mcp || doc?.loading || !stale || Date.now() - (doc?.at ?? 0) < 6e5) return
    state.hist[sym] = { ...doc, loading: true }
    try {
      const p = await call(T.batch, { symbols: [sym], columns: H_COLS })
      const h = p?.data?.[sym]
      if (!h?.total_revenue_fq_h) throw { code: p?.success === false ? 'server_unavailable' : 'no_history' }
      state.hist[sym] = { sym, h, px: doc?.px ?? null, fetchedAt: Date.now() }
      if (db) await db.doc(`h/${sym}`).set(state.hist[sym]).catch(() => {})
    } catch (e) {
      state.hist[sym] = doc?.h ? { ...doc, at: Date.now() }
        : { sym, at: Date.now(), error: e?.code === 'no_history' ? 'TradingView ما عنده تاريخ مبيعات ربعية لهذا السهم.' : explainError(e) }
    }
    if (state.open === sym) redraw(sym)
  }

  // Market value at the price shown, on every share class (allShares: an Up-C's units; quoteShares: an
  // ADR's quote can carry its home listing's).
  const mv = (q) => (allShares(q) ? q.close * allShares(q) : null)

  // The live page's own valuation choices (POST-HOC, 2026-10-21, from an audit of the page; study 7's
  // tested blend is unchanged in the engine): Graham's number is the most a defensive investor
  // should pay (The Intelligent Investor, ch. 14), so it is shown as a check with no weight; Lynch's
  // "P/E = growth" rule is for growth companies, so it counts only when the growth the rule uses is
  // at least 10% (AAPL at 6.9% gave $60): 3-year EPS growth, or revenue growth when EPS growth has
  // no value, as the engine's own rule (fixed 2026-10-21: MU, a loss in FY2023, had lost the method
  // while growing revenue 105% a year); the DCF starts from analysts' growth for the forecast year
  // and discounts at a CAPM rate (see liveDcf).
  function liveFairValues(fv, q, funds, g = null) {
    const v = { ...fv.values }
    if (!(g >= 0.1)) v.peg = null
    const d = liveDcf(q, fv.values.dcf)
    if (d) v.dcf = d.value
    const close = q.close
    const bvps = q.price_book_fq > 0 ? close / q.price_book_fq : null
    const eps = q.earnings_per_share_diluted_ttm
    const roe = Number.isFinite(q.return_on_equity) ? q.return_on_equity / 100 : null
    const shares = allShares(q)
    if (eps > 0 && bvps > 0) v.graham = Math.sqrt(22.5 * eps * bvps)
    if (bvps > 0 && roe != null) {
      const x = bvps * Math.min(4, (roe - PARAMS.termGrowth) / (PARAMS.discount - PARAMS.termGrowth))
      v.pbj = x > 0 ? x : null
    }
    // a bank's or insurer's cash is its clients' and policyholders' (IBKR showed 176.27 at $82.74)
    if (fv.profile !== 'Financial' && Number.isFinite(q.net_debt_fq) && shares) {
      const x = -q.net_debt_fq / shares
      v.cash = x > 0 ? x : null
    }
    // POST-HOC (2026-10-22, display only; the blend is the same): PEG outside Lynch's rule gets no weight,
    // like Graham, and coverage is over the weights left (KO showed 85% with every method there).
    const weights = WEIGHTS[fv.profile].map((w, i) => (METHODS[i] === 'graham' || (METHODS[i] === 'peg' && !(g >= 0.1)) ? 0 : w))
    // POST-HOC (2026-10-23, study 16 D2 C): a method above 3× or below ⅓ of the methods' weighted median is left out.
    const b = blendTrimmed(v, weights)
    const used = METHODS.filter((m, i) => weights[i] > 0 && v[m] > 0).map((m) => v[m])
    return { values: v, weights, profile: fv.profile, fair: b?.fair ?? null, dropped: b?.dropped ?? [], med: b?.med ?? null, coverage: b ? b.coverage / weights.reduce((a, w) => a + w, 0) : 0, dcf: d,
      low: used.length ? Math.min(...used) : null, high: used.length ? Math.max(...used) : null }
  }

  // DCF on free cash flow per share (TTM ÷ today's shares): year 1 grows at analysts' revenue growth
  // for the forecast year (−20%…60%; else the engine's 3-year rate), then fades in a straight line
  // from min(year 1, 25%) to 2.5% by year 10; discount = CAPM, 4.5% + beta × 4.2% (Damodaran's
  // equity risk premium, July 2026), held within 7%–13%, 9% without a beta; terminal growth 2.5%.
  // The 5-year beta, as Yahoo and Damodaran use (TradingView's plain 'beta' is the 1-year one: KO
  // −0.11, MU 3.01 against 2.23 over 5 years; fixed 2026-10-21).
  const beta5 = (q) => (Number.isFinite(q?.beta_5_year) ? q.beta_5_year : Number.isFinite(q?.beta) ? q.beta : null)
  function liveDcf(q, fallback) {
    const shares = allShares(q) // free cash flow is the whole company's (TKO: on Class A only, DCF 1207 vs 466)
    const fcf0 = shares && Number.isFinite(q.free_cash_flow_ttm) ? q.free_cash_flow_ttm / shares : null
    if (!(fcf0 > 0)) return null
    const a = analysts(q).rev
    const g1 = a != null ? Math.min(0.6, Math.max(-0.2, a)) : null
    if (g1 == null) return fallback > 0 ? { value: fallback, g1: null, r: PARAMS.discount, beta: null } : null
    const r = beta5(q) != null ? Math.min(0.13, Math.max(0.07, 0.045 + beta5(q) * 0.042)) : PARAMS.discount
    const gT = PARAMS.termGrowth
    const G = Math.min(g1, 0.25)
    let cf = fcf0 * (1 + g1)
    let pv = cf / (1 + r)
    for (let t = 2; t <= 10; t += 1) {
      cf *= 1 + G + ((gT - G) * (t - 2)) / 8
      pv += cf / (1 + r) ** t
    }
    pv += (cf * (1 + gT)) / (r - gT) / (1 + r) ** 10
    return { value: pv, g1, r, beta: beta5(q) }
  }

  // Monthly closes from the saved history, this month at the quote's price.
  function closesOf(sym) {
    const d = state.cache[sym]
    const closes = new Map()
    ;(d?.px?.t ?? []).forEach((t, i) => { if (Number.isFinite(d.px.c[i])) closes.set(monthKey(t), d.px.c[i]) })
    if (Number.isFinite(state.quotes[sym]?.close)) closes.set(monthKey(Math.floor(Date.now() / 1000)), state.quotes[sym].close)
    return closes
  }

  function compute(sym) {
    dirty.add(sym)
    const d = state.cache[sym]
    const q = state.quotes[sym]
    if (!d || !q) return
    if (d.missing) { state.errors[sym] = NO_FIN; return }
    if (!d.fin) return // not fetched yet, or the fetch failed (its message stays)
    const funds = parseFundamentals(d.fin)
    // Net income ÷ EPS misses the share count when preferred dividends or a near-zero EPS
    // distort it (MCHP showed twice its shares); then the quote's count is used for the last year.
    const qShares = quoteShares(q)
    const last = funds[funds.length - 1]
    if (qShares && last && !(last.shares > qShares / 1.5 && last.shares < qShares * 1.5)) last.shares = qShares
    const closes = closesOf(sym)
    const month = monthKey(Math.floor(Date.now() / 1000))
    // live: every fiscal year TradingView returns is already reported (MSFT, MU, COST… end
    // theirs mid-year), not only those the backtests' "May of the next year" rule allows.
    // Today and the recent history from the last twelve months when quarterly results are saved.
    const live = liveContext(funds, ttmFromQuarters(state.quarters[sym]?.fq), month, qShares)
    const s = scoreAt(funds, closes, q.sector, month, live)
    state.scores[sym] = { ...s, f0: live.f0 ?? last, period: live.period, known: funds }
    const fv = fairValuesAt(funds, closes, q.sector, month, live)
    // POST-HOC (2026-10-22): a method whose multiple today is above MULT_MAX (earnings or EBITDA near
    // zero) gets no value, the engine's rule for history months (LYFT: $1.06 on EV/EBITDA 247).
    const now = multiplesAt(live.state(month), q.close)
    const capped = fv ? ['pe', 'pen', 'ev'].filter((k) => fv.values[k] > 0 && !(now[k] <= MULT_MAX)) : []
    for (const k of capped) fv.values[k] = null
    state.fair[sym] = fv ? { ...liveFairValues(fv, q, funds, s.detail?.epsG ?? s.detail?.revG), capped } : null
    // A bank's free cash flow moves with deposits and loans, so no implied growth for financials.
    state.exp[sym] = q.sector === 'Finance' ? null : expectationsAt(funds, closes, month, live)
    state.proj[sym] = q.sector === 'Finance' ? null : projectAt(funds, closes, month, { revGrowthNext: analysts(q).rev, revNow: q.total_revenue_ttm, live })
    state.rdcf[sym] = (fv?.profile === 'Unprofitable growth' || preProfit(sym)) && !sym.startsWith('TADAWUL:') ? rdcfFor(sym, funds) : null
  }

  let busy = false
  let again = false
  const bgAt = {} // list → time of its last background update in this tab
  async function refresh(opts = {}) {
    if (!mcp || !cacheRead || state.market === 'sectors') return
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
    const m = state.market
    if (freshQuotes) for (const k in failedAt) delete failedAt[k] // the button retries failures now
    const bg = freshQuotes || !recent(bgAt[m], BG_MS)
    if (bg && !$('notice').querySelector('[data-undo]')) notice('') // a warning stays until a run retries; an undo offer until used
    let lost = []
    try {
      lost = await loadQuotes(syms, freshQuotes)
    } catch (e) {
      notice(explainError(e), true)
      $('status').textContent = ''
      $('refresh').disabled = false
      render()
      return
    }
    // Background updates for this list, favourites first: fundamentals of stocks with a newer
    // fiscal period (50 per call), then monthly prices (favourites, plus at most PX_OTHERS others,
    // oldest first). At most every BG_MS per list unless the refresh button was pressed.
    const fav = new Set(state.lists.fav)
    const order = [...syms].sort((a, b) => fav.has(b) - fav.has(a))
    const funds = bg ? order.filter(fundsDue) : []
    const lastBar = (s) => state.cache[s]?.px?.t?.at(-1) ?? 0
    const others = bg ? order.filter((s) => !fav.has(s) && pxDue(s)).sort((a, b) => lastBar(a) - lastBar(b)) : []
    const px = [...(bg ? order.filter((s) => fav.has(s) && pxDue(s)) : []), ...others.slice(0, PX_OTHERS)]
    if (bg) bgAt[m] = Date.now()
    const jobs = []
    for (let i = 0; i < funds.length; i += 50) jobs.push(() => loadFunds(funds.slice(i, i + 50)))
    for (const s of px) jobs.push(() => loadPx(s))
    let done = 0
    let authError = null
    let quota = false
    const failed = new Set(lost) // a failed quote batch too: reported below, asked again by the next refresh
    await pool(jobs, async (job) => {
      if (authError || quota) return
      try { await job() } catch (e) {
        if (['server_not_connected', 'needs_reauth', 'not_in_manifest', 'not_granted'].includes(e?.code)) authError = e
        else if (/quota/i.test(`${e?.code} ${e?.message}`)) quota = true
        else (e?.syms ?? []).forEach((s) => failed.add(s))
      }
      done += 1
      $('status').textContent = `جاري تحديث البيانات: ${done} من ${jobs.length}`
      scheduleRender()
    }, 3)
    for (const s of failed) if (!state.cache[s]?.fin || !state.quotes[s]) { state.errors[s] = 'TradingView ما رد على طلب بياناتها. بنحاول مرة ثانية في التحديث الجاي بعد 10 دقايق، أو اضغط تحديث الأسعار.'; dirty.add(s) }
    if (authError) notice(explainError(authError), true)
    else if (quota) notice('وصلنا حد TradingView اليومي لعدد الطلبات. الأسعار والبيانات المحفوظة تبقى ظاهرة، والتحديث يرجع بعد منتصف الليل بتوقيت غرينتش (3 الفجر بتوقيت السعودية).', true)
    else if (failed.size) {
      bgAt[m] = Date.now() - BG_MS + FAIL_MS // the next refresh after 10 minutes retries them
      notice(`ما قدرت أحدّث بيانات ${failed.size} سهم الحين (TradingView ما رد). بنحاول مرة ثانية في التحديث الجاي بعد 10 دقايق، أو اضغط تحديث الأسعار.`, true)
    }
    $('refresh').disabled = false
    const later = others.length - Math.min(PX_OTHERS, others.length)
    $('status').textContent = `آخر تحديث للأسعار: ${new Date().toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}${later ? ` · أسعار ${later} سهم ثاني الشهرية تتحدث في الزيارات الجاية (${PX_OTHERS} كل مرة)` : ''}`
    scheduleRender() // every stock was computed when its data came in
  }

  // ---------------------------------------------------------------- lists

  // Saved lists change only through editSaved: it reads the saved copy, changes that one symbol and
  // writes it back, one edit at a time, so a page that has not loaded the list yet (or holds an old
  // copy from another tab) can never save a shorter list over it. That is how lists/us went from
  // 703 stocks to 2 (TEM, LLY): stocks added while the saved lists were still loading. Edits also
  // wait for the list's first server-definitive snapshot (saved).
  // saved: each list as its last server-definitive snapshot had it (null until one arrives).
  const saved = { us: null, sa: null, fav: null }
  let edits = Promise.resolve()
  function editSaved(m, sym, add) {
    const run = async () => {
      if (!db) return
      const path = m === 'fav' ? 'meta/favorites' : `lists/${m}`
      const snap = await db.doc(path).get()
      const cur = snap.exists ? snap.data().symbols ?? [] : []
      // Never build on a read that is not the server's or is shorter than the last snapshot: an
      // empty read, then + TEM, + LLY, is exactly the 703 → 2 wipe. So a save drops at most one.
      if (snap.metadata?.fromCache || cur.length < saved[m].length) throw { code: 'short_read' }
      const next = add ? (cur.includes(sym) ? cur : [...cur, sym]) : cur.filter((s) => s !== sym)
      if (next.length !== cur.length) await db.doc(path).set({ symbols: next })
      state.lists[m] = next
      saved[m] = next
    }
    edits = edits.then(run, run)
    return edits.catch((e) => {
      state.lists[m] = [...saved[m]]
      render()
      notice(e?.code === 'short_read' ? 'ما وصلتني قائمتك المحفوظة كاملة، فما غيّرت فيها شي. جرّب بعد ثواني.'
        : m === 'fav' ? 'ما قدرت أحفظ المفضلة.' : 'ما قدرت أحفظ القائمة. الحفظ متاح لصاحب الصفحة بس.', true)
    })
  }
  const notLoaded = (m) => {
    if (!db || saved[m]) return false
    notice('لحظة، قاعد أقرأ قائمتك المحفوظة. جرّب بعد ثواني.')
    return true
  }
  // After a delete or an un-star: one tap brings it back.
  function undoNotice(kind, sym) {
    const n = $('notice')
    n.hidden = false
    n.className = 'notice'
    n.innerHTML = `${kind === 'fav' ? 'شلت' : 'حذفت'} <b class="n">${esc(sym.split(':')[1])}</b> ${kind === 'fav' ? 'من المفضلة' : 'من القائمة'}. <button class="btn" type="button" data-undo="${kind}|${esc(sym)}">تراجع</button>`
  }

  async function addSymbol(sym) {
    const m = marketOf(sym)
    if (notLoaded(m)) return
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
    await editSaved(m, sym, true)
    try {
      await loadQuotes([sym])
      if (fundsDue(sym)) await loadFunds([sym])
      if (pxDue(sym, true)) await loadPx(sym)
      compute(sym)
    } catch (e) { state.errors[sym] = explainError(e) }
    render()
  }

  async function removeSymbol(sym) {
    const m = marketOf(sym)
    if (notLoaded(m)) return
    state.lists[m] = state.lists[m].filter((s) => s !== sym)
    if (state.open === sym) state.open = null
    render()
    undoNotice('list', sym)
    $('notice').querySelector('[data-undo]')?.focus({ preventScroll: true }) // a keyboard user lands on the undo
    await editSaved(m, sym, false)
  }

  let searchN = 0
  async function search(q) {
    const n = ++searchN // a reply to an older search is dropped (AAPL's late answer showed under MSFT)
    if (!mcp || !q.trim()) return
    const ul = $('results')
    ul.hidden = false
    ul.innerHTML = '<li class="dim" style="padding:8px 10px">جاري البحث…</li>'
    try {
      const p = await call(T.search, { query: q.trim(), type_filter: 'stock' }, { staleTime: 300000 })
      if (n !== searchN) return
      const list = (p?.data?.symbols ?? []).filter((s) => /^(NASDAQ|NYSE|AMEX|TADAWUL|CBOE):/.test(s.symbol) && (s.type === 'stock' || s.type === 'dr'))
      ul.innerHTML = list.length
        ? list.slice(0, 12).map((s) => `<li><button type="button" data-add="${esc(s.symbol)}"><span dir="auto">${esc(s.description)}</span><span class="sym">${esc(s.symbol)}</span></button></li>`).join('')
        : '<li class="dim" style="padding:8px 10px">ما لقيت أسهم أمريكية أو سعودية بهذا الاسم.</li>'
    } catch (e) {
      if (n === searchN) ul.innerHTML = `<li class="dim" style="padding:8px 10px">${esc(explainError(e))}</li>`
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
  // No upside for a pre-revenue company: its "fair value" is the net cash per share, a floor.
  const upside = (sym) => {
    const f = state.fair[sym]
    const q = state.quotes[sym]
    return f?.fair && q?.close && f.profile !== 'Pre-revenue' ? f.fair / q.close - 1 : null
  }
  // cagr() (engine/fairvalue.js) spans min(3, years with revenue − 1): a young listing's is 1 or 2 years.
  const gYears = (sym) => { const n = Math.min(3, (state.scores[sym]?.known ?? []).filter((f) => f.rev != null).length - 1); return n === 1 ? 'آخر سنة' : n === 2 ? 'آخر سنتين' : 'آخر 3 سنوات' }
  // A weak estimate: more than ±60% from the price, methods more than 3× apart, or a P/E above 100
  // (earnings near zero): shown dim, with the reason.
  function weakFair(sym) {
    const f = state.fair[sym]
    const up = upside(sym)
    if (!f?.fair) return null
    if (peNow(sym) > 100 && f.values.pe > 0) return 'مكرر الربح فوق 100 (ربح شبه صفر)، فالطرق على الربح ما لها معنى'
    if (up != null && Math.abs(up) > 0.6) return 'بعيدة أكثر من 60% عن السعر'
    if (f.low > 0 && f.high / f.low > 3) return f.dropped?.length ? 'الطرق مختلفة كثير (أعلاها أكثر من 3 أضعاف أقلها)، وانشالت البعيدة منها' : 'الطرق مختلفة كثير (أعلاها أكثر من 3 أضعاف أقلها)'
    return null
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
      case 'pe': return peNow(sym)
      case 'fpe': return q.non_gaap_price_to_earnings_per_share_forecast_next_fy
      case 'peg': return peg(sym)?.v
      case 'svr': return svrShown(sym)
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
    if (state.underCap) {
      const cap = { us: listSvr('us'), sa: listSvr('sa') }
      syms = syms.filter((s) => {
        const v = svrShown(s)
        return v != null && v < 3 * cap[marketOf(s)]?.mean
      })
    }
    const f = state.filter.trim().toLowerCase()
    if (f) syms = syms.filter((s) => (f.includes(':') ? s : s.split(':')[1]).toLowerCase().includes(f) || String(state.quotes[s]?.description ?? '').toLowerCase().includes(f))
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
      ${PARTS.map(([k, name, c, what]) => `<div class="tip-row"><i style="background:var(${c})"></i><span><b>${name}</b> ${what}</span><b class="n">${fmt(s.parts[k], 2)} / 2</b></div>`).join('')}
      <span class="dim">اضغط على السهم تشوف أرقام كل جزء.</span>`
  }

  // Renders asked for within one frame are drawn once; all = the whole table (the saved lists,
  // favourites, ideas and watchlists arriving at boot drew it 5 times).
  let pending = false
  let whole = false
  const dirty = new Set() // stocks computed since the last render (compute adds them)
  function scheduleRender(all = false) {
    whole ||= all
    if (pending) return
    pending = true
    requestAnimationFrame(() => { pending = false; const w = whole; whole = false; render(w ? undefined : dirty) })
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

  // render(dirty) redraws only those stocks' rows (and the open panel) while the drawn order still
  // holds: a whole table of 703 rows costs ~300 ms (2 s on a phone), and a refresh drew it once per
  // quote batch. Anything else draws the whole table.
  function render(only) {
    for (const m of ['us', 'sa', 'fav']) $(`cnt-${m}`).textContent = state.lists[m].length ? ` ${state.lists[m].length}` : ''
    for (const m of ['us', 'sa', 'big', 'sectors', 'fav']) $(`tab-${m}`).setAttribute('aria-selected', String(m === state.market))
    document.querySelector('.wrap').dataset.view = state.market
    const caps = state.market === 'sa' ? [listSvr('sa')] : state.market === 'fav' ? [listSvr('us'), listSvr('sa')] : [listSvr('us')]
    $('underCap').disabled = !caps.some(Boolean)
    if ($('underCap').disabled) { $('underCap').checked = false; state.underCap = false }
    $('underCap').parentElement.title = $('underCap').disabled ? 'يحتاج متوسط SVR لقائمتك (20 سهم أو أكثر بإيرادات فوق 10 مليون)، ويتحسب بعد ما تتحمل أسعار القائمة' : 'يخلي بس الأسهم الخسرانة اللي الـ SVR حقها تحت سقف Nanalyze (3 أضعاف متوسط قائمتك)'
    $('sectorsView').hidden = state.market !== 'sectors'
    if (state.market === 'sectors') { renderSectors(); return }
    const sortVal = `${state.sort.key}:${state.sort.dir}`
    if ([...$('sortSel').options].some((o) => o.value === sortVal)) $('sortSel').value = sortVal
    const body = $('rows')
    const syms = visible()
    $('shown').textContent = state.lists[state.market].length ? `يظهر ${syms.length} من ${state.market === 'big' ? Math.min(25, BIG.length) : state.lists[state.market].length}` : ''
    if (!state.lists[state.market].length && saved[state.market] === null) {
      body.innerHTML = '<tr><td colspan="14" class="dim">جاري قراءة قائمتك المحفوظة…</td></tr>'
      return
    }
    if (!state.lists[state.market].length && state.market === 'fav') {
      body.innerHTML = '<tr><td colspan="14" class="dim">ما عندك أسهم في المفضلة. اضغط ☆ جنب أي سهم في باقي التبويبات يجي هنا.</td></tr>'
      return
    }
    if (!state.lists[state.market].length) {
      body.innerHTML = '<tr><td colspan="14" class="dim">القائمة فاضية. اكتب رمز سهم أو اسمه فوق واضغط بحث.</td></tr>'
      return
    }
    if (!syms.length) {
      body.innerHTML = '<tr><td colspan="14" class="dim">ما فيه أسهم تطابق الفلترة.</td></tr>'
      return
    }
    // Keyboard focus stays on the row or button it was on (the star's render rebuilt it, and focus fell to the page).
    const a = document.activeElement
    const fk = body.contains(a) && ['sym', 'star', 'del'].find((k) => a.dataset[k])
    const backP = panelFocus()
    const refocus = () => { if (fk) body.querySelector(`[data-${fk}="${CSS.escape(a.dataset[fk])}"]`)?.focus({ preventScroll: true }); else backP() }
    const rows = body.querySelectorAll('tr.row')
    if (only && state.market !== 'big' && rows.length === syms.length && syms.every((s, i) => rows[i].dataset.sym === s)) {
      if (state.open) only.add(state.open)
      for (const sym of only) { const i = syms.indexOf(sym); if (i >= 0) { rows[i].outerHTML = rowHtml(sym); if (sym === state.open) redraw(sym) } }
      only.clear()
      refocus()
      return
    }
    dirty.clear()
    let lastSector = null
    body.innerHTML = syms.map((sym) => {
      const q = state.quotes[sym]
      let head = ''
      if (state.market === 'big' && (q?.sector ?? '') !== lastSector) {
        lastSector = q?.sector ?? ''
        const n = syms.filter((x) => (state.quotes[x]?.sector ?? '') === lastSector).length
        head = `<tr class="grp"><td colspan="14">${esc(lastSector ? nameAr(lastSector) : 'جاري التحميل…')} <span class="dim n">${n}</span></td></tr>`
      }
      return head + rowHtml(sym) + (state.open === sym ? `<tr class="detail"><td colspan="14">${detail(sym)}</td></tr>` : '')
    }).join('')
    refocus()

    // Once a stock has an error (TradingView does not know it, or its fetch failed), the cells it
    // can never fill show '—', not a loading skeleton.
    function rowHtml(sym) {
      const q = state.quotes[sym]
      const s = state.scores[sym]
      const f = state.fair[sym]
      const up = upside(sym)
      return `<tr class="row" data-sym="${esc(sym)}" tabindex="0" aria-expanded="${state.open === sym}">
        <td class="stock c-stock"><b>${starBtn(sym)}${esc(sym.split(':')[1])}${MAG7.has(sym) ? ' <em class="mag">من السبعة الكبار</em>' : ''}</b><span dir="auto">${esc(q?.description ?? '')}</span></td>
        <td class="n" data-label="السعر">${q ? `${money(q, q.close)}${Number.isFinite(q.change) ? ` <small class="${q.change >= 0 ? 'hi' : 'lo'}" title="تغير اليوم">${pct(q.change / 100, 1)}</small>` : ''}` : state.errors[sym] ? '—' : '<span class="skel"></span>'}</td>
        <td class="n ${weakFair(sym) ? 'dim' : ''}" data-label="${f?.profile === 'Pre-revenue' ? 'أرضية الكاش' : 'القيمة العادلة'}" title="${esc(weakFair(sym) ? `تقدير ضعيف: ${weakFair(sym)}` : f?.profile === 'Pre-revenue' ? 'بدون إيرادات: الكاش الصافي للسهم، أرضية مو قيمة عادلة' : '')}">${f?.fair ? money(q, f.fair) : (q && state.cache[sym]) || state.errors[sym] ? '—' : '<span class="skel"></span>'}</td>
        <td class="n ${up == null || weakFair(sym) ? 'dim' : up >= 0 ? 'hi' : 'lo'}" data-label="الفرق عن القيمة العادلة">${f?.profile === 'Pre-revenue' && f.fair ? '<span style="font-family:var(--body)">أرضية كاش</span>' : pct(up)}</td>
        <td class="c-wide" data-label="الدرجة من 10">${scoreCell(sym)}</td>
        <td class="c-wide c-exp">${expCell(sym)}</td>
        <td class="n c-more">${s?.detail ? pct(s.detail.gStar) : '—'}</td>
        <td class="n c-more" title="نمو الإيراد السنوي، ${gYears(sym)}">${s?.detail ? pct(s.detail.revG) : '—'}${s?.detail?.revG != null && gYears(sym) !== 'آخر 3 سنوات' ? ` <small class="dim">(${gYears(sym)})</small>` : ''}</td>
        <td class="n" data-label="مكرر الربح P/E">${fmt(peNow(sym))}</td>
        <td class="n" data-label="المكرر المتوقع Fwd P/E" title="${fyNext(q) ? `على توقع ربح سنة ${fyNext(q)} المالية` : ''}">${fmt(q?.non_gaap_price_to_earnings_per_share_forecast_next_fy)}</td>
        <td class="n" data-label="PEG">${pegCell(sym)}</td>
        <td class="n" data-label="SVR">${svrShown(sym) == null ? '—' : `${fmtSvr(svrShown(sym))}×`}</td>
        <td class="n c-more">${fmt(q?.altman_z_score_ttm)}</td>
        <td class="c-del"><button class="x" type="button" data-del="${esc(sym)}" aria-label="احذف ${esc(sym)}">×</button></td>
      </tr>`
    }
  }

  // Keyboard focus inside the open panel survives its rebuild: the same tile, link or button by position.
  const PF = 'summary, a, button'
  function panelFocus() {
    const k = [...($('rows').querySelector('tr.detail')?.querySelectorAll(PF) ?? [])].indexOf(document.activeElement)
    return () => k >= 0 && $('rows').querySelector('tr.detail')?.querySelectorAll(PF)[k]?.focus({ preventScroll: true })
  }

  // One stock's panel opened, closed or refreshed in place.
  function redraw(sym) {
    const tr = $('rows').querySelector(`tr.row[data-sym="${CSS.escape(sym)}"]`)
    if (!tr) return // not drawn (filtered out)
    const d = tr.nextElementSibling?.matches('tr.detail') ? tr.nextElementSibling : null
    tr.setAttribute('aria-expanded', String(state.open === sym))
    if (state.open !== sym) return d?.remove()
    const html = `<td colspan="14">${detail(sym)}</td>`
    const back = panelFocus()
    if (d) d.innerHTML = html
    else tr.insertAdjacentHTML('afterend', `<tr class="detail">${html}</tr>`)
    back()
  }

  // Analysts' forecast for the first fiscal year not reported yet, against the last reported fiscal
  // year on the same basis (information only: no history to test). TradingView's forecast EPS is
  // adjusted, as earnings_per_share_fy is; the last 12 months are GAAP and already hold part of the
  // forecast year (LLY: six months of it), so they are not the base. Banks: TradingView's revenue is
  // gross interest income while analysts forecast net revenue, so the two are not compared. A
  // revenue dip under 2% does not count as falling (UNH −0.35%). POST-HOC (2026-10-22): nor when a
  // gross loss comes with a net profit, TradingView's revenue then being net of funding costs (STNE:
  // net income 111% of it; analysts' gross revenue made +387% and a +60% DCF year 1, fair +642%).
  function analysts(q) {
    const rev = q.sector !== 'Finance' && !(q.gross_margin < 0 && q.net_income_ttm > 0) && q.revenue_forecast_next_fy > 0 && q.total_revenue_fy > 0 ? q.revenue_forecast_next_fy / q.total_revenue_fy - 1 : null
    const eps = Number.isFinite(q.earnings_per_share_forecast_next_fy) && q.earnings_per_share_fy > 0 ? q.earnings_per_share_forecast_next_fy / q.earnings_per_share_fy - 1 : null
    return { rev, eps, falling: (rev != null && rev < -0.02) || (eps != null && eps < -0.1) }
  }
  // The forecast fiscal year (TradingView's next_fy is the year after the last reported one).
  const fyNext = (q) => (Number.isFinite(Number(q?.fiscal_period_fy)) ? Number(q.fiscal_period_fy) + 1 : null)

  // P/E over the last 12 months (POST-HOC 2026-10-22): TradingView's, price ÷ diluted EPS; none when
  // diluted EPS is not positive (a loss for common holders: ALB, BYND). Market value ÷ the quote's
  // twelve months' net income (the saved quarters' when it has none) only when TradingView has no
  // P/E, or on Tadawul when that is over 10% higher (Aramco's bonus shares: 13.0 vs 15.2). It took the
  // saved net income, of another year without saved quarters (3007: 166.8 vs 12.4) and before preferred
  // dividends (CELH: 59.2 vs 124.6). On quoteShares, not every class: net income is Class A's.
  function peNow(sym) {
    const q = state.quotes[sym]
    if (!q || (Number.isFinite(q.earnings_per_share_diluted_ttm) && q.earnings_per_share_diluted_ttm <= 0)) return null
    const tv = q.price_earnings_ttm > 0 ? q.price_earnings_ttm : null
    const s = state.scores[sym]
    const ni = Number.isFinite(q.net_income_ttm) ? q.net_income_ttm : s?.period ? s.f0?.ni : null
    const own = quoteShares(q) > 0 && ni > 0 ? (q.close * quoteShares(q)) / ni : null
    return own && (!tv || (sym.startsWith('TADAWUL:') && own > 1.1 * tv)) ? own : tv
  }

  // Forward PEG on one year's growth: forward P/E ÷ analysts' EPS growth for the forecast fiscal year
  // over the last reported one, in %, both on adjusted EPS (LLY 37.45 ÷ 41.6 = 0.90; Zacks, finviz and
  // Yahoo divide by 3–5-year growth instead). Only without a forecast: P/E ÷ the last 3 fiscal years' EPS
  // growth, marked historical. A forecast of falling EPS gives no PEG rather than past growth.
  // Growth over 50% in one year is flagged: it rarely lasts, and it is often a one-off (GOOGL 2026:
  // +90% from gains on its stakes, PEG 0.18).
  function peg(sym) {
    const q = state.quotes[sym]
    if (!q) return null
    const g = analysts(q).eps
    const fpe = q.non_gaap_price_to_earnings_per_share_forecast_next_fy
    if (g != null) return g > 0 && fpe > 0 ? { v: fpe / (100 * g), past: false, jump: g > 0.5 ? g : null } : null
    const h = state.scores[sym]?.detail?.epsG
    const pe = peNow(sym)
    return pe > 0 && h > 0 ? { v: pe / (100 * h), past: true } : null
  }

  // SVR today (Nanalyze): market value ÷ (latest quarter's revenue × 4); none under 10 million a
  // year, which they leave out too.
  const fmtSvr = (v) => fmt(v, v < 1 ? 2 : 1)
  const svrNow = (q) => (mv(q) > 0 && 4 * q.total_revenue_fq >= 1e7 ? mv(q) / (4 * q.total_revenue_fq) : null)
  // Shown only for a company that has not turned profitable yet, as Nanalyze uses it: a loss over
  // the last 12 months and in each of the last three fiscal years (Ford or American Airlines in a
  // bad year are not that kind of company; for them the P/E history says more). The list mean
  // (the ceiling) still counts every stock, as their catalog average does.
  function preProfit(sym) {
    const eps = state.quotes[sym]?.earnings_per_share_diluted_ttm
    const fy = (state.scores[sym]?.known ?? []).slice(-3)
    return Number.isFinite(eps) && eps <= 0 && fy.length > 0 && fy.every((f) => !(f.ni > 0))
  }
  const svrShown = (sym) => (preProfit(sym) ? svrNow(state.quotes[sym]) : null)
  // Their "catalog average" here: the mean SVR of a market's list. They do not buy above three times
  // it. Computed once nine in ten of the list's quotes are in, and saved (meta/svr), so another tab
  // (favourites) has it before that market's quotes are loaded.
  function listSvr(market) {
    const list = state.lists[market]
    const vs = list.map((s) => svrNow(state.quotes[s])).filter((v) => v != null)
    if (list.filter((s) => state.quotes[s]).length < 0.9 * list.length || vs.length < 20) return state.svrMean[market] ?? null
    const m = { mean: vs.reduce((a, b) => a + b, 0) / vs.length, n: vs.length }
    const old = state.svrMean[market]
    if (!(old && Math.abs(old.mean / m.mean - 1) < 0.02)) {
      state.svrMean = { ...state.svrMean, [market]: m }
      // update, not set: a full write here could drop the other market's mean (its read may not be back yet).
      if (db) { const d = db.doc('meta/svr'); (d.update ? d.update({ [market]: m }) : d.set(state.svrMean)).catch(() => d.set(state.svrMean).catch(() => {})) }
    }
    return m
  }

  // Favourites (meta/favorites): a star on every row, their own tab.
  const starBtn = (sym) => {
    const on = state.lists.fav.includes(sym)
    return `<button class="star" type="button" data-star="${esc(sym)}" aria-pressed="${on}" aria-label="${on ? 'شيل من المفضلة' : 'أضف للمفضلة'} ${esc(sym)}" title="${on ? 'شيل من المفضلة' : 'أضف للمفضلة'}">${on ? '★' : '☆'}</button>`
  }
  function toggleFav(sym) {
    if (notLoaded('fav')) return
    const on = !state.lists.fav.includes(sym)
    state.lists.fav = on ? [...state.lists.fav, sym] : state.lists.fav.filter((s) => s !== sym)
    if (!on) undoNotice('fav', sym)
    editSaved('fav', sym, on).then(render)
    render()
  }

  const pegCell = (sym) => {
    const p = peg(sym)
    if (!p) return '—'
    const note = p.past ? ' <small class="dim" dir="rtl" title="ما فيه توقعات محللين: محسوب على نمو أرباح آخر 3 سنين">(تاريخي)</small>'
      : p.jump ? ` <small class="dim" dir="rtl" title="المحللين متوقعين نمو ${pct(p.jump, 0)} بسنة وحدة. نمو بهالحجم نادراً يستمر وغالباً من أرباح مرة وحدة، فالـPEG هنا يبيّن السهم أرخص من حقيقته.">(نمو استثنائي)</small>` : ''
    return `${fmt(p.v, 2)}${note}`
  }

  function expCell(sym) {
    const e = state.exp[sym]
    const q = state.quotes[sym]
    const chips = []
    if (e?.flag === 'red') chips.push('<span class="chip red" title="سعره يفترض نمو أسرع بكثير من اللي تسويه الشركة فعلاً، ونموها قاعد يبطّي. انتبه وراجع قبل تشتري، مو إشارة بيع.">سعره أعلى من أدائه</span>')
    if (e?.flag === 'green') chips.push('<span class="chip green" title="السوق مسعّره كأنه بينمو أبطأ بكثير من اللي يسويه فعلاً، ونموه مستمر. يستاهل تدرسه، مو إشارة شراء.">سعره أقل من أدائه</span>')
    // Calendar days in the viewer's time zone, the date dateOf prints (whole 24 hours said 'tomorrow' on the day itself).
    const days = Number.isFinite(q?.earnings_release_next_date) ? Math.floor(q.earnings_release_next_date / 86400) - dayNo(Date.now()) : null
    if (days != null && days >= 0 && days <= 14) chips.push(`<span class="chip" title="موعد إعلان النتايج الجاي: ${dateOf(q.earnings_release_next_date)}. السعر يتحرك أكثر من العادة حول التقرير.">${days === 0 ? 'تقريره اليوم' : days === 1 ? 'تقريره بكرة' : days === 2 ? 'تقريره بعد يومين' : `تقريره بعد ${days} ${days <= 10 ? 'أيام' : 'يوم'}`}</span>`)
    if (q && analysts(q).falling) chips.push('<span class="chip amber" title="المحللين متوقعين إن إيراداته تنزل أكثر من 2%، أو ربح السهم ينزل أكثر من 10%، في سنة التوقع المالية مقارنة بآخر سنة معلنة.">المحللين متوقعين نزول</span>')
    return chips.join(' ') || '<span class="dim">—</span>'
  }

  // The viewer's calendar day (local time zone): a day number, and as YYYY-MM-DD.
  const dayNo = (ms) => { const d = new Date(ms); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 }
  // A report's day is its UTC date, the exchange's own (every TradingView report time falls 06:00–23:59
  // UTC), so a US after-close report stays on its US date for a viewer in Riyadh; today is the viewer's.
  const dateOf = (sec) => (Number.isFinite(sec) ? new Date(sec * 1000).toISOString().slice(0, 10) : '—')

  // Study 14's confirmed rank, T3 (PROTOCOL-study14.md §3, §7): −ln(diluted shares of the last fiscal
  // year ÷ the year before), shares = net income ÷ EPS, both years with |EPS| ≥ 0.25 of the same
  // sign; ranked within its sector among the loaded stocks of the same market (at least 5).
  function issuance(sym) {
    const [f1, f0] = (state.scores[sym]?.known ?? []).slice(-2)
    const ok = (f) => Math.abs(f?.eps) >= 0.25 && f.ni / f.eps > 0
    if (!ok(f0) || !ok(f1) || f0.year !== f1.year + 1 || Math.sign(f0.eps) !== Math.sign(f1.eps)) return null
    return { x: -Math.log((f0.ni / f0.eps) / (f1.ni / f1.eps)), y0: f0.year, y1: f1.year }
  }
  function issuanceRank(sym) {
    const sector = state.quotes[sym]?.sector
    const rows = Object.keys(state.scores).filter((s) => marketOf(s) === marketOf(sym) && state.quotes[s]?.sector === sector)
      .map((s) => ({ key: s, sector, x: issuance(s)?.x }))
    const p = sectorPercentiles(rows).get(sym)
    return p == null ? null : { p, n: rows.filter((r) => Number.isFinite(r.x)).length }
  }
  function issuanceBlock(sym) {
    const t = issuance(sym)
    const head = '<h3><span>شراء الشركة لأسهمها</span><span class="hi">مؤشر نجح في الاختبار</span></h3>'
    const test = '<p class="dim">في اختبارنا (دراسة 14، 815 سهم أمريكي، كل مايو من 2012 لين 2025، داخل كل قطاع): الخُمس اللي نزّل عدد أسهمه أكثر تفوق على الخُمس اللي زوّده أكثر بمتوسط <b class="n">+6.0%</b> بالسنة، في 12 من 14 سنة، والنتيجة ما تجي بالصدفة. بين أكبر 300 شركة الفرق أصغر بكثير (<span class="n">+1.9%</span>). هذا متوسط مجموعات، مو ضمان لسهم واحد، وعلى السعر بدون التوزيعات.</p>'
    if (!t) return `<div class="part iss" style="grid-column:1/-1">${head}<p class="dim">ما ينحسب لهذا السهم: يحتاج ربح أو خسارة للسهم 0.25 أو أكثر بآخر سنتين ماليتين، وبنفس الاتجاه.</p>${test}</div>`
    const ch = Math.exp(-t.x) - 1
    const what = Math.abs(ch) < 0.005 ? 'ما تغيّر تقريباً' : ch < 0 ? `نزل <b class="n hi">${pct(-ch, 1).replace('+', '')}</b> (الشركة اشترت أسهمها أكثر من اللي أصدرت)` : `زاد <b class="n lo">${pct(ch, 1).replace('+', '')}</b> (أصدرت أسهم جديدة: تعويضات موظفين أو استحواذ أو زيادة رأس مال)`
    const r = issuanceRank(sym)
    const side = r && r.p >= 0.8 ? ' — <b class="hi">من أعلى خُمس بقطاعها</b>' : r && r.p <= 0.2 ? ' — <b class="lo">من أدنى خُمس بقطاعها</b>' : ''
    const rank = r ? `<p>بين <span class="n">${r.n}</span> ${r.n <= 10 ? 'أسهم' : 'سهم'} من قطاعها في القائمة: نزّلت عدد أسهمها أكثر من <b class="n">${Math.round(100 * r.p)}%</b> منها${side}.</p>` : '<p class="dim">ما فيه 5 أسهم من قطاعها بالقائمة عشان نرتبها.</p>'
    return `<div class="part iss" style="grid-column:1/-1">${head}<p>عدد أسهمها المخففة ${what} بين سنتها المالية <span class="n">${t.y1}</span> و<span class="n">${t.y0}</span>.</p>${rank}${test}</div>`
  }

  function expBlock(sym) {
    const e = state.exp[sym]
    const q = state.quotes[sym] || {}
    const a = analysts(q)
    const fin = q.sector === 'Finance'
    const f0 = state.scores[sym]?.f0 // the record the engine read: the saved 12 months, or the last fiscal year
    const flagTxt = !e ? (fin ? 'ما ينحسب للبنوك والشركات المالية: تدفقها النقدي يتحرك مع الودائع والقروض، فما يدل على شي.'
      : f0?.fcf < 0 ? `ما ينحسب (التدفق النقدي الحر سالب ${f0.period ? 'لآخر 12 شهر' : `بسنة ${f0.year} المالية`}).` : 'ما ينحسب (بيانات التدفق النقدي الحر ناقصة).')
      : e.flag === 'red' ? '<b class="lo">سعره أعلى من أدائه:</b> السعر الحالي يفترض إن الشركة بتنمو أسرع بكثير من اللي تسويه فعلاً، ونموها قاعد يبطّي. لو طلعت نتايجها أقل من المتوقع ممكن ينزل بقوة. انتبه وراجع قبل تشتري، بس مو إشارة بيع.'
      : e.flag === 'green' ? '<b class="hi">سعره أقل من أدائه:</b> السوق مسعّره كأن الشركة بتنمو أبطأ بكثير من اللي تسويه فعلاً، ونموها مستمر. ممكن تكون فرصة تستاهل تدرسها، بس مو إشارة شراء.'
      : 'ما فيه تنبيه: السعر ماشي مع أداء الشركة تقريباً.'
    const news = state.news[sym]
    const newsHtml = news === undefined ? '<p class="dim">جاري جلب الأخبار…</p>'
      : news?.error ? `<p class="dim">${esc(news.error)}</p>`
      : news.length ? `<ul class="news">${news.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="dim n">${dateOf(n.published)} · ${esc(n.provider?.name ?? '')}</span></li>`).join('')}</ul>`
      : '<p class="dim">ما فيه أخبار حديثة.</p>'
    return `<div class="part" style="grid-column:1/-1">
      <h3><span>وش ينتظره السوق</span><span class="dim">التقرير الجاي <span class="n">${dateOf(q.earnings_release_next_date)}</span></span></h3>
      <p>${flagTxt}</p>
      ${fin || !e ? '' : `<p>السعر يفترض نمو <b class="n">${pct(e?.gStar)}</b> سنوياً · الشركة حققت <b class="n">${pct(e?.revG)}</b> (${gYears(sym)}) و<b class="n">${pct(e?.yoy)}</b> آخر سنة · الفرق <b class="n">${pct(e?.gap)}</b></p>`}
      <p>توقع المحللين لسنة ${fyNext(q) ?? 'التوقع'} المالية: ${fin ? '' : `الإيرادات <b class="n ${a.rev < 0 ? 'lo' : ''}">${pct(a.rev)}</b> · `}ربح السهم المعدّل <b class="n ${a.eps < 0 ? 'lo' : ''}">${pct(a.eps)}</b> مقارنة بسنة ${fyNext(q) ? fyNext(q) - 1 : 'آخر سنة'} المعلنة. آخر تقرير: الربح جا ${Number.isFinite(q.eps_surprise_percent_fq) ? `${q.eps_surprise_percent_fq >= 0 ? 'أعلى' : 'أقل'} من توقع المحللين بـ <b class="n">${pct(Math.abs(q.eps_surprise_percent_fq) / 100).replace('+', '')}</b>` : '<b class="n">—</b>'}، والإيرادات ${Number.isFinite(q.revenue_surprise_percent_fq) ? `${q.revenue_surprise_percent_fq >= 0 ? 'أعلى' : 'أقل'} بـ <b class="n">${pct(Math.abs(q.revenue_surprise_percent_fq) / 100).replace('+', '')}</b>` : '<b class="n">—</b>'}.</p>
      <p class="dim">جربنا الأحمر والأخضر على 819 سهم من 2012 لين 2025: الأحمر ما نزل أكثر من غيره، والأخضر ما طلع أكثر من غيره، في المتوسط. فخذها كتنبيه تسأل عنه، مو قرار شراء أو بيع.</p>
      <h3 style="margin-top:6px"><span>آخر الأخبار</span></h3>${newsHtml}
    </div>`
  }

  function ideasBlock(sym) {
    const list = (state.ideas[sym] ?? []).slice().sort((x, y) => String(y.date ?? '').localeCompare(String(x.date ?? '')))
    const q = state.quotes[sym] || {}
    if (!list.length) return '<div class="part" style="grid-column:1/-1"><h3><span>أفكار منشورة</span></h3><p class="dim">ما فيه أفكار مسجلة لهذا السهم للحين. ندوّر عليها في Value Investors Club يوم 1 و15 من كل شهر.</p></div>'
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
        return `<li><div><a dir="auto" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title || i.source)}</a> <span class="dim">${esc(i.source)} · <span class="n">${esc(i.date || 'تاريخ غير معروف')}</span>${i.side ? ' · ' + (i.side === 'short' ? 'بيع' : 'شراء') : ''}</span></div>
          ${i.summary ? `<p>${esc(i.summary)}</p>` : ''}
          ${base ? `<p class="dim">السعر وقتها <span class="n">${fmt(base, dp(q))}</span>${adj ? ' (معدّل للتقسيمات، إغلاق ذاك الشهر)' : ' (كما ذكره المصدر)'} · من وقتها <b class="n ${since >= 0 ? 'hi' : 'lo'}">${pct(since)}</b></p>` : ''}</li>`
      }).join('')}</ul></div>`
  }

  // A failed answer is asked again when the stock is opened again ("جرّب بعد شوي"), unless the daily quota ran out.
  async function loadNews(sym) {
    const n = state.news[sym]
    if (!mcp || (n !== undefined && !(n?.error && !n.quota))) return
    if (n) { delete state.news[sym]; if (state.open === sym) redraw(sym) }
    try {
      const p = await call(T.news, { symbol: sym, limit: 6 }, { staleTime: 300000, gcTime: 3600000 })
      state.news[sym] = (p?.data?.headlines ?? []).slice(0, 6)
    } catch (e) {
      state.news[sym] = { error: explainError(e), quota: /quota/i.test(`${e?.code} ${e?.message}`) }
    }
    if (state.open === sym) redraw(sym)
  }

  function fairBlock(sym) {
    const f = state.fair[sym]
    const q = state.quotes[sym] || {}
    if (!f) return '<div class="part"><h3><span>القيمة العادلة</span><span class="n dim">—</span></h3><p>ما تكفي البيانات لحسابها.</p></div>'
    const rows = METHODS.map((m, i) => {
      const w = f.weights[i]
      const v = f.values[m]
      if (!(w > 0) && !(v > 0)) return ''
      if (m === 'dcf' && q.sector === 'Finance' && !(w > 0)) return '' // a bank's FCF moves with deposits (GS: $13,117 against $891)
      if (m === 'pb' && !(v > 0)) return `<div class="off"><span>${METHOD_NAMES[m]}</span><b>ما فيه تاريخ للقيمة الدفترية</b></div>`
      const gone = f.dropped?.includes(m)
      const used = w > 0 && v > 0 && !gone
      return `<div class="${used ? '' : 'off'}"><span>${METHOD_NAMES[m]}${w > 0 ? ` · ${Math.round(w * 100)}%` : ''}${gone ? ' · انشالت' : ''}</span><b class="n">${v > 0 ? fmt(v, dp(q)) : '—'}</b></div>`
    }).join('')
    const pre = f.profile === 'Pre-revenue'
    const d = f.dcf
    const capped = (f.capped ?? []).filter((m) => f.weights[METHODS.indexOf(m)] > 0) // only methods this profile weights
    const noQ = !state.scores[sym]?.period && state.scores[sym]?.f0?.year
    const notes = [
      f.profile === 'Unprofitable growth' ? `${f.values.dcf > 0 ? 'الشركة تخسر (ربح السهم سالب)، فـ DCF العادي يبان للمقارنة بدون وزن، والقيمة العادلة' : 'DCF العادي (على التدفق النقدي) ما ينحسب لأن تدفقها سالب، فالقيمة العادلة'} فوق من طريقة وحدة: P/S مقارنة بتاريخ السهم، وتقيس وش دفع السوق قبل.${state.rdcf[sym] && !state.rdcf[sym].why ? ' تحت: DCF على إيراداتها للمقارنة.' : ''}` : '',
      d?.g1 != null ? `DCF: نمو أول سنة <b class="n">${pct(d.g1)}</b> (توقع المحللين للمبيعات)، يهدأ لين 2.5% بالسنة العاشرة، ومعدل خصم <b class="n">${pct(d.r, 1).replace('+', '')}</b>${d.beta != null ? ` (حسب بيتا <span class="n">${fmt(d.beta, 2)}</span>)` : ''}.` : '',
      f.values.ev > 0 ? 'EV هنا = القيمة السوقية + الدين (بدون خصم الكاش).' : '',
      capped.length ? `${capped.map((m) => METHOD_NAMES[m]).join('، ')}: السعر اليوم فوق 100 ضعف الربح أو EBITDA، فما انحسبت.` : '',
      f.dropped?.length ? `${f.dropped.map((m) => `${METHOD_NAMES[m]} (${f.values[m] > f.med ? 'أكثر من 3 أضعافه' : 'أقل من ثلثه'})`).join(' و')}: بعيدة عن الوسيط الموزون لطرق السهم (<b class="n">${fmt(f.med, dp(q))}</b>)، فانشالت من المتوسط. دراسة 16: كذا صارت القيمة أقرب للسعر بعد سنة في 12 من 14 سنة.` : '',
      noQ ? `الأرقام من سنة <span class="n">${noQ}</span> المالية: ما عندنا أرباع محفوظة لهالسهم للحين، وتنجاب بالتحديث الجاي.` : '',
      weakFair(sym) ? `<b>تقدير ضعيف:</b> ${weakFair(sym)}.` : '',
      Number.isFinite(q.price_target_1y) ? `للمقارنة: متوسط هدف المحللين <b class="n">${fmt(q.price_target_1y, dp(q))}</b>.` : '',
    ].filter(Boolean)
    return `<div class="part" style="grid-column:1/-1">
      <h3><span>${pre ? 'أرضية الكاش' : 'القيمة العادلة'} · ${esc(PROFILE_AR[f.profile] || f.profile)}</span><span class="n ${weakFair(sym) ? 'dim' : ''}">${f.fair ? fmt(f.fair, dp(q)) : '—'} <span class="${upside(sym) == null ? 'dim' : upside(sym) >= 0 ? 'hi' : 'lo'}">${pct(upside(sym))}</span></span></h3>
      <p>${pre ? 'الشركة بدون إيرادات، فما فيه قيمة عادلة. الرقم هو الكاش الصافي للسهم: أرضية، مو هدف.' : `متوسط موزون للطرق المناسبة لنوع الشركة. الطرق اللي بدون بيانات تنشال وتتوزع أوزانها على الباقي، ولما يكون فيه 3 طرق أو أكثر، اللي تقييمها أكثر من 3 أضعاف وسيطها الموزون أو أقل من ثلثه تنشال بعد (تغطية البيانات <b class="n">${Math.round(f.coverage * 100)}%</b>). أقل وأعلى تقييم: <b class="n">${fmt(f.low, dp(q))} – ${fmt(f.high, dp(q))}</b>، والسعر <b class="n">${fmt(q.close, dp(q))}</b>.`}</p>
      ${notes.length ? `<p class="dim">${notes.join(' ')}</p>` : ''}
      <div class="fair-list">${rows}</div>
      ${rdcfBlock(sym)}
    </div>`
  }

  // The digits isolated as LTR, the unit word left in the RTL sentence.
  const big = (x) => (!Number.isFinite(x) ? '—' : Math.abs(x) >= 1e9 ? `<span class="n">${fmt(x / 1e9, 1)}</span> مليار` : `<span class="n">${fmt(x / 1e6, 0)}</span> مليون`)

  // Revenue DCF for a loss-maker (engine/rdcf.js), US listings only (US rates): the default value,
  // the margin and growth the price implies, and a margin × growth grid. Histories come from the
  // saved fiscal years (newest first, as TradingView's *_fy_h).
  function rdcfFor(sym, funds) {
    const q = state.quotes[sym]
    const qq = { ...q, total_revenue_fy_h: funds.map((f) => f.rev).reverse(), net_income_fy_h: funds.map((f) => f.ni).reverse() }
    const o = { shares: allShares(q), peers: PEERS }
    const d = rdcf(qq, o)
    if (d.why) return d
    const m = impliedInput(qq, 'm', -0.1, 0.6, o)
    const tooHigh = m == null && rdcf(qq, { ...o, m: 0.6 }).raw < q.close
    const ms = [d.m, 0.1, 0.15, 0.2].filter((x, i, a) => a.findIndex((y) => Math.abs(y - x) < 0.01) === i).sort((a, b) => a - b)
    const gs = [d.G, 0.15, 0.3, 0.45].filter((x, i, a) => a.findIndex((y) => Math.abs(y - x) < 0.01) === i).sort((a, b) => a - b)
    return { ...d, implied: m, tooHigh, impliedG: tooHigh ? impliedInput(qq, 'G', 0.025, 1.5, o) : null, ms, gs,
      grid: ms.map((mm) => gs.map((G) => rdcf(qq, { ...o, m: mm, G }).raw)),
      gm5: Math.max(...funds.slice(-5).map((f) => (f.gp != null && f.rev > 0 ? f.gp / f.rev : -Infinity))) } // best gross margin, 5 years
  }
  function rdcfBlock(sym) {
    const d = state.rdcf[sym]
    if (!d) return ''
    const q = state.quotes[sym] || {}
    if (d.why) return `<div class="rdcf"><h4>DCF على الإيرادات</h4><p class="dim">ما ينحسب: ${esc(d.why)}</p></div>`
    const peer = d.mFrom.from === 'industry' ? `وسط الشركات الرابحة اللي إيرادها فوق مليار في صناعتها (${esc(nameAr(d.mFrom.key))}، <span class="n">${d.mFrom.n}</span> ${d.mFrom.n <= 10 ? 'شركات' : 'شركة'})`
      : d.mFrom.from === 'sector' ? `وسط الشركات الرابحة الكبيرة في قطاعها (${esc(nameAr(d.mFrom.key))})` : 'افتراضي'
    const mWord = d.mFrom.from === 'industry' ? 'صناعتها' : d.mFrom.from === 'sector' ? 'قطاعها' : 'الافتراضي'
    const mAt = d.mFrom.from === 'industry' ? 'وبهامش صناعتها' : d.mFrom.from === 'sector' ? 'وبهامش قطاعها' : 'وبالهامش الافتراضي'
    const fromAn = d.growthFrom === 'analysts'
    const head = d.raw < 0 ? `<b class="lo">أقل من صفر</b>: بهذا الهامش أرباحها ما تغطي الحرق والديون` : `<span class="n"><b>${money(q, d.value)}</b> <span class="${d.value >= q.close ? 'hi' : 'lo'}">${pct(d.value / q.close - 1)}</span></span>`
    const implied = d.implied != null ? `السعر اليوم <b class="n">${money(q, q.close)}</b> يفترض إنها توصل لهامش تشغيلي <b class="n">${pct(d.implied, 1).replace('+', '')}</b> (${mWord}: <span class="n">${pct(d.m, 1).replace('+', '')}</span>).`
      : d.tooHigh ? `حتى هامش 60% ما يبرر السعر اليوم${d.impliedG != null ? `. ${mAt} (<span class="n">${pct(d.m, 1).replace('+', '')}</span>) السعر يفترض نمو مبيعات <b class="n">${pct(d.impliedG, 0).replace('+', '')}</b> بالسنة لين السنة الخامسة` : ''}.` : 'السعر أقل من القيمة حتى بهامش سالب.'
    const cell = (v) => `<td class="n ${v > q.close ? 'hi' : ''}">${v > 0 ? fmt(v, dp(q)) : '<span class="dim">0</span>'}</td>`
    const grid = `<div class="gridwrap"><table class="ptable"><thead><tr><th>الهامش ↓ · النمو ←</th>${d.gs.map((g) => `<th class="n">${pct(g, Math.abs(g * 100 - Math.round(g * 100)) > 1e-6 ? 1 : 0).replace('+', '')}${Math.abs(g - d.G) < 1e-9 ? '*' : ''}</th>`).join('')}</tr></thead><tbody>
      ${d.ms.map((m, i) => `<tr><th class="n">${pct(m, 1).replace('+', '')}${Math.abs(m - d.m) < 1e-9 ? '*' : ''}</th>${d.grid[i].map(cell).join('')}</tr>`).join('')}</tbody></table></div>`
    const share = d.dilution == null ? '' : d.dilution < 0.01 ? ' (أقل من 1% من قيمتها السوقية)' : ` (<b class="n">${pct(d.dilution, 0).replace('+', '')}</b> من قيمتها السوقية)`
    const flags = [
      // A real burner must raise the money; a company with positive free cash flow only dips in the model.
      d.gap > 0 && d.runway != null && Number.isFinite(d.runway) ? `قبل ما يصير تدفقها النقدي موجب تحتاج تجمع حوالي <b>${big(d.gap)}</b>${share} من أسهم جديدة أو ديون${d.dilution > 0.5 ? '، فالقيمة هنا حد أعلى' : ''}.`
        : d.gap > 0 && d.runway != null ? `بهذي الافتراضات (الربح التشغيلي المحاسبي واستثمار النمو) الكاش يخلص وينقصها حوالي <b>${big(d.gap)}</b> قبل ما يرجع يرتفع.` : '',
      `احتمال تفلس قبل ما تربح: <b class="n">${pct(d.pFail, 0).replace('+', '')}</b> (${d.runway == null ? 'رصيد الكاش غير معروف' : Number.isFinite(d.runway) ? `الكاش يكفيها <span class="n">${fmt(d.runway, 1)}</span> سنة` : 'ما تحرق كاش'}).`,
    ].filter(Boolean)
    return `<div class="rdcf"><h4>DCF على الإيرادات <span class="dim">(للمقارنة، ما يدخل في القيمة العادلة)</span></h4>
      <p>بهامش تشغيلي <b class="n">${pct(d.m, 1).replace('+', '')}</b>، ${peer}${Number.isFinite(d.gm5) && d.m > d.gm5 ? `، وهذا أعلى من أعلى هامش ربح إجمالي حققته آخر 5 سنين (<span class="n">${pct(d.gm5, 0).replace('+', '')}</span>)، فالقيمة متفائلة` : ''}: ${head}.</p>
      <p>${implied}</p>
      ${grid}
      <p class="dim">قيمة السهم حسب هامش التشغيل اللي توصل له (الصفوف) ونمو المبيعات من السنة الثانية للخامسة (الأعمدة). * = الافتراض الأساسي (النمو من ${fromAn ? 'توقع المحللين' : `نمو مبيعاتها آخر 3 سنين، ${q.revenue_forecast_next_fy > 0 ? 'توقع المحللين فوق 10 أضعاف مبيعاتها فما اعتمدناه' : 'ما فيه توقع للمحللين'}`}، بين 2.5% و30%). الأخضر فوق سعر اليوم.</p>
      <p class="dim">${flags.join(' ')}</p>
      <details data-k="rdcf"${state.ctxOpen.has('rdcf') ? ' open' : ''}><summary>كيف ينحسب؟</summary><p class="dim">نتوقع مبيعات الشركة 10 سنين: ${fromAn ? 'السنة الحالية من توقعات المحللين، بعدها نموهم' : 'السنة الحالية بنمو مبيعاتها آخر 3 سنين، بعدها نفس النمو'} (بين 2.5% و30%) لين السنة الخامسة، ثم يهدأ لين 2.5%. كل مبيعات جديدة تربح بهامش الشركات الرابحة الكبيرة في صناعتها، وخسارة اليوم تنكمش لين تختفي خلال 7 سنين. نخصم الاستثمار اللي يحتاجه النمو (كل 1.5 دولار مبيعات إضافية تحتاج دولار) والضريبة بعد ما تخلص الخسائر المرحّلة، ونرجّع كل هذا لليوم بعائد مطلوب بين 9% و13% حسب تذبذب السهم (بيتا)، ينزل لين 8.7% بالسنة العاشرة. بعدين نطرح الديون ونضيف الكاش، ونحسب احتمال إن الشركة تفلس قبل ما تربح. طريقة Damodaran للشركات الصغيرة اللي تخسر. ما اختبرناها على أسعار سابقة، فخذها كمرجع: أهم رقم فيها الهامش اللي يفترضه السعر.</p></details>
    </div>`
  }

  function projBlock(sym) {
    const p = state.proj[sym]
    if (!p) return ''
    const q = state.quotes[sym] || {}
    const cur = q.currency === 'SAR' ? 'ريال' : q.currency === 'USD' ? 'دولار' : esc(q.currency ?? '')
    const y0 = new Date().getFullYear()
    let body
    if (p.kind === 'pre') {
      const cash = state.fair[sym]?.values?.cash
      body = `<p>الشركة بدون إيرادات كافية نرسم لها مسار سعر (إيراداتها <b>${big(p.rev)}</b> ${cur}). بدل التخمين: عشان سعرها اليوم يكون منطقي، تحتاج إيرادات سنوية حوالي <b>${big(p.revNeeded)}</b> ${cur} بعد 5 سنوات${p.rev > 0 ? ` (<b class="n">${fmt(p.revNeeded / p.rev, 0)}×</b> إيرادات اليوم)` : ''}.</p>
        <p class="dim">الحسبة: القيمة السوقية اليوم تكبر 9% سنوياً (العائد اللي تطلبه) لـ 5 سنوات، وتقسم على 3 (شركة ناضجة: مكرر ربح 20 × هامش ربح 15%).${cash ? ` الكاش الصافي للسهم اليوم: <b class="n">${fmt(cash, dp(q))}</b>.` : ''}</p>`
    } else {
      const cell = (x, cls = '') => `<td class="n ${cls}">${x}</td>`
      const row = (label, xs, f = (x) => fmt(x, dp(q)), cls = () => '') => `<tr><th>${label}</th>${xs.map((x) => cell(f(x), cls(x))).join('')}</tr>`
      const years = p.rows.map((r) => `<tr><th class="n">${y0 + r.t}</th>${cell(fmt(r.bear, dp(q)))}${cell(fmt(r.base, dp(q)))}${cell(fmt(r.bull, dp(q)))}</tr>`).join('')
      const multName = (b) => (b === 'pe' ? 'P/E' : 'P/S')
      body = `<table class="ptable"><thead><tr><th></th><th>متشائم</th><th>أساسي</th><th>متفائل</th></tr></thead><tbody>
          <tr class="now"><th>اليوم</th>${cell(fmt(p.price, dp(q))).repeat(3)}</tr>${years}
          <tr class="sum"><th>العائد سنوياً</th>${p.yearly.map((x) => cell(pct(x, 1), x >= 0 ? 'hi' : 'lo')).join('')}</tr>
          ${row('كم يسوى سعر ' + (y0 + 5) + ' بفلوس اليوم', p.today)}
          <tr class="grp"><th colspan="4">الافتراضات</th></tr>
          ${row('نمو الإيرادات أول سنة', p.growth, ([a]) => pct(a))}
          ${row('نمو الإيرادات السنة الخامسة', p.growth, ([, b]) => pct(b))}
          ${p.margin ? row('هامش صافي الربح', p.margin, (x) => pct(x, 1)) : ''}
          ${row('المكرر بالسنة الخامسة', p.exitMult.map((x, i) => [x, p.basis[i]]), ([x, b]) => `${multName(b)} ${fmt(x, 1)}`)}
        </tbody></table>
        <p>النمو الأساسي من ${p.growthFrom === 'analysts' ? 'توقع المحللين لإيرادات السنة الجاية' : `نمو الإيرادات ${gYears(sym)}`}، ويهدأ تدريجياً. ${p.margin ? 'الهامش: أقل ومتوسط وأعلى هامش في آخر 3 سنوات.' : 'الشركة ما تربح، فالسعر = المبيعات للسهم × مكرر المبيعات.'} المكرر يتحرك من مكرر اليوم إلى ${p.own == null ? `مكرر عام (<b class="n">${fmt(p.normal, 1)}</b>) لأن تاريخ السهم ما يكفي` : p.own > p.normal ? `متوسط السهم آخر 5 سنوات (<b class="n">${fmt(p.own, 1)}</b>، حدّيناه بـ <b class="n">${fmt(p.normal, 1)}</b> لأن النمو يهدأ مع الوقت)` : p.own < p.normal ? `<b class="n">${fmt(p.normal, 1)}</b> (متوسط السهم <b class="n">${fmt(p.own, 1)}</b> أقل من الحد الأدنى)` : `متوسط السهم نفسه آخر 5 سنوات (<b class="n">${fmt(p.normal, 1)}</b>)`} × 0.75 / 1 / 1.25.${p.basis.includes('ps') && p.margin ? ' السيناريو اللي هامشه صفر أو سالب مسعّر على المبيعات.' : ''}</p>
        <p class="dim">"قيمتها اليوم" = سعر ${y0 + 5} مخصوم 9% سنوياً: لو أعلى من سعر اليوم، السيناريو يعطي أكثر من 9% بالسنة. عدد الأسهم ثابت (ما حسبنا إعادة الشراء ولا الإصدار)، والتوزيعات مو داخلة.${p.kind === 'sales' && q.free_cash_flow_ttm < 0 ? ' <b>انتبه:</b> الشركة تحرق كاش، والسيناريو ما يحسب الأسهم الجديدة اللي غالباً بتصدرها لتمويل الحرق، فممكن يطلع أعلى من الواقع.' : ''}</p>`
    }
    return `<details class="part proj" style="grid-column:1/-1"${state.projOpen ? ' open' : ''}><summary><span>توقع السعر لـ 5 سنوات</span><span class="dim">اضغط للعرض</span></summary>
      ${body}
      <p class="dim">سيناريوهات من الافتراضات المكتوبة، مو توقع مجرّب: ما اختبرناها على الماضي. الشركات الدورية (رقائق، سلع، بتروكيماويات) يطلع المدى عندها واسع لأن هامشها يتقلب.</p>
    </details>`
  }

  // The stock's P/E against its US industry's (or sector's) aggregate P/E today, from SECTOR_PE.
  function industryTile(sym) {
    const q = state.quotes[sym]
    if (!SECTOR_PE || sym.startsWith('TADAWUL:') || !q) return []
    const g = SECTOR_PE.groups.find((x) => x.kind === 'industry' && x.key === q.industry) ?? SECTOR_PE.groups.find((x) => x.kind === 'sector' && x.key === q.sector)
    const now = g?.pe.findLast((v) => v != null)
    const pe = peNow(sym)
    if (!(now > 0)) return []
    const d = pe > 0 ? pe / now - 1 : null
    return [[`P/E مقارنة ب${g.kind === 'industry' ? 'صناعته' : 'قطاعه'}`, `${fmt(pe)} · ${fmt(now)}`,
      `مكرر السهم ${fmt(pe)} ومكرر ${g.kind === 'industry' ? 'صناعته' : 'قطاعه'} (${nameAr(g.key)}) اليوم ${fmt(now)}: قيمة شركاتها الأمريكية السوقية كلها ÷ أرباحها. ${d == null ? 'السهم ما يربح.' : `السهم ${d >= 0 ? 'أغلى' : 'أرخص'} من ${g.kind === 'industry' ? 'صناعته' : 'قطاعه'} بـ ${pct(Math.abs(d)).replace('+', '')}.`} وسط تاريخ ${g.kind === 'industry' ? 'الصناعة' : 'القطاع'} من ${SECTOR_PE.first.slice(0, 4)}: ${fmt(g.p50)}. ضعفه: الشركات داخل الصناعة تختلف بنموها.`]]
  }
  // Months of cash left for a company burning it: cash and short-term investments ÷ the last 12
  // months' negative free cash flow per month.
  function runwayTile(q) {
    if (!(q.free_cash_flow_ttm < 0) || !(q.cash_n_short_term_invest_fq > 0) || q.sector === 'Finance') return []
    const m = q.cash_n_short_term_invest_fq / (-q.free_cash_flow_ttm / 12)
    const n = Math.round(m)
    return [['الكاش يكفي', m >= 120 ? 'أكثر من 10 سنين' : n < 1 ? 'أقل من شهر' : n === 1 ? 'شهر' : n === 2 ? 'شهرين' : `${n} ${n <= 10 ? 'أشهر' : 'شهر'}`, `الكاش والاستثمارات القصيرة (${big(q.cash_n_short_term_invest_fq).replace(/<[^>]+>/g, '')}) ÷ الكاش اللي تحرقه بالشهر على آخر 12 شهر. لو قليل، الشركة غالباً بتصدر أسهم أو تقترض قريب. ضعفه: الحرق يتغير، وما يحسب خطوط الائتمان.`]]
  }

  function detail(sym) {
    const q = state.quotes[sym] || {}
    const s = state.scores[sym]
    if (!s || !s.detail) return `<div class="dgrid">${fairBlock(sym)}${svrBlock(sym)}${projBlock(sym)}${expBlock(sym)}${ideasBlock(sym)}</div><p class="dim" style="margin-top:10px">${esc(state.errors[sym] || (s?.reason === 'pre-revenue' ? 'الدرجة ما تنحسب لما تكون الإيرادات أقل من 1% من القيمة السوقية (يعني السهم يتداول بأكثر من 100 ضعف مبيعاته، أو الشركة بدون إيرادات). هذي قاعدة الاختبار نفسه.' : 'بيانات الدرجة ناقصة لهذا السهم.'))}</p>`
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
    const part = (title, val, html) => `<div class="part"><h3><span><i class="sw" style="background:var(${PARTS.find((x) => x[1] === title)[2]})"></i>${title}</span><span class="n ${val == null ? 'dim' : ''}">${val == null ? '—' : fmt(val, 2) + ' / 2'}</span></h3>${html}</div>`
    const ctx = [
      [`Fwd P/E${fyNext(q) ? ` (${fyNext(q)})` : ''}`, fmt(q.non_gaap_price_to_earnings_per_share_forecast_next_fy), `السعر ÷ توقع المحللين لربح السهم المعدّل (non-GAAP) لسنة ${fyNext(q) ?? 'التوقع'} المالية، أول سنة ما انعلنت نتايجها. الـ P/E العادي على الربح المحاسبي (GAAP)، فالفرق بينهم مو كله نمو. ضعفه: توقعات، والمحللين غالباً متفائلين.`],
      ['PEG', pegCell(sym), `المكرر المتوقع ÷ نمو ربح السهم المتوقع لسنة ${fyNext(q) ?? 'التوقع'} المالية مقارنة بآخر سنة معلنة (توقع سنة وحدة، مو 5 سنين مثل Yahoo وfinviz). الشائع: تحت 1 رخيص مقارنة بنموه، فوق 2 غالي. ضعفه: كله على رقم النمو.`],
      ['EV/EBITDA', fmt(q.enterprise_value_ebitda_ttm), 'يحسب الدين. ضعفه: قبل الإنفاق الرأسمالي، فيجامل الشركات اللي تصرف كثير.'],
      ['FCF yield', q.sector !== 'Finance' && mv(q) > 0 && Number.isFinite(q.free_cash_flow_ttm) ? pct(q.free_cash_flow_ttm / mv(q), 1) : '—', 'التدفق النقدي الحر لآخر 12 شهر ÷ القيمة السوقية (سالب = الشركة تحرق كاش). ضعفه: ينزل مؤقتاً وقت الإنفاق الكبير. ما يطلع للبنوك والمالية لأن تدفقها يتحرك مع الودائع والقروض.'],
      ['P/S', q.sector !== 'Finance' && mv(q) > 0 && q.total_revenue_ttm > 0 ? fmt(mv(q) / q.total_revenue_ttm) : '—', 'القيمة السوقية ÷ مبيعات آخر 12 شهر. للشركات اللي ما تربح. ضعفه: يتجاهل الهامش. ما يطلع للبنوك لأن "مبيعاتها" إجمالي دخل العمولات.'],
      ['P/B · ROE', `${fmt(q.price_book_fq)} · ${Number.isFinite(q.return_on_equity) ? `${fmt(q.return_on_equity, 0)}%` : '—'}`, 'للبنوك والتأمين. ضعفه: ما له معنى لشركات أصولها غير ملموسة.'],
      ['ROIC (آخر سنة مالية)', q.sector !== 'Finance' && Number.isFinite(q.return_on_invested_capital_fy) ? `${fmt(q.return_on_invested_capital_fy, 1)}%` : '—', 'العائد على رأس المال المستثمر لآخر سنة مالية: هل النمو مربح فعلاً؟ ما يطلع للبنوك.'],
      ['Altman Z', q.sector !== 'Finance' ? fmt(q.altman_z_score_ttm) : '—', 'خطر الإفلاس: فوق 3 آمن، تحت 1.8 خطر. ما يصلح للبنوك.'],
      ['Piotroski (آخر سنة مالية)', Number.isFinite(q.piotroski_f_score_fy) ? `${q.piotroski_f_score_fy}/9` : '—', `9 فحوصات لتحسن الأساسيات بين آخر سنتين ماليتين، مثل ما عرّفه Piotroski.${Number.isFinite(q.piotroski_f_score_ttm) ? ` على آخر 12 شهر: ${q.piotroski_f_score_ttm}/9.` : ''} الاستثمار الضخم ينزّله.`],
      ['هدف المحللين', Number.isFinite(q.price_target_1y) ? `${fmt(q.price_target_1y, dp(q))} (${pct(q.price_target_1y / q.close - 1)})` : '—', 'متوسط السعر المستهدف خلال سنة. مرجع فقط.'],
      ['توزيعات', q.dividends_yield > 0 ? `${fmt(q.dividends_yield, 2)}%` : 'ما يوزع', 'التوزيعات السنوية ÷ السعر.'],
      ['مدى 52 أسبوع', q.price_52_week_low > 0 && q.price_52_week_high > 0 ? `${fmt(q.price_52_week_low, dp(q))} – ${fmt(q.price_52_week_high, dp(q))}` : '—', q.price_52_week_high > 0 ? `السعر اليوم ${ltr(pct(q.close / q.price_52_week_high - 1))} عن أعلى سعر في سنة.` : ''],
      [Number.isFinite(q.beta_5_year) ? 'بيتا (5 سنين)' : 'بيتا (سنة)', fmt(beta5(q), 2), `كم يتحرك السهم مع السوق: 1 مثل السوق، 2 ضعفه. يدخل في معدل الخصم حق DCF.${Number.isFinite(q.beta_5_year) && Number.isFinite(q.beta) ? ` على آخر سنة بس: ${ltr(fmt(q.beta, 2))}.` : ''}`],
      ...industryTile(sym),
      ...runwayTile(q),
    ]
    return `<div class="dgrid">
      ${fairBlock(sym)}
      ${svrBlock(sym)}
      ${projBlock(sym)}
      ${expBlock(sym)}
      ${issuanceBlock(sym)}
      ${ideasBlock(sym)}
      ${part('السعر', p.A, `<p>أرخص من ${cheaper == null ? '<b class="n">—</b> من شهوره' : cheaper <= 0 ? '<b>أغلى من كل شهوره</b>' : cheaper >= 1 ? '<b>أرخص من كل شهوره</b>' : `<b class="n">${pct(cheaper).replace('+', '')}</b> من شهوره`} في آخر 5 سنوات (P/E، P/S، EV/EBITDA، P/FCF).</p>
        <p>${q.sector === 'Finance' ? 'للبنوك والمالية: السعر مقارنة بتاريخه بس، بدون النمو المفترض من التدفق النقدي.' : Number.isFinite(d.gStar) ? `السعر يفترض نمو تدفق نقدي <b class="n">${pct(d.gStar)}</b> سنوياً، والشركة نمت إيراداتها <b class="n">${pct(d.revG)}</b> سنوياً ${gYears(sym)}.`
          : `${Number.isFinite(d.revG) ? `الشركة نمت إيراداتها <b class="n">${pct(d.revG)}</b> سنوياً ${gYears(sym)}. ` : ''}النمو اللي يفترضه السعر ما ينحسب: ${f0.fcf < 0 ? 'التدفق النقدي الحر سالب' : 'بيانات التدفق النقدي ناقصة'}.`}</p>`)}
      ${part('الجودة', p.B, `<p>${marginName}: <b class="n">${pct(margin, 1)}</b></p><p>الكاش من الأرباح (آخر 3 سنوات): <b class="n">${q.sector === 'Finance' ? 'ما ينحسب للمالية' : sNi > 0 ? fmt(sFcf / sNi, 2) + '×' : sFcf > 0 ? 'كاش موجب مع خسائر' : 'سالب'}</b></p>`)}
      ${part('النمو', p.C, `<p>نمو الإيراد السنوي: <b class="n">${pct(d.revG, 1)}</b></p><p>نمو ربح السهم السنوي: <b class="n">${d.epsG == null ? 'غير محسوب (خسارة)' : pct(d.epsG, 1)}</b></p>`)}
      ${part('الأمان', p.D, `<p>الدين ÷ EBITDA: <b class="n">${d.d1 == null ? 'ما ينحسب للمالية' : debtX == null ? '—' : fmt(debtX, 1) + '×'}</b></p><p>سنوات خسارة في آخر 5: <b class="n">${d.losses ?? '—'}</b></p>`)}
      ${part('الاتجاه', p.E, `<p>نجح في <b><span class="n">${d.passed ?? '—'}</span> من <span class="n">${d.checks ?? '—'}</span></b> فحوصات تحسن (${q.sector === 'Finance' ? 'ربح، إيراد، ربح السهم، هوامش' : 'ربح، كاش، إيراد، هوامش، دين'}) مقارنة بالسنة اللي قبلها.</p>`)}
    </div>
    <p class="ctx-t">مقاييس إضافية ما تدخل في الدرجة. اضغط على أي مقياس يطلع لك شرحه وضعفه. ${s.period ? `الأرقام من آخر 12 شهر (حتى ${esc(qAr(s.period))})، ونمو 3 سنوات من السنوات المالية حتى <span class="n">${esc(s.fiscalYear ?? '—')}</span>.` : `السنة المالية المعتمدة: <span class="n">${esc(s.fiscalYear ?? '—')}</span>.`}</p>
    <div class="ctx">${ctx.map(([k, v, tip]) => `<details data-k="${esc(k)}"${state.ctxOpen.has(k) ? ' open' : ''}><summary><span>${k}</span><b>${v}</b></summary><p>${esc(tip)}</p></details>`).join('')}</div>`
  }

  function renderLatestIdeas(all) {
    const box = $('latestIdeas')
    if (!box) return
    const list = all.filter((i) => i.date).sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 25)
    box.innerHTML = list.length
      ? `<ul class="ideas">${list.map((i) => `<li><div><b class="n">${esc((i.sym || '').split(':')[1] || i.sym)}</b> · <a dir="auto" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title || i.source)}</a> <span class="dim">${esc(i.source)} · <span class="n">${esc(i.date)}</span></span></div>${i.summary ? `<p>${esc(i.summary)}</p>` : ''}</li>`).join('')}</ul>`
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

  // A line chart over months: `lines` of points { i (index into months), v }, dashed or plain
  // reference lines, optional cheap/expensive zones. Drawn at the box's real width so text stays
  // readable; values above `hi` leave the frame (the readout still shows them). The pointer
  // readout reads CHARTS[key]: the nearest point, labelled by `tip`.
  const CHARTS = new Map()
  let clipN = 0
  function lineChart(key, { months, lines, refs = [], zones = null, w, aria, tip, lo = null, hi = null, grid = false, above = null }) {
    const pts = lines.flat()
    const vs = [...pts.map((p) => p.v), ...refs.map((r) => r.v)]
    lo ??= Math.max(0, Math.min(...vs) * 0.9)
    hi ??= Math.max(...vs) * 1.06
    const X = (i) => CH.l + (i / Math.max(1, months.length - 1)) * (w - CH.l - CH.r)
    const Y = (v) => CH.t + (1 - (v - lo) / (hi - lo)) * (CH.h - CH.t - CH.b)
    const path = (l) => l.map((p, j) => `${j ? 'L' : 'M'}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')
    const step = months.length > 144 ? 3 : months.length > 72 ? 2 : 1
    const ticks = months.map((m, i) => [m, i]).filter(([m]) => m.endsWith('-01') && Number(m.slice(0, 4)) % step === 0)
    const ref = (r) => `<line x1="${CH.l}" x2="${w - CH.r}" y1="${Y(r.v)}" y2="${Y(r.v)}" class="ref ${r.cls ?? ''}"/><text x="${w - CH.r + 6}" y="${Y(r.v) + 4}" class="axis ${r.cls ?? ''}">${r.label} ${fmt(r.v, 1)}</text>`
    // Value gridlines at a round step (1, 2, 2.5 or 5 × a power of ten), about four of them.
    const raw = (hi - lo) / 4
    const mag = 10 ** Math.floor(Math.log10(raw))
    const gs = [1, 2, 2.5, 5, 10].find((k) => k * mag >= raw) * mag
    const gv = []
    for (let v = Math.ceil(lo / gs) * gs; grid && v <= hi; v += gs) gv.push(v)
    const last = lines.at(-1).at(-1)
    const clip = `clip${(clipN += 1)}`
    CHARTS.set(key, { months, pts, tip })
    return `<svg class="sc" width="${w}" height="${CH.h}" viewBox="0 0 ${w} ${CH.h}" data-w="${w}" data-k="${esc(key)}" role="img" aria-label="${esc(aria)}">
      <clipPath id="${clip}"><rect x="0" y="${CH.t}" width="${w}" height="${CH.h - CH.t - CH.b}"/></clipPath>
      ${zones ? `<rect x="${CH.l}" y="${CH.t}" width="${w - CH.l - CH.r}" height="${Y(zones.hi) - CH.t}" class="zone-hi"/>
      <rect x="${CH.l}" y="${Y(zones.lo)}" width="${w - CH.l - CH.r}" height="${CH.h - CH.b - Y(zones.lo)}" class="zone-lo"/>` : ''}
      ${gv.map((v) => `<line x1="${CH.l}" x2="${w - CH.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>`).join('')}
      ${refs.map(ref).join('')}
      ${above ? `<text x="${w - CH.r + 6}" y="${CH.t + 10}" class="axis ${above.cls}">${above.label}</text>` : ''}
      ${ticks.map(([m, i]) => `<text x="${Math.max(CH.l + 14, X(i))}" y="${CH.h - 6}" class="axis" text-anchor="middle">${m.slice(0, 4)}</text>`).join('')}
      <g clip-path="url(#${clip})">${lines.map((l, j) => `<path d="${path(l)}" class="pe-line ${l.cls ?? ''}"/>`).join('')}
      <circle cx="${X(last.i)}" cy="${Y(Math.min(last.v, hi))}" r="4" class="pe-dot"/></g>${gv.map((v) => `<text x="${CH.l + 2}" y="${Y(v) - 3}" class="axis gl">${+v.toFixed(2)}</text>`).join('')}
      <line class="cross" x1="0" x2="0" y1="${CH.t}" y2="${CH.h - CH.b}" visibility="hidden"/>
      <rect x="${CH.l}" y="0" width="${w - CH.l - CH.r}" height="${CH.h}" fill="transparent" class="hit"/>
    </svg>`
  }

  // One sector's P/E history: the line, the historically cheap (bottom 10%) and expensive
  // (top 10%) zones, and the median.
  function sectorChart(g, w) {
    const runs = []
    g.pe.forEach((v, i) => { if (v == null) runs.push([]); else (runs.at(-1) ?? runs[runs.push([]) - 1]).push({ i, v, m: SECTOR_PE.months[i] }) })
    return lineChart(`sec:${g.kind}:${g.key}`, {
      months: SECTOR_PE.months, lines: runs.filter((r) => r.length), zones: { hi: g.p90, lo: g.p10 },
      refs: [{ v: g.p90, label: 'قمة' }, { v: g.p50, label: 'وسط' }, { v: g.p10, label: 'قاع' }],
      w, aria: `مكرر الربح لـ ${nameAr(g.key)} من ${SECTOR_PE.first.slice(0, 4)} لين اليوم`, tip: (p) => `${monthAr(p.m)} · P/E ${p.v}`,
    })
  }

  // SVR history (engine/svr.js) with Nanalyze's two lines: the stock's last-four-quarter average
  // (red) and their ceiling, three times the list's mean (green).
  function svrBlock(sym) {
    const q = state.quotes[sym] || {}
    if (!preProfit(sym)) return ''
    const now = svrNow(q)
    const hd = state.hist[sym]
    const box = (body) => `<div class="part svr" style="grid-column:1/-1"><h3><span>SVR: القيمة السوقية ÷ (مبيعات آخر ربع × 4)</span><span class="n">${fmtSvr(now)}</span></h3>${body}</div>`
    if (!hd || hd.loading) return box('<p class="dim">جاري تحميل تاريخ المبيعات…</p>')
    if (hd.error) return box(`<p class="dim">${esc(hd.error)}</p>`)
    // The saved closes (the score's), and older months from the prices fetched with the history.
    const closes = closesOf(sym)
    ;(hd.px?.t ?? []).forEach((t, i) => { if (!closes.has(monthKey(t)) && Number.isFinite(hd.px.c[i])) closes.set(monthKey(t), hd.px.c[i]) })
    const r = svrHistory(hd.h, closes)
    if (!r) return box('<p class="dim">TradingView ما عنده تاريخ مبيعات ربعية لهذا السهم.</p>')
    if (!r.points.length) return box('<p class="dim">ما فيه أسعار شهرية محفوظة لهذا السهم للحين، أو مبيعاته أقل من 10 مليون بالسنة (Nanalyze ما يحسبونه تحتها).</p>')
    const month = monthKey(Math.floor(Date.now() / 1000))
    const months = []
    for (let m = r.points[0].m; m <= month; m = addMonths(m, 1)) months.push(m)
    const at = (p) => ({ ...p, i: months.indexOf(p.m) })
    const fy = r.points.filter((p) => p.fy).map(at)
    const qs = r.points.filter((p) => !p.fy).map(at)
    if (now != null && months.at(-1) !== qs.at(-1)?.m) qs.push({ m: month, v: now, i: months.length - 1, now: true })
    const L = listSvr(marketOf(sym))
    const cap = L && 3 * L.mean
    // A ceiling far above the line would flatten it (Ford at 0.25 under a ceiling of 29): then it is
    // written at the top instead of drawn.
    const top = Math.max(...r.points.map((p) => p.v), now ?? 0, r.avg4 ?? 0)
    const capIn = cap && cap <= 1.6 * top
    const refs = [r.avg4 != null && { v: r.avg4, label: 'متوسط', cls: 'red' }, capIn && { v: cap, label: 'سقف', cls: 'green' }].filter(Boolean)
    const lines = []
    if (fy.length) lines.push(Object.assign(qs.length ? [...fy, qs[0]] : fy, { cls: 'fy' }))
    if (qs.length) lines.push(qs)
    // Frame: up to 1.4× the higher of the lines, today and the top tenth, so one wild quarter does not flatten the rest.
    const vs = r.points.map((p) => p.v).sort((x, y) => x - y)
    const hi = Math.min(Math.max(...vs, ...refs.map((x) => x.v), now ?? 0) * 1.06, 1.4 * Math.max(vs[Math.floor(0.9 * (vs.length - 1))], ...refs.map((x) => x.v), now ?? 0))
    const w = Math.min(1100, Math.max(260, ($('rows')?.clientWidth ?? 600) - 60))
    const chart = lineChart(`svr:${sym}`, {
      months, lines, refs, w, lo: 0, hi, grid: true, above: cap && !capIn ? { label: `سقف ${fmt(cap, 1)} ↑`, cls: 'green' } : null, aria: `SVR لـ ${sym.split(':')[1]} من ${months[0].slice(0, 4)} لين اليوم`,
      tip: (p) => `${p.now ? 'اليوم' : monthAr(p.m)} · SVR ${fmtSvr(p.v)}${p.fy ? ' (سنوي)' : ''}`,
    })
    const vsAvg = now != null && r.avg4 ? now / r.avg4 - 1 : null
    const fyTo = fy.length ? qs[0]?.m.slice(0, 4) : null
    return box(`<div class="chart" dir="ltr">${chart}<div class="ctip" dir="rtl" hidden></div></div>
      <p>كل نقطة = نهاية ربع: القيمة السوقية وقتها ÷ (مبيعات ذاك الربع × 4)، مثل رسمات Nanalyze.${fyTo ? ` قبل <span class="n">${fyTo}</span> (الخط المتقطع الخفيف): نهاية كل سنة مالية ÷ مبيعات السنة كاملة، لأن تاريخ الأرباع في TradingView يبدأ من <span class="n">${fyTo}</span>. هذا الجزء تقريبي، ويطلع أعلى شوي للشركات اللي تنمو.` : ''}</p>
      <p>${r.avg4 != null ? `<b class="lo">الخط الأحمر المتقطع</b> = متوسط آخر 4 أرباع (<b class="n">${fmt(r.avg4, 1)}</b>)${vsAvg != null ? `، واليوم ${vsAvg >= 0 ? 'أعلى منه' : 'أقل منه'} بـ <b class="n">${pct(Math.abs(vsAvg))}</b>`.replace('+', '') : ''}. ` : ''}${cap ? `${capIn ? '<b class="hi">الأخضر المتقطع</b> = سقف Nanalyze' : '<b class="hi">سقف Nanalyze</b> (مكتوب فوق الرسمة، لأنه بعيد كثير فوق خط السهم)'}: ما يشترون سهم الـ SVR حقه فوق 3 أضعاف متوسط قائمتهم. متوسط قائمتك هنا <b class="n">${fmt(L.mean, 1)}</b> (${L.n} سهم)، فالسقف <b class="n">${fmt(cap, 1)}</b>${now != null ? `، والسهم اليوم <b>${now > cap ? 'فوقه' : 'تحته'}</b>` : ''}.` : ''}</p>
      <p class="dim">يطلع بس للشركات اللي ما صارت تربح للحين (خسرانة في آخر 12 شهر وفي آخر 3 سنين مالية)، مثل ما يستخدمه Nanalyze: للرابحة مكرر الربح أنسب.${q.sector === 'Finance' ? ' للبنوك: "المبيعات" في TradingView هي دخل العمولات الإجمالي، فالرقم ما يعني الكثير.' : ''} الشركات الموسمية (مثل أبل في ربع ديسمبر) يتذبذب رقمها من ربع لربع. مبيعات الربع تطلع بعد نهايته بأسابيع، فالنقطة وصف للتاريخ مو اللي كان المستثمر يشوفه ذاك اليوم. ما اختبرناه كإشارة شراء أو بيع.</p>`)
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
        <p class="dim">${g.n} شركة · أكبرها: ${g.top.map((x) => `<span class="n">${esc(x.split(':')[1])}</span>`).join('، ')}</p>
        <button class="btn" type="button" data-show="${esc(g.kind)}:${esc(g.key)}">شوف أسهمه في قائمتك</button>
      </article>`).join('')}</div>`
  }

  $('sectorsView').addEventListener('click', (e) => {
    const k = e.target.closest('button[data-kind]')
    if (k) { state.secKind = k.dataset.kind; renderSectors(); return }
    const b = e.target.closest('button[data-show]')
    if (b) { setMarket('us'); state.group = b.dataset.show; renderGroups(); render(); window.scrollTo({ top: 0 }) }
  })
  // Crosshair and readout on any chart: the pointer picks the nearest point.
  let shown = null
  const hideTip = () => {
    if (!shown) return
    shown.querySelector('.cross')?.setAttribute('visibility', 'hidden')
    const t = shown.closest('.chart')?.querySelector('.ctip')
    if (t) t.hidden = true
    shown = null
  }
  document.addEventListener('pointermove', (e) => {
    const svg = e.target.closest?.('svg.sc')
    const c = svg && CHARTS.get(svg.dataset.k)
    if (!c) return hideTip()
    if (shown !== svg) hideTip()
    shown = svg
    const w = Number(svg.dataset.w)
    const n = Math.max(1, c.months.length - 1)
    const fi = ((e.clientX - svg.getBoundingClientRect().left - CH.l) / (w - CH.l - CH.r)) * n
    const p = c.pts.reduce((b, x) => (Math.abs(x.i - fi) < Math.abs(b.i - fi) ? x : b))
    const cx = CH.l + (p.i / n) * (w - CH.l - CH.r)
    const line = svg.querySelector('.cross')
    line.setAttribute('x1', cx)
    line.setAttribute('x2', cx)
    line.setAttribute('visibility', 'visible')
    const tip = svg.closest('.chart').querySelector('.ctip')
    tip.hidden = false
    tip.textContent = c.tip(p)
    tip.style.left = `${Math.min(Math.max(0, cx - tip.offsetWidth / 2), w - tip.offsetWidth)}px`
  })
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) hideTip() }) // left the page
  let resizeT = 0
  let lastW = innerWidth // the charts follow the width only (a phone's toolbar changes the height)
  addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(resizeT); resizeT = setTimeout(() => { if (state.market === 'sectors') renderSectors(); else if (state.open) redraw(state.open) }, 150) })

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
  $('notice').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-undo]')
    if (!b) return
    const [kind, sym] = b.dataset.undo.split('|')
    notice('')
    if (kind === 'fav') { if (!state.lists.fav.includes(sym)) toggleFav(sym) } // undo = bring back, never a toggle
    else addSymbol(sym)
  })
  document.addEventListener('click', (e) => { if (!e.target.closest('.add')) $('results').hidden = true })
  $('refresh').addEventListener('click', () => refresh({ fresh: true }))
  $('filter').addEventListener('input', (e) => { state.filter = e.target.value; render() })
  $('underCap').addEventListener('change', (e) => { state.underCap = e.target.checked; render() })
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
  // Re-renders rebuild the panel, so the forecast and the tiles keep whatever open/closed state was chosen.
  $('rows').addEventListener('toggle', (e) => {
    const d = e.target
    if (d.matches('details.proj')) state.projOpen = d.open
    else if (d.dataset.k) state.ctxOpen[d.open ? 'add' : 'delete'](d.dataset.k)
  }, true)
  const toggle = (sym) => {
    const was = state.open
    state.open = state.open === sym ? null : sym
    if (was && was !== sym) redraw(was)
    redraw(sym)
    if (!state.open) return
    loadNews(sym)
    if (preProfit(sym)) loadHist(sym)
    if (mcp && cacheRead && fundsDue(sym)) loadFunds([sym]).then(scheduleRender, () => {})
    if (mcp && cacheRead && pxDue(sym, true)) loadPx(sym).then(scheduleRender, () => {})
  }
  $('rows').addEventListener('click', (e) => {
    const star = e.target.closest('button[data-star]')
    if (star) { e.stopPropagation(); toggleFav(star.dataset.star); return }
    const del = e.target.closest('button[data-del]')
    if (del) { e.stopPropagation(); if (state.market !== 'big' && state.market !== 'fav') removeSymbol(del.dataset.del); return }
    const row = e.target.closest('tr.row')
    if (row) toggle(row.dataset.sym)
  })
  $('rows').addEventListener('keydown', (e) => {
    if (e.target.matches('tr.row') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(e.target.dataset.sym) }
  })
  // Escape closes the open panel from anywhere (focus may sit on the page after a rebuild), not while typing.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !state.open || e.target.closest?.('input, select, textarea')) return
    const sym = state.open
    toggle(sym)
    $('rows').querySelector(`tr.row[data-sym="${CSS.escape(sym)}"]`)?.focus({ preventScroll: true })
  })
  document.querySelector('thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]')
    if (!b) return
    const k = b.dataset.sort
    state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === 'sym' ? 1 : -1 }
    $('sortSel').value = `${state.sort.key}:${state.sort.dir}` // '' when the menu has no such order
    render()
  })

  // ---------------------------------------------------------------- boot

  let cacheRead = false
  let cacheOk = false
  async function boot() {
    render()
    ;[db, mcp] = await Promise.all([window.claude?.use?.('db') ?? null, window.claude?.use?.('mcp') ?? null])
    if (!mcp) {
      $('status').textContent = ''
      notice('الصفحة تحتاج ربط TradingView من claude.ai عشان تجيب الأرقام. افتحها من claude.ai وهي مسجّلة دخول.', true)
    }
    if (!db) {
      saved.us = saved.sa = saved.fav = []
      cacheRead = true // nothing saved to wait for, and nothing a fetch could overwrite
      render()
      notice('الحفظ غير متاح في هذا العرض، فالقائمة ما بتنحفظ.', true)
      return
    }
    $('status').textContent = 'جاري قراءة البيانات المحفوظة…'
    // The lists first: edits wait for them (see editSaved), and the cache load below can take a while.
    db.doc('meta/favorites').onSnapshot((snap) => {
      const syms = snap.exists ? snap.data().symbols ?? [] : []
      const changed = JSON.stringify(syms) !== JSON.stringify(state.lists.fav)
      state.lists.fav = [...syms]
      if (!snap.metadata?.fromCache) saved.fav = [...syms]
      if (changed && state.market === 'fav' && cacheRead) refresh()
      else scheduleRender(true)
    }, () => notice('ما قدرت أقرأ المفضلة المحفوظة، فالنجمة موقفة لين تفتح الصفحة من جديد.', true))
    for (const m of ['us', 'sa']) {
      db.doc(`lists/${m}`).onSnapshot((snap) => {
        const syms = snap.exists ? snap.data().symbols ?? [] : []
        const changed = JSON.stringify(syms) !== JSON.stringify(state.lists[m])
        state.lists[m] = [...syms]
        if (!snap.metadata?.fromCache) saved[m] = [...syms]
        if (changed && m === state.market && cacheRead) refresh()
        else scheduleRender(true)
      }, () => notice('ما قدرت أقرأ القائمة المحفوظة، فالإضافة والحذف موقفة لين تفتح الصفحة من جديد.', true))
    }
    // One retry: a failed page of the saved histories would make every stock look unsaved.
    cacheOk = await loadCacheFromDb().then(() => true, () => loadCacheFromDb().then(() => true, () => false))
    cacheRead = true
    // Lists that arrived during the cache load were only drawn; fetch for the open tab now.
    if (state.lists[state.market]?.length) refresh()
    try {
      db.collection('ideas').limit(1000).onSnapshot((snap) => {
        const by = {}
        for (const d of snap.docs) { const v = d.data(); (by[v.sym] ??= []).push(v) }
        state.ideas = by
        renderLatestIdeas(snap.docs.map((d) => d.data()))
        scheduleRender(true)
      }, () => renderLatestIdeas([]))
    } catch { renderLatestIdeas([]) }
    db.doc('meta/svr').get().then((snap) => { if (snap.exists) { state.svrMean = { ...snap.data(), ...state.svrMean }; scheduleRender(true) } }).catch(() => {})
    db.doc('meta/watchlists').onSnapshot((snap) => {
      const d = snap.exists ? snap.data() : {}
      state.groups = { us: d.us ?? [], sa: d.sa ?? [] }
      renderGroups()
      scheduleRender(true)
    }, () => {})
  }
  boot()
})()
