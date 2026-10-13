;(() => {
  const SERVER = 'Trading view MCP'
  const T = { batch: 'mcp-tv-get-symbol-data-batch', fin: 'mcp-tv-get-financial-history', px: 'mcp-tv-get-ohlcv', search: 'mcp-tv-search-symbols', news: 'mcp-tv-get-news' }
  const STALE_DAYS = 14
  const COLS = ['description', 'close', 'currency', 'type', 'sector', 'market_cap_basic', 'price_earnings_ttm', 'non_gaap_price_to_earnings_per_share_forecast_next_fy',
    'earnings_per_share_forecast_next_fy', 'earnings_per_share_diluted_ttm', 'enterprise_value_ebitda_ttm', 'price_free_cash_flow_ttm', 'price_sales_current',
    'price_book_fq', 'return_on_invested_capital_fy', 'return_on_equity', 'piotroski_f_score_ttm', 'altman_z_score_ttm', 'price_target_1y', 'gross_margin',
    'debt_to_equity', 'net_debt_fq', 'revenue_forecast_next_fy', 'total_revenue_ttm', 'earnings_release_next_date', 'eps_surprise_percent_fq', 'revenue_surprise_percent_fq']
  const METHOD_NAMES = { pe: 'P/E مقارنة بتاريخه', peg: 'PEG', dcf: 'DCF (التدفق النقدي)', graham: 'رقم Graham', ev: 'EV/EBITDA مقارنة بتاريخه', ps: 'P/S مقارنة بتاريخه',
    pb: 'P/B مقارنة بتاريخه', pbj: 'P/B من العائد على حقوق المساهمين', cash: 'الكاش الصافي للسهم', pen: 'P/E على متوسط ربح 5 سنوات' }
  const PROFILE_AR = { 'Mature / profitable': 'ناضجة ورابحة', 'Growth / tech': 'نمو وتقنية', 'Heavy / cyclical': 'ثقيلة ودورية', Financial: 'مالية',
    'Unprofitable growth': 'تنمو وتخسر', 'Pre-revenue': 'بدون إيرادات' }

  const $ = (id) => document.getElementById(id)
  const state = { market: 'us', lists: { us: [], sa: [] }, groups: { us: [], sa: [] }, quotes: {}, cache: {}, scores: {}, fair: {}, exp: {}, news: {}, ideas: {}, errors: {},
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
    const closes = new Map()
    ;(d.px?.t ?? []).forEach((t, i) => { if (Number.isFinite(d.px.c[i])) closes.set(monthKey(t), d.px.c[i]) })
    const month = monthKey(Math.floor(Date.now() / 1000))
    if (Number.isFinite(q.close)) closes.set(month, q.close)
    const s = scoreAt(funds, closes, q.sector, month)
    const fy = lastUsableFiscalYear(month)
    const known = funds.filter((f) => f.year <= fy)
    state.scores[sym] = { ...s, f0: known[known.length - 1], known }
    const fv = fairValuesAt(funds, closes, q.sector, month)
    state.fair[sym] = fv ? liveFairValues(fv, q, funds) : null
    state.exp[sym] = expectationsAt(funds, closes, month)
  }

  let busy = false
  let again = false
  async function refresh(opts = {}) {
    if (!mcp) return
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

  const SEG = ['--seg-a', '--seg-b', '--seg-c', '--seg-d', '--seg-e']
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
      case 'fair': return state.fair[sym]?.fair
      case 'upside': return upside(sym)
      case 'score': return s.total
      case 'gstar': return s.detail?.gStar
      case 'greal': return s.detail?.gReal
      case 'pe': return q.price_earnings_ttm
      case 'fpe': return q.non_gaap_price_to_earnings_per_share_forecast_next_fy
      case 'z': return q.altman_z_score_ttm
      case 'gap': return state.exp[sym]?.gap
    }
  }

  function visible() {
    let syms = [...state.lists[state.market]]
    if (state.group) {
      const g = state.groups[state.market].find((x) => x.name === state.group)
      const set = new Set(g?.symbols ?? [])
      syms = syms.filter((s) => set.has(s))
    }
    const f = state.filter.trim().toLowerCase()
    if (f) syms = syms.filter((s) => s.toLowerCase().includes(f) || String(state.quotes[s]?.description ?? '').toLowerCase().includes(f))
    const { key, dir } = state.sort
    return syms.sort((a, b) => {
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
    const segs = ['A', 'B', 'C', 'D', 'E'].map((k, i) => `<i title="${['السعر', 'الجودة', 'النمو', 'الأمان', 'الاتجاه'][i]}: ${fmt(s.parts[k], 1)} من 2"><b style="height:${(s.parts[k] / 2) * 100}%;background:var(${SEG[i]})"></b></i>`).join('')
    return `<div class="score"><span class="big n ${tone(s.total)}">${fmt(s.total, 1)}</span><span class="segs">${segs}</span></div>`
  }

  let pending = false
  function scheduleRender() {
    if (pending) return
    pending = true
    requestAnimationFrame(() => { pending = false; render() })
  }

  function renderGroups() {
    const sel = $('group')
    const groups = state.groups[state.market]
    const opts = ['<option value="">كل الأسهم</option>', ...groups.map((g) => `<option value="${esc(g.name)}">${esc(g.name)} (${g.symbols.length})</option>`)]
    sel.innerHTML = opts.join('')
    sel.value = groups.some((g) => g.name === state.group) ? state.group : ''
    sel.hidden = !groups.length
  }

  function render() {
    for (const m of ['us', 'sa']) {
      $(`cnt-${m}`).textContent = state.lists[m].length ? ` ${state.lists[m].length}` : ''
      $(`tab-${m}`).setAttribute('aria-selected', String(m === state.market))
    }
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
    body.innerHTML = syms.map((sym) => {
      const q = state.quotes[sym]
      const s = state.scores[sym]
      const f = state.fair[sym]
      const up = upside(sym)
      const main = `<tr class="row" data-sym="${esc(sym)}" tabindex="0" aria-expanded="${state.open === sym}">
        <td class="stock"><b>${esc(sym.split(':')[1])}</b><span>${esc(q?.description ?? '')}</span></td>
        <td class="n">${q ? fmt(q.close, 2) : '<span class="skel"></span>'}</td>
        <td class="n">${f?.fair ? fmt(f.fair, 2) : q && state.cache[sym] ? '—' : '<span class="skel"></span>'}</td>
        <td class="n ${up == null ? '' : up >= 0 ? 'hi' : 'lo'}">${pct(up)}</td>
        <td>${scoreCell(sym)}</td>
        <td>${expCell(sym)}</td>
        <td class="n">${s?.detail ? pct(s.detail.gStar) : '—'}</td>
        <td class="n">${s?.detail ? pct(s.detail.gReal) : '—'}</td>
        <td class="n">${fmt(q?.price_earnings_ttm)}</td>
        <td class="n">${fmt(q?.non_gaap_price_to_earnings_per_share_forecast_next_fy)}</td>
        <td class="n">${fmt(q?.altman_z_score_ttm)}</td>
        <td><button class="x" type="button" data-del="${esc(sym)}" aria-label="احذف ${esc(sym)}">×</button></td>
      </tr>`
      return main + (state.open === sym ? `<tr class="detail"><td colspan="12">${detail(sym)}</td></tr>` : '')
    }).join('')
  }

  // Analysts' next fiscal year against the last 12 months (information only: no history to test).
  function analysts(q) {
    const rev = q.revenue_forecast_next_fy > 0 && q.total_revenue_ttm > 0 ? q.revenue_forecast_next_fy / q.total_revenue_ttm - 1 : null
    const eps = Number.isFinite(q.earnings_per_share_forecast_next_fy) && q.earnings_per_share_diluted_ttm > 0 ? q.earnings_per_share_forecast_next_fy / q.earnings_per_share_diluted_ttm - 1 : null
    return { rev, eps, falling: (rev != null && rev < 0) || (eps != null && eps < -0.1) }
  }

  function expCell(sym) {
    const e = state.exp[sym]
    const q = state.quotes[sym]
    const chips = []
    if (e?.flag === 'red') chips.push('<span class="chip red" title="السعر يفترض نمو أعلى بـ 10 نقاط أو أكثر من اللي تحققه الشركة، ونموها يتباطأ. اختبار: ما تنبأ بأداء أسوأ.">يتوقع أكثر من أدائها</span>')
    if (e?.flag === 'green') chips.push('<span class="chip green" title="السعر يفترض نمو أقل بـ 10 نقاط أو أكثر من اللي تحققه الشركة، ونموها ما يتباطأ. اختبار: ما تنبأ بأداء أفضل.">السوق متشائم</span>')
    if (q && analysts(q).falling) chips.push('<span class="chip amber" title="المحللين يتوقعون إيرادات أقل أو ربح أقل بأكثر من 10% في السنة المالية الجاية. معلومة فقط.">المحللين يتوقعون تراجع</span>')
    return chips.join(' ') || '<span class="dim">—</span>'
  }

  const dateOf = (sec) => (Number.isFinite(sec) ? new Date(sec * 1000).toISOString().slice(0, 10) : '—')

  function expBlock(sym) {
    const e = state.exp[sym]
    const q = state.quotes[sym] || {}
    const a = analysts(q)
    const flagTxt = !e ? 'ما ينحسب (التدفق النقدي الحر سالب).'
      : e.flag === 'red' ? '<b class="lo">يتوقع أكثر من أدائها</b>: السعر يفترض نمو أعلى بكثير من المحقق، والنمو يتباطأ.'
      : e.flag === 'green' ? '<b class="hi">السوق متشائم</b>: السعر يفترض نمو أقل بكثير من المحقق، والنمو ما يتباطأ.'
      : 'لا تنبيه: الفرق بين المفترض والمحقق أقل من 10 نقاط، أو ما فيه تباطؤ.'
    const news = state.news[sym]
    const newsHtml = news === undefined ? '<p class="dim">جاري جلب الأخبار…</p>'
      : news?.error ? `<p class="dim">${esc(news.error)}</p>`
      : news.length ? `<ul class="news">${news.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="dim n">${dateOf(n.published)} · ${esc(n.provider?.name ?? '')}</span></li>`).join('')}</ul>`
      : '<p class="dim">ما فيه أخبار حديثة.</p>'
    return `<div class="part" style="grid-column:1/-1">
      <h3><span>التوقعات والمحفزات</span><span class="n dim">التقرير الجاي ${dateOf(q.earnings_release_next_date)}</span></h3>
      <p>${flagTxt}</p>
      <p>السعر يفترض نمو <b class="n">${pct(e?.gStar)}</b> سنوياً · الشركة حققت <b class="n">${pct(e?.gReal)}</b> (3 سنوات) و<b class="n">${pct(e?.yoy)}</b> آخر سنة · الفرق <b class="n">${pct(e?.gap)}</b></p>
      <p>المحللين للسنة المالية الجاية: الإيرادات <b class="n ${a.rev < 0 ? 'lo' : ''}">${pct(a.rev)}</b> · ربح السهم <b class="n ${a.eps < 0 ? 'lo' : ''}">${pct(a.eps)}</b> مقارنة بآخر 12 شهر. آخر تقرير: مفاجأة الربح <b class="n">${Number.isFinite(q.eps_surprise_percent_fq) ? pct(q.eps_surprise_percent_fq / 100) : '—'}</b>، الإيرادات <b class="n">${Number.isFinite(q.revenue_surprise_percent_fq) ? pct(q.revenue_surprise_percent_fq / 100) : '—'}</b></p>
      <p class="dim">اختبرنا تنبيهي "يتوقع أكثر من أدائها" و"السوق متشائم" على 819 سهم (2012–2025) وما تنبأوا بأداء السنة التالية. معروضة كمعلومة تساعدك تسأل السؤال الصح، مو كإشارة.</p>
      <h3 style="margin-top:6px"><span>آخر الأخبار</span></h3>${newsHtml}
    </div>`
  }

  function ideasBlock(sym) {
    const list = (state.ideas[sym] ?? []).slice().sort((x, y) => (x.date < y.date ? 1 : -1))
    const q = state.quotes[sym] || {}
    if (!list.length) return '<div class="part" style="grid-column:1/-1"><h3><span>أفكار منشورة</span></h3><p class="dim">ما فيه أفكار مسجلة لهذا السهم للحين. تنضاف تلقائياً من Value Investors Club وReddit كل أسبوعين.</p></div>'
    return `<div class="part" style="grid-column:1/-1"><h3><span>أفكار منشورة</span><span class="n dim">${list.length}</span></h3>
      <ul class="ideas">${list.map((i) => {
        const since = i.priceThen > 0 && q.close > 0 ? q.close / i.priceThen - 1 : null
        return `<li><div><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title || i.source)}</a> <span class="dim">${esc(i.source)} · <span class="n">${esc(i.date || 'تاريخ غير معروف')}</span>${i.side ? ' · ' + (i.side === 'short' ? 'بيع' : 'شراء') : ''}</span></div>
          ${i.summary ? `<p>${esc(i.summary)}</p>` : ''}
          ${i.priceThen ? `<p class="dim">السعر وقتها <span class="n">${fmt(i.priceThen, 2)}</span> · من وقتها <b class="n ${since >= 0 ? 'hi' : 'lo'}">${pct(since)}</b></p>` : ''}</li>`
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
      <h3><span>القيمة العادلة · ${esc(PROFILE_AR[f.profile] || f.profile)}</span><span class="n">${f.fair ? fmt(f.fair, 2) : '—'} <span class="${upside(sym) >= 0 ? 'hi' : 'lo'}">${pct(upside(sym))}</span></span></h3>
      <p>متوسط موزون للطرق المناسبة لنوع الشركة. الطرق اللي بدون بيانات تنشال وتتوزع أوزانها على الباقي (تغطية البيانات <b class="n">${Math.round(f.coverage * 100)}%</b>). مدى الطرق: <b class="n">${fmt(f.low, 2)} – ${fmt(f.high, 2)}</b>، والسعر <b class="n">${fmt(q.close, 2)}</b>.</p>
      <div class="fair-list">${rows}</div>
    </div>`
  }

  function detail(sym) {
    const q = state.quotes[sym] || {}
    const s = state.scores[sym]
    if (!s || !s.detail) return `<div class="dgrid">${fairBlock(sym)}${expBlock(sym)}${ideasBlock(sym)}</div><p class="dim" style="margin-top:10px">${esc(state.errors[sym] || (s?.reason === 'pre-revenue' ? 'الدرجة ما تنحسب لما تكون الإيرادات أقل من 1% من القيمة السوقية (يعني السهم يتداول بأكثر من 100 ضعف مبيعاته، أو الشركة بدون إيرادات). هذي قاعدة الاختبار نفسه.' : 'بيانات الدرجة ناقصة لهذا السهم.'))}</p>`
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
    const part = (title, val, html) => `<div class="part"><h3><span>${title}</span><span class="n ${val == null ? 'dim' : ''}">${val == null ? '—' : fmt(val, 1) + ' / 2'}</span></h3>${html}</div>`
    const growthNext = Number.isFinite(q.earnings_per_share_forecast_next_fy) && q.earnings_per_share_diluted_ttm > 0 ? q.earnings_per_share_forecast_next_fy / q.earnings_per_share_diluted_ttm - 1 : null
    const growthFy = Number.isFinite(q.earnings_per_share_forecast_next_fy) && f0.eps > 0 ? q.earnings_per_share_forecast_next_fy / f0.eps - 1 : null
    const pegs = [growthNext, growthFy].filter((g) => g > 0).map((g) => q.price_earnings_ttm / (100 * g)).filter(Number.isFinite)
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
      ${expBlock(sym)}
      ${ideasBlock(sym)}
      ${part('السعر', p.A, `<p>أرخص من <b class="n">${cheaper == null ? '—' : pct(cheaper).replace('+', '')}</b> من شهوره في آخر 5 سنوات (P/E، P/S، EV/EBITDA، P/FCF).</p>
        <p>السعر يفترض نمو تدفق نقدي <b class="n">${pct(d.gStar)}</b> سنوياً، والشركة نمت إيراداتها <b class="n">${pct(d.gReal)}</b> سنوياً آخر 3 سنوات.</p>`)}
      ${part('الجودة', p.B, `<p>${marginName}: <b class="n">${pct(margin, 1)}</b></p><p>الكاش من الأرباح (آخر 3 سنوات): <b class="n">${sNi > 0 ? fmt(sFcf / sNi, 2) + '×' : sFcf > 0 ? 'كاش موجب مع خسائر' : 'سالب'}</b></p>`)}
      ${part('النمو', p.C, `<p>نمو الإيراد السنوي: <b class="n">${pct(d.revG, 1)}</b></p><p>نمو ربح السهم السنوي: <b class="n">${d.epsG == null ? 'غير محسوب (خسارة)' : pct(d.epsG, 1)}</b></p>`)}
      ${part('الأمان', p.D, `<p>الدين ÷ EBITDA: <b class="n">${d.d1 == null ? 'لا يُحسب للمالية' : debtX == null ? '—' : fmt(debtX, 1) + '×'}</b></p><p>سنوات خسارة في آخر 5: <b class="n">${d.losses ?? '—'}</b></p>`)}
      ${part('الاتجاه', p.E, `<p>نجح في <b class="n">${d.passed ?? '—'} من ${d.checks ?? '—'}</b> فحوصات تحسن (ربح، كاش، إيراد، هوامش، دين) مقارنة بالسنة اللي قبلها.</p>`)}
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
    renderGroups()
    render()
    refresh()
  }

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
  const toggle = (sym) => { state.open = state.open === sym ? null : sym; render(); if (state.open) loadNews(sym) }
  $('rows').addEventListener('click', (e) => {
    const del = e.target.closest('button[data-del]')
    if (del) { e.stopPropagation(); removeSymbol(del.dataset.del); return }
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
