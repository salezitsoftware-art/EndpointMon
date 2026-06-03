import requests
r = requests.get('http://127.0.0.1:8000/api/ai/machines/2/analyses', headers={'x-api-key':'1nw8eCc31CfB7rLb5kc7CDnL/8yPcd+Ng+xThBWQPdI='}, timeout=10)
print('STATUS', r.status_code)
print('TEXT', r.text)
print('JSON', None)
try:
    print(r.json())
except Exception as e:
    print('json error', e)
