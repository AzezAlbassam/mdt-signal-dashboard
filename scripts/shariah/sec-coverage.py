# SEC coverage test: for each ticker, find CIK (efts), read companyfacts, report latest quarterly interest income, revenue, debt, shares.
import json,sys,time,urllib.request,urllib.parse,datetime as dt,os
UA=os.environ.get('SEC_USER_AGENT') or 'AlbassamDashboard research'
def get(u):
    for i in range(3):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':UA,'Accept-Encoding':'identity'}),timeout=60))
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            time.sleep(2+i*3)
        except Exception: time.sleep(2+i*3)
    return 'ERR'
INT=['InvestmentIncomeInterest','InvestmentIncomeInterestAndDividend','InterestIncomeOther','InterestAndOtherIncome','InterestIncomeOperating','InterestAndDividendIncomeOperating','InvestmentIncomeNet','InterestIncomeNonoperating','InterestAndOtherIncomeNet']
DEBT=['LongTermDebt','LongTermDebtNoncurrent','DebtCurrent','LongTermDebtCurrent','ShortTermBorrowings','CommercialPaper','DebtLongtermAndShorttermCombinedAmount','LongTermDebtAndCapitalLeaseObligations','ConvertibleNotesPayable','ConvertibleDebtNoncurrent','LongTermNotesPayable']
REV=['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueNet']
out=open(sys.argv[2],'a')
for s in open(sys.argv[1]).read().split():
    q=get('https://efts.sec.gov/LATEST/search-index?keysTyped='+urllib.parse.quote(s))
    hits=[h for h in (q or {}).get('hits',{}).get('hits',[]) if s in (h['_source'].get('tickers') or '').split(', ')] if q!='ERR' else []
    if not hits: out.write(json.dumps({'s':s,'err':'nocik'})+'\n'); continue
    cik=hits[0]['_id'].zfill(10)
    d=get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json'); time.sleep(0.2)
    if not d or d=='ERR': out.write(json.dumps({'s':s,'cik':cik,'err':'nofacts'})+'\n'); continue
    f=d['facts']; g=f.get('us-gaap',{})
    def latest(tags,quarterly,ns=g,unit='USD'):
        best=None
        for k in tags:
            for x in ns.get(k,{}).get('units',{}).get(unit,[]):
                if quarterly:
                    if not x.get('start'): continue
                    days=(dt.date.fromisoformat(x['end'])-dt.date.fromisoformat(x['start'])).days
                    if not 80<=days<=100: continue
                if best is None or (x['end'],x['filed'])>(best[1]['end'],best[1]['filed']): best=(k,x)
        return {'tag':best[0],'end':best[1]['end'],'val':best[1]['val'],'form':best[1]['form'],'filed':best[1]['filed']} if best else None
    forms=sorted({x['form'] for k in g for u in g[k]['units'].values() for x in u})
    fil=max((x['filed'] for k in g for u in g[k]['units'].values() for x in u),default=None)
    out.write(json.dumps({'s':s,'cik':cik,'name':d.get('entityName'),'ifrs':'ifrs-full' in f,'forms':[x for x in forms if x[:2] in('10','20','40')],
      'int':latest(INT,True),'rev':latest(REV,True),'debt':latest(DEBT,False),
      'shares':latest(['EntityCommonStockSharesOutstanding'],False,f.get('dei',{}),'shares'),'lastfiled':fil})+'\n'); out.flush()
