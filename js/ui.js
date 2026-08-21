// ui.js
// Utilitários de interface compartilhados. `escapeHtml` é usado em TODO lugar que insere
// texto vindo do usuário/banco de dados na tela — corrige a falha de XSS encontrada na
// auditoria do sistema antigo (nunca colocar texto de questão/nome direto em innerHTML).

function escapeHtml(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formatação leve de matemática/quebras de linha em texto de questão. O texto já vem escapado. */
function formatarTextoQuestao(textoCru) {
  return escapeHtml(textoCru)
    .replace(/\n/g, '<br>')
    .replace(/\^(-?\d+)/g, '<sup>$1</sup>')
    .replace(/_(-?\d+)/g, '<sub>$1</sub>');
}

function mostrarLoading() { document.getElementById('loading').classList.remove('hidden'); }
function esconderLoading() { document.getElementById('loading').classList.add('hidden'); }

function toast(mensagem, tipo) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast ' + (tipo === 'erro' ? 'toast-erro' : 'toast-sucesso');
  el.textContent = mensagem;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function abrirModal(htmlConteudo) {
  document.getElementById('modal-box').innerHTML = htmlConteudo;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function fecharModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-box').innerHTML = '';
}

/** Segundo modal, empilhado por cima do primeiro — usado pra abrir a visualização completa
 * de uma questão (ou outra tela secundária) sem perder o formulário que já estava aberto
 * no modal principal (ex: seleção de questões da Nova Lista). */
function abrirModal2(htmlConteudo) {
  document.getElementById('modal-box-2').innerHTML = htmlConteudo;
  document.getElementById('modal-overlay-2').classList.remove('hidden');
}
function fecharModal2() {
  document.getElementById('modal-overlay-2').classList.add('hidden');
  document.getElementById('modal-box-2').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') fecharModal();
  });
  document.getElementById('modal-overlay-2').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay-2') fecharModal2();
  });
});

/** Chamada de API com loading + tratamento de erro padronizado. Uso: const dados = await chamarComLoading(...). */
async function chamarComLoading(action, dados) {
  mostrarLoading();
  try {
    return await Api.chamar(action, dados);
  } catch (e) {
    toast(e.message, 'erro');
    throw e;
  } finally {
    esconderLoading();
  }
}

function gerarId() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
