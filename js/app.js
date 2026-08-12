// app.js
// Lógica principal do AppMaximo: login, navegação e as telas de aluno/professor.

let sessaoLocal = { tipo: null, nome: null, nivel: null, user: null };

// ======================================================================
// INICIALIZAÇÃO
// ======================================================================

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
  ligarEventosLogin();
  document.getElementById('btn-logout').addEventListener('click', fazerLogout);

  const perfilSalvo = localStorage.getItem('appmaximo_perfil');
  if (Api.token() && perfilSalvo) {
    sessaoLocal = JSON.parse(perfilSalvo);
    entrarNoPainel();
  }
});

function ligarEventosLogin() {
  document.querySelectorAll('#login-selecao .card-opcao').forEach(btn => {
    btn.addEventListener('click', () => {
      sessaoLocal.tipoLogin = btn.dataset.tipo;
      document.getElementById('login-selecao').classList.add('hidden');
      document.getElementById('form-login').classList.remove('hidden');
      document.getElementById('login-titulo').textContent = 'Acesso do ' + (btn.dataset.tipo === 'professor' ? 'Professor' : 'Aluno');
    });
  });
  document.getElementById('btn-voltar-login').addEventListener('click', () => {
    document.getElementById('login-selecao').classList.remove('hidden');
    document.getElementById('form-login').classList.add('hidden');
  });
  document.getElementById('form-login').addEventListener('submit', (e) => {
    e.preventDefault();
    submeterLogin();
  });
}

async function submeterLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!user || !pass) { toast('Preencha usuário e senha.', 'erro'); return; }

  try {
    const resultado = await chamarComLoading('auth.login', { user, pass, tipo: sessaoLocal.tipoLogin });
    Api.setToken(resultado.token);
    sessaoLocal = {
      tipo: sessaoLocal.tipoLogin, user: resultado.usuario.user, nome: resultado.usuario.nome,
      nivel: resultado.usuario.nivel || null
    };
    localStorage.setItem('appmaximo_perfil', JSON.stringify(sessaoLocal));
    entrarNoPainel();
  } catch (e) { /* erro já mostrado via toast */ }
}

function fazerLogout() {
  Api.chamar('auth.logout', {}).catch(() => {});
  Api.limparToken();
  localStorage.removeItem('appmaximo_perfil');
  location.reload();
}

function entrarNoPainel() {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('app-header').classList.remove('hidden');
  document.getElementById('header-info').textContent = `${sessaoLocal.nome} · ${sessaoLocal.tipo === 'professor' ? 'Professor' : 'Aluno'}`;
  if (sessaoLocal.tipo === 'professor') {
    document.getElementById('view-professor').classList.remove('hidden');
    if (sessaoLocal.nivel === 'admin') document.getElementById('tab-admin-btn').classList.remove('hidden');
    ligarTabsProfessor();
    abrirAbaProfessor('turmas');
  } else {
    document.getElementById('view-aluno').classList.remove('hidden');
    ligarTabsAluno();
    abrirAbaAluno('pendentes');
  }
}

// ======================================================================
// NAVEGAÇÃO POR ABAS
// ======================================================================

function ligarTabsProfessor() {
  document.querySelectorAll('#tabs-professor button').forEach(btn => {
    btn.addEventListener('click', () => abrirAbaProfessor(btn.dataset.tab));
  });
}
function abrirAbaProfessor(nome) {
  document.querySelectorAll('#tabs-professor button').forEach(b => b.classList.toggle('tab-ativa', b.dataset.tab === nome));
  const map = { turmas: renderTurmas, questoes: renderBancoQuestoes, notas: renderNotas, diagnostico: renderDiagnostico, guia: renderGuiaClassificacao, admin: renderAdmin };
  (map[nome] || renderTurmas)();
}

function ligarTabsAluno() {
  document.querySelectorAll('#tabs-aluno button').forEach(btn => {
    btn.addEventListener('click', () => abrirAbaAluno(btn.dataset.tab));
  });
}
function abrirAbaAluno(nome) {
  document.querySelectorAll('#tabs-aluno button').forEach(b => b.classList.toggle('tab-ativa', b.dataset.tab === nome));
  const map = { pendentes: renderAlunoPendentes, concluidas: renderAlunoConcluidas, redacoes: renderAlunoRedacoes, extra: renderAlunoAtividadeExtra };
  (map[nome] || renderAlunoPendentes)();
}

// ======================================================================
// ALUNO — PAINEL
// ======================================================================

let painelAlunoCache = null;
async function _painelAluno() {
  if (!painelAlunoCache) painelAlunoCache = await chamarComLoading('turmas.painelAluno', {});
  return painelAlunoCache;
}

async function renderAlunoPendentes() {
  const el = document.getElementById('aluno-conteudo');
  try {
    const dados = await _painelAluno();
    const pendentes = dados.listas.filter(l => !l.respondida);
    el.innerHTML = pendentes.length === 0
      ? '<div class="estado-vazio">Nenhuma atividade pendente. 🎉</div>'
      : pendentes.map(l => `
        <div class="card lista-item">
          <div>
            <strong>${escapeHtml(l.titulo)}</strong><br>
            <small>${l.totalQuestoes} questões${l.cronometroMin ? ' · ⏱ ' + l.cronometroMin + ' min' : ''}</small>
          </div>
          <button class="btn btn-primario btn-pequeno" onclick="abrirProva('${l.id}')">Responder</button>
        </div>`).join('');
  } catch (e) { el.innerHTML = '<div class="estado-vazio">Não foi possível carregar.</div>'; }
}

async function renderAlunoConcluidas() {
  const el = document.getElementById('aluno-conteudo');
  const dados = await _painelAluno();
  const feitas = dados.listas.filter(l => l.respondida);
  el.innerHTML = feitas.length === 0 ? '<div class="estado-vazio">Nenhuma atividade concluída ainda.</div>' :
    feitas.map(l => `
      <div class="card lista-item">
        <div><strong>${escapeHtml(l.titulo)}</strong><br>
          <small>${l.resultado && l.resultado.acertos !== undefined ? l.resultado.acertos + ' acertos' : 'Aguardando correção'}</small>
          ${!l.resolucaoLiberada ? '<br><small style="color:var(--cinza-texto);">Resolução ainda não liberada pelo professor</small>' : ''}
        </div>
        <span style="display:flex;gap:6px;align-items:center;">
          <span class="badge badge-feito">✓ Feita</span>
          ${l.resolucaoLiberada ? `<button class="btn btn-secundario btn-pequeno" onclick="abrirProva('${l.id}')">Ver resolução</button>` : ''}
        </span>
      </div>`).join('');
}

async function renderAlunoRedacoes() {
  const el = document.getElementById('aluno-conteudo');
  const dados = await _painelAluno();
  el.innerHTML = dados.redacoes.length === 0 ? '<div class="estado-vazio">Nenhuma redação disponível.</div>' :
    dados.redacoes.map(r => `
      <div class="card lista-item">
        <div><strong>${escapeHtml(r.titulo)}</strong><br><small>${escapeHtml(r.tema || '')}${r.cronometroMin ? ' · ⏱ ' + r.cronometroMin + ' min' : ''}</small></div>
        ${r.respondida
          ? `<span class="badge ${r.revisada ? 'badge-feito' : 'badge-info'}">${r.revisada ? '✓ Corrigida' : 'Enviada'}</span>`
          : `<button class="btn btn-primario btn-pequeno" onclick="abrirRedacao('${r.id}')">Escrever</button>`}
      </div>`).join('');
}

async function renderAlunoAtividadeExtra() {
  const el = document.getElementById('aluno-conteudo');
  el.innerHTML = `<div class="card" style="text-align:center;">
    <p>Gere uma atividade extra com 3 questões, feita pela IA, sempre que quiser praticar. Se você tiver erros recentes, ela foca neles; senão, é uma revisão geral.</p>
    <button class="btn btn-primario" onclick="gerarAtividadeExtra()">✨ Gerar atividade extra</button>
    <div id="atividade-extra-resultado"></div>
  </div>`;
}

/** componenteEscolhido só é usado quando o aluno ainda não tem NENHUM histórico de provas (aluno novo). */
async function gerarAtividadeExtra(componenteEscolhido) {
  if (componenteEscolhido === '') { toast('Escolha um componente pra continuar.', 'erro'); return; }
  try {
    const dados = await chamarComLoading('ia.gerarAtividadeComplementar', componenteEscolhido ? { componente: componenteEscolhido } : {});
    window._atividadeExtraAtual = dados;
    const html = dados.questoes.map((q, i) => `
      <div class="questao-box">
        <div class="questao-enunciado"><strong>${i + 1}.</strong> ${formatarTextoQuestao(q.text)}</div>
        ${Object.entries(q.alternativas).map(([l, t]) => `
          <label class="alternativa">
            <input type="radio" name="extra_${q.id}" value="${l}">
            <span><strong>${l})</strong> ${formatarTextoQuestao(t)}</span>
          </label>`).join('')}
      </div>`).join('');
    document.getElementById('atividade-extra-resultado').innerHTML = html +
      `<button class="btn btn-sucesso btn-full" onclick="corrigirAtividadeExtra()">Corrigir</button>`;
  } catch (e) {
    if (e.code === 'ESCOLHA_COMPONENTE') {
      await carregarComponentes();
      document.getElementById('atividade-extra-resultado').innerHTML = `
        <p style="font-size:0.85rem;color:var(--cinza-texto);">Você ainda não tem histórico de provas — escolha um componente pra praticar:</p>
        ${renderSelectComponente('select-componente-extra', '')}
        <button class="btn btn-primario btn-full" style="margin-top:8px;" onclick="gerarAtividadeExtra(document.getElementById('select-componente-extra').value)">Gerar</button>`;
    }
    /* outros erros já mostrados via toast */
  }
}

async function corrigirAtividadeExtra() {
  const respostas = {};
  window._atividadeExtraAtual.questoes.forEach(q => {
    const marcado = document.querySelector(`input[name="extra_${q.id}"]:checked`);
    if (marcado) respostas[q.id] = marcado.value;
  });
  const resultado = await chamarComLoading('ia.corrigirAtividadeComplementar', { atividadeId: window._atividadeExtraAtual.atividadeId, respostas });
  document.getElementById('atividade-extra-resultado').innerHTML = `
    <div class="alerta alerta-sucesso">Você acertou ${resultado.acertos} de ${resultado.total}.</div>
    ${resultado.resultado.map((r, i) => `
      <div class="card">
        <strong>${i + 1}.</strong> ${r.correta ? '✅ Correto' : '❌ Errado — resposta certa: ' + escapeHtml(r.gabarito)}
        <p style="color:var(--cinza-texto);">${escapeHtml(r.explicacao)}</p>
      </div>`).join('')}
    <button class="btn btn-secundario btn-full" onclick="renderAlunoAtividadeExtra()">Fechar</button>`;
}

// ======================================================================
// ALUNO — RESPONDER PROVA
// ======================================================================

let provaAtual = null;
let cronometroInterval = null;

