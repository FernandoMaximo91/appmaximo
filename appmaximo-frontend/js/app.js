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
    document.getElementById('alerta-sessao-duplicada').classList.add('hidden');
  });
  document.getElementById('btn-cancelar-login').addEventListener('click', () => {
    document.getElementById('alerta-sessao-duplicada').classList.add('hidden');
  });
  document.getElementById('btn-forcar-login').addEventListener('click', () => submeterLogin(true));
  document.getElementById('form-login').addEventListener('submit', (e) => {
    e.preventDefault();
    submeterLogin(false);
  });
}

async function submeterLogin(forcar) {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!user || !pass) { toast('Preencha usuário e senha.', 'erro'); return; }

  try {
    if (!forcar) {
      const check = await chamarComLoading('auth.verificarSessaoAtiva', { usuario: user, token: '' });
      if (check.ativa) {
        document.getElementById('alerta-sessao-duplicada').classList.remove('hidden');
        return;
      }
    }
    const resultado = await chamarComLoading('auth.login', { user, pass, tipo: sessaoLocal.tipoLogin });
    Api.setToken(resultado.token);
    sessaoLocal = {
      tipo: sessaoLocal.tipoLogin, user: resultado.usuario.user, nome: resultado.usuario.nome,
      nivel: resultado.usuario.nivel || null
    };
    localStorage.setItem('appmaximo_perfil', JSON.stringify(sessaoLocal));
    document.getElementById('alerta-sessao-duplicada').classList.add('hidden');
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
  const map = { turmas: renderTurmas, questoes: renderBancoQuestoes, notas: renderNotas, diagnostico: renderDiagnostico, admin: renderAdmin };
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
        </div>
        <span class="badge badge-feito">✓ Feita</span>
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
    <p>Gere uma atividade extra com 3 questões, feita pela IA, mirando os pontos onde você mais errou recentemente.</p>
    <button class="btn btn-primario" onclick="gerarAtividadeExtra()">✨ Gerar atividade extra</button>
    <div id="atividade-extra-resultado"></div>
  </div>`;
}

async function gerarAtividadeExtra() {
  try {
    const dados = await chamarComLoading('ia.gerarAtividadeComplementar', {});
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
  } catch (e) { /* toast já mostrado */ }
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

async function abrirProva(listaId) {
  const dados = await chamarComLoading('questoes.paraResponder', { listaId });
  provaAtual = dados;
  document.getElementById('view-aluno').classList.add('hidden');
  document.getElementById('view-prova').classList.remove('hidden');
  const conteudo = document.getElementById('prova-conteudo');

  if (dados.jaRespondida) {
    conteudo.innerHTML = `<div class="alerta alerta-info">Você já respondeu esta atividade.
      ${dados.resultadoAnterior ? `Nota: ${dados.resultadoAnterior.acertos} acertos.` : ''}</div>` +
      dados.questoes.map((q, i) => renderResponderQuestao(q, i)).join('') +
      `<button class="btn btn-secundario btn-full" onclick="fecharProva()">Voltar</button>`;
    document.querySelectorAll('#prova-conteudo input, #prova-conteudo select, #prova-conteudo textarea, #prova-conteudo button').forEach(el => {
      if (!el.closest('button')) el.disabled = true;
    });
    return;
  }

  conteudo.innerHTML = dados.questoes.map((q, i) => renderResponderQuestao(q, i)).join('') +
    `<button class="btn btn-sucesso btn-full" onclick="enviarProva()">Enviar respostas</button>`;

  if (dados.lista.cronometroMin) {
    iniciarCronometro(dados.lista.cronometroMin);
  }
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
  try {
    const resultado = await chamarComLoading('questoes.entregarLista', { listaId: provaAtual.lista.id, respostas });
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
  abrirAbaAluno('pendentes');
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
    ${escolasCache.escolas.map(esc => `
      <div class="card">
        <h4>🏫 ${escapeHtml(esc.nome)}</h4>
        ${esc.turmas.map(t => `
          <div class="lista-item">
            <div>${escapeHtml(t.nome)} <small>(${t.totalAlunos} alunos)</small></div>
            <button class="btn btn-secundario btn-pequeno" onclick="abrirTurma('${esc.id}','${t.id}')">Abrir</button>
          </div>`).join('')}
        <button class="btn btn-texto btn-pequeno" onclick="modalNovaTurma('${esc.id}')">+ Nova turma</button>
      </div>`).join('')}
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
function modalNovaTurma(escolaId) {
  abrirModal(`<h3>Nova turma</h3><label>Nome</label><input id="input-nome-turma">
    <button class="btn btn-primario btn-full" onclick="salvarNovaTurma('${escolaId}')">Criar</button>`);
}
async function salvarNovaTurma(escolaId) {
  const nome = document.getElementById('input-nome-turma').value;
  await chamarComLoading('turmas.criarTurma', { escolaId, nome });
  fecharModal(); toast('Turma criada.', 'sucesso'); renderTurmas();
}

async function abrirTurma(escolaId, turmaId) {
  turmaAtualDetalhe = await chamarComLoading('turmas.detalhes', { turmaId });
  turmaAtualDetalhe._escolaId = escolaId;
  const el = document.getElementById('professor-conteudo');
  el.innerHTML = `
    <button class="btn btn-texto" onclick="renderTurmas()">← Voltar</button>
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
    </div>
    <div class="card">
      <h4>Listas de atividades</h4>
      ${turmaAtualDetalhe.listas.map(l => `
        <div class="lista-item"><span>${escapeHtml(l.titulo)} <small>(${(l.qIds || []).length} questões)</small></span>
          <span>
            <button class="btn btn-pequeno btn-secundario" onclick="abrirCorrecaoDiscursivas('${l.id}', '${escapeHtml(l.titulo).replace(/'/g, "\\'")}')">Corrigir discursivas</button>
            <button class="btn btn-pequeno ${l.resolucaoLiberada ? 'btn-sucesso' : 'btn-secundario'}" onclick="alternarResolucao('${l.id}', ${!l.resolucaoLiberada})">${l.resolucaoLiberada ? 'Resolução liberada' : 'Liberar resolução'}</button>
          </span>
        </div>`).join('')}
      <button class="btn btn-texto btn-pequeno" onclick="modalNovaLista()">+ Nova lista</button>
    </div>
    <div class="card">
      <h4>Redações</h4>
      ${turmaAtualDetalhe.redacoes.map(r => `<div class="lista-item"><span>${escapeHtml(r.titulo)}</span>
        <button class="btn btn-pequeno btn-secundario" onclick="abrirCorrecaoRedacoes('${r.id}')">Corrigir</button></div>`).join('')}
      <button class="btn btn-texto btn-pequeno" onclick="modalNovaRedacao()">+ Nova redação</button>
    </div>
    <div class="card">
      <h4>Blocos de notas</h4>
      ${turmaAtualDetalhe.blocos.map(b => `<div class="lista-item"><span>${escapeHtml(b.nome)} <small>(${b.notaTotal} pts, ${b.modo === 'participacao' ? 'participação' : 'acerto'})</small></span></div>`).join('')}
      <button class="btn btn-texto btn-pequeno" onclick="modalNovoBloco()">+ Novo bloco</button>
    </div>
  `;
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

async function alternarResolucao(listaId, liberar) {
  await chamarComLoading('questoes.liberarResolucao', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, listaId, liberar });
  toast('Atualizado.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

async function modalNovaLista() {
  const banco = await chamarComLoading('questoes.buscarPaginado', { filtros: {}, pagina: 1 });
  abrirModal(`<h3>Nova lista de atividades</h3>
    <label>Título</label><input id="input-lista-titulo">
    <label>Cronômetro (minutos, opcional)</label><input id="input-lista-cronometro" type="number">
    <label>Selecione as questões</label>
    <div style="max-height:300px;overflow-y:auto;">
      ${banco.questoes.map(q => `<label class="alternativa"><input type="checkbox" class="chk-questao-lista" value="${q.id}"><span>${escapeHtml(q.comp)} — ${formatarTextoQuestao(q.text).slice(0, 80)}...</span></label>`).join('')}
    </div>
    <button class="btn btn-primario btn-full" onclick="salvarNovaLista()">Criar lista</button>`);
}
async function salvarNovaLista() {
  const titulo = document.getElementById('input-lista-titulo').value;
  const cronometroMin = document.getElementById('input-lista-cronometro').value || null;
  const qIds = Array.from(document.querySelectorAll('.chk-questao-lista:checked')).map(c => c.value);
  if (qIds.length === 0) { toast('Selecione ao menos uma questão.', 'erro'); return; }
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
        ${!r.revisadoProfessor ? `<button class="btn btn-secundario btn-pequeno" onclick="pedirCorrecaoIA('${redacaoId}','${a.id}')">Pedir sugestão da IA</button>` : ''}
        <div id="correcao-area-${a.id}">${r.correcaoIA ? _htmlRevisaoRedacao(redacao, a.id, r.correcaoIA, redacaoId) : ''}</div>
      </div>`;
    }).join('')}`);
}

async function pedirCorrecaoIA(redacaoId, alunoId) {
  const redacao = turmaAtualDetalhe.redacoes.find(r => r.id === redacaoId);
  const sugestao = await chamarComLoading('redacao.corrigirIA', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, redacaoId, alunoId });
  document.getElementById('correcao-area-' + alunoId).innerHTML = _htmlRevisaoRedacao(redacao, alunoId, sugestao, redacaoId);
}

function _htmlRevisaoRedacao(redacao, alunoId, sugestao, redacaoId) {
  const criterios = redacao.criterio === 'enem'
    ? [{ chave: 'c1', nome: 'Domínio da norma culta' }, { chave: 'c2', nome: 'Compreensão do tema' }, { chave: 'c3', nome: 'Organização de argumentos' }, { chave: 'c4', nome: 'Mecanismos linguísticos' }, { chave: 'c5', nome: 'Proposta de intervenção' }]
    : redacao.criteriosCustom;
  return `<div class="alerta alerta-info">Sugestão da IA — revise antes de confirmar</div>
    ${criterios.map(c => {
      const sug = (sugestao.competencias || []).find(s => s.chave === c.chave) || {};
      return `<label>${escapeHtml(c.nome)}${sug.comentario ? ' — <small>' + escapeHtml(sug.comentario) + '</small>' : ''}</label>
        <input type="number" class="input-nota-criterio" data-chave="${c.chave}" value="${sug.nota || 0}">`;
    }).join('')}
    <label>Comentário final</label><textarea id="comentario-final-${alunoId}">${escapeHtml(sugestao.comentarioGeral || '')}</textarea>
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

