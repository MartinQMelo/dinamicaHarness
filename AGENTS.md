# AGENTS.md — Dinâmica "Você é o agente"

Página web em tempo real para uma aula sobre harness engineering (Samsung Ocean · UnB).
Alunos entram por QR code, viram grupos de "agentes" e montam a tela de um app no celular.
A especificação completa está em `especificacao/dinamica.md`. Leia antes de codar.

## Stack (não mude sem registrar o motivo em claude-progress.md)
- HTML + CSS + JavaScript puro em `site/`, sem build. Firebase JS SDK v10+ via CDN (ES modules).
- Firebase Realtime Database + Firebase Auth (anônimo para alunos, e-mail/senha para o apresentador).
- Hospedagem: GitHub Pages, publicado por `.github/workflows/pages.yml` a partir de `site/`.
- Testes: Firebase Emulator Suite + Playwright (`tests/`). Nada de teste contra o Firebase real.

## Comandos
- `./init.sh` — instala dependências, sobe os emuladores e o servidor estático. Rode no início de toda sessão.
- `npm test` — roda os testes end-to-end com Playwright contra os emuladores.
- `npm run serve` — serve `site/` em http://localhost:5173.

## Como trabalhar (toda sessão)
1. Leia `claude-progress.md` e `git log --oneline -10`.
2. Rode `./init.sh`. Se algo estiver quebrado, conserte antes de qualquer feature nova.
3. Escolha a PRIMEIRA feature com `"passes": false` em `feature_list.json`. Trabalhe só nela.
4. Implemente e escreva o teste end-to-end que prova cada item de `"steps"`.
5. Só mude `"passes"` para `true` depois que `npm test` passar. Nunca edite descrição ou steps de uma feature.
6. Faça commit (uma feature por commit) e atualize `claude-progress.md`: o que fez, como verificou, o próximo passo.

## Regras
- Toda a interface em português do Brasil. Funciona bem num celular de 360 px de largura.
- O estado do jogo vive SÓ no Realtime Database. Nada de estado importante em variável local.
- Somente o apresentador muda `salas/{sala}/estado`. Garanta isso nas regras do banco, não só na interface.
- Nunca coloque senha no código. A config do Firebase (apiKey etc.) é pública e vai em `site/js/firebase-config.js`.
- Não adicione funcionalidades fora de `feature_list.json`. Ideias novas vão para a seção "Ideias" do progresso.
- Saia de toda sessão com os testes passando e o git limpo.
