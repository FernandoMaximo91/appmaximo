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
  const map = { turmas: renderTurmas, questoes: renderBancoQuestoes, notas: renderNotas, diagnostico: renderDiagnostico, modelos: renderListasModelo, guia: renderGuiaClassificacao, admin: renderAdmin };
  (map[nome] || renderTurmas)();
}

function ligarTabsAluno() {
  document.querySelectorAll('#tabs-aluno button').forEach(btn => {
    btn.addEventListener('click', () => abrirAbaAluno(btn.dataset.tab));
  });
}
function abrirAbaAluno(nome) {
  document.querySelectorAll('#tabs-aluno button').forEach(b => b.classList.toggle('tab-ativa', b.dataset.tab === nome));
  const map = { pendentes: renderAlunoPendentes, concluidas: renderAlunoConcluidas, redacoes: renderAlunoRedacoes, extra: renderAlunoAtividadeExtra, minhasAtividades: renderAlunoMinhasAtividades };
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
  await carregarComponentes();
  el.innerHTML = `<div class="card">
    <p>Gere uma atividade extra com questões feitas pela IA, sempre que quiser praticar. Escolha quantas questões, um conteúdo específico (opcional) e quais níveis de Bloom quer treinar (opcional). Se não escolher conteúdo e você tiver erros recentes, a atividade foca neles; senão, é uma revisão geral. Todas as atividades corrigidas ficam salvas na aba "Minhas Atividades".</p>
    <label>Componente <small style="color:var(--cinza-texto);font-weight:400;">(obrigatório só se você escolher um conteúdo específico, ou se ainda não tiver nenhuma prova feita)</small></label>
    ${renderSelectComponente('select-extra-comp', '')}
    <label>Conteúdo específico (opcional)</label>
    <input id="input-extra-conteudo" placeholder="Ex: Frações — deixe em branco pra deixar a IA escolher">
    <label>Quantidade de questões</label>
    <input id="input-extra-qtd" type="number" min="1" max="10" value="3">
    <label>Níveis de Bloom pra praticar <small style="color:var(--cinza-texto);font-weight:400;">(opcional — deixe tudo desmarcado pra IA variar)</small></label>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin:6px 0;">
      ${Object.entries(LABELS_BLOOM).map(([k, label]) => `
        <label style="display:inline-flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" class="chk-extra-bloom" value="${k}"> ${label}</label>`).join('')}
    </div>
    <button class="btn btn-primario btn-full" style="margin-top:8px;" onclick="gerarAtividadeExtra()">✨ Gerar atividade extra</button>
    <div id="atividade-extra-resultado"></div>
  </div>`;
}

