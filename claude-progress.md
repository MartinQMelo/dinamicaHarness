# Progresso

## Estado atual
F01 a F13 prontas e verificadas (passes: true). Próximo passo: a próxima feature com passes false em
feature_list.json. Pontos de extensão: atualizacaoDeFase (site/js/fases.js), aluno.js
(uma seção por fase) e telao.js (uma seção por fase).

## Sessões
<!-- Uma entrada por sessão, mais recente no topo:
### AAAA-MM-DD · Feature Fxx
- Feito:
- Como verifiquei:
- Problemas / decisões:
- Próximo passo:
-->

### 2026-11-01 · Feature F13
- Feito: só o teste tests/f13-resiliencia.spec.js; o site já fazia o que a feature pede, sem mudança de
  código. Reconexão: o uid anônimo fica salvo no navegador, a página lê alunos/{uid} ao abrir (se já
  tem grupo, pula a tela de nome) e o SDK do Firebase reconecta sozinho e reenvia os onValue, então
  fase e tela em mãos se atualizam. Entrada atrasada: entrarEmGrupo/escolherGrupo põem quem chega
  depois do lobby no grupo com menos membros (Decisão 6) e o editor mostra telaDoGrupo (a tela que o
  grupo tem agora, por dono).
- Como verifiquei: npm test 53/53 (2 novos). Reconexão: Ana cai de verdade (setOffline do Playwright
  mais goOffline do SDK, porque o modo offline do navegador não fecha um WebSocket aberto;
  data-conectado="nao"); enquanto isso o Beto edita e o controle vai para a r1_troca, e a Ana não
  fica sabendo. Ao voltar, sem recarregar: data-conectado="sim", fase r1_troca, grupo Azul, a tela
  herdada do Beto, aviso de sessão, mesmo uid, continua editando. Depois fecha a aba, o controle vai
  para a r1_avaliacao e ela reabre o link: cai direto na avaliação, sem pedir nome, mesmo uid, nenhum
  aluno nem membro duplicado. Entrada atrasada: na r2 com Azul (2) e Verde (1), Caio entra, vai para o
  Verde sem grupo novo e vê o editor com a tela da r2 do Verde, os cartões e o progress.md já
  escritos; 360 px sem rolagem; edita e a Dani vê. Depois da troca forçada na r2_troca, Eva entra
  (empate → Azul) e vê a tela que o Azul herdou, não a que escreveu, com o aviso de sessão.
- Problemas / decisões: não há aviso visível de "sem conexão" no celular, só data-conectado no <html>
  (a feature não pede; ver Ideias).
- Próximo passo: a próxima feature com passes false.

### 2026-10-31 · Feature F12
- Feito: site/js/entrada.js: entrarEmGrupo(db, sala, uid) saiu do aluno.js e recebe o banco de quem
  entra (o celular e os bots usam a mesma transação). firebase-config.js › criarConexaoExtra(nome): outro
  app do Firebase com Auth só na memória e a sua própria conexão com o banco (emulador em localhost).
  site/js/bots.js (sem Firebase): acaoDoBot(sala, uid, sorteio) olha a sala inteira e devolve uma ação
  que as regras deixam o grupo do bot fazer: r1/r1_troca e r2 editam a tela em mãos (mudancaAleatoria:
  adiciona, edita com textos de carona, move, remove, sempre 3 a 8 componentes); r2 escreve o progress.md
  e marca a feature_list; r2_troca antes da troca escreve o progress.md e sai (saiu {por, em}), depois da
  troca edita a herdada; r1_avaliacao, r2_declaracao marcam critérios; r3 decide o que falta e envia;
  oficina preenche um campo por vez; votacao vota num harness de outro grupo (às vezes troca). site/js/
  ensaio.js: cada bot é um usuário anônimo de verdade com a sua conexão (grava pelas mesmas regras dos
  alunos); o controle lê salas/{sala} inteira como admin e, a cada 200 ms, cada bot livre faz uma ação
  (em média a cada 1,5 s). Gravação recusada só conta em falhasDosBots(). Bot que some de alunos
  (Remover, Reiniciar sala) é desligado; abrir outra sala desliga todos. Nomes "Bot N" continuam a
  numeração dos bots que já estão na sala. Controle: seção "Ensaio" com "Adicionar 20 alunos falsos" e
  "N alunos falsos jogando".
