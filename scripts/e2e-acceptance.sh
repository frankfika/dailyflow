#!/bin/bash
# End-to-end acceptance scenario for spec section 26.
# Runs against a real Express server with a temp workspace.
set -e

WORKSPACE=$(mktemp -d)
echo "Workspace: $WORKSPACE"

export DAILYFLOW_V2_WORKSPACE_ROOT="$WORKSPACE"
export DAILYFLOW_V2_WORKSPACE_ID="ws_test"
export V2_AI_PROVIDER="local-deterministic"
export PORT=3030

node -e "
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfgPath = path.join(os.homedir(), '.dailyflow', 'config.json');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
cfg.workspaceRoot = process.env.DAILYFLOW_V2_WORKSPACE_ROOT;
cfg.v2 = { enabled: true, inboxV2: true, todayV2: true, memoryV2: true, connectorsV2: false, aiEnabled: false, contextBudgetBytes: 32000 };
fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
"

cd "$(dirname "$0")/.."
PORT=3030 npx tsx server/index.ts > /tmp/server.log 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null; mavis-trash '$WORKSPACE' 2>/dev/null || rm -rf '$WORKSPACE'" EXIT

for i in $(seq 1 30); do
  if curl -s http://localhost:3030/health > /dev/null 2>&1; then break; fi
  sleep 1
done
echo "Server up on port 3030"

PORT=3030
echo "=== 1. Paste meeting minutes ==="
CAPTURE=$(curl -s -X POST http://localhost:$PORT/api/v2/inbox/capture \
  -H "content-type: application/json" \
  -d '{"kind":"quick_capture","title":"周会","body":"讨论了 Q3 计划。\nAlex 答应下周三前给到技术方案。\n我承诺本周五前向 Zhang 发出更新后的合作方案。\n决定：采用两档定价。"}')
SOURCE_ID=$(echo "$CAPTURE" | python3 -c "import sys,json; print(json.load(sys.stdin)['source']['id'])")
echo "Source saved: $SOURCE_ID"