async function gerarAtividadeExtra() {
  const componente = document.getElementById('select-extra-comp').value;
  const conteudo = document.getElementById('input-extra-conteudo').value.trim();
  const quantidade = parseInt(document.getElementById('input-extra-qtd').value, 10) || 3;
  const niveisBloom = Array.from(document.querySelectorAll('.chk-extra-bloom:checked')).map(c => c.value);
  if (conteudo && !componente) { toast('Escolha o componente curricular deste conteúdo.', 'erro'); return; }
  try {
    const dados = await chamarComLoading('ia.gerarAtividadeComplementar', { componente, conteudo, quantidade, niveisBloom });
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
      toast('Você ainda não tem histórico de provas — escolha um componente acima pra praticar.', 'erro');
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

// ---------- Aluno: histórico permanente de atividades extras ("Minhas Atividades") ----------

async function renderAlunoMinhasAtividades() {
  const el = document.getElementById('aluno-conteudo');
  const dados = await chamarComLoading('ia.listarAtividadesExtras', {});
  if (dados.itens.length === 0) { el.innerHTML = '<div class="estado-vazio">Nenhuma atividade extra corrigida ainda — veja a aba "Atividade Extra".</div>'; return; }
  el.innerHTML = dados.itens.map((item, i) => `
    <div class="card">
      <div class="lista-item" style="cursor:pointer;border-bottom:none;padding:0;" onclick="_alternarDetalheAtividadeExtra(${i})">
        <div>
          <strong>${escapeHtml(item.comp)}${item.conteudo ? ' · ' + escapeHtml(item.conteudo) : ''}</strong><br>
          <small>${new Date(item.corrigidaEm).toLocaleString('pt-BR')} · ${item.acertos}/${item.total} acertos${item.niveisBloom && item.niveisBloom.length ? ' · ' + item.niveisBloom.map(n => LABELS_BLOOM[n] || n).join(', ') : ''}</small>
        </div>
        <span class="badge badge-info">${Math.round((item.acertos / item.total) * 100)}%</span>
      </div>
      <div id="detalhe-atividade-extra-${i}" class="hidden" style="margin-top:10px;">
        ${item.questoes.map((q, j) => {
          const r = item.resultado[j];
          return `<div class="card" style="background:var(--cinza-fundo);">
            <strong>${j + 1}.</strong> ${formatarTextoQuestao(q.text)}
            ${q.bloomLevel ? `<span class="badge badge-info" style="margin-left:6px;">${escapeHtml(LABELS_BLOOM[q.bloomLevel] || q.bloomLevel)}</span>` : ''}
            <p>${r.correta ? '✅ Correto' : '❌ Errado — sua resposta: ' + escapeHtml(item.respostas[q.id] || '—') + ' · resposta certa: ' + escapeHtml(r.gabarito)}</p>
            <p style="color:var(--cinza-texto);">${escapeHtml(r.explicacao)}</p>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function _alternarDetalheAtividadeExtra(i) {
  document.getElementById(`detalhe-atividade-extra-${i}`).classList.toggle('hidden');
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
      ${dados.lista.cronometroMin ? `<div><small>Tempo gasto</small><strong>${_formatarDuracao(r && r.duracaoSegundos)}</strong></div>` : ''}
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
  const acesso = turmaAtualDetalhe._acesso || { total: true };
  const el = document.getElementById('professor-conteudo');
  el.innerHTML = `
    <button class="btn btn-texto" onclick="abrirEscola('${escolaId}')">← Voltar</button>
    <h3>${escapeHtml(turmaAtualDetalhe.nome)}
      ${!acesso.total ? `<span class="badge badge-info" style="vertical-align:middle;">Acesso: ${escapeHtml((acesso.componentes || []).join(', '))}</span>` : ''}
    </h3>

    <details class="card">
      <summary>Alunos (${turmaAtualDetalhe.alunos.length})</summary>
      ${turmaAtualDetalhe.alunos.map(a => `
        <div class="lista-item"><span>${escapeHtml(a.nome)} <small>(${escapeHtml(a.usuario)})</small></span>
          <span>
            <button class="btn btn-pequeno btn-secundario" onclick="abrirDetalhesAluno('${a.id}')">📊 Detalhes</button>
            <button class="btn btn-pequeno btn-secundario" onclick="modalEditarAluno('${a.id}')">Editar</button>
            <button class="btn btn-pequeno btn-perigo" onclick="excluirAluno('${a.id}')">Excluir</button>
          </span>
        </div>`).join('')}
      <button class="btn btn-texto btn-pequeno" onclick="modalNovoAluno()">+ Adicionar aluno</button>
      <button class="btn btn-texto btn-pequeno" onclick="modalImportarAlunosJSON()">📥 Importar alunos via JSON</button>
    </details>

    <h4 style="margin:18px 0 8px;">Listas de atividades</h4>
    ${turmaAtualDetalhe.listas.length === 0 ? '<div class="estado-vazio">Nenhuma lista criada ainda.</div>' : ''}
    <div class="grid-cards">
      ${turmaAtualDetalhe.listas.map(l => _cardLista(l)).join('')}
    </div>
    <button class="btn btn-texto btn-pequeno" onclick="modalNovaLista()">+ Nova lista</button>

    ${acesso.total ? `
    <div class="card" style="margin-top:16px;">
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
    <div class="card">
      <h4>Acesso de professores</h4>
      <p style="font-size:0.85rem;color:var(--cinza-texto);">Acesso total (mesmos acessos que você tem nesta turma):</p>
      ${(turmaAtualDetalhe.compartilhadoCom || []).map(u => `
        <div class="lista-item"><span>${escapeHtml(u)}</span>
          <button class="btn btn-pequeno btn-perigo" onclick="removerCompartilhamentoUI('${escapeHtml(u).replace(/'/g, "\\'")}')">Remover</button>
        </div>`).join('') || '<p style="color:var(--cinza-texto);font-size:0.85rem;">Nenhum professor com acesso total ainda.</p>'}
      <button class="btn btn-texto btn-pequeno" onclick="modalCompartilharTurma()">+ Dar acesso total a um professor</button>
      <p style="font-size:0.85rem;color:var(--cinza-texto);margin-top:16px;">Acesso restrito a um componente curricular:</p>
      ${(turmaAtualDetalhe.acessosComponente || []).map(a => `
        <div class="lista-item"><span>${escapeHtml(a.user)} — ${escapeHtml(a.componente)}</span>
          <button class="btn btn-pequeno btn-perigo" onclick="removerAcessoComponenteUI('${escapeHtml(a.user).replace(/'/g, "\\'")}', '${escapeHtml(a.componente).replace(/'/g, "\\'")}')">Remover</button>
        </div>`).join('') || '<p style="color:var(--cinza-texto);font-size:0.85rem;">Nenhum acesso por componente ainda.</p>'}
      <button class="btn btn-texto btn-pequeno" onclick="modalAtribuirComponente()">+ Atribuir professor a um componente</button>
    </div>` : ''}
  `;
}

/** Card de uma lista de atividades — quantos alunos já responderam é calculado aqui mesmo,
 * a partir dos dados que já vieram em turmaAtualDetalhe (sem precisar de outra chamada). */
function _cardLista(l) {
  const totalAlunos = turmaAtualDetalhe.alunos.length;
  const responderam = turmaAtualDetalhe.alunos.filter(a => a.respostas && a.respostas[l.id]).length;
  return `<div class="card-quadrado">
    <h4>📝 ${escapeHtml(l.titulo)}</h4>
    <p class="card-quadrado-info">
      ${(l.qIds || []).length} questões${(l.componentes || []).length ? ' · ' + escapeHtml(l.componentes.join(', ')) : ''}<br>
      ${responderam} de ${totalAlunos} aluno(s) já responderam
      ${l.cronometroMin ? `<br>⏱ ${l.cronometroMin} min` : ''}
      <br>${l.resolucaoLiberada ? '<span class="badge badge-feito">Resolução liberada</span>' : '<span class="badge badge-pendente">Resolução bloqueada</span>'}
    </p>
    <div class="card-quadrado-acoes" style="flex-wrap:wrap;">
      <button class="btn btn-pequeno btn-primario" onclick="abrirDetalhesLista('${l.id}')">📊 Detalhes</button>
      <button class="btn btn-pequeno btn-secundario" onclick="abrirQuestoesDaLista('${l.id}')">👁 Ver questões</button>
      <button class="btn btn-pequeno btn-secundario" onclick="exportarListaPdf('${l.id}')">📄 Exportar PDF</button>
      <button class="btn btn-pequeno btn-secundario" onclick="salvarListaComoModelo('${l.id}', '${escapeHtml(l.titulo).replace(/'/g, "\\'")}')">💾 Salvar como modelo</button>
      <button class="btn btn-pequeno btn-secundario" onclick="abrirCorrecaoDiscursivas('${l.id}', '${escapeHtml(l.titulo).replace(/'/g, "\\'")}')">Corrigir discursivas</button>
      <button class="btn btn-pequeno ${l.resolucaoLiberada ? 'btn-sucesso' : 'btn-secundario'}" onclick="alternarResolucao('${l.id}', ${!l.resolucaoLiberada})">${l.resolucaoLiberada ? '🔓 Resolução liberada' : '🔒 Liberar resolução'}</button>
      <button class="btn btn-pequeno btn-perigo" onclick="excluirLista('${l.id}', '${escapeHtml(l.titulo).replace(/'/g, "\\'")}')">Excluir</button>
    </div>
  </div>`;
}

/** "Detalhes" da lista: quantos responderam, média, tempo médio, ranking de questões com mais erro e situação por aluno. */
async function abrirDetalhesLista(listaId) {
  const dados = await chamarComLoading('questoes.detalhesLista', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, listaId });
  const pct = v => (v === null || v === undefined) ? '—' : Math.round(v * 100) + '%';
  const rankingComRespostas = dados.rankingErros.filter(r => r.respondidas > 0);
  abrirModal(`<h3>📊 ${escapeHtml(dados.lista.titulo)}</h3>
    <div class="cabecalho-resultado-grid" style="margin-bottom:14px;">
      <div><small>Responderam</small><strong>${dados.alunosResponderam} de ${dados.totalAlunos}</strong></div>
      <div><small>Média da turma</small><strong>${pct(dados.mediaPercentual)}</strong></div>
      <div><small>Tempo médio</small><strong>${_formatarDuracao(dados.mediaDuracaoSegundos)}</strong></div>
    </div>
    <h4>Questões com mais erros</h4>
    ${rankingComRespostas.length === 0 ? '<p style="color:var(--cinza-texto);font-size:0.85rem;">Ainda sem respostas suficientes pra calcular.</p>' :
      rankingComRespostas.slice(0, 8).map(r => `
        <div class="lista-item">
          <span>${formatarTextoQuestao(r.enunciado).slice(0, 90)}...
            ${r.bloomLevel ? `<br><small style="color:var(--cinza-texto);">${escapeHtml(LABELS_BLOOM[r.bloomLevel] || r.bloomLevel)}${r.dimensaoConhecimento ? ' · ' + escapeHtml(r.dimensaoConhecimento) : ''}</small>` : ''}
          </span>
          <span class="badge ${r.percentualErro > 0.5 ? 'badge-pendente' : 'badge-info'}">${Math.round((r.percentualErro || 0) * 100)}% erro (${r.erros}/${r.respondidas})</span>
        </div>`).join('')}
    <p style="font-size:0.78rem;color:var(--cinza-texto);margin-top:4px;">Nível de Bloom e Dimensão do Conhecimento ajudam a interpretar o erro: muitos erros concentrados no mesmo nível/dimensão, em vez de espalhados, podem indicar uma lacuna mais específica (ex: turma erra mais em "Analisar" do que em "Aplicar" no mesmo conteúdo).</p>
    <h4>Situação por aluno</h4>
    ${dados.porAluno.map(a => `
      <div class="lista-item">
        <span>${escapeHtml(a.alunoNome)} ${a.pendenteDiscursiva ? '<span class="badge badge-pendente">Discursiva pendente</span>' : ''}</span>
        <span>${a.respondeu ? `${pct(a.percentualGeral)} · ${_formatarDuracao(a.duracaoSegundos)}` : '<span class="badge badge-pendente">Não respondeu</span>'}</span>
      </div>`).join('')}
    <button class="btn btn-secundario btn-full" onclick="fecharModal()">Fechar</button>`);
}

/** "Observar" uma lista já criada: mostra as questões completas (com gabarito/resolução), pro professor conferir depois de criada. */
async function abrirQuestoesDaLista(listaId) {
  const dados = await chamarComLoading('questoes.listarDaLista', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, listaId });
  abrirModal(`<h3>👁 ${escapeHtml(dados.lista.titulo)}</h3>
    ${dados.questoes.map((q, i) => `
      <div style="margin-bottom:4px;">
        ${q.bloomLevel ? `<span class="badge badge-info">${escapeHtml(LABELS_BLOOM[q.bloomLevel] || q.bloomLevel)}</span>` : ''}
        ${q.dimensaoConhecimento ? `<span class="badge badge-info">${escapeHtml(q.dimensaoConhecimento)}</span>` : ''}
      </div>
      ${renderResponderQuestao(q, i)}`).join('')}
    <button class="btn btn-secundario btn-full" onclick="fecharModal()">Fechar</button>`);
  document.querySelectorAll('#modal-box input, #modal-box select, #modal-box textarea').forEach(el => { el.disabled = true; });
}

/** Cabeçalho de marca do AppMaximo pra exportação de listas em PDF pelo professor (questões + gabarito + resolução). */
function _cabecalhoExportacaoLista(lista) {
  const agora = new Date().toLocaleDateString('pt-BR');
  return `<div style="background:linear-gradient(135deg,var(--azul-escuro),var(--azul));color:white;padding:20px 24px;border-radius:10px;margin-bottom:18px;">
    <div style="font-size:1.4rem;font-weight:800;">📘 AppMaximo</div>
    <div style="font-size:1.15rem;font-weight:700;margin-top:10px;">${escapeHtml(lista.titulo)}</div>
    <div style="font-size:0.85rem;opacity:0.92;margin-top:6px;line-height:1.5;">
      ${escapeHtml(turmaAtualDetalhe.nome)}${(lista.componentes || []).length ? ' · ' + escapeHtml(lista.componentes.join(', ')) : ''}<br>
      Gabarito e resolução comentada · gerado em ${agora} por ${escapeHtml(sessaoLocal.nome)}
    </div>
  </div>`;
}

/** Exporta uma lista (questões + gabarito + resolução) em PDF com cabeçalho de marca, pro professor imprimir/compartilhar. */
async function exportarListaPdf(listaId) {
  if (typeof html2pdf === 'undefined') { toast('Não foi possível gerar o PDF agora — verifique sua conexão com a internet e tente de novo.', 'erro'); return; }
  const dados = await chamarComLoading('questoes.listarDaLista', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, listaId });
  const listaCompleta = (turmaAtualDetalhe.listas || []).find(l => l.id === listaId) || dados.lista;

  const area = document.createElement('div');
  area.id = 'area-lista-pdf-tmp';
  area.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:white;padding:4px;';
  area.innerHTML = _cabecalhoExportacaoLista({ ...dados.lista, componentes: listaCompleta.componentes }) +
    dados.questoes.map((q, i) => renderResponderQuestao(q, i)).join('');
  document.body.appendChild(area);
  area.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });

  const nomeArquivo = `${(dados.lista.titulo || 'lista').replace(/[^\w\s-]/g, '')} - gabarito.pdf`;
  try {
    await html2pdf().set({ margin: 10, filename: nomeArquivo, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4' } }).from(area).save();
  } catch (e) {
    toast('Não foi possível gerar o PDF agora. Tente de novo.', 'erro');
  } finally {
    area.remove();
  }
}

/** Painel do professor sobre UM aluno: desempenho em cada lista/redação e o resumo de diagnóstico. */
async function abrirDetalhesAluno(alunoId) {
  const dados = await chamarComLoading('turmas.detalhesAluno', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, alunoId });
  const pct = v => (v === null || v === undefined) ? '—' : Math.round(v * 100) + '%';
  const textoHipotese = { possivel_lacuna_base: '⚠️ Possível lacuna de base', dificuldade_conteudo_atual: '📍 Dificuldade no conteúdo atual' };
  abrirModal(`<h3>${escapeHtml(dados.aluno.nome)}</h3>
    <p style="color:var(--cinza-texto);font-size:0.85rem;margin-top:-8px;">${escapeHtml(dados.aluno.usuario)}</p>
    <h4>Listas de atividades</h4>
    ${dados.listas.length === 0 ? '<p style="color:var(--cinza-texto);font-size:0.85rem;">Nenhuma lista visível.</p>' : dados.listas.map(l => `
      <div class="lista-item">
        <span>${escapeHtml(l.titulo)}</span>
        <span>${l.respondeu ? `${pct(l.percentualGeral)} (${l.acertos}/${l.total}) · ${_formatarDuracao(l.duracaoSegundos)}` : '<span class="badge badge-pendente">Não respondeu</span>'}</span>
      </div>`).join('')}
    ${dados.redacoes.length > 0 ? `<h4>Redações</h4>
      ${dados.redacoes.map(r => `<div class="lista-item"><span>${escapeHtml(r.titulo)}</span>
        <span class="badge ${r.revisada ? 'badge-feito' : (r.respondeu ? 'badge-info' : 'badge-pendente')}">${r.revisada ? 'Corrigida' : (r.respondeu ? 'Enviada' : 'Não entregue')}</span></div>`).join('')}` : ''}
    ${dados.diagnostico.length > 0 ? `<h4>Diagnóstico</h4>
      ${dados.diagnostico.map(d => `<div class="lista-item">
        <span>${escapeHtml(d.conteudo)}</span>
        <span>${d.hipotese !== 'indeterminado' ? `<span class="badge badge-info">${textoHipotese[d.hipotese] || escapeHtml(d.hipotese)}</span>` : ''}${_htmlHipoteseDimensao(d.hipoteseDimensao)}</span>
      </div>`).join('')}` : ''}
    <button class="btn btn-secundario btn-full" onclick="fecharModal()">Fechar</button>`);
}