- Como verifiquei: npm test 51/51 (3 novos em tests/f12-ensaio.spec.js): teste de acaoDoBot no Node
  (lobby/sem grupo → nada, tela herdada, progress.md antes de sair, espera depois de sair, revisão envia só
  com tudo decidido, nunca vota no próprio grupo, 3 a 8 componentes); botão cria Bot 1..Bot 20, 20 uids
  diferentes, cada um membro do seu grupo, 4 grupos de 5, controle e telão mostram; mais 20 continuam em
  Bot 21..40; reiniciar desliga os bots. Partida completa com 20 bots, controle e telão abertos: telas
  editadas na r1, mudadas depois da troca, avaliação, r2 com progress.md, "4 de 4 grupos prontos" e saiu
  gravado por um bot do grupo dono, declaração, 4 revisões enviadas com os 5 critérios, telão no
  resultado, 4 harnesses completos, 20 votos fora do próprio grupo, vencedor e .zip habilitado; zero
  erros no console (controle e telão). Repeti o arquivo 2 vezes sem falha (~35 s por partida).
- Problemas / decisões: os bots só vivem enquanto o controle que os criou está aberto (Auth na memória);
  recarregar o controle deixa os bots na sala, parados. Numa partida medida houve 1 gravação recusada:
  dois bots do mesmo grupo apertaram "Sair" juntos (a regra aceita um saiu só), como dois alunos
  apertando ao mesmo tempo; aparece como FIREBASE WARNING (aviso, não erro). Os bots não gravam
  editandoPor. No Firebase real, cada clique cria 20 contas anônimas (o Auth limita criações por IP).
- Próximo passo: F13.

### 2026-10-31 · Feature F11
- Feito: site/js/harness.js (sem Firebase): PROJETOS (chaves ru, caronas, provas, atletica), limites
  (AGENTS.md 8 linhas/800, nome 80, aceite e evidência 200, progresso 280), limitarLinhas,
  funcionalidades (aceita features como lista ou objeto), harnessesDaSala, contarVotos (só voto de
  aluno que ainda está na sala, num harness que existe, de outro grupo), lideres, vencedorDe (único
  líder ou estado/vencedor entre os empatados: Decisão 9), arquivosDoHarness (AGENTS.md,
  feature_list.json no formato {id, description, steps:[aceite], evidencia, passes:false} e
  claude-progress.md com "## Primeiro passo"), nomeDoZip e desenharHarness (cartão usado no celular e
  no telão). site/js/zip.js: .zip "stored" sem biblioteca (CRC32, nomes UTF-8). Celular:
  site/js/oficina.js e a seção tela-oficina (select do projeto, AGENTS.md cortado em 8 linhas com
  "N de 8 linhas", 3 funcionalidades com aceite e evidência, primeiro passo); cada campo grava em
  oficina/{gid}/{campo} 250 ms depois de digitar, o campo em foco não é sobrescrito. site/js/votacao.js
  e a seção tela-votacao (votacao e fim): harnesses dos outros grupos com "Votar em X" / "Seu voto ✓
  X", o do próprio grupo à parte sem botão; no fim, "Votação encerrada." sem botões. Telão: seção
  telao-oficina nas fases oficina/votacao/fim com os harnesses ao vivo, "N votos" (≥ 32 px) na
  votação e no fim, e no fim "Vencedor: X" ou "Empate entre X e Y…", com os líderes contornados.
  Controle: na votacao e no fim, votos por grupo; no fim, o vencedor, botões "Escolher X" no empate
  (grava estado/vencedor) e "Baixar harness vencedor (.zip)" (desabilitado enquanto há empate).
  atualizacaoDeFase recebe estado e apaga estado/vencedor ao sair do fim; remover aluno apaga o voto.
  Regras: oficina legível por autenticado; oficina/{gid} só do grupo e só na oficina; projeto da
  lista, agents ≤ 800 com no máximo 7 quebras de linha, features/{0..2} com nome/aceite/evidencia,
  progresso ≤ 280, nada além disso. votos legível por autenticado; votos/{uid} só o próprio, só na
  votacao, só com grupo, num grupo que existe e tem harness, diferente do próprio.
