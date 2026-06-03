import sqlite3, json, pprint

conn = sqlite3.connect('endpointwatch.db')
cur = conn.cursor()
cur.execute("SELECT id,machine_id,provider,model,generated_at,summary,severity,confidence,signals,recommendations,ai_enabled FROM machine_analyses ORDER BY generated_at DESC")
rows = cur.fetchall()
print('TOTAL ROWS:', len(rows))
for r in rows[:10]:
    id,mid,prov,model,gen,summary,severity,conf,signals,recs,ai = r
    print('ID',id,'MID',mid,'prov',prov,'model',model,'gen',gen)
    print(' summary:', summary)
    print(' severity:', severity,'conf:',conf,'ai_enabled',ai)
    try:
        print(' signals:', json.loads(signals) if signals else signals)
    except Exception:
        print(' signals raw:', signals)
    try:
        print(' recs:', json.loads(recs) if recs else recs)
    except Exception:
        print(' recs raw:', recs)
    print('-'*40)

conn.close()
