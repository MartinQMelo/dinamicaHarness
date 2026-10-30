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
salas/{sala}/
  estado: { fase, timerFim, atualizadoEm }
  config: { tamanhoGrupo, frase, criterios? }
  segredo: { criterios }                     # leitura só do apresentador
  alunos/{uid}: { nome, grupo, entrouEm }
  grupos/{gid}: { cor, nome, ordem, membros: {uid: true} }
  telas/{tid}: { rodada, autor: gid, dono: gid, componentes: [ {tipo, texto, editandoPor?} ],
                 progresso, declarados: {1..5: bool}, avaliacaoR1: {1..5: bool},
                 revisao: { revisor: gid, aprovados: {1..5: bool}, enviadoEm } }
  oficina/{gid}: { projeto, agents, features: [ {nome, aceite, evidencia} ], progresso }
  votos/{uid}: gid
```
A troca de sessão é uma única atualização multi-caminho feita pelo controle, mudando `dono` de todas as telas e a `fase` juntos.

## Segurança (regras em `database.rules.json`)
- Alunos usam Auth anônimo. Cada aluno só escreve o próprio `alunos/{uid}` e o próprio voto.
- Um aluno só edita telas cujo `dono` é o seu grupo, e só na fase que permite edição.
- Só o apresentador (e-mail listado em `admins/{emailCodificado}`) escreve `estado`, `config`, `segredo`, `grupos` e `dono`.
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
