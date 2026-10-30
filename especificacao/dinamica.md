# Especificação — Dinâmica "Você é o agente"

## Objetivo
Fazer a turma sentir na pele por que agentes de IA falham sem harness. Cada grupo de alunos é um "agente" que monta a tela inicial de um app de caronas da UnB. No meio do trabalho, a sessão "acaba" e o trabalho passa para outro grupo, que não sabe o que o anterior pensou. Na rodada 2, os grupos recebem cartões de harness e o resultado melhora. Na rodada 3, outro grupo revisa e mostra a diferença entre "disse que terminou" e "terminou de verdade".

Público: 30 a 150 alunos num auditório, cada um com o próprio celular, sem conta e sem cadastro.

## As três telas

| Tela | Arquivo | Quem usa |
| --- | --- | --- |
| Aluno | `site/index.html?sala=XXXX` | Cada aluno, pelo QR code |
| Telão | `site/telao.html?sala=XXXX` | Projetor da sala |
| Controle | `site/controle.html` | Apresentador, com login |

A sala é um código de 4 letras criado pelo controle (ex.: `UNB1`). O mesmo banco suporta várias salas, para ensaio e para a aula.

## Fases (salas/{sala}/estado/fase)
O controle avança as fases nesta ordem. Cada fase tem um cronômetro opcional (`timerFim`, em ms epoch), que o telão e os celulares mostram.

1. `lobby` — alunos entram. O sistema distribui em grupos por ordem de chegada: o aluno entra no grupo aberto com menos membros, e um grupo novo só é criado quando todos estão cheios (tamanho configurável, padrão 5). Use transação no banco para dois alunos simultâneos não estourarem o limite. O controle tem um botão "Rebalancear grupos" para usar no fim do lobby. Cada grupo tem cor e nome (Azul, Verde, Laranja, Roxo, Rosa, Amarelo, Ciano, Vermelho…, depois "Azul 2" etc.).
2. `r1` — Rodada 1, só prompt. O grupo vê apenas a frase: "Monte a tela inicial de um app de caronas para alunos da UnB." e o editor de tela.
3. `r1_troca` — o controle aperta "Trocar sessão". Cada tela passa para o próximo grupo (rotação circular por ordem dos grupos). O celular mostra um aviso grande: "Sua sessão acabou. Você é um agente novo, sem memória. Continue a tela que recebeu." O editor continua, agora na tela herdada.
4. `r1_avaliacao` — os 5 critérios são revelados. Cada grupo marca, na tela que tem em mãos, quais critérios ela cumpre. O telão mostra a média de critérios cumpridos (placar R1).
5. `r2` — Rodada 2, com harness. Cada grupo recebe uma tela NOVA em branco e três cartões: AGENTS.md, feature_list (os 5 critérios com caixa "pronto?") e progress.md (campo de texto).
6. `r2_troca` — igual ao `r1_troca`, mas o celular só permite que o grupo "saia" da sessão depois de preencher o progress.md. O controle mostra quantos grupos já preencheram e pode forçar a troca. O grupo novo vê o progress.md do anterior em destaque.
7. `r2_declaracao` — cada grupo marca na feature_list quais critérios considera prontos ("o agente diz que terminou").
8. `r3` — Revisão. Cada tela vai para outro grupo (diferente do autor e do dono atual, quando possível). O revisor aprova ou reprova cada critério, olhando só a tela. Não vê as marcações do autor até enviar.
9. `resultado` — o telão mostra: placar R1 vs R2 e, para a R2, "declarado pronto" vs "aprovado pelo revisor", com a diferença destacada como "vitória falsa".
10. `oficina` — cada grupo preenche três campos: AGENTS.md (até 8 linhas), feature_list (3 funcionalidades, cada uma com critério de aceite e evidência) e progress.md (primeiro passo). Escolhem o projeto numa lista: Cardápio do RU, Mural de caronas, Agenda de provas, Presença da atlética.
11. `votacao` — cada aluno vota em um harness (não pode votar no próprio grupo). O telão mostra os harnesses e os votos ao vivo.
12. `fim` — telão mostra o vencedor. O controle tem um botão para baixar o harness vencedor como `.zip` com `AGENTS.md`, `feature_list.json` e `claude-progress.md`.