- Como verifiquei: npm test 48/48 (3 novos em tests/f11-oficina.spec.js): 3 celulares (2 no Azul,
  1 no Verde), 360 px sem rolagem lateral; projeto e campos aparecem no colega do grupo; 10 linhas
  viram 8 (campo e banco); banco com o harness completo; telão mostra os harnesses ao vivo sem votos;
  regras (antes da oficina, outro grupo, 9 linhas, projeto fora da lista, 4ª funcionalidade, campos
  extras, texto longo, voto na oficina, editar na votação → negado; 8 linhas ok). Votação com 3
  grupos: não aparece o próprio grupo, voto e troca de voto (um registro só no banco), telão e
  controle contando ao vivo, regras (próprio grupo, voto de outro aluno, grupo inexistente, não
  texto, votar no fim → negado); no fim, "Vencedor: Laranja" e o .zip baixado de verdade (download do
  Playwright), lido pelo diretório central com CRC conferido por zlib.crc32. Empate: telão com os
  empatados, controle com download desabilitado, escolher Verde e depois Azul (zip de cada um), aluno
  não grava estado/vencedor, voltar apaga a escolha. Conferi que os testes falham com as regras de
  voto e de linhas abertas; validei um .zip gerado com o zipfile do Python; repeti o arquivo 2 vezes
  sem falha; conferi por screenshot (360 px e 1920).
- Problemas / decisões: o regex das regras lê \n como a letra n e não aceita quebra de linha literal;
  as 8 linhas são contadas com `val.length - val.replace('\n', '').length <= 7` (string com escape
  funciona). O projeto vai para o banco como chave (as regras não lidam bem com acento). Só grupo
  que escreveu algo na oficina vira harness votável. Sem votos, todos empatam com 0 e o controle
  escolhe. O texto digitado nos últimos 250 ms antes de sair da oficina se perde (como na F07).
- Próximo passo: F12.

### 2026-10-31 · Feature F10
- Feito: fases.js › escolherRevisores(grupos, telas): para as telas da R2 com dono num grupo, tenta um
  deslocamento k na ordem dos grupos a partir do dono (cada grupo revisa uma tela só) até que nenhum
  revisor seja autor nem dono; senão escolhe tela a tela (≠ autor e ≠ dono; senão ≠ dono; senão o
  dono). atualizacaoDeFase('r3') grava telas/{tid}/revisao/revisor só nas telas que ainda não têm
  (dono não muda: Decisão 5; voltar e avançar não troca o revisor). criterios.js: marcasDe(tela,
  'revisao/aprovados') usado por mediaDeCriterios, e vitoriasFalsas(tela) = declarado pronto e não
  aprovado. Celular: site/js/revisao.js e a seção tela-revisao na r3: a tela revisada, cada critério
  com Aprova/Reprova (grava revisao/aprovados/{c} na hora, o grupo inteiro vê), "N de 5 critérios
  avaliados", "Enviar revisão" só com todos decididos (grava enviadoEm). Depois de enviar: "O agente
  disse: pronto/não pronto", selo "Vitória falsa" e o total; as opções ficam travadas. Telão: seção
  telao-resultado na fase resultado: R1 (média avaliacaoR1), R2 declarado pronto e aprovado pelo
  revisor (médias), faixa vermelha "Vitória falsa: N critérios declarados prontos e reprovados pelo
  revisor" e cada tela da R2 com declarado/aprovado e suas vitórias falsas. Regras: revisao/aprovados/
  {c1..c5} booleano, só do grupo revisor, rodada 2, só na r3, antes de enviar; enviadoEm = now, uma
  vez, só do revisor na r3 e só com todos os critérios de config/criterios decididos; revisor e dono
  continuam só do apresentador.