async function renderBancoQuestoes(pagina) {
  pagina = pagina || 1;
  const el = document.getElementById('professor-conteudo');
  const dados = await chamarComLoading('questoes.buscarPaginado', { filtros: {}, pagina });
  el.innerHTML = `
    <div class="linha-botoes">
      <button class="btn btn-primario" onclick="modalNovaQuestao()">+ Nova questão</button>
      <button class="btn btn-secundario" onclick="modalImportarJSON()">Importar JSON</button>
      <button class="btn btn-secundario" onclick="modalImportarVestibular()">Importar vestibular (IA)</button>
    </div>
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

function modalNovaQuestao() { _modalFormQuestao(null); }
function modalEditarQuestao(q) { _modalFormQuestao(q); }

function _modalFormQuestao(q) {
  const tipoAtual = (q && q.tipo) || 'multipla';
  window._imagensQuestaoAtual = (q && q.imagens) || [];
  window._imagensResolucaoAtual = (q && q.resolucaoImagens) || [];
  abrirModal(`<h3>${q ? 'Editar' : 'Nova'} questão</h3>
    <label>Tipo</label>
    <select id="input-q-tipo" onchange="_atualizarEditorTipo()">
      ${TIPOS_QUESTAO_OPCOES.map(t => `<option value="${t}" ${t === tipoAtual ? 'selected' : ''}>${LABELS_TIPO[t]}</option>`).join('')}
    </select>
    <label>Componente</label><input id="input-q-comp" value="${escapeHtml((q && q.comp) || '')}">
    <label>Conteúdo</label><input id="input-q-cont" value="${escapeHtml((q && q.cont) || '')}">
    <label>Nível de Bloom</label>
    <select id="input-q-bloom">
      <option value="">Não classificado</option>
      ${Object.keys(LABELS_BLOOM).map(k => `<option value="${k}" ${q && q.bloomLevel === k ? 'selected' : ''}>${LABELS_BLOOM[k]}</option>`).join('')}
    </select>
    <button type="button" class="btn btn-texto btn-pequeno" onclick="pedirSugestaoClassificacao()">✨ Sugerir com IA</button>
    <label>Enunciado</label><textarea id="input-q-text">${escapeHtml((q && q.text) || '')}</textarea>
    <label>Imagens do enunciado</label>
    <input type="file" accept="image/*" onchange="adicionarImagem(this, 'questao')">
    <div id="preview-imagens-questao">${_previewImagens(window._imagensQuestaoAtual, 'questao')}</div>
    <label>Resolução (explicação — só aparece pro aluno quando você liberar)</label>
    <textarea id="input-q-resolucao">${escapeHtml((q && q.resolucao) || '')}</textarea>
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

function modalImportarJSON() {
  abrirModal(`<h3>Importar questões via JSON</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Opção avançada: cole um array JSON de questões já no formato do sistema.</p>
    <textarea id="input-json-import" style="min-height:200px;"></textarea>
    <button class="btn btn-primario btn-full" onclick="confirmarImportarJSON()">Importar</button>`);
}
async function confirmarImportarJSON() {
  let arr;
  try { arr = JSON.parse(document.getElementById('input-json-import').value); } catch (e) { toast('JSON inválido.', 'erro'); return; }
  const resultado = await chamarComLoading('questoes.importarJSON', { questoes: arr });
  fecharModal(); toast(`${resultado.importadas} importadas, ${resultado.ignoradasDuplicadas} duplicadas ignoradas.`, 'sucesso'); renderBancoQuestoes();
}

function modalImportarVestibular() {
  abrirModal(`<h3>Importar prova de vestibular (IA)</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Envie o PDF ou foto da prova (e do gabarito, se for um arquivo separado). A IA reconhece as questões, classifica e você revisa antes de salvar.</p>
    <label>Arquivo da prova (PDF ou imagem)</label><input type="file" id="input-arquivo-prova" accept="application/pdf,image/*">
    <label>Arquivo do gabarito (opcional)</label><input type="file" id="input-arquivo-gabarito" accept="application/pdf,image/*">
    <label>Componente padrão (se a IA não identificar)</label><input id="input-comp-padrao" placeholder="Ex: Matemática">
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
        <small>${escapeHtml(q.comp)} · Gabarito: ${escapeHtml(q.gabarito)} · ${escapeHtml(LABELS_BLOOM[q.bloomLevel] || '')}</small>
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
