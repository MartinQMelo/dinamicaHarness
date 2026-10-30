# Prompts para o Claude Code

Use os três prompts abaixo em sessões separadas. Cada sessão começa do zero e se orienta só pelos arquivos do repositório. É o mesmo princípio que vocês vão ensinar na aula.

## Antes de começar (feito por vocês, uma vez)
1. O repositório no github aidnae stá vazio e acabou de ser criado
2. Em https://console.firebase.google.com crie um projeto. Ative o **Realtime Database** e, em Authentication, os métodos **Anônimo** e **E-mail/senha**. Crie um usuário de e-mail e senha para o apresentador.
3. Em Configurações do projeto → Seus apps → Web, registre um app e copie o objeto `firebaseConfig`. Ele vai para `site/js/firebase-config.js` (não é segredo).
4. No GitHub, em Settings → Pages, escolha "GitHub Actions" como origem.
5. Cadastre o e-mail do apresentador como admin: no console do Firebase, em Realtime Database → Dados, crie o nó `admins` e, dentro dele, a chave com o e-mail trocando todo "." por "," e o valor `true`. Exemplo: `admins/fulano@gmail,com: true`. Sem isso, o login funciona mas as regras do banco recusam as ações do controle.

---

## Prompt 1 · Sessão de inicialização (rode uma vez)

```
Você vai construir a página descrita neste repositório. Antes de qualquer código:

1. Leia AGENTS.md, especificacao/dinamica.md, feature_list.json e claude-progress.md.
2. Liste para mim, em até 10 linhas, ambiguidades ou contradições que encontrar na especificação. Não resolva por conta própria nada que mude o comportamento da dinâmica: pergunte.
3. Depois que eu responder, implemente APENAS a feature F01 (esqueleto, emuladores, Playwright, workflow do Pages), seguindo a seção "Como trabalhar" do AGENTS.md.
4. Coloque este firebaseConfig em site/js/firebase-config.js: <COLE AQUI O OBJETO DO FIREBASE>
5. Ao terminar: ./init.sh deve rodar limpo, npm test deve passar, F01 marcada como true, commit feito e claude-progress.md atualizado com o próximo passo.

Pare depois da F01.
```

## Prompt 2 · Sessões de implementação (repita até acabar a lista)

```
Continue o projeto. Siga exatamente a seção "Como trabalhar" do AGENTS.md:
leia claude-progress.md e o git log, rode ./init.sh, pegue a primeira feature com passes false,
implemente só ela, prove cada step com teste end-to-end, rode npm test, faça commit e atualize o progresso.

Se a feature for grande demais para uma sessão, faça uma parte que deixe os testes passando,
registre no progresso o que falta e NÃO marque passes como true.
Pare ao fim da feature.
```

Dica: dá para rodar o Prompt 2 várias vezes seguidas. Abra sempre uma sessão nova (`/clear` ou um novo `claude`), para ver a continuidade funcionando.

## Prompt 3 · Sessão de revisão (rode a cada 3 ou 4 features e no final)

```
Você é o REVISOR deste projeto, não o autor. Não escreva código de feature.

1. Leia AGENTS.md, especificacao/dinamica.md e feature_list.json.
2. Rode ./init.sh e npm test.
3. Para cada feature com passes true, confira cada step: aponte o teste que prova o step
   e rode-o. Se não houver teste, ou se o teste não prova o que o step diz, a feature é reprovada.
4. Abra o site no navegador (Playwright) nos tamanhos 360x740 e 1920x1080 e tire screenshots de cada fase.
5. Volte para false toda feature reprovada e escreva em claude-progress.md, numa seção "Revisão AAAA-MM-DD",
   o motivo de cada reprovação e o que falta para passar.
6. Faça commit só dessas mudanças.
```

---

## Depois de pronto
- Ensaio: abra `controle.html`, crie a sala UNB1, aperte "Adicionar 20 alunos falsos" e rode a dinâmica inteira com o telão aberto em outra aba.
- Ensaio real: peçam a 5 ou 6 amigos que entrem pelo celular, na rede de um celular roteado, para testar a velocidade.
- Na aula: mostrem este repositório no Bloco 4 ("Anatomia do harness"). A página que a turma acabou de usar foi construída por um agente com exatamente esses arquivos.