- Como verifiquei: npm test 45/45 (3 novos em tests/f10-revisao.spec.js): escolherRevisores com 3 a 6
  grupos, com e sem troca (revisor ≠ autor, ≠ dono, todos diferentes), 2 e 1 grupo, telas da R1 e de
  grupo apagado fora; pelo controle com 3 grupos (g1→g3, g2→g1, g3→g2, donos iguais), voltar/avançar
  mantém revisão começada. 3 celulares: revisor vê a tela e os 5 critérios sem nenhum texto das
  marcações do autor (nem escondido), marca/muda de ideia, regras (enviar incompleta, tela de outro
  revisor, tela em mãos, c9, não booleano, mudar revisor/dono, mudar depois de enviar, enviar de
  novo, revisar fora da r3 → negado), envio mostra declarados e 2 vitórias falsas, também depois de
  recarregar; telão no resultado com as médias e a contagem. Teste do resultado com dados semeados:
  médias, singular/plural, atualização ao vivo, fundo vermelho do destaque, números ≥ 32 px, voltar
  esconde. Conferi que os testes falham com as regras da revisão abertas e sem a escolha de revisor
  na r3; o teste pegou um vazamento (o texto das vitórias falsas ficava no DOM escondido antes de
  enviar), corrigido. Repeti o arquivo 2 vezes sem falha; conferi por screenshot (360 px e 1920).
- Problemas / decisões: telas/ é legível por qualquer autenticado, então "não vê as marcações do autor"
  é garantido pela página, não pelas regras (esconder declarados exigiria reestruturar a leitura de
  telas inteira). Com 2 grupos o revisor é diferente do dono (acaba sendo o autor). As escolhas do
  revisor vão para o banco antes de enviar (estado só no banco); só enviadoEm as congela. Na r3 o
  telão continua mostrando "Fase: Rodada 3 · revisão" (sem contagem de revisões enviadas: fora da F10).
- Próximo passo: próxima feature de feature_list.json.

### 2026-10-31 · Feature F09
- Feito: fases.js: RODADA_DA_TROCA inclui r2_troca (para "voltar" desfazer); TROCA_AO_ENTRAR = só
  r1_troca (na r2_troca, entrar na fase NÃO troca: Decisão 3); ao entrar na r1 ou na r2 cria as
  telas em branco que faltam (r2_{gid}) e apaga os `saiu` da rodada; contarProntos(telas, grupos).
  site/js/cartoes.js (celular): cartões AGENTS.md (texto da especificação), feature_list (critérios
  de config/criterios com caixa "pronto?" → telas/{tid}/declarados/{c}) e progress.md (≤ 280,
  grava 250 ms depois de digitar). Na r2_troca: botão "Sair da sessão", habilitado só com o
  progress.md preenchido; grava saiu {por, em}; depois disso o editor some ("Vocês saíram…") e o
  progress.md fica só leitura. Depois da troca, o herdeiro vê o aviso de sessão nova e
  "progress.md do agente anterior" em destaque acima da tela; o cartão progress.md some. Na
  r2_declaracao, seção tela-declaracao: feature_list da tela em mãos, "N de 5 critérios prontos",
  o progress.md anterior e a tela. aluno.js escuta trocas/r2_troca para saber se a troca já
  aconteceu. Controle: na r2_troca, "X de N grupos prontos" e o botão "Forçar troca" (vira
  "Trocar sessão" com todos prontos), que faz atualizacaoDeTroca('r2_troca') numa atualização; depois
  mostra "Troca feita.". Telão: Rodada 2 com as telas e "X de N grupos prontos" na r2_troca.
  Regras: componentes editáveis na rodada 2 em r2/r2_troca; trocas legível por autenticado;
  progresso (string ≤ 280) só do dono, rodada 2, sem saiu, na r2 ou na r2_troca antes da troca;
  saiu só do dono, na r2_troca antes da troca, uma vez, com por = auth.uid, em = now e progresso com
  ao menos uma letra ou dígito; declarados/{c1..c5} booleano, só do dono, em r2/r2_troca/r2_declaracao.