function _formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function _formatarDuracao(segundos) {
  if (segundos === null || segundos === undefined) return 'não registrado';
  const m = Math.floor(segundos / 60), s = segundos % 60;
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')}s` : `${s}s`;
}

/** Cabeçalho com identificação do aluno + desempenho — aparece na tela de revisão e vai junto no PDF. */
function _cabecalhoResultado(dados) {
  const r = dados.resultadoAnterior;
  return `<div class="card cabecalho-resultado">
    <h3 style="margin:0 0 4px;">${escapeHtml(dados.lista.titulo)}</h3>
    <div class="cabecalho-resultado-grid">
      <div><small>Aluno</small><strong>${escapeHtml(sessaoLocal.nome)}</strong></div>
      <div><small>Data</small><strong>${_formatarDataHora(r && r.enviadoEm)}</strong></div>
      <div><small>Tempo gasto</small><strong>${_formatarDuracao(r && r.duracaoSegundos)}</strong></div>
      <div><small>Acertos</small><strong>${r ? `${r.acertos} de ${r.total}` : '—'}</strong></div>
    </div>
  </div>`;
}

async function abrirProva(listaId) {
  const dados = await chamarComLoading('questoes.paraResponder', { listaId });
  provaAtual = dados;
  document.getElementById('view-aluno').classList.add('hidden');
  document.getElementById('view-prova').classList.remove('hidden');
  const conteudo = document.getElementById('prova-conteudo');

  if (dados.jaRespondida) {
    const avisoResolucao = dados.lista.resolucaoLiberada
      ? ''
      : '<br><small>A resolução comentada e o gabarito ainda não foram liberados pelo professor.</small>';
    conteudo.innerHTML = `<div id="area-prova-pdf">
      ${_cabecalhoResultado(dados)}
      <div class="alerta alerta-info">${avisoResolucao ? avisoResolucao.replace('<br>', '') : 'Resolução liberada pelo professor.'}</div>` +
      dados.questoes.map((q, i) => renderResponderQuestao(q, i)).join('') +
      `</div>
      <div class="linha-botoes">
        <button class="btn btn-secundario btn-full" onclick="fecharProva()">Voltar</button>
        <button class="btn btn-primario btn-full" onclick="baixarPdfProva()">⬇️ Baixar PDF</button>
      </div>`;
    document.querySelectorAll('#prova-conteudo input, #prova-conteudo select, #prova-conteudo textarea, #prova-conteudo button').forEach(el => {
      if (!el.closest('button')) el.disabled = true;
    });
    return;
  }

  window._provaInicioMs = Date.now();
  conteudo.innerHTML = dados.questoes.map((q, i) => renderResponderQuestao(q, i)).join('') +
    `<button class="btn btn-sucesso btn-full" onclick="enviarProva()">Enviar respostas</button>`;

  if (dados.lista.cronometroMin) {
    iniciarCronometro(dados.lista.cronometroMin);
  }
}

/** Gera um PDF da tela de revisão da atividade (cabeçalho + questões + resolução), direto no aparelho do aluno. */
function baixarPdfProva() {
  if (typeof html2pdf === 'undefined') { toast('Não foi possível gerar o PDF agora — verifique sua conexão com a internet e tente de novo.', 'erro'); return; }
  const area = document.getElementById('area-prova-pdf');
  const nomeArquivo = `${(provaAtual.lista.titulo || 'atividade').replace(/[^\w\s-]/g, '')} - ${sessaoLocal.nome}.pdf`;
  html2pdf().set({ margin: 10, filename: nomeArquivo, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4' } }).from(area).save();
}

function iniciarCronometro(minutos) {
  let segundosRestantes = minutos * 60;
  const el = document.getElementById('prova-cronometro');
  el.classList.remove('hidden');
  const atualizar = () => {
    const m = Math.floor(segundosRestantes / 60), s = segundosRestantes % 60;
    el.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
    if (segundosRestantes <= 0) { clearInterval(cronometroInterval); enviarProva(); return; }
    segundosRestantes--;
  };
  atualizar();
  cronometroInterval = setInterval(atualizar, 1000);
}

async function enviarProva() {
  if (cronometroInterval) clearInterval(cronometroInterval);
  const respostas = {};
  provaAtual.questoes.forEach(q => { respostas[q.id] = coletarRespostaQuestao(q); });
  const duracaoSegundos = window._provaInicioMs ? Math.round((Date.now() - window._provaInicioMs) / 1000) : null;
  try {
    const resultado = await chamarComLoading('questoes.entregarLista', { listaId: provaAtual.lista.id, respostas, duracaoSegundos });
    document.getElementById('prova-conteudo').innerHTML = `
      <div class="alerta alerta-sucesso">
        <strong>Enviado!</strong> Você acertou ${resultado.acertos} de ${resultado.total} questões corrigíveis automaticamente.
        ${resultado.pendenteDiscursiva ? '<br>Há questões discursivas aguardando correção.' : ''}
      </div>
      <button class="btn btn-primario btn-full" onclick="fecharProva()">Voltar ao painel</button>`;
    painelAlunoCache = null;
  } catch (e) { /* toast já mostrado */ }
}

function fecharProva() {
  document.getElementById('prova-cronometro').classList.add('hidden');
  document.getElementById('view-prova').classList.add('hidden');
  document.getElementById('view-aluno').classList.remove('hidden');
  abrirAbaAluno(provaAtual && provaAtual.jaRespondida ? 'concluidas' : 'pendentes');
}

// ======================================================================
// ALUNO — REDAÇÃO
// ======================================================================

function abrirRedacao(redacaoId) {
  const redacao = painelAlunoCache.redacoes.find(r => r.id === redacaoId);
  abrirModal(`
    <h3>${escapeHtml(redacao.titulo)}</h3>
    <p><strong>Tema:</strong> ${escapeHtml(redacao.tema || 'Livre')}</p>
    ${redacao.cronometroMin ? `<div id="redacao-cronometro" class="cronometro"></div>` : ''}
    <textarea id="redacao-texto" style="min-height:300px;" placeholder="Escreva sua redação aqui..."></textarea>
    <button class="btn btn-sucesso btn-full" onclick="enviarRedacaoAluno('${redacaoId}')">Enviar redação</button>
  `);
  if (redacao.cronometroMin) {
    let segundos = redacao.cronometroMin * 60;
    const el = document.getElementById('redacao-cronometro');
    window._redacaoTimer = setInterval(() => {
      const m = Math.floor(segundos / 60), s = segundos % 60;
      el.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
      if (segundos <= 0) { clearInterval(window._redacaoTimer); enviarRedacaoAluno(redacaoId); }
      segundos--;
    }, 1000);
  }
}

async function enviarRedacaoAluno(redacaoId) {
  if (window._redacaoTimer) clearInterval(window._redacaoTimer);
  const texto = document.getElementById('redacao-texto').value;
  if (!texto.trim()) { toast('Escreva a redação antes de enviar.', 'erro'); return; }
  await chamarComLoading('redacao.enviarResposta', { redacaoId, texto });
  toast('Redação enviada! Aguarde a correção do professor.', 'sucesso');
  fecharModal();
  painelAlunoCache = null;
  abrirAbaAluno('redacoes');
}

// ======================================================================
// PROFESSOR — TURMAS
// ======================================================================

let escolasCache = null;
let turmaAtualDetalhe = null;

async function renderTurmas() {
  const el = document.getElementById('professor-conteudo');
  escolasCache = await chamarComLoading('turmas.listarEscolas', {});
  el.innerHTML = `
    <button class="btn btn-primario" onclick="modalNovaEscola()">+ Nova escola</button>
    ${escolasCache.escolas.length === 0 ? '<div class="estado-vazio">Nenhuma escola cadastrada ainda.</div>' : ''}
    <div class="grid-cards">
      ${escolasCache.escolas.map(esc => `
        <div class="card-quadrado">
          <h4>🏫 ${escapeHtml(esc.nome)}</h4>
          <p class="card-quadrado-info">${esc.turmas.length} turma(s)<br>${esc.turmas.reduce((s, t) => s + t.totalAlunos, 0)} aluno(s)</p>
          <div class="card-quadrado-acoes">
            <button class="btn btn-primario btn-pequeno" onclick="abrirEscola('${esc.id}')">Acessar</button>
            <button class="btn btn-secundario btn-pequeno" onclick="modalEditarEscola('${esc.id}', '${escapeHtml(esc.nome).replace(/'/g, "\\'")}')">✏️</button>
            <button class="btn btn-perigo btn-pequeno" onclick="excluirEscola('${esc.id}', '${escapeHtml(esc.nome).replace(/'/g, "\\'")}')">🗑️</button>
          </div>
        </div>`).join('')}
    </div>
  `;
}

function modalNovaEscola() {
  abrirModal(`<h3>Nova escola</h3><label>Nome</label><input id="input-nome-escola">
    <button class="btn btn-primario btn-full" onclick="salvarNovaEscola()">Criar</button>`);
}
async function salvarNovaEscola() {
  const nome = document.getElementById('input-nome-escola').value;
  await chamarComLoading('turmas.criarEscola', { nome });
  fecharModal(); toast('Escola criada.', 'sucesso'); renderTurmas();
}
function modalEditarEscola(escolaId, nomeAtual) {
  abrirModal(`<h3>Editar escola</h3><label>Nome</label><input id="input-editar-escola-nome" value="${escapeHtml(nomeAtual)}">
    <button class="btn btn-primario btn-full" onclick="salvarEdicaoEscola('${escolaId}')">Salvar</button>`);
}
async function salvarEdicaoEscola(escolaId) {
  const nome = document.getElementById('input-editar-escola-nome').value;
  await chamarComLoading('turmas.editarEscola', { escolaId, nome });
  fecharModal(); toast('Escola atualizada.', 'sucesso'); renderTurmas();
}
async function excluirEscola(escolaId, nome) {
  if (!confirm(`Excluir a escola "${nome}" e TODAS as turmas, alunos, listas e redações dentro dela? Essa ação não pode ser desfeita.`)) return;
  await chamarComLoading('turmas.deletarEscola', { escolaId });
  toast('Escola excluída.', 'sucesso'); renderTurmas();
}

