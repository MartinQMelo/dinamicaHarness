#!/usr/bin/env bash
# Prepara o ambiente antes de qualquer trabalho. Rode no início de toda sessão.
set -euo pipefail
cd "$(dirname "$0")"

echo "== Verificando ferramentas =="
command -v node >/dev/null || { echo "ERRO: instale o Node.js 20+"; exit 1; }
command -v java >/dev/null || { echo "ERRO: instale o Java 11+ (necessário para os emuladores do Firebase)"; exit 1; }
node -v

if [ -f package.json ]; then
  echo "== Instalando dependências =="
  npm install --silent
  npx playwright install chromium >/dev/null 2>&1 || true
else
  echo "AVISO: ainda não há package.json. A feature F01 cria o projeto."
  exit 0
fi

echo "== Subindo emuladores e servidor estático (se ainda não estiverem rodando) =="
if ! curl -s localhost:9000 >/dev/null 2>&1; then
  nohup npx firebase emulators:start --only auth,database --project demo-dinamica > .emuladores.log 2>&1 &
fi
if ! curl -s localhost:5173 >/dev/null 2>&1; then
  nohup npm run serve > .servidor.log 2>&1 &
fi

for i in $(seq 1 30); do
  if curl -s localhost:9000 >/dev/null 2>&1 && curl -s localhost:5173 >/dev/null 2>&1; then
    echo "OK: emuladores em localhost:9000 (banco) e 9099 (auth); site em http://localhost:5173"
    echo "== Teste de fumaça =="
    npm test -- --grep @fumaca || { echo "ERRO: teste de fumaça falhou. Conserte antes de seguir."; exit 1; }
    exit 0
  fi
  sleep 1
done
echo "ERRO: emuladores ou servidor não subiram. Veja .emuladores.log e .servidor.log"
exit 1