- Como verifiquei: npm test 42/42 (3 novos em tests/f09-rodada2.spec.js): telas r2 em branco e
  cartões nos 2 celulares (360 px sem rolagem lateral), edição, feature_list e progress.md no banco,
  telão; regras (tela de outro grupo, tela da R1, progresso 281, sair na r2 → negado). r2_troca:
  sem troca ao entrar, sair negado sem progress.md e só com espaços, sair grava saiu, contagem
  0 → 1 → 2 no controle e no telão, "Forçar troca"/"Trocar sessão", voltar apaga saídas, forçar com
  1 de 2, herdeiro vê aviso e progress.md anterior (também depois de recarregar), edita a tela
  herdada e não reescreve o progress.md; voltar desfaz a troca. r2_declaracao: herdeiro vê a marca
  deixada pelo autor, marca/desmarca, regras (tela do outro, c9, não booleano, editar tela, r3).
  Conferi que o teste falha sem a exigência do progress.md na regra e com a r2_troca trocando ao
  entrar. Repeti o arquivo da F09 2 vezes sem falha; conferi por screenshot em 360 px.
- Problemas / decisões: o regex das regras do RTDB não aceita \S e lê \t/\n como letras; por isso
  "preenchido" = tem letra ou dígito ([a-zA-Z0-9]), igual na página e no banco. A feature_list é
  editável pelo dono desde a r2 (é estado compartilhado, como o feature_list.json de verdade); na
  r2_declaracao quem marca é quem tem a tela (Decisão 4). Avançar da r2_troca sem apertar a troca
  apenas avança (a troca nunca é automática). As regras não impedem editar componentes depois de
  sair; só a interface esconde o editor. Com 1 grupo, a troca da r2 devolve a tela ao próprio grupo.
- Próximo passo: F10. A revisão usa telas/{tid}/revisao {revisor, aprovados, enviadoEm} (Decisão 5:
  dono não muda); declarados já está no banco para o resultado.

### 2026-10-31 · Feature F08
- Feito: fases.js › criteriosRevelados(fase) (r1_avaliacao em diante) e atualizacaoDeFase recebe
  segredo e config: da r1_avaliacao em diante grava config/criterios = segredo/criterios; antes dela,
  apaga config/criterios só se existir (as atualizações das outras fases ficam iguais). O controle lê
  segredo e config ao mudar de fase. Regras: config deixou de ser legível inteiro; tamanhoGrupo e
  frase continuam legíveis para qualquer autenticado; config/criterios só da r1_avaliacao em diante
  (lista de fases na regra). telas/{tid}/avaliacaoR1/{c1..c5}: booleano, escrito só pelo grupo dono
  da tela, rodada 1, só na r1_avaliacao. aluno.js lê config/tamanhoGrupo em vez de config.
  site/js/criterios.js (sem Firebase): listaDeCriterios, contarMarcados, mediaDeCriterios(telas,
  grupos, rodada, campo), formatarMedia ("2,5"); serve para a F10. Celular: site/js/avaliacao.js e a
  seção tela-avaliacao (critérios com caixas, "N de 5 critérios cumpridos", desenho da tela em mãos).
  Telão: seção telao-avaliacao com a média grande, "de 5", cada tela (pelo autor, na cor do dono)
  com N/5 e os critérios revelados. Celular e telão só escutam config/criterios enquanto estão na
  r1_avaliacao (uma escuta negada pelas regras é cancelada e não volta).
  Correção de bug da F04: `.telao-lobby { display: flex }` anulava o atributo hidden e o lobby (QR e
  grupos) continuava aparecendo nas outras fases. Regra global `[hidden] { display: none !important }`.