async function abrirEscola(escolaId) {
  escolasCache = escolasCache || await chamarComLoading('turmas.listarEscolas', {});
  let escola = escolasCache.escolas.find(e => e.id === escolaId);
  if (!escola) { escolasCache = await chamarComLoading('turmas.listarEscolas', {}); escola = escolasCache.escolas.find(e => e.id === escolaId); }
  const el = document.getElementById('professor-conteudo');
  el.innerHTML = `
    <button class="btn btn-texto" onclick="renderTurmas()">← Voltar às escolas</button>
    <h3>🏫 ${escapeHtml(escola.nome)}</h3>
    <button class="btn btn-primario" onclick="modalNovaTurma('${escolaId}')">+ Nova turma</button>
    ${escola.turmas.length === 0 ? '<div class="estado-vazio">Nenhuma turma cadastrada ainda.</div>' : ''}
    <div class="grid-cards">
      ${escola.turmas.map(t => `
        <div class="card-quadrado">
          <h4>${escapeHtml(t.nome)}</h4>
          <p class="card-quadrado-info">${t.totalAlunos} aluno(s)</p>
          <div class="card-quadrado-acoes">
            <button class="btn btn-primario btn-pequeno" onclick="abrirTurma('${escolaId}','${t.id}')">Acessar</button>
            <button class="btn btn-secundario btn-pequeno" onclick="modalEditarTurma('${escolaId}','${t.id}','${escapeHtml(t.nome).replace(/'/g, "\\'")}')">✏️</button>
            <button class="btn btn-perigo btn-pequeno" onclick="excluirTurma('${escolaId}','${t.id}','${escapeHtml(t.nome).replace(/'/g, "\\'")}')">🗑️</button>
          </div>
        </div>`).join('')}
    </div>
  `;
}

function modalNovaTurma(escolaId) {
  abrirModal(`<h3>Nova turma</h3><label>Nome</label><input id="input-nome-turma">
    <button class="btn btn-primario btn-full" onclick="salvarNovaTurma('${escolaId}')">Criar</button>`);
}
async function salvarNovaTurma(escolaId) {
  const nome = document.getElementById('input-nome-turma').value;
  await chamarComLoading('turmas.criarTurma', { escolaId, nome });
  fecharModal(); toast('Turma criada.', 'sucesso'); escolasCache = null; abrirEscola(escolaId);
}
function modalEditarTurma(escolaId, turmaId, nomeAtual) {
  abrirModal(`<h3>Editar turma</h3><label>Nome</label><input id="input-editar-turma-nome" value="${escapeHtml(nomeAtual)}">
    <button class="btn btn-primario btn-full" onclick="salvarEdicaoTurma('${escolaId}','${turmaId}')">Salvar</button>`);
}
async function salvarEdicaoTurma(escolaId, turmaId) {
  const nome = document.getElementById('input-editar-turma-nome').value;
  await chamarComLoading('turmas.editar', { escolaId, turmaId, nome });
  fecharModal(); toast('Turma atualizada.', 'sucesso'); escolasCache = null; abrirEscola(escolaId);
}
async function excluirTurma(escolaId, turmaId, nome) {
  if (!confirm(`Excluir a turma "${nome}" e todos os alunos, listas e redações dentro dela? Essa ação não pode ser desfeita.`)) return;
  await chamarComLoading('turmas.deletar', { escolaId, turmaId });
  toast('Turma excluída.', 'sucesso'); escolasCache = null; abrirEscola(escolaId);
}

async function abrirTurma(escolaId, turmaId) {
  turmaAtualDetalhe = await chamarComLoading('turmas.detalhes', { turmaId });
  turmaAtualDetalhe._escolaId = escolaId;
  const el = document.getElementById('professor-conteudo');
  el.innerHTML = `
    <button class="btn btn-texto" onclick="abrirEscola('${escolaId}')">← Voltar</button>
    <h3>${escapeHtml(turmaAtualDetalhe.nome)}</h3>
    <div class="card">
      <h4>Alunos (${turmaAtualDetalhe.alunos.length})</h4>
      ${turmaAtualDetalhe.alunos.map(a => `
        <div class="lista-item"><span>${escapeHtml(a.nome)} <small>(${escapeHtml(a.usuario)})</small></span>
          <span>
            <button class="btn btn-pequeno btn-secundario" onclick="modalEditarAluno('${a.id}')">Editar</button>
            <button class="btn btn-pequeno btn-perigo" onclick="excluirAluno('${a.id}')">Excluir</button>
          </span>
        </div>`).join('')}
      <button class="btn btn-texto btn-pequeno" onclick="modalNovoAluno()">+ Adicionar aluno</button>
      <button class="btn btn-texto btn-pequeno" onclick="modalImportarAlunosJSON()">📥 Importar alunos via JSON</button>
    </div>
    <div class="card">
      <h4>Listas de atividades</h4>
      ${turmaAtualDetalhe.listas.map(l => `
        <div class="lista-item"><span>${escapeHtml(l.titulo)} <small>(${(l.qIds || []).length} questões)</small></span>
          <span>
            <button class="btn btn-pequeno btn-secundario" onclick="abrirCorrecaoDiscursivas('${l.id}', '${escapeHtml(l.titulo).replace(/'/g, "\\'")}')">Corrigir discursivas</button>
            <button class="btn btn-pequeno ${l.resolucaoLiberada ? 'btn-sucesso' : 'btn-secundario'}" onclick="alternarResolucao('${l.id}', ${!l.resolucaoLiberada})">${l.resolucaoLiberada ? 'Resolução liberada' : 'Liberar resolução'}</button>
            <button class="btn btn-pequeno btn-perigo" onclick="excluirLista('${l.id}', '${escapeHtml(l.titulo).replace(/'/g, "\\'")}')">Excluir</button>
          </span>
        </div>`).join('')}
      <button class="btn btn-texto btn-pequeno" onclick="modalNovaLista()">+ Nova lista</button>
    </div>
    <div class="card">
      <h4>Redações</h4>
      ${turmaAtualDetalhe.redacoes.map(r => `<div class="lista-item"><span>${escapeHtml(r.titulo)}</span>
        <span>
          <button class="btn btn-pequeno btn-secundario" onclick="abrirCorrecaoRedacoes('${r.id}')">Corrigir</button>
          <button class="btn btn-pequeno btn-perigo" onclick="excluirRedacao('${r.id}', '${escapeHtml(r.titulo).replace(/'/g, "\\'")}')">Excluir</button>
        </span></div>`).join('')}
      <button class="btn btn-texto btn-pequeno" onclick="modalNovaRedacao()">+ Nova redação</button>
    </div>
    <div class="card">
      <h4>Blocos de notas</h4>
      ${turmaAtualDetalhe.blocos.map(b => `<div class="lista-item"><span>${escapeHtml(b.nome)} <small>(${b.notaTotal} pts, ${b.modo === 'participacao' ? 'participação' : 'acerto'})</small></span></div>`).join('')}
      <button class="btn btn-texto btn-pequeno" onclick="modalNovoBloco()">+ Novo bloco</button>
    </div>
  `;
}