O controle também pode voltar uma fase e reiniciar a sala.

## O editor de tela (celular)
- Um celular desenhado (moldura) mostrando os componentes empilhados, de cima para baixo.
- Botão "+ componente" abre o catálogo: Título, Botão, Lista de caronas, Filtro, Busca, Mapa, Perfil, Chat, Pagamento, Aviso.
- Cada componente tem um texto editável (ex.: o rótulo do botão, os itens da lista separados por linha, as opções do filtro separadas por vírgula).
- Dá para mover para cima/baixo e remover.
- Todos os membros do grupo editam a mesma tela em tempo real. Mostrar "editando: Fulano" no componente que alguém está mexendo.
- A mesma renderização é usada no telão e na revisão (componente compartilhado em `site/js/tela.js`).

## Os 5 critérios escondidos (padrão, editáveis no controle)
1. O botão "Oferecer carona" é o primeiro componente da tela.
2. A lista de caronas mostra horário e ponto de saída em cada item (ex.: "18h · ICC Norte").
3. Existe um filtro por campus com Darcy Ribeiro, Gama, Ceilândia e Planaltina.
4. Não há componente de Chat nem de Pagamento (fora do escopo).
5. A tela tem no máximo 6 componentes.

Os critérios ficam em `salas/{sala}/config/criterios` e só são enviados aos alunos a partir de `r1_avaliacao`. Atenção: as regras do banco devem impedir a leitura antes disso (por exemplo, guardando em `salas/{sala}/segredo/criterios` com leitura só do apresentador, e o controle copiando para `config/criterios` ao revelar).

## Cartões da rodada 2
- AGENTS.md: "Tela de celular em pé. No máximo 6 componentes. Nunca invente funcionalidade fora da lista. Antes de sair, escreva no progress.md o que fez e o que falta."
- feature_list: os 5 critérios, cada um com caixa "pronto?".
- progress.md: campo de texto de até 280 caracteres.

## Modelo de dados (Realtime Database)
```
admins/{emailCodificado}: true              # e-mail com "." trocado por "," (ex.: fulano@gmail,com)
salas/{sala}/
  estado: { fase, timerFim, atualizadoEm, vencedor? }   # vencedor: gid escolhido pelo controle no fim
  config: { tamanhoGrupo, frase, criterios? } # criterios só existe da r1_avaliacao em diante
  segredo: { criterios: {c1..c5: texto} }    # leitura e escrita só do apresentador
  alunos/{uid}: { nome, grupo, entrouEm }
  grupos/{gid}: { cor, nome, ordem, membros: {uid: true} }
  telas/{tid}: { rodada, autor: gid, dono: gid, componentes: [ {tipo, texto, editandoPor?} ],
                 progresso, saiu?: { por: uid, em: timestamp },
                 declarados: {c1..c5: bool}, avaliacaoR1: {c1..c5: bool},
                 revisao: { revisor: gid, aprovados: {c1..c5: bool}, enviadoEm } }
  trocas/{fase}: { tid: donoAntes }          # gravado a cada troca, para "voltar fase" desfazer
  oficina/{gid}: { projeto, agents, features: [ {nome, aceite, evidencia} ], progresso }
  votos/{uid}: gid
```
As chaves dos critérios são `c1`..`c5` (não `1`..`5`): chaves numéricas fazem o Realtime Database devolver uma lista com `null` na posição 0.

A troca de sessão é uma única atualização multi-caminho feita pelo controle, mudando `dono` de todas as telas e a `fase` juntos (e gravando `trocas/{fase}`).

## Segurança (regras em `database.rules.json`)
- Alunos usam Auth anônimo. Cada aluno só escreve o próprio `alunos/{uid}` e o próprio voto.
- Um aluno só edita telas cujo `dono` é o seu grupo, e só na fase que permite edição.
- Só o apresentador (e-mail listado em `admins/{emailCodificado}`) escreve `estado`, `config`, `segredo` e `dono`. Em `grupos`, o aluno só pode se adicionar a um grupo (ver Decisão 11); todo o resto de `grupos` é do apresentador.
- Testar as regras com o emulador: um aluno tentando mudar `estado` ou editar tela de outro grupo deve falhar.

