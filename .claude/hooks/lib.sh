# Shared helpers for hooks. Sourced, not executed.

# Print tool_input.<field> from the hook's JSON on stdin, using whatever is installed.
tool_input_field() {
  local field=$1 json
  json=$(cat)
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg f "$field" '.tool_input[$f] // empty' <<<"$json" 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("tool_input",{}).get(sys.argv[1]) or "", end="")
except Exception: pass' "$field" <<<"$json"
  elif command -v node >/dev/null 2>&1; then
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input[process.argv[1]]||"")}catch{}})' "$field" <<<"$json"
  else
    echo "Hook needs jq, python3 or node to read its input." >&2
    exit 2
  fi
}