- Como verifiquei: npm test 39/39 (3 novos em tests/f08-avaliacao.spec.js): critério editado em
  segredo antes de revelar aparece copiado em config e nos 2 celulares sem recarregar; voltar apaga e
  avançar revela de novo; na r2 continua. Leitura negada pelo SDK de config/criterios, config e
  segredo no celular e no telão em lobby, r1 e r1_troca (mesmo com config/criterios gravado à força),
  liberada na r1_avaliacao, negada de novo ao voltar. 4 alunos em 2 grupos marcam a tela em mãos, o
  colega vê as marcas, o banco grava, a média do telão vai 0 → 1,5 → 2,5 → 2 ao vivo, números do
  placar ≥ 32 px, regras (tela do outro, c9, não booleano, fora da fase → negado). Conferi que os
  testes falham com a regra de critérios aberta, sem a cópia em atualizacaoDeFase e sem a correção
  do [hidden]. Repeti o arquivo da F08 2 vezes sem falha; conferi por screenshot (360 px e 1920).
  Ajustei os testes da F06 e F07 que esperavam a tela do grupo/"Fase: X" na r1_avaliacao.
- Problemas / decisões: o placar conta toda tela da R1 cujo dono é um grupo existente; tela sem
  marcação conta como 0. O telão mostra cada tela pelo nome do grupo autor ("Tela de Azul"), na cor
  de quem a avaliou. Os critérios no celular aparecem só na r1_avaliacao (a F09 usa na feature_list).
- Próximo passo: F09. config/criterios já está disponível da r2 em diante para os cartões; a
  r2_troca provavelmente precisa entrar em RODADA_DA_TROCA (ver a nota da F07).

### 2026-10-30 · Feature F07
- Feito: a troca é a passagem r1 → r1_troca, numa única atualização multi-caminho (como no modelo
  de dados): estado/fase, telas/{tid}/dono de cada tela da R1 para o próximo grupo (proximoGrupo:
  rotação circular por `ordem`; com 1 grupo, ele mesmo), trocas/r1_troca {tid: donoAntes} e
  editandoPor: null nos componentes que estavam sendo editados por quem perdeu a tela. Em fases.js:
  RODADA_DA_TROCA, proximoGrupo, atualizacaoDeTroca, atualizacaoDeDesfazerTroca; atualizacaoDeFase
  troca só se trocas/{fase} ainda não existe (voltar da r1_avaliacao não troca de novo) e, ao ir
  para a fase de antes da troca, restaura os donos e apaga trocas/{fase} (Decisão 2). Controle:
  botão "Trocar sessão" visível só na r1 (faz o mesmo que "Avançar fase →"). Celular: aviso grande
  "Sua sessão acabou. Você é um agente novo, sem memória. Continue a tela que recebeu." com botão
  "Continuar", mostrado ao entrar na r1_troca e ao recarregar nela; o editor descarta seleção e texto
  pendente quando a tela em mãos muda. tests/emulador.js: escutarComoDono (stream REST do banco).
- Como verifiquei: npm test 36/36 (3 novos em tests/f07-troca.spec.js): 3 grupos rodam g1→g2→g3→g1,
  e o stream REST recebe UM só evento patch com fase, donos, trocas e editandoPor; voltar da
  avaliação não troca de novo; voltar para r1 desfaz (também um evento só); em 3 celulares (2 grupos)
  o aviso aparece sem recarregar, cada um vê e edita a tela herdada (banco e telão conferidos), a
  regra nega a tela antiga e aceita a herdada, recarregar mantém aviso e tela; com 1 grupo a tela
  continua no g1 e a edição segue. Desligando a troca em atualizacaoDeFase, os 3 testes falham.
  Repeti o arquivo da F07 2 vezes sem falha.