## Resiliência
- Celular que perde conexão e volta continua no mesmo grupo (uid anônimo persistido) e na fase atual.
- Aluno que entra atrasado cai num grupo existente e recebe a tela que o grupo tem agora.
- Modo ensaio: `controle.html` tem "Adicionar 20 alunos falsos", que cria alunos-bot que entram e editam telas aleatoriamente. Serve para ensaiar sem plateia.
- Modo offline (plano B): `telao.html?offline=1` roda a dinâmica inteira numa tela só, com estado local, para quando o Wi-Fi cair. O apresentador monta as telas dos grupos de viva voz.

## Visual
- Fundo escuro no telão, letras grandes legíveis do fundo do auditório (mínimo 32 px nos números do placar).
- Cada grupo identificado por cor em todas as telas.
- O telão mostra o QR code (gerado no navegador) e o link curto durante o `lobby`.

## Decisões (2026-10-30)
Respostas do apresentador às ambiguidades levantadas antes da F01. Elas prevalecem sobre o texto acima quando houver conflito.

1. **Critérios.** O controle edita os critérios só em `segredo/criterios`. Ao entrar em `r1_avaliacao`, copia para `config/criterios`. Regra: `config/criterios` existe se e somente se a fase for `r1_avaliacao` ou posterior. Voltar para antes disso apaga `config/criterios`.
2. **Voltar fase desfaz a troca.** Cada troca grava `salas/{sala}/trocas/{fase}: {tid: donoAntes}`. Voltar a fase restaura os donos numa única atualização multi-caminho. "Voltar" existe para corrigir erro do apresentador.
3. **Saída na `r2_troca`.** O grupo sai gravando `telas/{tid}/saiu: {por: uid, em: timestamp}`. A troca só acontece quando o controle aperta o botão; nunca é automática. O controle e o telão mostram "X de N grupos prontos". Forçar a troca ignora quem não saiu.
4. **Declaração na `r2_declaracao`.** Quem declara é o grupo que tem a tela agora (o herdeiro), não o autor.
5. **Revisão na `r3`.** O `dono` NÃO muda; o revisor fica em `revisao.revisor`. Só o grupo revisor escreve em `telas/{tid}/revisao/aprovados`, e só durante a `r3`.
6. **Grupos.** "Aberto" = não cheio; não existe estado de grupo fechado. No `lobby`, se todos estiverem cheios, cria-se um grupo novo. A partir da `r1` nunca se criam grupos: quem entra atrasado vai para o grupo com menos membros, mesmo passando do limite.
7. **Rebalancear.** Deixa os grupos com tamanhos quase iguais (diferença máxima de 1), movendo o menor número possível de alunos. O botão só fica disponível no `lobby`.
8. **Admins e telão.** Apresentadores ficam em `admins/{emailCodificado}: true`, com "." trocado por "," (ex.: `admins/fulano@gmail,com`). O cadastro é feito à mão no console do Firebase. O telão faz login anônimo e só lê. Nos testes, o emulador semeia o admin.
9. **Empate na votação.** O telão mostra todos os empatados e o controle escolhe o vencedor com um botão (grava `estado/vencedor`); o `.zip` baixa o escolhido. Só aluno com grupo vota.
10. **Config do Firebase.** `site/js/firebase-config.js` é um modelo com placeholders. Em localhost ele usa os emuladores e não precisa da config real. Fora de localhost, se os placeholders não tiverem sido trocados, a página mostra um aviso claro.
11. **Aluno entra no grupo sozinho (2026-10-30).** A distribuição automática exige que o aluno se coloque no grupo, sem Cloud Functions. As regras permitem que o aluno adicione só a si mesmo em `grupos/{gid}/membros` (sem mudar `cor`, `nome` e `ordem`) e que crie um grupo novo só no `lobby`. O limite de tamanho do grupo é garantido pela transação na página, não pelas regras, que não sabem contar filhos. Risco aceito para uso em sala: um aluno mal-intencionado poderia, na mesma escrita em que se adiciona, passar do limite ou tirar outro membro do grupo. O controle mostra o tamanho de cada grupo e permite remover um aluno de um grupo, para o apresentador corrigir.