// ---------- Acesso de professores (compartilhamento total / por componente curricular) ----------

function _htmlFormNovoProfessorInline() {
  return `<div style="margin-top:10px;">
    <button type="button" class="btn btn-texto btn-pequeno" onclick="_mostrarFormNovoProfessorInline(this)">+ Cadastrar novo professor</button>
    <div id="form-novo-professor-inline" class="hidden">
      <label>Nome</label><input id="input-novoprof-nome">
      <label>Usuário</label><input id="input-novoprof-user">
      <label>Senha</label><input id="input-novoprof-senha">
      <button type="button" class="btn btn-secundario btn-pequeno" onclick="_criarProfessorInline()">Cadastrar</button>
    </div>
  </div>`;
}
function _mostrarFormNovoProfessorInline(botao) {
  botao.nextElementSibling.classList.remove('hidden');
  botao.classList.add('hidden');
}
async function _criarProfessorInline() {
  const nome = document.getElementById('input-novoprof-nome').value;
  const user = document.getElementById('input-novoprof-user').value;
  const senha = document.getElementById('input-novoprof-senha').value;
  if (!nome || !user || !senha) { toast('Preencha nome, usuário e senha.', 'erro'); return; }
  await chamarComLoading('admin.criarProfessor', { nome, user, pass: senha, nivel: 'professor' });
  toast('Professor cadastrado! Selecione ele na lista acima.', 'sucesso');
  const { professores } = await chamarComLoading('turmas.listarProfessoresParaCompartilhar', {});
  ['select-prof-compartilhar', 'select-prof-componente'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = professores.map(p => `<option value="${escapeHtml(p.user)}">${escapeHtml(p.nome)} (${escapeHtml(p.user)})</option>`).join('');
  });
  document.getElementById('form-novo-professor-inline').classList.add('hidden');
  document.getElementById('input-novoprof-nome').value = '';
  document.getElementById('input-novoprof-user').value = '';
  document.getElementById('input-novoprof-senha').value = '';
}

