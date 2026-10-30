# Progresso

## Estado atual
F01 pronta e verificada (passes: true). Próximo passo: feature F02 (login do apresentador,
criação de sala e regras do banco).

## Sessões
<!-- Uma entrada por sessão, mais recente no topo:
### AAAA-MM-DD · Feature Fxx
- Feito:
- Como verifiquei:
- Problemas / decisões:
- Próximo passo:
-->

### 2026-10-30 · Feature F01 (verificação)
- Feito: init.sh agora também espera a porta 9099 (Auth) antes do teste de fumaça; o Auth sobe
  alguns segundos depois do banco e o teste falhava com ECONNREFUSED 127.0.0.1:9099. Espera
  máxima subiu de 30 s para 60 s. package-lock.json commitado. F01 marcada como true.
- Como verifiquei: parei emuladores e servidor (portas 9000, 9099 e 5173 livres), rodei
  ./init.sh do zero (6/6 do @fumaca passaram) e depois npm test (6/6).
- Problemas / decisões: cuidado com `pkill -f` usando um padrão que aparece na própria linha de
  comando: ele mata o shell que o chamou. Use `pkill -f "[f]irebase emulators:start"`.
- Próximo passo: F02.

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
