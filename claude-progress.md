# Progresso

## Estado atual
F01 a F05 prontas e verificadas (passes: true). Próximo passo: feature F06 (controle das fases e
cronômetro). Atenção: ao entrar na r1, o controle precisa criar as telas com telasIniciais (ver F05).

## Sessões
<!-- Uma entrada por sessão, mais recente no topo:
### AAAA-MM-DD · Feature Fxx
- Feito:
- Como verifiquei:
- Problemas / decisões:
- Próximo passo:
-->

### 2026-10-30 · Feature F05
- Feito: site/js/tela.js (sem Firebase, importável pelos testes): CATALOGO dos 10 tipos com texto
  padrão neutro (não entrega os critérios), operações puras adicionar/alterar/mover/remover por id,
  listaDeComponentes (array ou objeto do banco), telasIniciais(grupos, rodada) → atualização
  multi-caminho `telas/r{n}_{gid}: {rodada, autor, dono}`, telaDoGrupo e desenharTela (moldura de
  celular; selo "editando: Fulano", sem mostrar o próprio aluno). site/js/editor.js: o celular
  acompanha estado/fase (onValue); em r1 e r1_troca mostra faixa do grupo, frase de config/frase e o
  editor. Cada mudança é uma transação em telas/{tid}/componentes (cada item tem `id`); texto grava
  250 ms depois da digitação; foco/saída do campo grava/limpa editandoPor (uid). Telão: em r1 e
  r1_troca mostra "Rodada 1", a frase e a tela de cada grupo (na cor do dono) com o mesmo desenharTela.
  Regras: telas lidas por qualquer autenticado; componentes só escritos por aluno cujo grupo é o
  `dono`, com rodada 1 e fase r1/r1_troca; itens validados (índice 0..29, tipo do catálogo, texto
  ≤ 300, sem campos extras). dono/autor/rodada e criar tela: só o admin.
- Como verifiquei: npm test 28/28 (5 novos em tests/f05-editor.spec.js): troca para r1 sem
  recarregar e sem rolagem horizontal em 360 px; os 10 tipos adicionados, texto editado de cada um
  (banco e desenho), mover e remover; dois alunos do mesmo grupo veem adicionar/editar/mover/remover
  e o "editando: Duda" com timeout de 2 s; regras (outro grupo, dono, rodada, criar tela, tipo
  inválido, texto longo, fora da fase → negado); HTML da moldura igual no celular e no telão e o
  telão acompanha ao vivo. Rodei o arquivo da F05 mais 2 vezes sem falha e conferi por screenshot.
- Problemas / decisões: tocar num componente com o campo em foco perdia o clique (o blur grava e a
  moldura é redesenhada antes do click). Resolvido com seleção por delegação (pointerdown/pointerup
  no mesmo id) e desenhando a moldura já com o texto pendente. Quem cria as telas da R1 é o
  controle (F06), com telasIniciais e a fase na mesma atualização; os testes da F05 fazem isso como
  dono. editandoPor pode ficar preso se o aluno fechar a página editando (sem onDisconnect em item
  de lista); o selo some na próxima vez que alguém focar e sair daquele componente.
- Próximo passo: F06. Ao avançar para r1, gravar `{...telasIniciais(grupos, 1), 'estado/fase': 'r1'}`.

### 2026-10-30 · Feature F04
- Feito: site/js/telao.js + telao.html. O telão lê ?sala=, faz login anônimo e só lê o banco.
  No lobby mostra o QR code (qrcode-generator 1.4.4 via CDN jsDelivr `+esm`, desenhado num canvas
  com margem branca), o link completo index.html?sala=XXXX, o código da sala, a contagem de alunos
  e de grupos e a lista de grupos na cor de cada um, com o número de membros, tudo por onValue.
  Fora do lobby mostra só "Fase: X" (as telas das outras fases vêm nas features delas). Sem sala
  ou com sala inexistente mostra um aviso. Estilos .telao-* em base.css (números com 48 px).
- Como verifiquei: npm test 23/23 (4 novos em tests/f04-telao.spec.js, telão em 1920x1080):
  o QR é decodificado de verdade com o jsQR (devDependency, injetado na página com
  addScriptTag) e o link lido abre a entrada da sala; alunos entram em outros contextos e a
  contagem/lista mudam de 0 → 1 → 3 alunos e 1 → 2 grupos (Azul 2, Verde 1, nas cores certas)
  sem recarregar (marca em window); o font-size calculado do código, das contagens e dos números
  dos grupos é ≥ 32 px. Repeti o arquivo da F04 mais 2 vezes sem falha. Conferi por screenshot.
- Problemas / decisões: o QR vem de CDN, como o Firebase; sem internet ele não aparece (o link
  e o código continuam na tela). Os rótulos alternam singular/plural ("1 aluno").
- Próximo passo: F05.

### 2026-10-30 · Ferramenta: npm run dev
- Feito: `npm run dev` = ./init.sh + scripts/semear-dev.mjs, que cria no emulador de Auth o
  apresentador admin@teste.com / senha123 e grava admins/admin@teste,com: true. Dá para rodar de
  novo sem erro (ignora EMAIL_EXISTS). Documentado em AGENTS.md › Comandos. Não é feature.
- Como verifiquei: rodei npm run dev duas vezes; um teste descartável entrou no controle com essas
  credenciais e criou uma sala; npm test 19/19.
- Próximo passo: F04.

