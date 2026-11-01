// Oficina "Monte seu harness" e votação: projetos, limites, contagem de votos, vencedor e os arquivos do
// .zip. Sem Firebase, para os testes importarem. As regras do banco usam as mesmas chaves e limites.
import { criarZip } from './zip.js';

export const PROJETOS = {
  ru: 'Cardápio do RU',
  caronas: 'Mural de caronas',
  provas: 'Agenda de provas',
  atletica: 'Presença da atlética',
};
export const AGENTS_MAX_LINHAS = 8;
export const LIMITES = {
  agents: 800, nome: 80, aceite: 200, evidencia: 200, progresso: 280,
};
export const N_FUNCIONALIDADES = 3;

// Corta o texto em AGENTS_MAX_LINHAS linhas.
export function limitarLinhas(texto, max = AGENTS_MAX_LINHAS) {
  return String(texto ?? '').split('\n').slice(0, max).join('\n');
}

export function contarLinhas(texto) {
  return texto ? String(texto).split('\n').length : 0;
}

// As 3 funcionalidades, sempre com 3 posições. No banco, features pode vir como lista ou objeto.
export function funcionalidades(harness) {
  return Array.from({ length: N_FUNCIONALIDADES }, (_, i) => ({
    nome: '', aceite: '', evidencia: '', ...(harness?.features?.[i] || {}),
  }));
}

// Os harnesses que podem receber voto: grupos que existem e já escreveram algo na oficina, por ordem.
export function harnessesDaSala(oficina, grupos) {
  return Object.keys(oficina || {})
    .filter((gid) => grupos?.[gid])
    .sort((a, b) => grupos[a].ordem - grupos[b].ordem);
}

// Votos por grupo. Conta só voto de aluno que ainda está na sala, num harness que existe e de outro grupo.
export function contarVotos(votos, alunos, oficina, grupos) {
  const harnesses = harnessesDaSala(oficina, grupos);
  const contagem = Object.fromEntries(harnesses.map((gid) => [gid, 0]));
  for (const [uid, gid] of Object.entries(votos || {})) {
    if (gid in contagem && alunos?.[uid] && alunos[uid].grupo !== gid) contagem[gid] += 1;
  }
  return contagem;
}

// Os grupos com mais votos (empatados, se houver mais de um).
export function lideres(contagem) {
  const max = Math.max(...Object.values(contagem));
  return Object.keys(contagem).filter((gid) => contagem[gid] === max);
}

// O vencedor: o único líder, ou o escolhido pelo controle entre os empatados (estado/vencedor, Decisão 9).
// null enquanto o empate não foi decidido ou não há harness.
export function vencedorDe(contagem, escolhido) {
  const empatados = lideres(contagem);
  if (escolhido && empatados.includes(escolhido)) return escolhido;
  return empatados.length === 1 ? empatados[0] : null;
}

export function nomeDoProjeto(chave) {
  return PROJETOS[chave] || 'Projeto não escolhido';
}

// Os três arquivos do .zip do harness, no formato dos arquivos deste próprio projeto.
export function arquivosDoHarness(harness, grupo) {
  const projeto = nomeDoProjeto(harness?.projeto);
  const quem = grupo?.nome ? `Grupo ${grupo.nome}` : 'Grupo';
  const agents = `# AGENTS.md — ${projeto}\n\nHarness montado pelo ${quem} na dinâmica "Você é o agente".\n\n`
    + `${(harness?.agents || '').trim()}\n`;
  const features = funcionalidades(harness).map((f, i) => ({
    id: `F${String(i + 1).padStart(2, '0')}`,
    description: f.nome,
    steps: [f.aceite],
    evidencia: f.evidencia,
    passes: false,
  }));
  const progresso = `# Progresso — ${projeto}\n\n## Primeiro passo\n${(harness?.progresso || '').trim()}\n`;
  return {
    'AGENTS.md': agents,
    'feature_list.json': `${JSON.stringify(features, null, 2)}\n`,
    'claude-progress.md': progresso,
  };
}

// Grupo "Azul 2" → "harness-azul-2.zip".
export function nomeDoZip(grupo) {
  const base = (grupo?.nome || 'grupo').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `harness-${base}.zip`;
}

// Baixa o .zip do harness no navegador (controle online e telão offline).
export function baixarHarness(harness, grupo) {
  const url = URL.createObjectURL(new Blob([criarZip(arquivosDoHarness(harness, grupo))], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoZip(grupo);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// O harness de um grupo como cartão (celular e telão): projeto, AGENTS.md, funcionalidades e progresso.
export function desenharHarness(harness, grupo) {
  const art = el('article', 'harness');
  art.style.setProperty('--cor-grupo', grupo?.cor || '#1f6feb');
  art.append(el('p', 'harness-grupo', grupo?.nome || ''));
  art.append(el('p', 'harness-projeto', nomeDoProjeto(harness?.projeto)));
  art.append(el('p', 'cartao-titulo', 'AGENTS.md'));
  art.append(el('p', 'harness-agents', harness?.agents || '(vazio)'));
  art.append(el('p', 'cartao-titulo', 'feature_list'));
  const ol = el('ol', 'harness-features');
  for (const f of funcionalidades(harness)) {
    const li = el('li');
    li.append(el('strong', '', f.nome || '(sem nome)'));
    if (f.aceite) li.append(el('span', 'harness-detalhe', `Aceite: ${f.aceite}`));
    if (f.evidencia) li.append(el('span', 'harness-detalhe', `Evidência: ${f.evidencia}`));
    ol.append(li);
  }
  art.append(ol);
  art.append(el('p', 'cartao-titulo', 'progress.md'));
  art.append(el('p', 'harness-progresso', harness?.progresso || '(vazio)'));
  return art;
}