- Problemas / decisões: o que o aluno digitou nos últimos 250 ms antes da troca se perde (a regra já
  nega a gravação na tela antiga). Observação da F05: adicionar um componente não abre o painel dele
  (selecionar roda antes de o item existir na lista e a seleção é limpa); é preciso tocar no
  componente. Os testes da F07 tocam antes de escrever. Não corrigi por estar fora da F07.
  A r2_troca (F09) provavelmente é diferente (o grupo sai antes e o controle aperta o botão já na
  fase); por isso RODADA_DA_TROCA ainda não inclui r2_troca. Decidir na F09.
- Próximo passo: F08. Lembrar da Decisão 1: config/criterios só existe da r1_avaliacao em diante e
  voltar para antes apaga.

### 2026-10-30 · Feature F06
- Feito: site/js/fases.js (sem Firebase): FASES na ordem da especificação, NOMES_DAS_FASES em
  português, proximaFase/faseAnterior, atualizacaoDeFase(para, {grupos, telas}) → multi-caminho
  com fase, timerFim 0 e atualizadoEm; ao ir para r1 cria só as telas que faltam (voltar e avançar
  não apaga trabalho); atualizacaoDeReinicio (lobby; apaga alunos, grupos, telas, trocas, oficina,
  votos e config/criterios; mantém frase, tamanhoGrupo e segredo). site/js/cronometro.js:
  timerFim no relógio do servidor (Date.now + .info/serverTimeOffset), mostra "⏱ m:ss" ou
  "⏱ Tempo esgotado", some com timerFim 0. Controle: fase atual, "← Voltar fase", "Avançar fase →",
  "Próxima: …", cronômetro (minutos, Iniciar, Parar), grupos com tamanho e membros por ordem de
  chegada e botão "Remover" (pendência da Decisão 11: apaga membros/{uid} e alunos/{uid} numa
  atualização), "Reiniciar sala" com confirm. A sala aberta vai para ?sala= na URL e recarregar o
  controle a reabre. Celular: barra com o nome da fase e o cronômetro; se alunos/{uid} some
  (removido ou sala reiniciada), recarrega e volta à tela de nome. Telão: cronômetro no canto e
  o nome da fase em português.
- Como verifiquei: npm test 33/33 (5 novos em tests/f06-fases.spec.js): avançar pelas 12 fases até
  o fim, voltar, recarregar o controle, reiniciar (banco limpo, celular volta ao nome e entra de
  novo); cronômetro de 2 min igual (±1 s) no controle, telão e dois celulares, um deles com o
  relógio 3 min adiantado (Date trocado por addInitScript); tempo esgotado; parar e mudar de fase
  zeram; lobby → r1 → r1_troca → r1_avaliacao → voltar em dois celulares e no telão sem recarregar;
  voltar/avançar mantém os componentes da r1; remover aluno. Conferi que o teste do cronômetro
  falha se a correção do offset for desligada. Repeti o arquivo da F06 2 vezes sem falha.
- Problemas / decisões: mudar de fase zera o cronômetro (cada fase tem o seu). O controle não
  tem ainda os efeitos das fases seguintes (troca de donos, cópia dos critérios, telas da r2):
  cada feature acrescenta o seu em atualizacaoDeFase. Avançar até r1_troca hoje só muda a fase;
  "Trocar sessão" é da F07. O botão "Rebalancear grupos" da especificação não está em nenhuma
  feature e não foi feito (ver Ideias).
- Próximo passo: F07. Lembrar da Decisão 2: a troca grava trocas/{fase} e voltar a fase restaura.

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
- "Rebalancear grupos" no lobby (está na especificação e na Decisão 7, mas em nenhuma feature).
- Faixa "Sem conexão. Reconectando…" no celular quando data-conectado="nao" (hoje a queda não aparece para o aluno).