async function excluirLista(listaId, titulo) {
  if (!confirm(`Excluir a lista "${titulo}"? Os alunos que já responderam perdem o acesso ao resultado. Essa ação não pode ser desfeita.`)) return;
  await chamarComLoading('listas.deletar', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, listaId });
  toast('Lista excluída.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}
async function excluirRedacao(redacaoId, titulo) {
  if (!confirm(`Excluir a redação "${titulo}"? Os alunos que já entregaram perdem o acesso ao resultado. Essa ação não pode ser desfeita.`)) return;
  await chamarComLoading('redacao.deletar', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, redacaoId });
  toast('Redação excluída.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

// ---------- Componentes curriculares (lista global; só admin adiciona) ----------

let componentesCache = null;
async function carregarComponentes() {
  if (!componentesCache) {
    const dados = await chamarComLoading('componentes.listar', {});
    componentesCache = dados.componentes;
  }
  return componentesCache;
}

function _opcoesComponente(valorAtual, comOpcaoTodos) {
  const opcoes = (componentesCache || []).map(c => `<option value="${escapeHtml(c)}" ${c === valorAtual ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  const opcaoVazia = `<option value="">${comOpcaoTodos ? 'Todos os componentes' : 'Selecione...'}</option>`;
  const opcaoNovo = sessaoLocal.nivel === 'admin' ? `<option value="__novo__">+ Novo componente...</option>` : '';
  return opcaoVazia + opcoes + opcaoNovo;
}

/** <select> de componente curricular. Use comOpcaoTodos=true em filtros (onde "vazio" = não filtrar). */
function renderSelectComponente(idSelect, valorAtual, comOpcaoTodos) {
  return `<select id="${idSelect}" data-com-opcao-todos="${comOpcaoTodos ? '1' : '0'}" onchange="_tratarSelecaoComponente('${idSelect}')">${_opcoesComponente(valorAtual, comOpcaoTodos)}</select>`;
}

async function _tratarSelecaoComponente(idSelect) {
  const sel = document.getElementById(idSelect);
  if (sel.value !== '__novo__') return;
  const nome = prompt('Nome do novo componente curricular (ex: Espanhol):');
  if (!nome || !nome.trim()) { sel.value = ''; return; }
  try {
    const resultado = await chamarComLoading('componentes.adicionar', { nome: nome.trim() });
    componentesCache = resultado.componentes;
    sel.innerHTML = _opcoesComponente(nome.trim(), sel.dataset.comOpcaoTodos === '1');
    toast('Componente adicionado.', 'sucesso');
  } catch (e) {
    sel.value = ''; // erro já mostrado via toast (ex: não-admin, ou nome duplicado)
  }
}

function modalNovoAluno() {
  abrirModal(`<h3>Novo aluno</h3><label>Nome</label><input id="input-aluno-nome">
    <label>Usuário</label><input id="input-aluno-usuario">
    <label>Senha</label><input id="input-aluno-senha">
    <button class="btn btn-primario btn-full" onclick="salvarNovoAluno()">Adicionar</button>`);
}
async function salvarNovoAluno() {
  const nome = document.getElementById('input-aluno-nome').value;
  const usuario = document.getElementById('input-aluno-usuario').value;
  const senha = document.getElementById('input-aluno-senha').value;
  await chamarComLoading('turmas.adicionarAluno', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, nome, usuario, senha });
  fecharModal(); toast('Aluno adicionado.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}
function modalEditarAluno(alunoId) {
  const a = turmaAtualDetalhe.alunos.find(x => x.id === alunoId);
  abrirModal(`<h3>Editar aluno</h3><label>Nome</label><input id="edit-aluno-nome" value="${escapeHtml(a.nome)}">
    <label>Nova senha (deixe em branco pra manter)</label><input id="edit-aluno-senha">
    <button class="btn btn-primario btn-full" onclick="salvarEdicaoAluno('${alunoId}')">Salvar</button>`);
}
async function salvarEdicaoAluno(alunoId) {
  const nome = document.getElementById('edit-aluno-nome').value;
  const novaSenha = document.getElementById('edit-aluno-senha').value;
  await chamarComLoading('turmas.editarAluno', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, alunoId, nome, novaSenha });
  fecharModal(); toast('Aluno atualizado.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}
async function excluirAluno(alunoId) {
  if (!confirm('Excluir este aluno da turma?')) return;
  await chamarComLoading('turmas.deletarAluno', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, alunoId });
  toast('Aluno removido.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

// ---------- Importar alunos em lote via JSON ----------

const MODELO_JSON_ALUNOS = [
  { nome: 'Maria Silva', usuario: 'maria.silva', senha: 'aluno123' },
  { nome: 'João Souza', usuario: 'joao.souza', senha: 'aluno123' },
  { nome: 'Ana Pereira', usuario: 'ana.pereira', senha: 'aluno123' }
];

function modalImportarAlunosJSON() {
  abrirModal(`<h3>Importar alunos via JSON</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Pra cadastrar muitos alunos de uma vez, cole um array JSON com nome, usuário e senha de cada um. Alunos com usuário repetido na turma são ignorados (não substituem o cadastro existente).</p>
    <button type="button" class="btn btn-secundario btn-full" onclick="copiarModeloAlunosJSON()">📋 Copiar modelo JSON</button>
    <textarea id="input-alunos-json" style="min-height:200px;"></textarea>
    <button class="btn btn-primario btn-full" onclick="confirmarImportarAlunosJSON()">Importar</button>`);
}

async function copiarModeloAlunosJSON() {
  const texto = JSON.stringify(MODELO_JSON_ALUNOS, null, 2);
  try {
    await navigator.clipboard.writeText(texto);
    toast('Modelo copiado! Cole onde quiser (ou aqui embaixo pra editar).', 'sucesso');
  } catch (e) {
    document.getElementById('input-alunos-json').value = texto;
    toast('Não consegui copiar automaticamente — coloquei o modelo no campo abaixo pra você copiar.', 'sucesso');
  }
}

async function confirmarImportarAlunosJSON() {
  let arr;
  try { arr = JSON.parse(document.getElementById('input-alunos-json').value); } catch (e) { toast('JSON inválido.', 'erro'); return; }
  const resultado = await chamarComLoading('turmas.importarAlunosJSON', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, alunos: arr });
  fecharModal();
  toast(`${resultado.importados} aluno(s) importado(s), ${resultado.ignoradosDuplicados} duplicado(s) ignorado(s)${resultado.erros ? ', ' + resultado.erros + ' com erro' : ''}.`, 'sucesso');
  abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

async function alternarResolucao(listaId, liberar) {
  await chamarComLoading('questoes.liberarResolucao', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, listaId, liberar });
  toast('Atualizado.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

async function modalNovaLista() {
  await carregarComponentes();
  window._listaQuestoesSelecionadas = new Set();
  window._listaFiltros = { busca: '', comp: '', tipo: '' };
  abrirModal(`<h3>Nova lista de atividades</h3>
    <label>Título</label><input id="input-lista-titulo">
    <label>Cronômetro (minutos, opcional)</label><input id="input-lista-cronometro" type="number">
    <label>Selecione as questões</label>
    <div class="card">
      <input id="filtro-lista-busca" placeholder="Buscar por enunciado, componente ou conteúdo...">
      <div style="display:flex;gap:8px;margin-top:8px;">
        <div style="flex:1;">${renderSelectComponente('filtro-lista-comp', '', true)}</div>
        <div style="flex:1;">
          <select id="filtro-lista-tipo">
            <option value="">Todos os tipos</option>
            ${TIPOS_QUESTAO_OPCOES.map(t => `<option value="${t}">${LABELS_TIPO[t]}</option>`).join('')}
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-secundario btn-pequeno" style="margin-top:8px;" onclick="_filtrarQuestoesLista(1)">Filtrar</button>
    </div>
    <p id="contador-selecionadas-lista" style="font-size:0.85rem;color:var(--cinza-texto);"><strong>0</strong> questões selecionadas.</p>
    <div id="lista-checklist-questoes" style="max-height:300px;overflow-y:auto;"></div>
    <button class="btn btn-primario btn-full" onclick="salvarNovaLista()">Criar lista</button>`);
  _filtrarQuestoesLista(1);
}

async function _filtrarQuestoesLista(pagina) {
  window._listaFiltros = {
    busca: document.getElementById('filtro-lista-busca').value.trim(),
    comp: document.getElementById('filtro-lista-comp').value.trim(),
    tipo: document.getElementById('filtro-lista-tipo').value
  };
  const dados = await chamarComLoading('questoes.buscarPaginado', { filtros: window._listaFiltros, pagina: pagina || 1 });
  const container = document.getElementById('lista-checklist-questoes');
  container.innerHTML = dados.questoes.map(q => `
    <label class="alternativa">
      <input type="checkbox" class="chk-questao-lista" value="${q.id}" ${window._listaQuestoesSelecionadas.has(q.id) ? 'checked' : ''} onchange="_alternarSelecaoQuestaoLista('${q.id}', this.checked)">
      <span>[${escapeHtml(LABELS_TIPO[q.tipo] || q.tipo)}] ${escapeHtml(q.comp)} — ${formatarTextoQuestao(q.text).slice(0, 80)}...</span>
    </label>`).join('') +
    `<div class="linha-botoes" style="justify-content:center;">
      ${pagina > 1 ? `<button class="btn btn-secundario btn-pequeno" onclick="_filtrarQuestoesLista(${pagina - 1})">← Anterior</button>` : ''}
      <span>Página ${dados.pagina} de ${dados.totalPaginas || 1} (${dados.total} encontradas)</span>
      ${pagina < dados.totalPaginas ? `<button class="btn btn-secundario btn-pequeno" onclick="_filtrarQuestoesLista(${pagina + 1})">Próxima →</button>` : ''}
    </div>`;
}

function _alternarSelecaoQuestaoLista(id, marcado) {
  if (marcado) window._listaQuestoesSelecionadas.add(id);
  else window._listaQuestoesSelecionadas.delete(id);
  const n = window._listaQuestoesSelecionadas.size;
  document.getElementById('contador-selecionadas-lista').innerHTML = `<strong>${n}</strong> questõe${n === 1 ? '' : 's'} selecionada${n === 1 ? '' : 's'}.`;
}

async function salvarNovaLista() {
  const titulo = document.getElementById('input-lista-titulo').value;
  const cronometroMin = document.getElementById('input-lista-cronometro').value || null;
  const qIds = Array.from(window._listaQuestoesSelecionadas);
  if (qIds.length === 0) { toast('Selecione ao menos uma questão (em qualquer página/filtro — a seleção é mantida).', 'erro'); return; }
  await chamarComLoading('listas.criar', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, titulo, cronometroMin, qIds });
  fecharModal(); toast('Lista criada.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

function modalNovaRedacao() {
  abrirModal(`<h3>Nova redação</h3>
    <label>Título</label><input id="input-red-titulo">
    <label>Tema</label><input id="input-red-tema">
    <label>Critério</label>
    <select id="input-red-criterio" onchange="document.getElementById('bloco-criterio-custom').classList.toggle('hidden', this.value!=='custom')">
      <option value="enem">Padrão ENEM (5 competências)</option>
      <option value="custom">Critérios próprios</option>
    </select>
    <div id="bloco-criterio-custom" class="hidden">
      <label>Critérios (um por linha, formato "Nome: nota máxima")</label>
      <textarea id="input-red-criterios-custom" placeholder="Ortografia: 30&#10;Argumentação: 40"></textarea>
    </div>
    <label>Cronômetro (minutos, opcional)</label><input id="input-red-cronometro" type="number">
    <button class="btn btn-primario btn-full" onclick="salvarNovaRedacao()">Criar</button>`);
}
async function salvarNovaRedacao() {
  const titulo = document.getElementById('input-red-titulo').value;
  const tema = document.getElementById('input-red-tema').value;
  const criterio = document.getElementById('input-red-criterio').value;
  let criteriosCustom = null;
  if (criterio === 'custom') {
    criteriosCustom = document.getElementById('input-red-criterios-custom').value.split('\n').map(l => {
      const m = l.match(/^(.+):\s*(\d+)$/);
      return m ? { chave: gerarId(), nome: m[1].trim(), notaMaxima: Number(m[2]) } : null;
    }).filter(Boolean);
  }
  const cronometroMin = document.getElementById('input-red-cronometro').value || null;
  await chamarComLoading('redacao.criar', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, titulo, tema, criterio, criteriosCustom, cronometroMin });
  fecharModal(); toast('Redação criada.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

async function abrirCorrecaoRedacoes(redacaoId) {
  const redacao = turmaAtualDetalhe.redacoes.find(r => r.id === redacaoId);
  const entregas = turmaAtualDetalhe.alunos.filter(a => a.redacoesRespondidas && a.redacoesRespondidas[redacaoId]);
  abrirModal(`<h3>Corrigir: ${escapeHtml(redacao.titulo)}</h3>
    ${entregas.length === 0 ? '<p>Nenhum aluno entregou ainda.</p>' : entregas.map(a => {
      const r = a.redacoesRespondidas[redacaoId];
      return `<div class="card">
        <strong>${escapeHtml(a.nome)}</strong> ${r.revisadoProfessor ? '<span class="badge badge-feito">Corrigida</span>' : ''}
        <p style="max-height:100px;overflow-y:auto;background:var(--cinza-fundo);padding:8px;border-radius:6px;">${escapeHtml(r.texto)}</p>
        ${!r.revisadoProfessor ? `<button class="btn btn-secundario btn-pequeno" onclick="pedirCorrecaoIA('${redacaoId}','${a.id}')">✨ Pedir sugestão da IA (opcional)</button>` : ''}
        <div id="correcao-area-${a.id}">${!r.revisadoProfessor ? _htmlRevisaoRedacao(redacao, a.id, r.correcaoIA || null, redacaoId) : ''}</div>
      </div>`;
    }).join('')}`);
}

/**
 * A nota sempre pode ser preenchida manualmente — "Pedir sugestão da IA" é só um atalho
 * opcional que pré-preenche os campos. Antes, esse formulário só aparecia depois que a IA
 * respondia com sucesso, então se a IA falhasse (ex: erro 404) o professor ficava sem
 * conseguir corrigir a redação de jeito nenhum. Agora o formulário aparece sempre.
 */
async function pedirCorrecaoIA(redacaoId, alunoId) {
  const redacao = turmaAtualDetalhe.redacoes.find(r => r.id === redacaoId);
  const sugestao = await chamarComLoading('redacao.corrigirIA', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, redacaoId, alunoId });
  document.getElementById('correcao-area-' + alunoId).innerHTML = _htmlRevisaoRedacao(redacao, alunoId, sugestao, redacaoId);
}

function _htmlRevisaoRedacao(redacao, alunoId, sugestao, redacaoId) {
  const criterios = redacao.criterio === 'enem'
    ? [{ chave: 'c1', nome: 'Domínio da norma culta' }, { chave: 'c2', nome: 'Compreensão do tema' }, { chave: 'c3', nome: 'Organização de argumentos' }, { chave: 'c4', nome: 'Mecanismos linguísticos' }, { chave: 'c5', nome: 'Proposta de intervenção' }]
    : redacao.criteriosCustom;
  return `${sugestao ? '<div class="alerta alerta-info">Sugestão da IA — revise antes de confirmar</div>' : '<p style="font-size:0.85rem;color:var(--cinza-texto);">Preencha a nota de cada critério manualmente (ou peça uma sugestão da IA acima).</p>'}
    ${sugestao && sugestao.avisoTextoCurto ? `<div class="alerta alerta-atencao">⚠️ ${escapeHtml(sugestao.avisoTextoCurto)}</div>` : ''}
    ${criterios.map(c => {
      const sug = (sugestao && (sugestao.competencias || []).find(s => s.chave === c.chave)) || {};
      return `<label>${escapeHtml(c.nome)}${sug.comentario ? ' — <small>' + escapeHtml(sug.comentario) + '</small>' : ''}</label>
        <input type="number" class="input-nota-criterio" data-chave="${c.chave}" value="${sug.nota || 0}">`;
    }).join('')}
    <label>Comentário final</label><textarea id="comentario-final-${alunoId}">${escapeHtml((sugestao && sugestao.comentarioGeral) || '')}</textarea>
    <button class="btn btn-sucesso btn-pequeno" onclick="confirmarRevisaoRedacao('${redacaoId}','${alunoId}', this)">Confirmar nota</button>`;
}

async function confirmarRevisaoRedacao(redacaoId, alunoId, botao) {
  const area = botao.closest('div');
  const notasPorCriterio = {};
  area.querySelectorAll('.input-nota-criterio').forEach(inp => notasPorCriterio[inp.dataset.chave] = Number(inp.value));
  const comentarioFinal = document.getElementById('comentario-final-' + alunoId).value;
  await chamarComLoading('redacao.revisar', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, redacaoId, alunoId, notasPorCriterio, comentarioFinal });
  toast('Nota confirmada.', 'sucesso'); fecharModal();
}

async function abrirCorrecaoDiscursivas(listaId, tituloLista) {
  const { pendentes } = await chamarComLoading('questoes.discursivasPendentes', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, listaId });
  abrirModal(`<h3>Discursivas pendentes: ${escapeHtml(tituloLista)}</h3>
    ${pendentes.length === 0 ? '<p>Nenhuma resposta discursiva pendente de correção nesta lista.</p>' : pendentes.map((p, i) => `
      <div class="card" id="discursiva-item-${i}">
        <strong>${escapeHtml(p.alunoNome)}</strong>
        <p style="font-size:0.85rem;color:var(--cinza-texto);">${formatarTextoQuestao(p.enunciado)}</p>
        <p style="max-height:100px;overflow-y:auto;background:var(--cinza-fundo);padding:8px;border-radius:6px;">${escapeHtml(p.resposta) || '<em>(sem resposta)</em>'}</p>
        <button class="btn btn-secundario btn-pequeno" onclick="pedirSugestaoDiscursivaIA(${i}, '${escapeHtml(p.enunciado).replace(/'/g, "\\'")}', '${escapeHtml(p.resposta).replace(/'/g, "\\'")}')">Pedir sugestão da IA</button>
        <div id="discursiva-sugestao-${i}"></div>
        <label>Nota (0 a 10)</label><input type="number" min="0" max="10" step="0.5" id="discursiva-nota-${i}">
        <label>Comentário (opcional)</label><textarea id="discursiva-comentario-${i}"></textarea>
        <button class="btn btn-sucesso btn-pequeno" onclick="confirmarNotaDiscursiva('${listaId}','${p.alunoId}','${p.questaoId}', ${i})">Confirmar nota</button>
      </div>`).join('')}`);
}

async function pedirSugestaoDiscursivaIA(i, enunciado, resposta) {
  const sugestao = await chamarComLoading('questoes.sugerirCorrecaoDiscursivaIA', { enunciado, resposta });
  document.getElementById('discursiva-sugestao-' + i).innerHTML = `<div class="alerta alerta-info">Sugestão da IA: nota ${(sugestao.nota * 10).toFixed(1)} — ${escapeHtml(sugestao.comentario)}</div>`;
  document.getElementById('discursiva-nota-' + i).value = (sugestao.nota * 10).toFixed(1);
  document.getElementById('discursiva-comentario-' + i).value = sugestao.comentario;
}

async function confirmarNotaDiscursiva(listaId, alunoId, questaoId, i) {
  const notaDez = Number(document.getElementById('discursiva-nota-' + i).value);
  const comentario = document.getElementById('discursiva-comentario-' + i).value;
  if (isNaN(notaDez) || notaDez < 0 || notaDez > 10) { toast('Digite uma nota de 0 a 10.', 'erro'); return; }
  await chamarComLoading('questoes.revisarDiscursiva', {
    escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, listaId, alunoId, questaoId,
    percentual: notaDez / 10, comentario
  });
  toast('Nota confirmada.', 'sucesso');
  document.getElementById('discursiva-item-' + i).remove();
}

function modalNovoBloco() {
  abrirModal(`<h3>Novo bloco de notas</h3>
    <label>Nome</label><input id="input-bloco-nome" placeholder="Tarefas, Verificação, Atividade Final...">
    <label>Nota total</label><input id="input-bloco-nota" type="number" step="0.1">
    <label>Modo de correção</label>
    <select id="input-bloco-modo"><option value="participacao">Por participação</option><option value="acerto">Por acerto</option></select>
    <label>Período</label>
    <select id="input-bloco-periodo"></select>
    <label>Itens do bloco</label>
    <div>
      ${turmaAtualDetalhe.listas.map(l => `<label class="alternativa"><input type="checkbox" class="chk-item-bloco" value="lista:${l.id}"><span>📝 ${escapeHtml(l.titulo)}</span></label>`).join('')}
      ${turmaAtualDetalhe.redacoes.map(r => `<label class="alternativa"><input type="checkbox" class="chk-item-bloco" value="redacao:${r.id}"><span>✍️ ${escapeHtml(r.titulo)}</span></label>`).join('')}
    </div>
    <button class="btn btn-primario btn-full" onclick="salvarNovoBloco()">Criar bloco</button>`);
  carregarPeriodosNoSelect('input-bloco-periodo');
}
async function carregarPeriodosNoSelect(idSelect) {
  const dados = await Api.chamar('periodos.listar', {});
  const sel = document.getElementById(idSelect);
  if (dados.periodos.length === 0) {
    sel.innerHTML = '<option value="">Crie um período primeiro na aba Notas</option>';
  } else {
    sel.innerHTML = dados.periodos.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
  }
}
async function salvarNovoBloco() {
  const nome = document.getElementById('input-bloco-nome').value;
  const notaTotal = document.getElementById('input-bloco-nota').value;
  const modo = document.getElementById('input-bloco-modo').value;
  const periodoId = document.getElementById('input-bloco-periodo').value;
  const itens = Array.from(document.querySelectorAll('.chk-item-bloco:checked')).map(c => {
    const [tipo, refId] = c.value.split(':'); return { tipo, refId };
  });
  if (!periodoId) { toast('Selecione um período (crie um na aba Notas se ainda não existir).', 'erro'); return; }
  await chamarComLoading('blocos.criar', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, nome, notaTotal, modo, periodoId, itens });
  fecharModal(); toast('Bloco criado.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

// ======================================================================
// PROFESSOR — BANCO DE QUESTÕES
// ======================================================================

window._filtrosBancoQuestoes = { busca: '', tipo: '', comp: '', banca: '' };

async function renderBancoQuestoes(pagina) {
  pagina = pagina || 1;
  await carregarComponentes();
  const el = document.getElementById('professor-conteudo');
  const filtros = window._filtrosBancoQuestoes;
  const dados = await chamarComLoading('questoes.buscarPaginado', { filtros, pagina });
  el.innerHTML = `
    <div class="linha-botoes">
      <button class="btn btn-primario" onclick="modalNovaQuestao()">+ Nova questão</button>
      <button class="btn btn-secundario" onclick="modalImportarJSON()">Importar JSON</button>
      <button class="btn btn-secundario" onclick="modalImportarVestibular()">Importar vestibular (IA)</button>
    </div>
    <div class="card">
      <label>Buscar (enunciado, componente ou conteúdo)</label>
      <input id="filtro-q-busca" value="${escapeHtml(filtros.busca)}" placeholder="Ex: frações, fotossíntese...">
      <div style="display:flex;gap:8px;">
        <div style="flex:1;">
          <label>Componente</label>
          ${renderSelectComponente('filtro-q-comp', filtros.comp, true)}
        </div>
        <div style="flex:1;">
          <label>Tipo</label>
          <select id="filtro-q-tipo">
            <option value="">Todos</option>
            ${TIPOS_QUESTAO_OPCOES.map(t => `<option value="${t}" ${filtros.tipo === t ? 'selected' : ''}>${LABELS_TIPO[t]}</option>`).join('')}
          </select>
        </div>
      </div>
      <label>Banca (ex: FUVEST, ENEM)</label>
      <input id="filtro-q-banca" value="${escapeHtml(filtros.banca || '')}" placeholder="Ex: ENEM">
      <button class="btn btn-secundario btn-pequeno" style="margin-top:8px;" onclick="aplicarFiltroBancoQuestoes()">Filtrar</button>
      <button class="btn btn-texto btn-pequeno" onclick="limparFiltroBancoQuestoes()">Limpar filtros</button>
    </div>
    <p style="font-size:0.85rem;color:var(--cinza-texto);"><strong>${dados.total}</strong> questão${dados.total === 1 ? '' : 'ões'} encontrada${dados.total === 1 ? '' : 's'}.</p>
    ${dados.questoes.map(q => `
      <div class="card">
        <span class="badge badge-info">${escapeHtml(LABELS_TIPO[q.tipo] || q.tipo)}</span>
        ${q.bloomLevel ? `<span class="badge badge-info">${escapeHtml(LABELS_BLOOM[q.bloomLevel] || q.bloomLevel)}</span>` : ''}
        <p>${formatarTextoQuestao(q.text)}</p>
        <small>${escapeHtml(q.comp)} · ${escapeHtml(q.cont || '')}</small>
        <div class="linha-botoes">
          <button class="btn btn-pequeno btn-secundario" onclick='modalEditarQuestao(${JSON.stringify(q).replace(/'/g, "&#39;")})'>Editar</button>
          <button class="btn btn-pequeno btn-perigo" onclick="excluirQuestao('${q.id}')">Excluir</button>
        </div>
      </div>`).join('')}
    <div class="linha-botoes" style="justify-content:center;">
      ${pagina > 1 ? `<button class="btn btn-secundario btn-pequeno" onclick="renderBancoQuestoes(${pagina - 1})">← Anterior</button>` : ''}
      <span>Página ${dados.pagina} de ${dados.totalPaginas || 1}</span>
      ${pagina < dados.totalPaginas ? `<button class="btn btn-secundario btn-pequeno" onclick="renderBancoQuestoes(${pagina + 1})">Próxima →</button>` : ''}
    </div>`;
}

function aplicarFiltroBancoQuestoes() {
  window._filtrosBancoQuestoes = {
    busca: document.getElementById('filtro-q-busca').value.trim(),
    comp: document.getElementById('filtro-q-comp').value.trim(),
    tipo: document.getElementById('filtro-q-tipo').value,
    banca: document.getElementById('filtro-q-banca').value.trim()
  };
  renderBancoQuestoes(1);
}
function limparFiltroBancoQuestoes() {
  window._filtrosBancoQuestoes = { busca: '', tipo: '', comp: '', banca: '' };
  renderBancoQuestoes(1);
}

async function modalNovaQuestao() { await _modalFormQuestao(null); }
async function modalEditarQuestao(q) { await _modalFormQuestao(q); }

async function _modalFormQuestao(q) {
  await carregarComponentes();
  const tipoAtual = (q && q.tipo) || 'multipla';
  window._imagensQuestaoAtual = (q && q.imagens) || [];
  window._imagensResolucaoAtual = (q && q.resolucaoImagens) || [];
  abrirModal(`<h3>${q ? 'Editar' : 'Nova'} questão</h3>
    <label>Tipo</label>
    <select id="input-q-tipo" onchange="_atualizarEditorTipo()">
      ${TIPOS_QUESTAO_OPCOES.map(t => `<option value="${t}" ${t === tipoAtual ? 'selected' : ''}>${LABELS_TIPO[t]}</option>`).join('')}
    </select>
    <label>Componente</label>${renderSelectComponente('input-q-comp', (q && q.comp) || '')}
    <label>Conteúdo</label><input id="input-q-cont" value="${escapeHtml((q && q.cont) || '')}">
    <label>Nível de Bloom</label>
    <select id="input-q-bloom">
      <option value="">Não classificado</option>
      ${Object.keys(LABELS_BLOOM).map(k => `<option value="${k}" ${q && q.bloomLevel === k ? 'selected' : ''}>${LABELS_BLOOM[k]}</option>`).join('')}
    </select>
    <button type="button" class="btn btn-texto btn-pequeno" onclick="pedirSugestaoClassificacao()">✨ Sugerir com IA</button>
    <label>Enunciado</label><textarea id="input-q-text" class="campo-matematico">${escapeHtml((q && q.text) || '')}</textarea>
    ${renderToolbarMatematica()}
    <label>Imagens do enunciado</label>
    <input type="file" accept="image/*" onchange="adicionarImagem(this, 'questao')">
    <div id="preview-imagens-questao">${_previewImagens(window._imagensQuestaoAtual, 'questao')}</div>
    <label>Resolução (explicação — só aparece pro aluno quando você liberar)</label>
    <textarea id="input-q-resolucao" class="campo-matematico">${escapeHtml((q && q.resolucao) || '')}</textarea>
    <label>Imagens da resolução</label>
    <input type="file" accept="image/*" onchange="adicionarImagem(this, 'resolucao')">
    <div id="preview-imagens-resolucao">${_previewImagens(window._imagensResolucaoAtual, 'resolucao')}</div>
    <div id="editor-tipo-especifico"></div>
    <button class="btn btn-primario btn-full" onclick="salvarQuestao(${q ? `'${q.id}'` : 'null'})">Salvar</button>`);
  window._questaoEditando = q;
  _atualizarEditorTipo();
}

function _previewImagens(lista, grupo) {
  return lista.map((img, i) => `
    <div style="display:inline-block;position:relative;margin:4px;">
      <img src="${escapeHtml(img.data)}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;">
      <button type="button" onclick="removerImagem('${grupo}', ${i})" style="position:absolute;top:-6px;right:-6px;background:var(--vermelho);color:white;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;">×</button>
    </div>`).join('');
}

/** Redimensiona/comprime a imagem no navegador antes de enviar — evita falha com fotos grandes de celular. */
function comprimirImagem(file, larguraMax) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, (larguraMax || 1200) / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * escala;
        canvas.height = img.height * escala;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function adicionarImagem(input, grupo) {
  if (!input.files || !input.files[0]) return;
  try {
    mostrarLoading();
    const dataUrlComprimido = await comprimirImagem(input.files[0], 1200);
    const resultado = await Api.chamar('imagens.upload', { base64: dataUrlComprimido, nomeArquivo: 'questao_' + Date.now() });
    const alvo = grupo === 'questao' ? window._imagensQuestaoAtual : window._imagensResolucaoAtual;
    alvo.push({ id: gerarId(), data: resultado.url });
    document.getElementById('preview-imagens-' + grupo).innerHTML = _previewImagens(alvo, grupo);
  } catch (e) {
    toast(e.message, 'erro');
  } finally {
    esconderLoading();
    input.value = '';
  }
}

function removerImagem(grupo, idx) {
  const alvo = grupo === 'questao' ? window._imagensQuestaoAtual : window._imagensResolucaoAtual;
  alvo.splice(idx, 1);
  document.getElementById('preview-imagens-' + grupo).innerHTML = _previewImagens(alvo, grupo);
}
const TIPOS_QUESTAO_OPCOES = ['multipla', 'vf', 'relacione', 'classifique', 'ordenar', 'lacunas', 'discursiva'];

function _atualizarEditorTipo() {
  const tipo = document.getElementById('input-q-tipo').value;
  const q = window._questaoEditando;
  document.getElementById('editor-tipo-especifico').innerHTML = renderEditorPorTipo(tipo, q && q.tipo === tipo ? q : {});
}

async function pedirSugestaoClassificacao() {
  const componente = document.getElementById('input-q-comp').value;
  const conteudo = document.getElementById('input-q-cont').value;
  const enunciado = document.getElementById('input-q-text').value;
  if (!componente || !enunciado) { toast('Preencha componente e enunciado primeiro.', 'erro'); return; }
  const sugestao = await chamarComLoading('ia.sugerirClassificacao', { componente, conteudo, enunciado });
  document.getElementById('input-q-bloom').value = sugestao.bloomLevel;
  toast('Pré-requisitos sugeridos pela IA: ' + sugestao.preRequisitosSugeridos.join(', ') + ' (sugestão informativa — o cadastro formal de pré-requisitos ainda não tem tela própria nesta versão).', 'sucesso');
}

async function salvarQuestao(id) {
  const tipo = document.getElementById('input-q-tipo').value;
  const { alternativas, gabarito } = coletarDadosEditorPorTipo(tipo);
  const dados = {
    tipo, comp: document.getElementById('input-q-comp').value, cont: document.getElementById('input-q-cont').value,
    bloomLevel: document.getElementById('input-q-bloom').value, text: document.getElementById('input-q-text').value,
    resolucao: document.getElementById('input-q-resolucao').value, alternativas, gabarito,
    imagens: window._imagensQuestaoAtual || [], resolucaoImagens: window._imagensResolucaoAtual || []
  };
  try {
    await chamarComLoading(id ? 'questoes.editar' : 'questoes.criar', id ? { id, ...dados } : dados);
    fecharModal(); toast('Questão salva.', 'sucesso'); renderBancoQuestoes();
  } catch (e) { /* toast já mostrado */ }
}

async function excluirQuestao(id) {
  if (!confirm('Excluir esta questão do banco?')) return;
  await chamarComLoading('questoes.deletar', { id });
  toast('Questão excluída.', 'sucesso'); renderBancoQuestoes();
}

const MODELO_JSON_QUESTOES = [
  { tipo: 'multipla', comp: 'Matemática', cont: 'Frações', text: 'Quanto é 1/2 + 1/4?',
    alternativas: { A: '1/2', B: '3/4', C: '1', D: '2/4', E: '1/4' }, gabarito: 'B',
    bloomLevel: 'aplicar', resolucao: '1/2 = 2/4, então 2/4 + 1/4 = 3/4.' },
  { tipo: 'vf', comp: 'Ciências', cont: 'Água', text: 'Classifique as afirmações:',
    alternativas: [{ id: 'af1', texto: 'A água ferve a 100°C no nível do mar.' }, { id: 'af2', texto: 'O gelo é mais denso que a água líquida.' }],
    gabarito: { af1: true, af2: false }, bloomLevel: 'lembrar' },
  { tipo: 'relacione', comp: 'Geografia', cont: 'Capitais', text: 'Relacione o país à capital:',
    alternativas: { colunaA: [{ id: 'a1', texto: 'Brasil' }, { id: 'a2', texto: 'França' }], colunaB: [{ id: 'b1', texto: 'Brasília' }, { id: 'b2', texto: 'Paris' }] },
    gabarito: { a1: 'b1', a2: 'b2' }, bloomLevel: 'entender' },
  { tipo: 'classifique', comp: 'Biologia', cont: 'Ecologia', text: 'Ordene do menor para o maior nível organizacional:',
    alternativas: [{ id: 'i1', texto: 'Célula' }, { id: 'i2', texto: 'Tecido' }, { id: 'i3', texto: 'Órgão' }],
    gabarito: ['i1', 'i2', 'i3'], bloomLevel: 'analisar' },
  { tipo: 'ordenar', comp: 'História', cont: 'Linha do tempo', text: 'Ordene cronologicamente:',
    alternativas: [{ id: 'e1', texto: 'Proclamação da República' }, { id: 'e2', texto: 'Independência do Brasil' }],
    gabarito: ['e2', 'e1'], bloomLevel: 'analisar' },
  { tipo: 'lacunas', comp: 'Português', cont: 'Gramática', text: 'O {{1}} concorda em gênero e número com o {{2}}.',
    alternativas: 'O {{1}} concorda em gênero e número com o {{2}}.', gabarito: { '1': ['adjetivo'], '2': ['substantivo'] }, bloomLevel: 'entender' },
  { tipo: 'discursiva', comp: 'Redação', cont: 'Argumentação', text: 'Explique, com suas palavras, a importância da reciclagem.',
    alternativas: null, gabarito: null, bloomLevel: 'avaliar' }
];

function modalImportarJSON() {
  abrirModal(`<h3>Importar questões via JSON</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Opção avançada: cole um array JSON de questões já no formato do sistema. Se quiser, copie o modelo abaixo — ele tem um exemplo de cada tipo de questão — e use como referência (inclusive pra pedir a uma IA que gere questões nesse formato).</p>
    <button type="button" class="btn btn-secundario btn-full" onclick="copiarModeloJSON()">📋 Copiar modelo JSON</button>
    <textarea id="input-json-import" style="min-height:200px;"></textarea>
    <button class="btn btn-primario btn-full" onclick="confirmarImportarJSON()">Importar</button>`);
}

async function copiarModeloJSON() {
  const texto = JSON.stringify(MODELO_JSON_QUESTOES, null, 2);
  try {
    await navigator.clipboard.writeText(texto);
    toast('Modelo copiado! Cole onde quiser (ou aqui embaixo pra editar).', 'sucesso');
  } catch (e) {
    // Alguns navegadores bloqueiam a área de transferência — como alternativa, já deixamos
    // o modelo pronto no campo de texto pra copiar manualmente.
    document.getElementById('input-json-import').value = texto;
    toast('Não consegui copiar automaticamente — coloquei o modelo no campo abaixo pra você copiar.', 'sucesso');
  }
}
async function confirmarImportarJSON() {
  let arr;
  try { arr = JSON.parse(document.getElementById('input-json-import').value); } catch (e) { toast('JSON inválido.', 'erro'); return; }
  const resultado = await chamarComLoading('questoes.importarJSON', { questoes: arr });
  fecharModal(); toast(`${resultado.importadas} importadas, ${resultado.ignoradasDuplicadas} duplicadas ignoradas.`, 'sucesso'); renderBancoQuestoes();
}

async function modalImportarVestibular() {
  await carregarComponentes();
  abrirModal(`<h3>Importar prova de vestibular (IA)</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Envie o PDF ou foto da prova (e do gabarito, se for um arquivo separado — ou deixe em branco se prova, gabarito e resolução já vierem juntos no mesmo arquivo). A IA reconhece as questões, extrai a resolução comentada quando houver, classifica e você revisa antes de salvar.</p>
    <label>Arquivo da prova (PDF ou imagem)</label><input type="file" id="input-arquivo-prova" accept="application/pdf,image/*">
    <label>Arquivo do gabarito (opcional — deixe em branco se já estiver junto da prova)</label><input type="file" id="input-arquivo-gabarito" accept="application/pdf,image/*">
    <label>Componente padrão (se a IA não identificar)</label>${renderSelectComponente('input-comp-padrao', '')}
    <button class="btn btn-primario btn-full" onclick="confirmarImportarVestibular()">Analisar com IA</button>
    <div id="preview-import-vestibular"></div>`);
}
function _arquivoParaBase64(input) {
  return new Promise((resolve, reject) => {
    if (!input.files[0]) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({ base64: reader.result.split(',')[1], mime: input.files[0].type });
    reader.onerror = reject;
    reader.readAsDataURL(input.files[0]);
  });
}
async function confirmarImportarVestibular() {
  const prova = await _arquivoParaBase64(document.getElementById('input-arquivo-prova'));
  if (!prova) { toast('Selecione o arquivo da prova.', 'erro'); return; }
  const gabarito = await _arquivoParaBase64(document.getElementById('input-arquivo-gabarito'));
  const componentePadrao = document.getElementById('input-comp-padrao').value;
  const resultado = await chamarComLoading('questoes.importarVestibularIA', {
    base64Prova: prova.base64, mimeProva: prova.mime,
    base64Gabarito: gabarito ? gabarito.base64 : null, mimeGabarito: gabarito ? gabarito.mime : null,
    componentePadrao
  });
  window._questoesVestibularPreview = resultado.questoes.map(q => ({ ...q, tipo: 'multipla', incluir: true }));
  document.getElementById('preview-import-vestibular').innerHTML = `
    <p><strong>${resultado.total} questões encontradas.</strong> Revise antes de confirmar:</p>
    ${window._questoesVestibularPreview.map((q, i) => `
      <div class="card">
        <label class="alternativa"><input type="checkbox" checked onchange="window._questoesVestibularPreview[${i}].incluir=this.checked"><span>${formatarTextoQuestao(q.text).slice(0, 150)}...</span></label>
        <small>${escapeHtml(q.comp)} · Gabarito: ${escapeHtml(q.gabarito)} · ${escapeHtml(LABELS_BLOOM[q.bloomLevel] || '')} · ${q.resolucao ? '✓ resolução extraída' : 'sem resolução no arquivo'}</small>
      </div>`).join('')}
    <button class="btn btn-sucesso btn-full" onclick="confirmarSalvarVestibular()">Salvar questões selecionadas</button>`;
}
async function confirmarSalvarVestibular() {
  const selecionadas = window._questoesVestibularPreview.filter(q => q.incluir).map(({ incluir, ...q }) => q);
  const resultado = await chamarComLoading('questoes.importarJSON', { questoes: selecionadas });
  fecharModal(); toast(`${resultado.importadas} questões importadas.`, 'sucesso'); renderBancoQuestoes();
}

// ======================================================================
// PROFESSOR — NOTAS
// ======================================================================

async function renderNotas() {
  const el = document.getElementById('professor-conteudo');
  const escolas = escolasCache || await chamarComLoading('turmas.listarEscolas', {});
  const periodos = await chamarComLoading('periodos.listar', {});
  const todasTurmas = escolas.escolas.flatMap(e => e.turmas.map(t => ({ ...t, escolaId: e.id })));
  el.innerHTML = `
    <div class="card">
      <h4>Criar período de avaliação</h4>
      <label>Nome</label><input id="input-periodo-nome" placeholder="1º Bimestre">
      <label>Início</label><input id="input-periodo-inicio" type="date">
      <label>Término</label><input id="input-periodo-termino" type="date">
      <button class="btn btn-secundario" onclick="criarPeriodoUI()">Criar período</button>
    </div>
    <div class="card">
      <h4>Ver notas por turma</h4>
      <label>Turma</label>
      <select id="select-turma-notas">${todasTurmas.map(t => `<option value="${t.escolaId}|${t.id}">${escapeHtml(t.nome)}</option>`).join('')}</select>
      <label>Período</label>
      <select id="select-periodo-notas">${periodos.periodos.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}</select>
      <button class="btn btn-primario" onclick="verNotasTurma()">Ver notas</button>
      <div id="tabela-notas-container"></div>
    </div>`;
}
async function criarPeriodoUI() {
  const nome = document.getElementById('input-periodo-nome').value;
  const inicio = document.getElementById('input-periodo-inicio').value;
  const termino = document.getElementById('input-periodo-termino').value;
  await chamarComLoading('periodos.criar', { nome, inicio, termino });
  toast('Período criado.', 'sucesso'); renderNotas();
}
async function verNotasTurma() {
  const [escolaId, turmaId] = document.getElementById('select-turma-notas').value.split('|');
  const periodoId = document.getElementById('select-periodo-notas').value;
  const dados = await chamarComLoading('blocos.calcularNotasTurma', { escolaId, turmaId, periodoId });
  const container = document.getElementById('tabela-notas-container');
  if (dados.blocos.length === 0) { container.innerHTML = '<p>Nenhum bloco cadastrado para este período.</p>'; return; }
  container.innerHTML = `<table class="tabela-notas"><thead><tr><th>Aluno</th>${dados.blocos.map(b => `<th>${escapeHtml(b.nome)} (${b.notaTotal})</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${dados.alunos.map(a => `<tr><td>${escapeHtml(a.nome)}</td>${a.notasPorBloco.map(b => `<td>${b.notaObtida}</td>`).join('')}<td><strong>${a.totalPeriodo}</strong></td></tr>`).join('')}</tbody></table>`;
}

// ======================================================================
// PROFESSOR — DIAGNÓSTICO
// ======================================================================

async function renderDiagnostico() {
  const el = document.getElementById('professor-conteudo');
  const escolas = escolasCache || await chamarComLoading('turmas.listarEscolas', {});
  const todasTurmas = escolas.escolas.flatMap(e => e.turmas.map(t => ({ ...t, escolaId: e.id })));
  el.innerHTML = `
    <div class="card">
      <label>Turma</label>
      <select id="select-turma-diagnostico">${todasTurmas.map(t => `<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join('')}</select>
      <button class="btn btn-primario" onclick="verDiagnosticoTurma()">Ver diagnóstico</button>
    </div>
    <div id="diagnostico-resultado"></div>`;
}
async function verDiagnosticoTurma() {
  const turmaId = document.getElementById('select-turma-diagnostico').value;
  const dados = await chamarComLoading('diagnostico.relatorioTurma', { turmaId });
  const container = document.getElementById('diagnostico-resultado');
  if (dados.alunos.length === 0) { container.innerHTML = '<div class="estado-vazio">Sem indícios de dificuldade registrados ainda.</div>'; return; }
  const textoHipotese = { possivel_lacuna_base: '⚠️ Possível lacuna de base', dificuldade_conteudo_atual: '📍 Dificuldade no conteúdo atual' };
  container.innerHTML = dados.alunos.map(a => `
    <div class="card">
      <strong>${escapeHtml(a.nome)}</strong>
      ${a.diagnostico.map(d => `
        <div class="lista-item">
          <span>${escapeHtml(d.conteudo)}</span>
          <span class="badge badge-info">${textoHipotese[d.hipotese] || d.hipotese}</span>
        </div>`).join('')}
    </div>`).join('') + `<p style="font-size:0.8rem;color:var(--cinza-texto);">Hipótese estatística baseada em padrão de erro — não é um diagnóstico exato.</p>`;
}

// ======================================================================
// PROFESSOR — GUIA DE CLASSIFICAÇÃO DE QUESTÕES (consulta rápida, sem sair do app)
// ======================================================================

function renderGuiaClassificacao() {
  const el = document.getElementById('professor-conteudo');
  el.innerHTML = `<div class="card guia-conteudo">${GUIA_CLASSIFICACAO_HTML}</div>`;
}

const GUIA_CLASSIFICACAO_HTML = `
<h3>Guia prático de classificação de questões</h3>
<p style="color:var(--cinza-texto);font-style:italic;">Como cadastrar e classificar questões por nível cognitivo (Taxonomia de Bloom) e por pré-requisito de conteúdo.</p>
<p>Este guia traduz três referências acadêmicas em passos práticos pro cadastro de questões: a Taxonomia de Bloom Revisada (pra classificar o nível cognitivo exigido por cada questão), a Teoria da Aprendizagem Significativa de Ausubel (pra identificar os pré-requisitos de um conteúdo) e a concepção de avaliação diagnóstica de Luckesi (pra entender como o sistema usa essas classificações pra apontar hipóteses de dificuldade).</p>

<h4>1. Classificando pelo nível cognitivo (Taxonomia de Bloom Revisada)</h4>
<p>A Taxonomia de Bloom Revisada (Anderson &amp; Krathwohl, 2001) organiza o que se pede numa questão em seis processos cognitivos, do mais simples ao mais complexo. É esse o campo "Nível de Bloom" que aparece no cadastro de questão.</p>
<table>
  <tr><th>Nível</th><th>Definição</th><th>Verbos típicos</th><th>Exemplo</th></tr>
  <tr><td>Lembrar</td><td>Recuperar um fato ou informação já vista, sem precisar entender ou usar.</td><td>listar, nomear, identificar, definir, reconhecer</td><td>"Qual é a capital do Brasil?"</td></tr>
  <tr><td>Entender</td><td>Explicar uma ideia com as próprias palavras; interpretar, comparar, resumir.</td><td>explicar, interpretar, resumir, comparar, exemplificar</td><td>"Explique por que a água ferve mais rápido em altitude elevada."</td></tr>
  <tr><td>Aplicar</td><td>Usar um procedimento ou conceito já conhecido numa situação nova, mas do mesmo tipo já treinado.</td><td>calcular, resolver, aplicar, demonstrar, usar</td><td>"Calcule a área de um terreno retangular de 12m por 8m."</td></tr>
  <tr><td>Analisar</td><td>Quebrar a informação em partes e entender como elas se relacionam ou por que algo funciona.</td><td>comparar, categorizar, diferenciar, examinar, decompor</td><td>"Compare as causas econômicas e sociais da Revolução Industrial."</td></tr>
  <tr><td>Avaliar</td><td>Julgar algo com base em critérios definidos, com justificativa.</td><td>julgar, criticar, justificar, avaliar, defender</td><td>"A solução apresentada pelo colega está correta? Justifique."</td></tr>
  <tr><td>Criar</td><td>Combinar elementos pra produzir algo novo — um plano, um argumento, uma solução original.</td><td>elaborar, propor, criar, planejar, formular</td><td>"Elabore uma proposta de intervenção para reduzir o desperdício de água na escola."</td></tr>
</table>
<p class="fonte">Fonte: Krathwohl, D. R. (2002). A Revision of Bloom's Taxonomy: An Overview. Theory Into Practice, 41(4).</p>

<h4>1.1 Método prático: verbo + assunto</h4>
<p>Segundo Krathwohl (2002), a forma mais confiável de classificar uma questão é separar dois elementos do enunciado: o <strong>VERBO</strong> principal — o que o aluno precisa fazer (lembrar, explicar, calcular, comparar, julgar, criar...) — e o <strong>ASSUNTO</strong> (substantivo) sobre o que ele está fazendo isso. O verbo é geralmente o melhor indicador do nível: se o comando pede pra "listar" ou "nomear", é Lembrar; se pede pra "calcular" um valor com um método já ensinado, é Aplicar; se pede pra "comparar" duas ideias e mostrar a relação entre elas, é Analisar — e assim por diante.</p>

<h4>1.2 Diferenciando níveis vizinhos (os que mais geram dúvida)</h4>
<p><strong>Lembrar × Entender:</strong> Lembrar é só recuperar o fato ("qual é a fórmula da área do triângulo?"). Entender exige reformular ou interpretar esse fato com as próprias palavras ("por que a fórmula da área do triângulo é base × altura ÷ 2?").</p>
<p><strong>Aplicar × Analisar:</strong> esta é a divisa mais confundida na prática. Aplicar é usar um procedimento já treinado numa situação parecida ("resolva esta equação do 2º grau"). Analisar exige decompor a situação e entender POR QUE ou COMO as partes se relacionam ("por que este método de resolução funciona, e em que casos ele falharia?").</p>
<p><strong>Avaliar × Criar:</strong> Avaliar é julgar algo que já existe, com base em critérios ("essa redação atende ao tema proposto? justifique"). Criar é produzir algo novo — planejar, propor, formular ("elabore uma proposta original para..."). Por isso Criar fica no topo: produzir algo novo geralmente exige também avaliar as opções ao longo do caminho.</p>
<p class="fonte">Fonte: Structural Learning — "Anderson and Krathwohl's Revised Taxonomy: A Teacher's Guide".</p>

<h4>1.3 No AppMaximo</h4>
<ul>
  <li>Ao cadastrar uma questão, escolha o nível no campo "Nível de Bloom" (ou clique em "✨ Sugerir com IA" pra receber uma sugestão automática, sempre revisável antes de confirmar).</li>
  <li>Esse campo é o que alimenta o relatório de Diagnóstico da turma — sem ele, o sistema não consegue apontar em qual nível cognitivo os alunos estão com mais dificuldade.</li>
</ul>

<h4>2. Identificando pré-requisitos ("subsunções")</h4>
<p>O AppMaximo usa o termo "pré-requisito" pra descrever o que Ausubel chamava de subsunção: um conteúdo só é aprendido de forma significativa quando se conecta a algo que o aluno já sabe. Se essa base ("subsunçor") não existe ou está frágil, o aluno tende a memorizar o conteúdo novo sem realmente compreendê-lo — e o erro nas provas costuma aparecer não no conteúdo atual, mas nessa base que faltou.</p>
<blockquote>"A aprendizagem envolve a reorganização das estruturas cognitivas existentes" — o conhecimento novo precisa se ligar ativamente a ideias já estabelecidas, não é construído do zero. (Ausubel, Teoria da Assimilação)</blockquote>
<p class="fonte">Fonte: InstructionalDesign.org — "Subsumption Theory (David Ausubel)".</p>

<h4>2.1 Método prático pra mapear pré-requisitos de um conteúdo</h4>
<p>Ausubel não deixou uma receita fixa pra listar pré-requisitos, mas o princípio de organizar do geral pro específico, e sempre relacionar o novo ao que já existe, sugere um caminho prático simples — faça a si mesmo esta pergunta para cada conteúdo novo:</p>
<ul>
  <li>"O que o aluno PRECISA já saber, de forma sólida, antes deste conteúdo fazer sentido?" — liste só os 2 ou 3 pré-requisitos mais diretos, não a árvore inteira do currículo.</li>
  <li>Prefira pré-requisitos que já foram (ou serão) também cadastrados como conteúdo de alguma questão no banco — assim o sistema consegue medir o desempenho histórico do aluno naquele pré-requisito.</li>
</ul>
<p>Exemplos por disciplina:</p>
<ul>
  <li>Matemática — "Equações do 2º grau" tem como pré-requisitos "Equações do 1º grau" e "Potenciação".</li>
  <li>Matemática — "Frações" tem como pré-requisito "Divisão".</li>
  <li>Português — "Concordância verbal" tem como pré-requisito "Classes gramaticais (sujeito e verbo)".</li>
  <li>Ciências — "Fotossíntese" tem como pré-requisito "Estrutura da célula vegetal".</li>
  <li>História — "Revolução Industrial" tem como pré-requisito "Sistema colonial e mercantilismo".</li>
</ul>

<h4>2.2 Situação atual no AppMaximo</h4>
<p>Hoje, ao clicar em "✨ Sugerir com IA" no cadastro de uma questão, o sistema já sugere possíveis pré-requisitos do conteúdo (com base no componente e conteúdo informados) — essa sugestão aparece como informação, pra te orientar. O cadastro FORMAL de pré-requisitos aprovados (que efetivamente alimenta o cálculo de diagnóstico) ainda não tem uma tela própria nesta versão.</p>

<h4>3. Como isso vira diagnóstico (Luckesi e a análise de erros)</h4>
<p>Cipriano Luckesi separa a avaliação classificatória (que só rotula o aluno como "aprovado" ou "reprovado") da avaliação diagnóstica, que usa o resultado pra entender e agir. Para Luckesi, o erro não é um veredito sobre o aluno — é uma pista sobre o caminho que ele está tentando percorrer.</p>
<blockquote>"O erro é uma hipótese de construção de conhecimento, um caminho que o aprendiz está tentando trilhar e que não está produzindo resultados adequados." (Luckesi)</blockquote>
<p class="fonte">Fonte: Cadernos de Graduação — "A avaliação como um instrumento diagnóstico: uma reflexão sobre a prática docente" (periodicos.set.edu.br).</p>
<p>É exatamente essa lógica que o AppMaximo automatiza: quando um aluno erra uma questão, o sistema compara o desempenho histórico dele NAQUELE conteúdo com o desempenho nos pré-requisitos cadastrados para ele, e gera uma hipótese (nunca uma certeza — sempre revisável por você):</p>
<ul>
  <li>"possível lacuna de base" — o aluno também está com desempenho baixo nos pré-requisitos daquele conteúdo. O problema provavelmente não é o conteúdo atual, é o que vem antes dele.</li>
  <li>"dificuldade no conteúdo atual" — o aluno domina os pré-requisitos, mas está errando especificamente o conteúdo novo. Vale reforçar só esse tópico.</li>
</ul>
<p>Essa hipótese só existe, e só fica mais precisa, quando as questões estão bem classificadas por componente/conteúdo e quando os pré-requisitos estão mapeados — por isso os passos 1 e 2 deste guia importam na prática, não são só um campo a mais pra preencher.</p>

<h4>Checklist rápido ao cadastrar uma questão</h4>
<ul>
  <li>1. Componente e Conteúdo preenchidos com nomes consistentes (use sempre a mesma grafia — "Frações" e "frações" contam como conteúdos diferentes pro sistema).</li>
  <li>2. Nível de Bloom escolhido (use o botão de sugestão da IA como ponto de partida, mas revise).</li>
  <li>3. Se o conteúdo tiver um pré-requisito claro, anote-o (mesmo que hoje seja só numa lista sua, até a tela de cadastro formal existir).</li>
  <li>4. Gabarito conferido — principalmente em Relacione, Classifique e Ordenar, onde é fácil errar a ordem/pareamento.</li>
  <li>5. Resolução (explicação) preenchida quando possível — ela é o que mais ajuda o aluno quando você libera a correção.</li>
</ul>

<h4>Referências</h4>
<p>Anderson, L. W., &amp; Krathwohl, D. R. (Eds.). (2001). A Taxonomy for Learning, Teaching, and Assessing: A Revision of Bloom's Taxonomy of Educational Objectives. Longman.</p>
<p>Krathwohl, D. R. (2002). A Revision of Bloom's Taxonomy: An Overview. Theory Into Practice, 41(4), 212–218.</p>
<p>Ausubel, D. P. (1962/1968). Subsumption Theory / Educational Psychology: A Cognitive View. Resumo consultado em InstructionalDesign.org.</p>
<p>Doignon, J.-P., &amp; Falmagne, J.-C. (1999). Knowledge Spaces. Springer.</p>
<p>Luckesi, C. C. (2018). Avaliação da Aprendizagem: Componente do Ato Pedagógico. Cortez. Referência secundária consultada via "A avaliação como um instrumento diagnóstico: uma reflexão sobre a prática docente", Cadernos de Graduação (periodicos.set.edu.br).</p>
`;

// ======================================================================
// PROFESSOR — ADMIN
// ======================================================================

async function renderAdmin() {
  const el = document.getElementById('professor-conteudo');
  try {
    const stats = await chamarComLoading('admin.estatisticas', {});
    el.innerHTML = `
      <div class="card">
        <h4>Estatísticas gerais</h4>
        <p>${stats.totalProfessores} professores · ${stats.totalEscolas} escolas · ${stats.totalTurmas} turmas · ${stats.totalAlunos} alunos · ${stats.totalQuestoes} questões</p>
      </div>
      <div class="card">
        <h4>Novo professor/admin</h4>
        <label>Nome</label><input id="input-prof-nome">
        <label>Usuário</label><input id="input-prof-user">
        <label>Senha</label><input id="input-prof-senha">
        <label>Nível</label><select id="input-prof-nivel"><option value="professor">Professor</option><option value="admin">Admin</option></select>
        <button class="btn btn-primario" onclick="criarProfessorUI()">Criar</button>
      </div>
      <div class="card">
        <h4>Backup</h4>
        <button class="btn btn-secundario" onclick="baixarBackup()">Baixar backup completo (JSON)</button>
      </div>`;
  } catch (e) {
    el.innerHTML = '<div class="estado-vazio">Acesso restrito ao administrador.</div>';
  }
}
async function criarProfessorUI() {
  const nome = document.getElementById('input-prof-nome').value;
  const user = document.getElementById('input-prof-user').value;
  const pass = document.getElementById('input-prof-senha').value;
  const nivel = document.getElementById('input-prof-nivel').value;
  await chamarComLoading('admin.criarProfessor', { nome, user, pass, nivel });
  toast('Professor criado.', 'sucesso'); renderAdmin();
}
async function baixarBackup() {
  const dados = await chamarComLoading('admin.exportarBackup', {});
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `backup-appmaximo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