echo "=== 2. Inbox contains source ==="
INBOX=$(curl -s http://localhost:$PORT/api/v2/inbox)
SOURCE_ID="$SOURCE_ID" python3 -c "import sys,json,os; d=json.load(sys.stdin); sid=os.environ['SOURCE_ID']; print(f'Total: {d[\"total\"]}, contains: {any(s[\"id\"]==sid for s in d[\"items\"])}')" <<< "$INBOX"

echo "=== 3. Process (deterministic fallback) ==="
PROC=$(curl -s -X POST http://localhost:$PORT/api/v2/sources/$SOURCE_ID/process -H "content-type: application/json" -d '{}')
echo "$PROC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'fallback={d[\"fallback\"]} reason={d.get(\"fallbackReason\")} empty={d[\"empty\"]}')"

echo "=== 4. Manually create commitment ==="
COM=$(curl -s -X POST http://localhost:$PORT/api/v2/commitments \
  -H "content-type: application/json" \
  -d '{"title":"本周五前向 Zhang 发出更新后的合作方案","outcome":"Zhang 收到包含最新报价的合作方案。","state":"active","importance":"high","dueAt":"2026-07-24T17:00:00+08:00","dueConfidence":"explicit","sourceIds":["'$SOURCE_ID'"]}')
COM_ID=$(echo "$COM" | python3 -c "import sys,json; print(json.load(sys.stdin)['commitment']['id'])")
echo "Commitment: $COM_ID"

echo "=== 5. Reload commitment ==="
RELOAD=$(curl -s http://localhost:$PORT/api/v2/commitments/$COM_ID)
echo "$RELOAD" | python3 -c "import sys,json; c=json.load(sys.stdin)['commitment']; print(f'title={c[\"title\"][:30]}... state={c[\"state\"]}')"

echo "=== 6. Generate today's plan ==="
TODAY=$(date -u +%Y-%m-%d)
PLAN=$(curl -s -X POST http://localhost:$PORT/api/v2/plans/generate \
  -H "content-type: application/json" \
  -d '{"date":"'$TODAY'","availableMinutes":240}')
COM_ID="$COM_ID" python3 -c "import sys,json,os; d=json.load(sys.stdin); cid=os.environ['COM_ID']; items=d['plan']['items']; print(f'Plan items: {len(items)}, has commitment: {any(i[\"commitmentId\"]==cid for i in items)}')" <<< "$PLAN"

echo "=== 7. Re-plan with brief ==="
REPLAN=$(curl -s -X POST http://localhost:$PORT/api/v2/plans/generate \
  -H "content-type: application/json" \
  -d '{"date":"'$TODAY'","brief":"Only 2 hours in the afternoon"}')
echo "$REPLAN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Available: {d[\"plan\"][\"availableMinutes\"]}m')"

echo "=== 8. Set to wait on Alex ==="
REVIEW=$(date -u -v+3d +%Y-%m-%dT09:00:00+00:00 2>/dev/null || date -u -d '+3 days' +%Y-%m-%dT09:00:00+00:00)
WAIT=$(curl -s -X POST http://localhost:$PORT/api/v2/commitments/$COM_ID/wait \
  -H "content-type: application/json" \
  -d '{"waitingOnText":"Alex","reviewAt":"'$REVIEW'"}')
echo "$WAIT" | python3 -c "import sys,json; c=json.load(sys.stdin)['commitment']; print(f'state={c[\"state\"]} waitingOnText={c.get(\"waitingOnText\")}')"

echo "=== 9. Complete with outcome ==="
COMP=$(curl -s -X POST http://localhost:$PORT/api/v2/commitments/$COM_ID/complete \
  -H "content-type: application/json" \
  -d '{"outcomeKind":"sent","outcomeSummary":"已向 Zhang 发送合作方案。还需要在周五前跟 Zhang 确认报价细节。"}')
echo "$COMP" | python3 -c "import sys,json; d=json.load(sys.stdin); fup=d.get('followUpProposal'); print(f'state={d[\"commitment\"][\"state\"]} outcomeId={d[\"outcome\"][\"id\"]} followUpProposal={fup[\"id\"] if fup else None} candidates={fup[\"candidateCount\"] if fup else 0}')"

echo "=== 9b. Follow-up proposal exists, can be accepted (§26 step 14) ==="
FUP_ID=$(echo "$COMP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['followUpProposal']['id'] if d.get('followUpProposal') else '')")
if [ -n "$FUP_ID" ]; then
  APPLY=$(curl -s -X POST http://localhost:$PORT/api/v2/proposals/$FUP_ID/accept \
    -H "content-type: application/json" \
    -d '{}')
  echo "$APPLY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'created={len(d.get(\"created\", []))}')"
fi

echo "=== 10. Memory search ==="
SEARCH=$(curl -s "http://localhost:$PORT/api/v2/memory/search?q=Zhang")
echo "$SEARCH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Hits: {len(d[\"hits\"])}')"

echo "=== 10a. Manually create Evidence + Decision linked to the source (§26 step 10/15) ==="
# Pick a verbatim substring from the meeting body so Evidence is real.
EV=$(SOURCE_ID="$SOURCE_ID" python3 -c "
import json, os, urllib.request
req = urllib.request.Request(
  'http://localhost:$PORT/api/v2/evidence',
  data=json.dumps({'sourceId': os.environ['SOURCE_ID'], 'quote': 'Alex 答应下周三前给到技术方案。'}).encode('utf-8'),
  headers={'content-type': 'application/json'},
  method='POST',
)
print(urllib.request.urlopen(req).read().decode('utf-8'))
")
EV_ID=$(echo "$EV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('evidence',{}).get('id',''))")
echo "Evidence: $EV_ID"

DEC=$(EV_ID="$EV_ID" python3 -c "
import json, os, urllib.request
req = urllib.request.Request(
  'http://localhost:$PORT/api/v2/decisions',
  data=json.dumps({
    'title': '采用两档定价',
    'decision': '采用两档定价更好覆盖客户分层',
    'rationale': '客户分层需求明确',
    'evidenceIds': [os.environ['EV_ID']],
  }).encode('utf-8'),
  headers={'content-type': 'application/json'},
  method='POST',
)
print(urllib.request.urlopen(req).read().decode('utf-8'))
")
DEC_ID=$(echo "$DEC" | python3 -c "import sys,json; print(json.load(sys.stdin)['decision']['id'])")
echo "Decision: $DEC_ID"

# Patch the commitment to include the same evidenceId so the link is
# bidirectional (§7.5 + §15.4).
COM_ID="$COM_ID" EV_ID="$EV_ID" python3 -c "
import json, os, urllib.request
req = urllib.request.Request(
  'http://localhost:$PORT/api/v2/commitments/' + os.environ['COM_ID'],
  data=json.dumps({'evidenceIds': [os.environ['EV_ID']]}).encode('utf-8'),
  headers={'content-type': 'application/json'},
  method='PATCH',
)
print(urllib.request.urlopen(req).read().decode('utf-8'))
" > /dev/null
echo "Commitment patched to reference evidence $EV_ID"

echo "=== 10b. Memory search for decision (Q3 / 决定) returns Decisions (§26 step 15) ==="
SEARCH_DEC=$(curl -s --get "http://localhost:$PORT/api/v2/memory/search" --data-urlencode "q=Zhang")
echo "$SEARCH_DEC" | python3 -c "import sys,json; d=json.load(sys.stdin); types=[h['type'] for h in d['hits']]; print(f'Hits: {len(d[\"hits\"])}, types={set(types)}')"

echo "=== 10c. /memory/context returns decisions + evidence (§26 step 10) ==="
CTX=$(curl -s "http://localhost:$PORT/api/v2/memory/context?commitmentId=$COM_ID")
echo "$CTX" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'decisions={len(d[\"related\"][\"decisions\"])} evidence={len(d[\"related\"][\"evidence\"])} sources={len(d[\"related\"][\"sourceItems\"])}')"

echo "=== 11. Connectors blocked ==="
CONN=$(curl -s http://localhost:$PORT/api/v2/connectors)
echo "$CONN" | python3 -c "import sys,json; d=json.load(sys.stdin); blocked=[c for c in d['items'] if c.get('blockedBy')]; print(f'Total: {len(d[\"items\"])}, blocked: {len(blocked)}')"

echo "=== 12. Index rebuild ==="
STATUS=$(curl -s http://localhost:$PORT/api/v2/status)
echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Index: scanned={d[\"index\"][\"scanned\"]} entities={d[\"index\"][\"entities\"]}')"

echo "=== 13. State machine: invalid transition blocked ==="
NEW_COM=$(curl -s -X POST http://localhost:$PORT/api/v2/commitments \
  -H "content-type: application/json" \
  -d '{"title":"Will fail","outcome":"Test","state":"active"}')
NEW_ID=$(echo "$NEW_COM" | python3 -c "import sys,json; print(json.load(sys.stdin)['commitment']['id'])")
COMP2=$(curl -s -X POST http://localhost:$PORT/api/v2/commitments/$NEW_ID/complete -H "content-type: application/json" -d '{"outcomeKind":"delivered","outcomeSummary":"x"}')
echo "$COMP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'After complete: state={d[\"commitment\"][\"state\"]}')"
RESUME=$(curl -s -X POST http://localhost:$PORT/api/v2/commitments/$NEW_ID/resume -H "content-type: application/json" -d '{}')
echo "$RESUME" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Resume attempt: {d}')"

echo "=== ALL CHECKS COMPLETED ==="