async function modalCompartilharTurma() {
  const { professores } = await chamarComLoading('turmas.listarProfessoresParaCompartilhar', {});
  abrirModal(`<h3>Dar acesso total a um professor</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Esse professor passa a ter os mesmos acessos que você nesta turma (alunos, listas, redações, blocos de notas).</p>
    <label>Professor</label>
    <select id="select-prof-compartilhar">
      ${professores.length === 0 ? '<option value="">Nenhum outro professor cadastrado</option>' : professores.map(p => `<option value="${escapeHtml(p.user)}">${escapeHtml(p.nome)} (${escapeHtml(p.user)})</option>`).join('')}
    </select>
    ${sessaoLocal.nivel === 'admin' ? _htmlFormNovoProfessorInline() : ''}
    <button class="btn btn-primario btn-full" onclick="confirmarCompartilharTurma()">Dar acesso</button>`);
}
async function confirmarCompartilharTurma() {
  const userProfessorAlvo = document.getElementById('select-prof-compartilhar').value;
  if (!userProfessorAlvo) { toast('Selecione um professor.', 'erro'); return; }
  await chamarComLoading('turmas.compartilhar', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, userProfessorAlvo });
  fecharModal(); toast('Acesso concedido.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}
async function removerCompartilhamentoUI(userProfessorAlvo) {
  if (!confirm('Remover o acesso total desse professor a esta turma?')) return;
  await chamarComLoading('turmas.removerCompartilhamento', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, userProfessorAlvo });
  toast('Acesso removido.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}

async function modalAtribuirComponente() {
  await carregarComponentes();
  const { professores } = await chamarComLoading('turmas.listarProfessoresParaCompartilhar', {});
  abrirModal(`<h3>Atribuir professor a um componente</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Esse professor só vai gerenciar listas, correções e notas do componente escolhido, dentro desta turma (continua vendo a lista de alunos normalmente).</p>
    <label>Professor</label>
    <select id="select-prof-componente">
      ${professores.length === 0 ? '<option value="">Nenhum outro professor cadastrado</option>' : professores.map(p => `<option value="${escapeHtml(p.user)}">${escapeHtml(p.nome)} (${escapeHtml(p.user)})</option>`).join('')}
    </select>
    <label>Componente</label>${renderSelectComponente('select-comp-atribuir', '')}
    ${sessaoLocal.nivel === 'admin' ? _htmlFormNovoProfessorInline() : ''}
    <button class="btn btn-primario btn-full" onclick="confirmarAtribuirComponente()">Atribuir</button>`);
}
async function confirmarAtribuirComponente() {
  const userProfessorAlvo = document.getElementById('select-prof-componente').value;
  const componente = document.getElementById('select-comp-atribuir').value;
  if (!userProfessorAlvo || !componente) { toast('Selecione o professor e o componente.', 'erro'); return; }
  await chamarComLoading('turmas.atribuirAcessoComponente', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, userProfessorAlvo, componente });
  fecharModal(); toast('Acesso concedido.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
}
async function removerAcessoComponenteUI(userProfessorAlvo, componente) {
  if (!confirm('Remover esse acesso?')) return;
  await chamarComLoading('turmas.removerAcessoComponente', { escolaId: turmaAtualDetalhe._escolaId, turmaId: turmaAtualDetalhe.id, userProfessorAlvo, componente });
  toast('Acesso removido.', 'sucesso'); abrirTurma(turmaAtualDetalhe._escolaId, turmaAtualDetalhe.id);
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

/** <select> de componente curricular. Use comOpcaoTodos=true em filtros (onde "vazio" = não filtrar). onchangeExtra: JS extra (string) rodado depois da lógica padrão, ex: pra atualizar outro campo que depende do componente escolhido. */
function renderSelectComponente(idSelect, valorAtual, comOpcaoTodos, onchangeExtra) {
  const onchange = `_tratarSelecaoComponente('${idSelect}')${onchangeExtra ? ';' + onchangeExtra : ''}`;
  return `<select id="${idSelect}" data-com-opcao-todos="${comOpcaoTodos ? '1' : '0'}" onchange="${onchange}">${_opcoesComponente(valorAtual, comOpcaoTodos)}</select>`;
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
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">
      <label class="alternativa" style="flex:1;margin-bottom:0;">
        <input type="checkbox" class="chk-questao-lista" value="${q.id}" ${window._listaQuestoesSelecionadas.has(q.id) ? 'checked' : ''} onchange="_alternarSelecaoQuestaoLista('${q.id}', this.checked)">
        <span>[${escapeHtml(LABELS_TIPO[q.tipo] || q.tipo)}] ${escapeHtml(q.comp)} — ${formatarTextoQuestao(q.text).slice(0, 80)}...</span>
      </label>
      <button type="button" class="btn btn-pequeno btn-secundario" onclick='abrirVisualizacaoQuestao(${JSON.stringify(q).replace(/'/g, "&#39;")})'>👁 Ver</button>
    </div>`).join('') +
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

// ======================================================================
// PROFESSOR — BIBLIOTECA DE LISTAS SALVAS (modelos reutilizáveis, fora de turma)
// ======================================================================

/** Salva uma lista já existente (de dentro de uma turma) como modelo reutilizável na Biblioteca. */
async function salvarListaComoModelo(listaId, tituloAtual) {
  const lista = (turmaAtualDetalhe.listas || []).find(l => l.id === listaId);
  if (!lista) { toast('Lista não encontrada.', 'erro'); return; }
  const titulo = prompt('Nome do modelo (pra reconhecer depois na Biblioteca de Listas Salvas):', tituloAtual);
  if (!titulo || !titulo.trim()) return;
  await chamarComLoading('listasModelo.salvar', { titulo: titulo.trim(), qIds: lista.qIds, cronometroMin: lista.cronometroMin });
  toast('Modelo salvo! Veja na aba "💾 Listas Salvas".', 'sucesso');
}

async function renderListasModelo(busca, componente) {
  const el = document.getElementById('professor-conteudo');
  await carregarComponentes();
  const dados = await chamarComLoading('listasModelo.listar', { busca: busca || '', componente: componente || '' });
  el.innerHTML = `
    <p style="color:var(--cinza-texto);">Modelos de lista que você salvou (título + questões + cronômetro), reutilizáveis em qualquer turma sua. Reaproveitar sempre cria uma lista NOVA na turma escolhida — não afeta os outros lugares onde o mesmo modelo já foi usado.</p>
    <div class="card">
      <div style="display:flex;gap:8px;">
        <input id="filtro-modelo-busca" placeholder="Buscar por título ou conteúdo..." value="${escapeHtml(busca || '')}" style="flex:2;">
        <div style="flex:1;">${renderSelectComponente('filtro-modelo-comp', componente || '', true)}</div>
      </div>
      <button class="btn btn-secundario btn-pequeno" style="margin-top:8px;" onclick="_filtrarListasModelo()">Filtrar</button>
    </div>
    ${dados.itens.length === 0 ? '<div class="estado-vazio">Nenhum modelo salvo ainda. Numa turma, abra uma lista e clique em "💾 Salvar como modelo".</div>' :
      dados.itens.map(m => `
        <div class="card">
          <strong>${escapeHtml(m.titulo)}</strong><br>
          <small>${(m.componentes || []).map(c => escapeHtml(c)).join(', ')} · ${m.totalQuestoes} questões${m.cronometroMin ? ' · ⏱ ' + m.cronometroMin + ' min' : ''}</small><br>
          ${(m.conteudos || []).length ? `<div style="margin-top:6px;">${m.conteudos.map(c => `<span class="badge badge-info">${escapeHtml(c)}</span>`).join(' ')}</div>` : ''}
          <div class="linha-botoes">
            <button class="btn btn-pequeno btn-primario" onclick="abrirModalUsarModelo('${m.id}', '${escapeHtml(m.titulo).replace(/'/g, "\\'")}')">▶ Usar numa turma</button>
            <button class="btn btn-pequeno btn-perigo" onclick="excluirModeloLista('${m.id}', '${escapeHtml(m.titulo).replace(/'/g, "\\'")}')">Excluir</button>
          </div>
        </div>`).join('')}`;
}

function _filtrarListasModelo() {
  renderListasModelo(document.getElementById('filtro-modelo-busca').value.trim(), document.getElementById('filtro-modelo-comp').value);
}

/** Modal pra escolher em qual turma reaproveitar o modelo — sempre cria uma lista NOVA lá. */
async function abrirModalUsarModelo(modeloId, tituloModelo) {
  const escolas = await chamarComLoading('turmas.listarEscolas', {});
  const todasTurmas = escolas.escolas.flatMap(e => e.turmas.map(t => ({ ...t, escolaId: e.id })));
  if (todasTurmas.length === 0) { toast('Você ainda não tem nenhuma turma.', 'erro'); return; }
  abrirModal(`<h3>Usar modelo "${escapeHtml(tituloModelo)}"</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Cria uma lista nova, com as mesmas questões do modelo, na turma escolhida.</p>
    <label>Turma de destino</label>
    <select id="select-turma-usar-modelo">${todasTurmas.map(t => `<option value="${t.id}|${t.escolaId}">${escapeHtml(t.nome)}</option>`).join('')}</select>
    <label>Título da nova lista</label>
    <input id="input-titulo-usar-modelo" value="${escapeHtml(tituloModelo)}">
    <button class="btn btn-primario btn-full" onclick="confirmarUsarModelo('${modeloId}')">Criar lista nesta turma</button>`);
}

async function confirmarUsarModelo(modeloId) {
  const [turmaId, escolaId] = document.getElementById('select-turma-usar-modelo').value.split('|');
  const tituloNovo = document.getElementById('input-titulo-usar-modelo').value.trim();
  await chamarComLoading('listasModelo.usar', { escolaId, turmaId, modeloId, tituloNovo });
  fecharModal();
  toast('Lista criada a partir do modelo.', 'sucesso');
  if (turmaAtualDetalhe && turmaAtualDetalhe.id === turmaId) abrirTurma(escolaId, turmaId);
}

async function excluirModeloLista(modeloId, titulo) {
  if (!confirm(`Excluir o modelo "${titulo}" da Biblioteca? As listas já criadas a partir dele em turmas não são afetadas.`)) return;
  await chamarComLoading('listasModelo.excluir', { modeloId });
  toast('Modelo excluído.', 'sucesso');
  renderListasModelo();
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

window._filtrosBancoQuestoes = { busca: '', tipo: '', comp: '', banca: '', bloomLevel: '', dimensaoConhecimento: '', ano: '', unidadeTematica: '' };
window._bancoQuestoesFiltrado = false;

/**
 * Modal de "visualizar questão completa" — reaproveita o mesmo motor de renderização usado
 * pra responder prova (renderResponderQuestao já inclui a resolução via renderResolucaoQuestao
 * quando `gabarito` vem preenchido no objeto). Abre num segundo modal, empilhado por cima do
 * modal principal, pra não perder o formulário que já estava aberto (ex: Nova Lista).
 */
function abrirVisualizacaoQuestao(q) {
  abrirModal2(`<h3>Visualizar questão</h3>
    <div style="margin-bottom:10px;">
      <span class="badge badge-info">${escapeHtml(LABELS_TIPO[q.tipo] || q.tipo)}</span>
      ${q.bloomLevel ? `<span class="badge badge-info">${escapeHtml(LABELS_BLOOM[q.bloomLevel] || q.bloomLevel)}</span>` : ''}
      ${q.dimensaoConhecimento ? `<span class="badge badge-info">Dimensão: ${escapeHtml(q.dimensaoConhecimento)}</span>` : ''}
      ${q.comp ? `<span class="badge badge-info">${escapeHtml(q.comp)}${q.cont ? ' · ' + escapeHtml(q.cont) : ''}</span>` : ''}
      ${q.unidadeTematica ? `<span class="badge badge-info">${escapeHtml(q.unidadeTematica)}</span>` : ''}
      ${q.ano ? `<span class="badge badge-info">${escapeHtml(q.ano)}</span>` : ''}
    </div>
    <p style="font-size:0.78rem;color:var(--cinza-texto);margin:-6px 0 10px;">Classificação visível só pra você (professor) — o aluno nunca vê a Dimensão do Conhecimento nem a Unidade Temática.</p>
    ${renderResponderQuestao(q, 0)}
    <button class="btn btn-secundario btn-full" onclick="fecharModal2()">Fechar</button>`);
  document.querySelectorAll('#modal-box-2 input, #modal-box-2 select, #modal-box-2 textarea').forEach(el => { el.disabled = true; });
}

async function renderBancoQuestoes(pagina) {
  pagina = pagina || 1;
  await carregarComponentes();
  const el = document.getElementById('professor-conteudo');
  const filtros = window._filtrosBancoQuestoes;
  const dados = window._bancoQuestoesFiltrado
    ? await chamarComLoading('questoes.buscarPaginado', { filtros, pagina })
    : { questoes: [], total: 0, pagina: 1, totalPaginas: 1 };
  // Hint da biblioteca de listas salvas: se a busca bater com o título ou os conteúdos de algum
  // modelo já salvo por este professor, sugere reaproveitar em vez de montar tudo de novo. Busca
  // silenciosa (sem loading/toast) — não deve atrapalhar o fluxo normal de filtro de questões.
  let modelosSugeridos = [];
  if (window._bancoQuestoesFiltrado && filtros.busca) {
    try { modelosSugeridos = (await Api.chamar('listasModelo.listar', { busca: filtros.busca })).itens; } catch (e) { /* hint é best-effort */ }
  }
  el.innerHTML = `
    <div class="linha-botoes">
      <button class="btn btn-primario" onclick="modalNovaQuestao()">+ Nova questão</button>
      <button class="btn btn-secundario" onclick="modalImportarJSON()">Importar JSON</button>
      <button class="btn btn-secundario" onclick="modalImportarLoteComImagens()">🖼️ Importar em lote (com imagens)</button>
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
      <p style="font-size:0.78rem;color:var(--cinza-texto);margin:14px 0 4px;">Filtros gerais (Taxonomia de Bloom Revisada — Anderson &amp; Krathwohl, 2001)</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">
          <label>Nível de Bloom</label>
          <select id="filtro-q-bloom">
            <option value="">Todos</option>
            ${Object.keys(LABELS_BLOOM).map(k => `<option value="${k}" ${filtros.bloomLevel === k ? 'selected' : ''}>${LABELS_BLOOM[k]}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1;min-width:140px;">
          <label>Dimensão do Conhecimento</label>
          <select id="filtro-q-dimensao">
            <option value="">Todas</option>
            ${DIMENSOES_CONHECIMENTO_OPCOES.map(d => `<option value="${d}" ${filtros.dimensaoConhecimento === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <div style="flex:1;min-width:140px;">
          <label>Ano/Série</label>
          <input id="filtro-q-ano" list="lista-anos-serie-filtro" value="${escapeHtml(filtros.ano || '')}" placeholder="Ex: 8º ano EF">
          <datalist id="lista-anos-serie-filtro">${ANOS_SERIE_SUGESTOES.map(a => `<option value="${a}">`).join('')}</datalist>
        </div>
        <div style="flex:1;min-width:140px;">
          <label>Unidade Temática</label>
          <input id="filtro-q-unidade" list="lista-unidades-tematicas-filtro" value="${escapeHtml(filtros.unidadeTematica || '')}" placeholder="Ex: Geometria, Leitura/Escuta...">
          <datalist id="lista-unidades-tematicas-filtro">${todasUnidadesTematicasConhecidas().map(u => `<option value="${u}">`).join('')}</datalist>
        </div>
      </div>
      <button class="btn btn-secundario btn-pequeno" style="margin-top:8px;" onclick="aplicarFiltroBancoQuestoes()">Filtrar</button>
      <button class="btn btn-texto btn-pequeno" onclick="limparFiltroBancoQuestoes()">Limpar filtros</button>
    </div>
    ${!window._bancoQuestoesFiltrado
      ? '<div class="estado-vazio">Aplique um filtro pra ver as questões (clique em "Filtrar" mesmo sem preencher nada, pra ver todas).</div>'
      : `${modelosSugeridos.length > 0 ? `
      <div class="alerta alerta-info">
        💾 Você já tem ${modelosSugeridos.length === 1 ? 'uma lista salva' : modelosSugeridos.length + ' listas salvas'} relacionada${modelosSugeridos.length === 1 ? '' : 's'} a "${escapeHtml(filtros.busca)}": ${modelosSugeridos.map(m => escapeHtml(m.titulo)).join(', ')}.
        <button class="btn btn-texto btn-pequeno" onclick="abrirAbaProfessor('modelos')" style="padding:2px 6px;">Ver na Biblioteca →</button>
      </div>` : ''}
      <p style="font-size:0.85rem;color:var(--cinza-texto);"><strong>${dados.total}</strong> questão${dados.total === 1 ? '' : 'ões'} encontrada${dados.total === 1 ? '' : 's'}.</p>
    ${dados.questoes.map(q => `
      <div class="card">
        <span class="badge badge-info">${escapeHtml(LABELS_TIPO[q.tipo] || q.tipo)}</span>
        ${q.bloomLevel ? `<span class="badge badge-info">${escapeHtml(LABELS_BLOOM[q.bloomLevel] || q.bloomLevel)}</span>` : ''}
        ${q.dimensaoConhecimento ? `<span class="badge badge-info">${escapeHtml(q.dimensaoConhecimento)}</span>` : ''}
        ${q.unidadeTematica ? `<span class="badge badge-info">${escapeHtml(q.unidadeTematica)}</span>` : ''}
        ${q.ano ? `<span class="badge badge-info">${escapeHtml(q.ano)}</span>` : ''}
        <p>${formatarTextoQuestao(q.text)}</p>
        <small>${escapeHtml(q.comp)} · ${escapeHtml(q.cont || '')}</small>
        <div class="linha-botoes">
          <button class="btn btn-pequeno btn-secundario" onclick='abrirVisualizacaoQuestao(${JSON.stringify(q).replace(/'/g, "&#39;")})'>👁 Ver</button>
          <button class="btn btn-pequeno btn-secundario" onclick='modalEditarQuestao(${JSON.stringify(q).replace(/'/g, "&#39;")})'>Editar</button>
          <button class="btn btn-pequeno btn-perigo" onclick="excluirQuestao('${q.id}')">Excluir</button>
        </div>
      </div>`).join('')}
    <div class="linha-botoes" style="justify-content:center;">
      ${pagina > 1 ? `<button class="btn btn-secundario btn-pequeno" onclick="renderBancoQuestoes(${pagina - 1})">← Anterior</button>` : ''}
      <span>Página ${dados.pagina} de ${dados.totalPaginas || 1}</span>
      ${pagina < dados.totalPaginas ? `<button class="btn btn-secundario btn-pequeno" onclick="renderBancoQuestoes(${pagina + 1})">Próxima →</button>` : ''}
    </div>`}`;
}

function aplicarFiltroBancoQuestoes() {
  window._filtrosBancoQuestoes = {
    busca: document.getElementById('filtro-q-busca').value.trim(),
    comp: document.getElementById('filtro-q-comp').value.trim(),
    tipo: document.getElementById('filtro-q-tipo').value,
    banca: document.getElementById('filtro-q-banca').value.trim(),
    bloomLevel: document.getElementById('filtro-q-bloom').value,
    dimensaoConhecimento: document.getElementById('filtro-q-dimensao').value,
    ano: document.getElementById('filtro-q-ano').value.trim(),
    unidadeTematica: document.getElementById('filtro-q-unidade').value
  };
  window._bancoQuestoesFiltrado = true;
  renderBancoQuestoes(1);
}
function limparFiltroBancoQuestoes() {
  window._filtrosBancoQuestoes = { busca: '', tipo: '', comp: '', banca: '', bloomLevel: '', dimensaoConhecimento: '', ano: '', unidadeTematica: '' };
  window._bancoQuestoesFiltrado = false;
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
    <label>Componente</label>${renderSelectComponente('input-q-comp', (q && q.comp) || '', false, '_atualizarCampoUnidadeTematica()')}
    <label>Conteúdo</label><input id="input-q-cont" value="${escapeHtml((q && q.cont) || '')}">
    <div style="display:flex;gap:8px;">
      <div style="flex:1;">
        <label>Ano/Série</label>
        <input id="input-q-ano" list="lista-anos-serie-form" value="${escapeHtml((q && q.ano) || '')}" placeholder="Ex: 8º ano EF">
        <datalist id="lista-anos-serie-form">${ANOS_SERIE_SUGESTOES.map(a => `<option value="${a}">`).join('')}</datalist>
      </div>
      <div style="flex:1;" id="campo-unidade-tematica-wrap">${_htmlCampoUnidadeTematica((q && q.comp) || '', (q && q.unidadeTematica) || '')}</div>
    </div>
    <p style="font-size:0.8rem;color:var(--cinza-texto);margin:14px 0 4px;"><strong>Classificação pedagógica</strong> (Taxonomia de Bloom Revisada — Anderson &amp; Krathwohl, 2001) — visível só pra você, nunca pro aluno.</p>
    <div style="display:flex;gap:8px;">
      <div style="flex:1;">
        <label>Nível de Bloom (processo cognitivo)</label>
        <select id="input-q-bloom">
          <option value="">Não classificado</option>
          ${Object.keys(LABELS_BLOOM).map(k => `<option value="${k}" ${q && q.bloomLevel === k ? 'selected' : ''}>${LABELS_BLOOM[k]}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;">
        <label>Dimensão do Conhecimento</label>
        <select id="input-q-dimensao">
          <option value="">Não classificada</option>
          ${DIMENSOES_CONHECIMENTO_OPCOES.map(d => `<option value="${d}" ${q && q.dimensaoConhecimento === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>
    <button type="button" class="btn btn-texto btn-pequeno" onclick="pedirSugestaoClassificacao()">✨ Sugerir com IA (Bloom + Dimensão)</button>
    <label>Enunciado</label><textarea id="input-q-text" class="campo-matematico">${escapeHtml((q && q.text) || '')}</textarea>
    ${renderToolbarMatematica()}
    <label>Imagens do enunciado</label>
    <input type="file" accept="image/*" onchange="adicionarImagem(this, 'questao')">
    <div id="preview-imagens-questao">${_previewImagens(window._imagensQuestaoAtual, 'questao')}</div>
    <div id="editor-tipo-especifico"></div>
    <label style="margin-top:18px;">Resolução (explicação — só aparece pro aluno quando você liberar)</label>
    <p style="font-size:0.8rem;color:var(--cinza-texto);margin:0 0 6px;">Preencha junto com a questão: a resolução comentada é o que mais ajuda o aluno quando a correção for liberada.</p>
    <textarea id="input-q-resolucao" class="campo-matematico">${escapeHtml((q && q.resolucao) || '')}</textarea>
    <label>Imagens da resolução</label>
    <input type="file" accept="image/*" onchange="adicionarImagem(this, 'resolucao')">
    <div id="preview-imagens-resolucao">${_previewImagens(window._imagensResolucaoAtual, 'resolucao')}</div>
    <label style="margin-top:14px;">Objetivo de aprendizagem (opcional — aparece pro aluno junto da resolução)</label>
    <p style="font-size:0.8rem;color:var(--cinza-texto);margin:0 0 6px;">Frase curta do tipo "o que essa questão queria que o aluno demonstrasse" — ex: "Entender por que uma equação do 2º grau precisa estar na forma reduzida, com a ≠ 0". Pra Matemática, pode copiar direto da Matriz de Objetivos de Aprendizagem. Fica visível só depois que o aluno entrega E você libera a resolução — nunca antes.</p>
    <textarea id="input-q-objetivo" class="campo-matematico">${escapeHtml((q && q.objetivoAprendizagem) || '')}</textarea>
    <div id="secao-pre-requisitos" style="margin-top:14px;">${_htmlSecaoPreRequisitos()}</div>
    <button class="btn btn-primario btn-full" onclick="salvarQuestao(${q ? `'${q.id}'` : 'null'})">Salvar</button>`);
  window._questaoEditando = q;
  window._preRequisitosAtuais = null;
  _atualizarEditorTipo();
  if (q && q.comp && q.cont) _carregarPreRequisitosDoConteudo();
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

/** Campo "Unidade Temática": vira <select> de vocabulário fechado quando o componente tem BNCC mapeada (ver UNIDADES_TEMATICAS_POR_COMPONENTE), senão fica texto livre. */
function _htmlCampoUnidadeTematica(componente, valorAtual) {
  const opcoes = unidadesTematicasDoComponente(componente);
  if (opcoes.length === 0) {
    return `<label>Unidade Temática</label>
      <input id="input-q-unidade" value="${escapeHtml(valorAtual || '')}" placeholder="Sem vocabulário BNCC fechado pra este componente ainda">`;
  }
  return `<label>Unidade Temática (BNCC)</label>
    <select id="input-q-unidade">
      <option value="">Não se aplica</option>
      ${opcoes.map(u => `<option value="${u}" ${valorAtual === u ? 'selected' : ''}>${u}</option>`).join('')}
    </select>`;
}
function _atualizarCampoUnidadeTematica() {
  const componente = document.getElementById('input-q-comp').value;
  document.getElementById('campo-unidade-tematica-wrap').innerHTML = _htmlCampoUnidadeTematica(componente, '');
}

async function pedirSugestaoClassificacao() {
  const componente = document.getElementById('input-q-comp').value;
  const conteudo = document.getElementById('input-q-cont').value;
  const enunciado = document.getElementById('input-q-text').value;
  if (!componente || !enunciado) { toast('Preencha componente e enunciado primeiro.', 'erro'); return; }
  const sugestao = await chamarComLoading('ia.sugerirClassificacao', { componente, conteudo, enunciado });
  document.getElementById('input-q-bloom').value = sugestao.bloomLevel;
  if (sugestao.dimensaoConhecimento) document.getElementById('input-q-dimensao').value = sugestao.dimensaoConhecimento;
  window._preRequisitosAtuais = sugestao.preRequisitosSugeridos || [];
  _renderSecaoPreRequisitos();
  toast('Nível de Bloom, Dimensão do Conhecimento e pré-requisitos sugeridos pela IA — revise tudo antes de salvar (os pré-requisitos aparecem na seção abaixo do formulário; clique em "Salvar pré-requisitos" pra confirmá-los).', 'sucesso');
}

// ---------- Pré-requisitos do conteúdo (Ausubel) — editados direto no cadastro de questão ----------

function _htmlSecaoPreRequisitos() {
  return `<label>Pré-requisitos deste conteúdo (Ausubel — o que o aluno precisa já saber antes)</label>
    <p style="font-size:0.8rem;color:var(--cinza-texto);margin:0 0 6px;">Alimenta o diagnóstico automático: quando o aluno erra este conteúdo, o sistema compara com o desempenho nesses pré-requisitos pra sugerir se é lacuna de base ou dificuldade específica. Vale pra TODAS as questões deste componente+conteúdo, não só esta.</p>
    <div id="pre-requisitos-chips">${_htmlChipsPreRequisitos()}</div>
    <div style="display:flex;gap:6px;margin-top:6px;">
      <input id="input-novo-prereq" placeholder="Nome curto do pré-requisito (ex: Equações do 1º grau)" style="flex:1;">
      <button type="button" class="btn btn-secundario btn-pequeno" onclick="_adicionarPreRequisitoChip()">+ Adicionar</button>
    </div>
    <div class="linha-botoes" style="margin-top:6px;">
      <button type="button" class="btn btn-texto btn-pequeno" onclick="_carregarPreRequisitosDoConteudo()">🔄 Carregar deste conteúdo</button>
      <button type="button" class="btn btn-texto btn-pequeno" onclick="_salvarPreRequisitosConteudo()">💾 Salvar pré-requisitos</button>
    </div>`;
}

function _htmlChipsPreRequisitos() {
  const itens = window._preRequisitosAtuais;
  if (itens === null || itens === undefined) {
    return '<p style="font-size:0.8rem;color:var(--cinza-texto);">Clique em "Carregar deste conteúdo" pra ver se já existem pré-requisitos salvos.</p>';
  }
  if (itens.length === 0) return '<p style="font-size:0.8rem;color:var(--cinza-texto);">Nenhum pré-requisito ainda — adicione abaixo ou use "✨ Sugerir com IA".</p>';
  return itens.map((p, i) => `
    <span class="badge badge-info" style="margin:2px;">${escapeHtml(p)}
      <button type="button" onclick="_removerPreRequisitoChip(${i})" style="border:none;background:none;color:inherit;cursor:pointer;margin-left:4px;">×</button>
    </span>`).join('');
}

function _renderSecaoPreRequisitos() {
  document.getElementById('secao-pre-requisitos').innerHTML = _htmlSecaoPreRequisitos();
}

function _adicionarPreRequisitoChip() {
  const input = document.getElementById('input-novo-prereq');
  const valor = input.value.trim();
  if (!valor) return;
  window._preRequisitosAtuais = window._preRequisitosAtuais || [];
  if (!window._preRequisitosAtuais.includes(valor)) window._preRequisitosAtuais.push(valor);
  input.value = '';
  _renderSecaoPreRequisitos();
  document.getElementById('input-novo-prereq').focus();
}

function _removerPreRequisitoChip(i) {
  window._preRequisitosAtuais.splice(i, 1);
  _renderSecaoPreRequisitos();
}

async function _carregarPreRequisitosDoConteudo() {
  const componente = document.getElementById('input-q-comp').value;
  const conteudo = document.getElementById('input-q-cont').value;
  if (!componente || !conteudo) { toast('Preencha componente e conteúdo primeiro.', 'erro'); return; }
  const dados = await chamarComLoading('diagnostico.listarPreRequisitos', { componente });
  const item = dados.itens.find(p => p.conteudo === conteudo);
  window._preRequisitosAtuais = item ? item.preRequisitosDe : [];
  _renderSecaoPreRequisitos();
  toast(item ? 'Pré-requisitos carregados.' : 'Nenhum pré-requisito salvo ainda pra este conteúdo — adicione abaixo.', 'sucesso');
}

async function _salvarPreRequisitosConteudo() {
  const componente = document.getElementById('input-q-comp').value;
  const conteudo = document.getElementById('input-q-cont').value;
  if (!componente || !conteudo) { toast('Preencha componente e conteúdo primeiro.', 'erro'); return; }
  await chamarComLoading('diagnostico.salvarPreRequisito', {
    componente, conteudo, preRequisitosDe: window._preRequisitosAtuais || [], origem: 'professor'
  });
  toast('Pré-requisitos salvos pra "' + conteudo + '".', 'sucesso');
}

async function salvarQuestao(id) {
  const tipo = document.getElementById('input-q-tipo').value;
  const { alternativas, gabarito } = coletarDadosEditorPorTipo(tipo);
  const dados = {
    tipo, comp: document.getElementById('input-q-comp').value, cont: document.getElementById('input-q-cont').value,
    ano: document.getElementById('input-q-ano').value.trim(), unidadeTematica: document.getElementById('input-q-unidade').value,
    bloomLevel: document.getElementById('input-q-bloom').value, dimensaoConhecimento: document.getElementById('input-q-dimensao').value,
    text: document.getElementById('input-q-text').value,
    resolucao: document.getElementById('input-q-resolucao').value, alternativas, gabarito,
    objetivoAprendizagem: document.getElementById('input-q-objetivo').value,
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
  { tipo: 'multipla', comp: 'Matemática', cont: 'Frações', ano: '6º ano EF', unidadeTematica: 'Números', text: 'Quanto é 1/2 + 1/4?',
    alternativas: { A: '1/2', B: '3/4', C: '1', D: '2/4', E: '1/4' }, gabarito: 'B',
    bloomLevel: 'aplicar', dimensaoConhecimento: 'Procedimental', resolucao: '1/2 = 2/4, então 2/4 + 1/4 = 3/4.' },
  { tipo: 'vf', comp: 'Ciências', cont: 'Água', text: 'Classifique as afirmações:',
    alternativas: [{ id: 'af1', texto: 'A água ferve a 100°C no nível do mar.' }, { id: 'af2', texto: 'O gelo é mais denso que a água líquida.' }],
    gabarito: { af1: true, af2: false }, bloomLevel: 'lembrar', dimensaoConhecimento: 'Factual',
    resolucao: 'Ao nível do mar (1 atm), a água ferve a 100°C — verdadeiro. O gelo é MENOS denso que a água líquida (por isso flutua) — falso.' },
  { tipo: 'relacione', comp: 'Geografia', cont: 'Capitais', text: 'Relacione o país à capital:',
    alternativas: { colunaA: [{ id: 'a1', texto: 'Brasil' }, { id: 'a2', texto: 'França' }], colunaB: [{ id: 'b1', texto: 'Brasília' }, { id: 'b2', texto: 'Paris' }] },
    gabarito: { a1: 'b1', a2: 'b2' }, bloomLevel: 'entender', dimensaoConhecimento: 'Conceitual',
    resolucao: 'Brasília é a capital do Brasil desde 1960; Paris é a capital da França.' },
  { tipo: 'classifique', comp: 'Biologia', cont: 'Ecologia', text: 'Ordene do menor para o maior nível organizacional:',
    alternativas: [{ id: 'i1', texto: 'Célula' }, { id: 'i2', texto: 'Tecido' }, { id: 'i3', texto: 'Órgão' }],
    gabarito: ['i1', 'i2', 'i3'], bloomLevel: 'analisar', dimensaoConhecimento: 'Conceitual',
    resolucao: 'A hierarquia biológica vai de células (unidade básica) a tecidos (grupos de células) a órgãos (grupos de tecidos).' },
  { tipo: 'ordenar', comp: 'História', cont: 'Linha do tempo', text: 'Ordene cronologicamente:',
    alternativas: [{ id: 'e1', texto: 'Proclamação da República' }, { id: 'e2', texto: 'Independência do Brasil' }],
    gabarito: ['e2', 'e1'], bloomLevel: 'analisar', dimensaoConhecimento: 'Factual',
    resolucao: 'A Independência do Brasil ocorreu em 1822; a Proclamação da República, em 1889 — quase 70 anos depois.' },
  { tipo: 'lacunas', comp: 'Português', cont: 'Gramática', text: 'O {{1}} concorda em gênero e número com o {{2}}.',
    alternativas: 'O {{1}} concorda em gênero e número com o {{2}}.', gabarito: { '1': ['adjetivo'], '2': ['substantivo'] }, bloomLevel: 'entender', dimensaoConhecimento: 'Conceitual',
    resolucao: 'Regra de concordância nominal: o adjetivo se flexiona para concordar em gênero (masculino/feminino) e número (singular/plural) com o substantivo a que se refere.' },
  { tipo: 'discursiva', comp: 'Redação', cont: 'Argumentação', text: 'Explique, com suas palavras, a importância da reciclagem.',
    alternativas: null, gabarito: null, bloomLevel: 'avaliar', dimensaoConhecimento: 'Metacognitivo',
    resolucao: 'Não tem gabarito fixo — sirva de referência pro professor/IA avaliar: a resposta deve citar ao menos a redução de resíduos e a economia de recursos naturais.' }
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

// ---------- Importar questões com imagens EM LOTE (sem precisar abrir formulário questão por questão) ----------
// Estende o "Importar JSON": cada questão pode ter os campos extras `imagemArquivo` (imagem do
// enunciado) e/ou `imagemResolucaoArquivo` (imagem da resolução) com o NOME EXATO de um arquivo
// selecionado junto. A ferramenta casa cada nome com o arquivo correspondente, comprime, sobe pro
// Drive (reaproveitando `imagens.upload`, o mesmo usado no formulário manual) e importa tudo de uma
// vez (reaproveitando `questoes.importarJSON`) — sem precisar nenhuma mudança no backend.

function modalImportarLoteComImagens() {
  abrirModal(`<h3>🖼️ Importar questões com imagens em lote</h3>
    <p style="font-size:0.85rem;color:var(--cinza-texto);">Cole o array JSON das questões (mesmo formato do "Importar JSON") e selecione TODAS as imagens de uma vez, num só clique. Em cada questão que tiver imagem, adicione o campo <code>imagemArquivo</code> (imagem do enunciado) e/ou <code>imagemResolucaoArquivo</code> (imagem da resolução) com o NOME EXATO do arquivo de imagem — a ferramenta casa pelo nome, sobe cada imagem automaticamente e importa todas as questões de uma vez, sem precisar abrir o formulário questão por questão.</p>
    <button type="button" class="btn btn-secundario btn-full" onclick="copiarModeloJSONComImagem()">📋 Copiar modelo JSON (com imagem)</button>
    <label>JSON das questões</label>
    <textarea id="input-json-import-imagens" style="min-height:180px;"></textarea>
    <label>Imagens (selecione todas de uma vez — os nomes dos arquivos precisam bater com o JSON acima)</label>
    <input type="file" id="input-arquivos-imagens-lote" accept="image/*" multiple>
    <p id="resultado-import-lote-imagens" style="font-size:0.85rem;color:var(--cinza-texto);margin-top:8px;"></p>
    <button id="btn-confirmar-import-lote-imagens" class="btn btn-primario btn-full" onclick="confirmarImportarLoteComImagens()">Importar em lote</button>`);
}

async function copiarModeloJSONComImagem() {
  const modelo = [{
    tipo: 'multipla', comp: 'Matemática', cont: 'Geometria', ano: '9º ano EF',
    text: 'Observe a figura abaixo. Qual é a medida do ângulo x?',
    imagemArquivo: 'questao1.jpg',
    alternativas: { A: '30°', B: '45°', C: '60°', D: '90°', E: '120°' },
    gabarito: 'C', bloomLevel: 'aplicar', dimensaoConhecimento: 'Procedimental',
    resolucao: 'Explicação de por que C é a resposta correta, referenciando a figura.',
    imagemResolucaoArquivo: 'questao1-resolucao.jpg'
  }];
  const texto = JSON.stringify(modelo, null, 2);
  try {
    await navigator.clipboard.writeText(texto);
    toast('Modelo copiado! Os nomes de arquivo do exemplo são só ilustrativos — troque pelos nomes reais das suas imagens (uma questão pode ter só imagemArquivo, só imagemResolucaoArquivo, os dois, ou nenhum).', 'sucesso');
  } catch (e) {
    document.getElementById('input-json-import-imagens').value = texto;
    toast('Não consegui copiar automaticamente — coloquei o modelo no campo abaixo.', 'sucesso');
  }
}

async function confirmarImportarLoteComImagens() {
  let arr;
  try { arr = JSON.parse(document.getElementById('input-json-import-imagens').value); } catch (e) { toast('JSON inválido.', 'erro'); return; }
  if (!Array.isArray(arr) || arr.length === 0) { toast('O JSON precisa ser um array com ao menos uma questão.', 'erro'); return; }

  const arquivosPorNome = {};
  Array.from(document.getElementById('input-arquivos-imagens-lote').files || []).forEach(f => { arquivosPorNome[f.name] = f; });

  const totalReferencias = arr.reduce((soma, q) =>
    soma + [].concat(q.imagemArquivo || []).length + [].concat(q.imagemResolucaoArquivo || []).length, 0);

  const resultadoEl = document.getElementById('resultado-import-lote-imagens');
  const botao = document.getElementById('btn-confirmar-import-lote-imagens');
  const naoEncontradas = [];
  let enviadas = 0;
  const atualizarProgresso = () => { resultadoEl.textContent = totalReferencias > 0 ? `Enviando imagens... ${enviadas}/${totalReferencias}` : ''; };

  botao.disabled = true;
  try {
    for (const q of arr) {
      await _anexarImagensDaQuestao(q, 'imagemArquivo', 'imagens', arquivosPorNome, naoEncontradas, () => { enviadas++; atualizarProgresso(); });
      await _anexarImagensDaQuestao(q, 'imagemResolucaoArquivo', 'resolucaoImagens', arquivosPorNome, naoEncontradas, () => { enviadas++; atualizarProgresso(); });
      delete q.imagemArquivo; delete q.imagemResolucaoArquivo;
    }
    resultadoEl.textContent = 'Imagens enviadas — importando questões...';
    const resultado = await Api.chamar('questoes.importarJSON', { questoes: arr });
    fecharModal();
    let msg = `${resultado.importadas} importadas, ${resultado.ignoradasDuplicadas} duplicadas ignoradas.`;
    if (naoEncontradas.length > 0) msg += ` ⚠️ Imagem(ns) não encontrada(s) entre os arquivos selecionados (questão foi importada mesmo assim, sem essa imagem): ${naoEncontradas.join(', ')}.`;
    toast(msg, naoEncontradas.length > 0 ? 'erro' : 'sucesso');
    renderBancoQuestoes();
  } catch (e) {
    toast(e.message, 'erro');
  } finally {
    botao.disabled = false;
  }
}

/** Resolve o campo `imagemArquivo`/`imagemResolucaoArquivo` de UMA questão (string ou array de
 * nomes) em imagens de fato enviadas pro Drive, empilhando no campo de destino (`imagens` ou
 * `resolucaoImagens`) no MESMO formato que o upload manual usa: `{ id, data: url }`. */
async function _anexarImagensDaQuestao(q, campoArquivo, campoDestino, arquivosPorNome, naoEncontradas, onEnviada) {
  const valor = q[campoArquivo];
  if (!valor) return;
  const nomes = Array.isArray(valor) ? valor : [valor];
  q[campoDestino] = q[campoDestino] || [];
  for (const nome of nomes) {
    const file = arquivosPorNome[nome];
    if (!file) { naoEncontradas.push(nome); continue; }
    try {
      const dataUrlComprimido = await comprimirImagem(file, 1200);
      const resultado = await Api.chamar('imagens.upload', { base64: dataUrlComprimido, nomeArquivo: nome });
      q[campoDestino].push({ id: gerarId(), data: resultado.url });
    } catch (e) {
      naoEncontradas.push(nome + ' (falha no envio)');
    }
    onEnviada();
  }
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
        <small>${escapeHtml(q.comp)} · Gabarito: ${escapeHtml(q.gabarito)} · ${escapeHtml(LABELS_BLOOM[q.bloomLevel] || '')}${q.dimensaoConhecimento ? ' · ' + escapeHtml(q.dimensaoConhecimento) : ''} · ${q.resolucao ? '✓ resolução extraída' : 'sem resolução no arquivo'}</small>
        <div style="margin-top:6px;"><button type="button" class="btn btn-pequeno btn-secundario" onclick="abrirVisualizacaoQuestao(window._questoesVestibularPreview[${i}])">👁 Ver questão completa</button></div>
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
          <span>${d.hipotese !== 'indeterminado' ? `<span class="badge badge-info">${textoHipotese[d.hipotese] || d.hipotese}</span>` : ''}${_htmlHipoteseDimensao(d.hipoteseDimensao)}</span>
        </div>`).join('')}
    </div>`).join('') + `<p style="font-size:0.8rem;color:var(--cinza-texto);">Hipótese estatística baseada em padrão de erro — não é um diagnóstico exato.</p>`;
}

/** Badge da 3ª hipótese de diagnóstico (comparação de desempenho entre Dimensões do Conhecimento do mesmo conteúdo). */
function _htmlHipoteseDimensao(hd) {
  if (!hd) return '';
  const pct = v => Math.round(v * 100) + '%';
  return ` <span class="badge badge-atencao" title="Desempenho por Dimensão do Conhecimento neste conteúdo">
    🔍 Mais fraco em ${escapeHtml(hd.dimensaoMaisFraca)} (${pct(hd.percentualMaisFraca)}) que em ${escapeHtml(hd.dimensaoMaisForte)} (${pct(hd.percentualMaisForte)})
  </span>`;
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

<h4>1.4 A Dimensão do Conhecimento (o outro eixo da Taxonomia)</h4>
<p>A formulação original de Anderson &amp; Krathwohl (2001) não é uma lista de 6 níveis — é uma <strong>matriz bidimensional</strong>: o nível cognitivo (seção 1, acima) cruzado com a <strong>Dimensão do Conhecimento</strong>, o TIPO de conhecimento que a questão mobiliza. Desde 2026, o AppMaximo também classifica esse segundo eixo, no campo "Dimensão do Conhecimento" do cadastro de questão (junto do botão "✨ Sugerir com IA", que agora sugere os dois eixos de uma vez).</p>
<table>
  <tr><th>Dimensão</th><th>Definição</th><th>Exemplo</th></tr>
  <tr><td>Factual</td><td>Fatos isolados, terminologia, símbolos — dados soltos e desconectados.</td><td>O símbolo químico do ferro; a data de um evento histórico.</td></tr>
  <tr><td>Conceitual</td><td>Relações entre ideias, princípios, classificações, generalizações.</td><td>Por que uma fórmula funciona; como dois conceitos se relacionam.</td></tr>
  <tr><td>Procedimental</td><td>"Como fazer" — algoritmos, técnicas, método passo a passo.</td><td>Como resolver uma equação; como executar uma construção geométrica.</td></tr>
  <tr><td>Metacognitivo</td><td>Reflexão sobre a própria estratégia de raciocínio; autoavaliação; julgamento sobre um processo ou planejamento de algo novo.</td><td>Avaliar se a estratégia usada foi a mais eficiente; propor um método próprio.</td></tr>
</table>
<p>Na prática, cada nível de Bloom tende a puxar pra uma dimensão predominante (isso é só um ponto de partida, ajustável conforme o conteúdo): <strong>Lembrar→Factual · Entender→Conceitual · Aplicar→Procedimental · Analisar→Conceitual · Avaliar→Metacognitivo · Criar→Metacognitivo</strong>.</p>
<p>Essa classificação é um metadado de bastidor: aparece só pra você (professor) — no banco de questões, no formulário de cadastro, ao "observar" uma lista já criada e no relatório de detalhes da lista — o aluno nunca vê a Dimensão do Conhecimento nem a Unidade Temática de uma questão.</p>
<p>Pra Matemática, do 6º ano do Fundamental II à 3ª série do Ensino Médio, já existe uma referência pronta: a <strong>"Matriz de Objetivos de Aprendizagem — Matemática"</strong>, uma planilha com um objetivo de aprendizagem para cada conteúdo × nível de Bloom × dimensão do conhecimento, alinhada à BNCC. Use-a como inspiração de fraseado ao classificar (ou ao pedir pra IA gerar) questões desses conteúdos.</p>
<p>Os filtros do banco de questões (Nível de Bloom, Dimensão do Conhecimento, Ano/Série e Unidade Temática) usam exatamente esses campos — por isso vale preenchê-los mesmo quando parecer redundante: é o que permite, por exemplo, montar rapidamente uma lista só com questões de "Analisar" sobre "Geometria" do 8º ano.</p>
<p class="fonte">Fonte: Anderson, L. W., &amp; Krathwohl, D. R. (Eds.) (2001). A Taxonomy for Learning, Teaching, and Assessing. Longman.</p>

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
  <li>2. Nível de Bloom E Dimensão do Conhecimento escolhidos (use o botão de sugestão da IA como ponto de partida, mas revise os dois).</li>
  <li>3. Se o conteúdo tiver um pré-requisito claro, anote-o (mesmo que hoje seja só numa lista sua, até a tela de cadastro formal existir).</li>
  <li>4. Gabarito conferido — principalmente em Relacione, Classifique e Ordenar, onde é fácil errar a ordem/pareamento.</li>
  <li>5. Resolução (explicação) preenchida quando possível — ela é o que mais ajuda o aluno quando você libera a correção.</li>
  <li>6. Pra Matemática, considere preencher também Ano/Série e Unidade Temática — são os campos que alimentam os filtros novos do banco de questões.</li>
</ul>

<h4>Referências</h4>
<p>Anderson, L. W., &amp; Krathwohl, D. R. (Eds.). (2001). A Taxonomy for Learning, Teaching, and Assessing: A Revision of Bloom's Taxonomy of Educational Objectives. Longman.</p>
<p>Krathwohl, D. R. (2002). A Revision of Bloom's Taxonomy: An Overview. Theory Into Practice, 41(4), 212–218.</p>
<p>Ausubel, D. P. (1962/1968). Subsumption Theory / Educational Psychology: A Cognitive View. Resumo consultado em InstructionalDesign.org.</p>
<p>Doignon, J.-P., &amp; Falmagne, J.-C. (1999). Knowledge Spaces. Springer.</p>
<p>Luckesi, C. C. (2018). Avaliação da Aprendizagem: Componente do Ato Pedagógico. Cortez. Referência secundária consultada via "A avaliação como um instrumento diagnóstico: uma reflexão sobre a prática docente", Cadernos de Graduação (periodicos.set.edu.br).</p>
<p>Mager, R. F. (1962). Preparing Instructional Objectives. Fearon Publishers.</p>
<p>Trevisan, A. L., &amp; Amaral, R. B. (2016). A Taxionomia revisada de Bloom aplicada à avaliação: um estudo de provas escritas de Matemática. Ciência &amp; Educação (Bauru), 22(2).</p>
<p>Base Nacional Comum Curricular (BNCC) — Matemática, Ensino Fundamental e Ensino Médio. MEC, 2018. E Currículo Paulista, usado como referência pra distribuição das habilidades do Ensino Médio por série.</p>
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
