# Progresso

## Estado atual
F01 implementada mas AINDA NÃO VERIFICADA (passes: false): a máquina não tinha node nem java,
então ./init.sh e npm test não rodaram. Próximo passo: instalar Node 20+ e Java 11+, rodar
./init.sh e npm test, corrigir o que falhar e só então marcar F01 como true.

## Sessões
<!-- Uma entrada por sessão, mais recente no topo:
### AAAA-MM-DD · Feature Fxx
- Feito:
- Como verifiquei:
- Problemas / decisões:
- Próximo passo:
-->

### 2026-10-30 · Feature F01 (parcial, não verificada)
- Feito: decisões do apresentador registradas em especificacao/dinamica.md ("Decisões" e modelo de
  dados) e cadastro de admin em PROMPTS.md. Esqueleto: package.json (http-server, firebase-tools,
  Playwright), firebase.json (auth 9099, database 9000, projeto demo-dinamica), database.rules.json
  (tudo fechado; F02 escreve as regras de verdade), site/index.html, telao.html, controle.html,
  site/css/base.css, site/js/firebase-config.js (modelo com placeholders COLE_AQUI; em localhost
  conecta nos emuladores; fora dele, sem config, mostra aviso .aviso-config), site/js/conexao.js
  (marca data-conectado no <html>), .github/workflows/pages.yml, tests/fumaca.spec.js (@fumaca).
- Como verifiquei: só checagem estática (JSON válido, bash -n init.sh). npm test NÃO rodou.
- Problemas / decisões: package-lock.json não existe ainda (será criado no primeiro npm install;
  commitar junto). O Playwright também sobe emuladores/servidor sozinho se o init.sh não tiver subido.
  O aviso de config ausente fora de localhost não tem teste automático (não é step da F01).
- Próximo passo: rodar ./init.sh e npm test; se passar, marcar F01 true e commitar o package-lock.

## Ideias (fora do escopo, não implementar)