### 2026-10-30 · Decisão 11 (grupos) registrada na especificação
- Feito: o apresentador aceitou a regra de grupos e o risco (sem Cloud Functions). A Decisão 11 foi
  registrada em especificacao/dinamica.md e a frase da seção Segurança, corrigida.
- Pendência da F06 (pedido do apresentador; não cabe na F04, que é só o telão): no controle, mostrar
  o tamanho de cada grupo e um botão para remover um aluno do grupo. Remover = apagar, numa única
  atualização multi-caminho, `grupos/{gid}/membros/{uid}` e `alunos/{uid}`. Assim o aluno volta à
  tela de nome e entra de novo pela distribuição (as regras de alunos/{uid} exigem ser membro do
  grupo, então não dá para só tirar do grupo e manter o registro). O admin já tem escrita em salas/**.
  Fazer junto da F06 e cobrir com teste e2e.
- Próximo passo: F04.

### 2026-10-30 · Feature F03
- Feito: site/js/grupos.js (paleta Azul…Vermelho, depois "Azul 2"; gid = g1, g2…;
  escolherGrupo: no lobby, o grupo não cheio com menos membros, ou um novo se todos cheios; fora
  do lobby, o menor, sem criar). site/js/aluno.js + index.html: lê ?sala=, Auth anônimo, form de
  nome (até 30), transação em grupos/{gid} e depois grava alunos/{uid} {nome, grupo, entrouEm}.
  Mostra o cartão na cor do grupo, o nome do grupo e os colegas ao vivo. Ao recarregar, se
  alunos/{uid} existe, vai direto para o grupo. Sala inexistente mostra um aviso. Regras novas:
  alunos/{uid} só o próprio (nome 1..30 e precisa ser membro do grupo informado); grupos lidos
  por qualquer autenticado.
- Como verifiquei: npm test 19/19 (6 novos em tests/f03-alunos.spec.js; o dos 12 alunos entra
  com os 12 ao mesmo tempo, em contextos separados, e confere 5/5/2, nomes, cores, a cor do cartão
  e os colegas em cada celular). Rodei o arquivo da F03 mais 2 vezes, sem falha intermitente.
- Problemas / decisões: a especificação diz que só o apresentador escreve em `grupos`, mas a
  distribuição automática exige que o aluno se coloque no grupo. Regra adotada: o aluno só pode
  ADICIONAR A SI MESMO em grupos/{gid}/membros, sem mudar cor/nome/ordem; criar grupo só no lobby.
  O resto continua só do admin. Lacuna conhecida: as regras não contam filhos, então não conseguem
  impedir que um aluno malicioso, na mesma escrita em que se adiciona, remova outro membro, nem
  que passe do limite do grupo. O limite é garantido pela transação no cliente.
  Transação do RTDB: a 1ª chamada recebe o cache local (pode ser null mesmo com o grupo existindo);
  por isso, com null, a função sempre propõe a criação e o servidor reexecuta com o valor real.
  O fluxo de quem entra atrasado (fora do lobby) já está no código, mas o teste é da F13.
- Próximo passo: F04. Reaproveitar grupos.js no telão. Para a contagem, alunos e grupos já são
  legíveis por qualquer autenticado (o telão faz login anônimo).

### 2026-10-30 · Ajuste do modelo: critérios com chaves c1..c5
- Feito: a pedido do apresentador, as chaves dos critérios passaram de 1..5 para c1..c5 em todo o
  modelo (segredo/criterios, declarados, avaliacaoR1, revisao/aprovados), na especificação, em
  CRITERIOS_PADRAO (site/js/controle.js) e nos testes da F02.
- Como verifiquei: npm test 13/13; o teste de "Criar sala" confere que segredo/criterios volta
  como objeto com as chaves c1..c5, não como lista.
- Próximo passo: F03.

### 2026-10-30 · Feature F02
- Feito: database.rules.json com as regras de verdade: admin = `admins/{email com "." → ","}`
  (comparado em minúsculas); só admin lê/escreve `salas/**`; qualquer autenticado lê
  `salas/{sala}/estado` e `config`; `segredo` e o resto ficam só do admin. site/js/controle.js +
  controle.html: login e-mail/senha, "Sair", aviso quando o e-mail não está em admins, "Criar sala"
  (4 letras sem I/O, confere se o código está livre) gravando estado {fase: lobby, timerFim: 0,
  atualizadoEm}, config {tamanhoGrupo: 5, frase} e segredo/criterios (os 5 padrão). Mostra o
  código, o link dos alunos e o link do telão. tests/emulador.js: helpers que carregam as regras do
  arquivo no emulador, criam usuário no Auth e semeiam admin via REST (Bearer owner).
- Como verifiquei: npm test 13/13 (7 novos em tests/f02-controle.spec.js: login, senha errada,
  não-admin, criar sala, anônimo não escreve estado/segredo, anônimo não lê segredo, admin lê/escreve).
- Problemas / decisões: chaves 1..5 viravam lista no banco (null no índice 0); resolvido na
  sessão seguinte trocando para c1..c5 (ver abaixo). Leitura negada no SDK vem com
  mensagem "Permission denied" sem `code`; o teste normaliza. Alunos ainda não conseguem escrever
  em nada: as regras de alunos/grupos/telas/votos entram nas features F03, F05 etc.
- Próximo passo: F03. Vai precisar de regras para `alunos/{uid}` (só o próprio) e de uma forma de
  o aluno entrar num grupo (transação em `grupos`), que hoje é só do admin.

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
