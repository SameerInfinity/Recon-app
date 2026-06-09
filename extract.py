import json
import codecs

res = []
try:
    with codecs.open(r'C:\Users\samee\.gemini\antigravity-ide\brain\7409f0dd-228c-4b26-a377-e7dd83543f4c\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            if 'const CIVIL_CARDS = [' in line or 'CIVIL_CARDS_REF' in line:
                obj = json.loads(line)
                content = obj.get('content', '')
                res.append(content)
except Exception as e:
    res.append(str(e))

with codecs.open('output.txt', 'w', encoding='utf-8') as f:
    f.write('\n\n====\n\n'.join(res))
