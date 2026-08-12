// questoes-ui.js
// Motor de renderização dos 7 tipos de questão — tanto pro aluno responder quanto pro
// professor cadastrar. Formatos batem com docs/SPEC.md (seção 3, alternativas_json/gabarito_json).

const LABELS_TIPO = {
  multipla: 'Múltipla escolha', vf: 'Verdadeiro ou Falso', relacione: 'Relacione as colunas',
  classifique: 'Classifique (ordene por grau)', discursiva: 'Discursiva',
  lacunas: 'Preencher lacunas', ordenar: 'Ordenar sequência'
};
const LABELS_BLOOM = {
  lembrar: 'Lembrar', entender: 'Entender', aplicar: 'Aplicar',
  analisar: 'Analisar', avaliar: 'Avaliar', criar: 'Criar'
};

// ========================================================================
// EDITOR DE MATEMÁTICA — barra de símbolos pra inserir no campo de texto
// que estiver ativo no momento (enunciado, alternativas, resolução...).
// ========================================================================

const SIMBOLOS_MATEMATICA = [
  ['x²', '²', ''], ['x³', '³', ''], ['xⁿ', '^', ''],
  ['√', '√(', ')'], ['∛', '∛(', ')'],
  ['π', 'π', ''], ['°', '°', ''], ['±', '±', ''],
  ['≤', '≤', ''], ['≥', '≥', ''], ['≠', '≠', ''], ['≈', '≈', ''],
  ['×', '×', ''], ['÷', '÷', ''], ['Δ', 'Δ', ''], ['Σ', 'Σ', ''], ['∞', '∞', ''],
  ['sen', 'sen(', ')'], ['cos', 'cos(', ')'], ['tan', 'tan(', ')']
];

document.addEventListener('focusin', (e) => {
  if (e.target && e.target.matches('input[type="text"], textarea')) {
    window._campoMatematicoAtivo = e.target;
  }
});

/** Insere `antes` (e opcionalmente `depois`, envolvendo a seleção) no último campo de texto/textarea clicado. */
function inserirSimboloMatematico(antes, depois) {
  const campo = window._campoMatematicoAtivo || document.getElementById('input-q-text');
  if (!campo) return;
  depois = depois || '';
  const inicio = campo.selectionStart != null ? campo.selectionStart : campo.value.length;
  const fim = campo.selectionEnd != null ? campo.selectionEnd : campo.value.length;
  const selecionado = campo.value.slice(inicio, fim);
  const trecho = antes + selecionado + depois;
  campo.value = campo.value.slice(0, inicio) + trecho + campo.value.slice(fim);
  const novaPos = selecionado ? inicio + trecho.length : inicio + antes.length;
  campo.focus();
  campo.setSelectionRange(novaPos, novaPos);
}

function renderToolbarMatematica() {
  return `<div class="toolbar-matematica">
    ${SIMBOLOS_MATEMATICA.map(([label, antes, depois]) => `
      <button type="button" class="btn-simbolo" title="Inserir no campo em uso"
        onclick="inserirSimboloMatematico('${antes.replace(/'/g, "\\'")}','${depois.replace(/'/g, "\\'")}')">${escapeHtml(label)}</button>`).join('')}
  </div>
  <p style="font-size:0.75rem;color:var(--cinza-texto);margin:2px 0 0;">Clique num campo de texto (enunciado, alternativa, resolução) e depois nos símbolos acima pra inserir ali.</p>`;
}

// ========================================================================
// MODO "RESPONDER" (aluno)
// ========================================================================

function renderResponderQuestao(q, idx) {
  const cabecalho = `<div class="questao-box" data-questao-id="${escapeHtml(q.id)}" data-tipo="${escapeHtml(q.tipo)}">
    <div class="questao-enunciado"><strong>${idx + 1}.</strong> ${formatarTextoQuestao(q.text)}</div>
    ${(q.imagens || []).map(img => `<img src="${escapeHtml(img.data)}" style="max-width:100%;border-radius:8px;margin-bottom:10px;" alt="Imagem da questão">`).join('')}`;
  let corpo = '';

  switch (q.tipo) {
    case 'multipla':
      corpo = Object.entries(q.alternativas || {}).map(([letra, texto]) => `
        <label class="alternativa">
          <input type="radio" name="resp_${escapeHtml(q.id)}" value="${escapeHtml(letra)}">
          <span><strong>${escapeHtml(letra)})</strong> ${formatarTextoQuestao(texto)}</span>
        </label>`).join('');
      break;

    case 'vf':
      corpo = (q.alternativas || []).map(af => `
        <div class="alternativa" style="cursor:default;">
          <span style="flex:1;">${formatarTextoQuestao(af.texto)}</span>
          <label style="width:auto;display:flex;gap:4px;align-items:center;"><input type="radio" name="vf_${escapeHtml(q.id)}_${escapeHtml(af.id)}" value="true"> V</label>
          <label style="width:auto;display:flex;gap:4px;align-items:center;"><input type="radio" name="vf_${escapeHtml(q.id)}_${escapeHtml(af.id)}" value="false"> F</label>
        </div>`).join('');
      break;

    case 'relacione': {
      const colB = (q.alternativas && q.alternativas.colunaB) || [];
      corpo = `<div class="coluna-relacione"><div>
        ${(q.alternativas.colunaA || []).map(itemA => `
          <div class="alternativa" style="cursor:default;">
            <span style="flex:1;">${formatarTextoQuestao(itemA.texto)}</span>
            <select data-relacione-de="${escapeHtml(itemA.id)}" style="width:auto;">
              <option value="">?</option>
              ${colB.map(itemB => `<option value="${escapeHtml(itemB.id)}">${escapeHtml(itemB.texto).slice(0, 3)}...</option>`).join('')}
            </select>
          </div>`).join('')}
      </div><div>
        ${colB.map((itemB, i) => `<div class="alternativa" style="cursor:default;"><span><strong>${i + 1}.</strong> ${formatarTextoQuestao(itemB.texto)}</span></div>`).join('')}
      </div></div>`;
      break;
    }

    case 'classifique':
    case 'ordenar':
      corpo = `<div class="lista-ordenavel" data-questao-ordenar="${escapeHtml(q.id)}">
        ${_embaralhar(q.alternativas || []).map((item, i) => `
          <div class="item-arrastavel" data-item-id="${escapeHtml(item.id)}" style="display:flex;justify-content:space-between;align-items:center;">
            <span>${formatarTextoQuestao(item.texto)}</span>
            <span>
              <button type="button" class="btn btn-pequeno btn-secundario" onclick="moverItemOrdenavel('${escapeHtml(q.id)}', ${i}, -1)">▲</button>
              <button type="button" class="btn btn-pequeno btn-secundario" onclick="moverItemOrdenavel('${escapeHtml(q.id)}', ${i}, 1)">▼</button>
            </span>
          </div>`).join('')}
      </div>`;
      break;

    case 'lacunas': {
      let texto = escapeHtml(q.alternativas || '');
      texto = texto.replace(/\{\{(\d+)\}\}/g, (m, n) => `<input type="text" style="width:140px;display:inline-block;" data-lacuna="${n}">`);
      corpo = `<div style="line-height:2.2;">${texto}</div>`;
      break;
    }

    case 'discursiva':
      corpo = `<textarea data-discursiva="${escapeHtml(q.id)}" placeholder="Digite sua resposta..."></textarea>`;
      break;
  }

  return cabecalho + corpo + '</div>';
}

/** Embaralha uma cópia do array — usado pra não mostrar "classifique"/"ordenar" já na ordem certa (senão a resposta fica óbvia). */
function _embaralhar(arr) {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function moverItemOrdenavel(qId, indice, direcao) {
  const container = document.querySelector(`[data-questao-ordenar="${qId}"]`);
  const itens = Array.from(container.children);
  const novoIndice = indice + direcao;
  if (novoIndice < 0 || novoIndice >= itens.length) return;
  if (direcao < 0) container.insertBefore(itens[indice], itens[novoIndice]);
  else container.insertBefore(itens[novoIndice], itens[indice]);
}

/** Lê o DOM e monta o objeto de resposta no formato que o backend espera para aquele tipo. */
function coletarRespostaQuestao(q) {
  switch (q.tipo) {
    case 'multipla': {
      const marcado = document.querySelector(`input[name="resp_${q.id}"]:checked`);
      return marcado ? marcado.value : null;
    }
    case 'vf': {
      const resp = {};
      (q.alternativas || []).forEach(af => {
        const marcado = document.querySelector(`input[name="vf_${q.id}_${af.id}"]:checked`);
        if (marcado) resp[af.id] = marcado.value === 'true';
      });
      return resp;
    }
    case 'relacione': {
      const resp = {};
      document.querySelectorAll(`[data-relacione-de]`).forEach(sel => {
        if (sel.value) resp[sel.dataset.relacioneDe] = sel.value;
      });
      return resp;
    }
    case 'classifique':
    case 'ordenar': {
      const container = document.querySelector(`[data-questao-ordenar="${q.id}"]`);
      return container ? Array.from(container.children).map(el => el.dataset.itemId) : [];
    }
    case 'lacunas': {
      const resp = {};
      document.querySelectorAll(`.questao-box[data-questao-id="${q.id}"] [data-lacuna]`).forEach(input => {
        resp[input.dataset.lacuna] = input.value;
      });
      return resp;
    }
    case 'discursiva': {
      const el = document.querySelector(`[data-discursiva="${q.id}"]`);
      return el ? el.value : '';
    }
    default: return null;
  }
}

// ========================================================================
// MODO "EDITOR" (professor cadastrando/editando questão)
// ========================================================================

/** Devolve o HTML do formulário específico do tipo, pra dentro do modal de cadastro de questão. */
function renderEditorPorTipo(tipo, dados) {
  dados = dados || {};
  switch (tipo) {
    case 'multipla': {
      const alt = dados.alternativas || { A: '', B: '', C: '', D: '', E: '' };
      return ['A', 'B', 'C', 'D', 'E'].map(l => `
        <div style="margin-top:12px;">
          <label style="display:flex;align-items:center;gap:8px;margin:0 0 4px;cursor:pointer;">
            <input type="radio" name="gabarito-multipla" value="${l}" ${dados.gabarito === l ? 'checked' : ''} style="width:auto;">
            <span>Alternativa ${l}${l === 'A' ? ' <span style="font-weight:400;">(marque a correta)</span>' : ''}</span>
          </label>
          <input type="text" id="edit-alt-${l}" class="campo-matematico" value="${escapeHtml(alt[l] || '')}">
        </div>`).join('');
    }
    case 'vf': {
      const afirmacoes = dados.alternativas || [{ id: gerarId(), texto: '' }, { id: gerarId(), texto: '' }];
      return `<div id="editor-vf-lista">
        ${afirmacoes.map(af => _linhaAfirmacaoVF(af, dados.gabarito ? dados.gabarito[af.id] : null)).join('')}
      </div>
      <button type="button" class="btn btn-secundario btn-pequeno" onclick="adicionarAfirmacaoVF()">+ Adicionar afirmação</button>`;
    }
    case 'relacione': {
      const colA = (dados.alternativas && dados.alternativas.colunaA) || [{ id: gerarId(), texto: '' }];
      const colB = (dados.alternativas && dados.alternativas.colunaB) || [{ id: gerarId(), texto: '' }];
      return `<label>Coluna A</label><div id="editor-relacione-a">${colA.map(i => _linhaItemSimples('a', i)).join('')}</div>
        <button type="button" class="btn btn-secundario btn-pequeno" onclick="adicionarItemRelacione('a')">+ Item coluna A</button>
        <label style="margin-top:16px;">Coluna B</label><div id="editor-relacione-b">${colB.map(i => _linhaItemSimples('b', i)).join('')}</div>
        <button type="button" class="btn btn-secundario btn-pequeno" onclick="adicionarItemRelacione('b')">+ Item coluna B</button>
        <p style="font-size:0.8rem;color:var(--cinza-texto);">Depois de salvar, edite a correspondência correta na tela de revisão.</p>`;
    }
    case 'classifique':
    case 'ordenar': {
      const itens = dados.alternativas || [{ id: gerarId(), texto: '' }, { id: gerarId(), texto: '' }];
      return `<label>Itens, JÁ NA ORDEM CORRETA (do menor grau ao maior, ou da 1ª à última etapa)</label>
        <div id="editor-ordenar-lista">${itens.map(i => _linhaItemSimples('ordenar', i)).join('')}</div>
        <button type="button" class="btn btn-secundario btn-pequeno" onclick="adicionarItemOrdenar()">+ Adicionar item</button>`;
    }
    case 'lacunas':
      return `<label>Texto com lacunas — use {{1}}, {{2}}, {{3}}... nos espaços</label>
        <textarea id="edit-lacunas-texto">${escapeHtml(dados.alternativas || '')}</textarea>
        <label>Respostas aceitas por lacuna (uma por linha, ex: "1: são paulo, sp")</label>
        <textarea id="edit-lacunas-gabarito">${escapeHtml(_gabaritoLacunasParaTexto(dados.gabarito))}</textarea>`;
    case 'discursiva':
      return `<p style="color:var(--cinza-texto);font-size:0.9rem;">Questão discursiva: não tem gabarito fixo — a IA sugere uma correção e o professor sempre revisa antes de valer.</p>`;
    default: return '';
  }
}

function _linhaAfirmacaoVF(af, valorGabarito) {
  return `<div class="linha-botoes" data-af-id="${af.id}" style="align-items:center;">
    <input type="text" class="vf-texto" value="${escapeHtml(af.texto)}" placeholder="Afirmação" style="flex:1;">
    <label style="width:auto;"><input type="radio" name="vf-gab-${af.id}" value="true" ${valorGabarito === true ? 'checked' : ''}> V</label>
    <label style="width:auto;"><input type="radio" name="vf-gab-${af.id}" value="false" ${valorGabarito === false ? 'checked' : ''}> F</label>
  </div>`;
}
function _linhaItemSimples(grupo, item) {
  return `<div class="linha-botoes" data-item-id="${item.id}"><input type="text" class="item-${grupo}-texto" value="${escapeHtml(item.texto)}" style="flex:1;"></div>`;
}
function _gabaritoLacunasParaTexto(gabarito) {
  if (!gabarito) return '';
  return Object.entries(gabarito).map(([n, aceitas]) => `${n}: ${(aceitas || []).join(', ')}`).join('\n');
}

function adicionarAfirmacaoVF() {
  document.getElementById('editor-vf-lista').insertAdjacentHTML('beforeend', _linhaAfirmacaoVF({ id: gerarId(), texto: '' }, null));
}
function adicionarItemRelacione(lado) {
  document.getElementById('editor-relacione-' + lado).insertAdjacentHTML('beforeend', _linhaItemSimples(lado, { id: gerarId(), texto: '' }));
}
function adicionarItemOrdenar() {
  document.getElementById('editor-ordenar-lista').insertAdjacentHTML('beforeend', _linhaItemSimples('ordenar', { id: gerarId(), texto: '' }));
}

/** Lê o formulário aberto e monta {alternativas, gabarito} pro tipo atual. */
function coletarDadosEditorPorTipo(tipo) {
  switch (tipo) {
    case 'multipla': {
      const alternativas = {};
      ['A', 'B', 'C', 'D', 'E'].forEach(l => alternativas[l] = document.getElementById('edit-alt-' + l).value);
      const gab = document.querySelector('input[name="gabarito-multipla"]:checked');
      if (!gab) throw new Error('Marque qual alternativa é a correta.');
      return { alternativas, gabarito: gab.value };
    }
    case 'vf': {
      const alternativas = []; const gabarito = {};
      document.querySelectorAll('#editor-vf-lista [data-af-id]').forEach(linha => {
        const id = linha.dataset.afId;
        const texto = linha.querySelector('.vf-texto').value;
        const marcado = linha.querySelector('input[type=radio]:checked');
        if (!texto.trim()) return;
        alternativas.push({ id, texto });
        if (marcado) gabarito[id] = marcado.value === 'true';
      });
      return { alternativas, gabarito };
    }
    case 'relacione': {
      const colunaA = [], colunaB = [];
      document.querySelectorAll('#editor-relacione-a [data-item-id]').forEach(l => {
        const t = l.querySelector('.item-a-texto').value; if (t.trim()) colunaA.push({ id: l.dataset.itemId, texto: t });
      });
      document.querySelectorAll('#editor-relacione-b [data-item-id]').forEach(l => {
        const t = l.querySelector('.item-b-texto').value; if (t.trim()) colunaB.push({ id: l.dataset.itemId, texto: t });
      });
      // Gabarito default: pareamento na mesma ordem em que foram cadastrados (ajustável depois).
      const gabarito = {};
      colunaA.forEach((a, i) => { if (colunaB[i]) gabarito[a.id] = colunaB[i].id; });
      return { alternativas: { colunaA, colunaB }, gabarito };
    }
    case 'classifique':
    case 'ordenar': {
      const itens = [];
      document.querySelectorAll('#editor-ordenar-lista [data-item-id]').forEach(l => {
        const t = l.querySelector('.item-ordenar-texto').value; if (t.trim()) itens.push({ id: l.dataset.itemId, texto: t });
      });
      // A ordem de cadastro JÁ é a ordem correta (instrução na tela); embaralha só a exibição no front na hora de responder.
      return { alternativas: [...itens], gabarito: itens.map(i => i.id) };
    }
    case 'lacunas': {
      const texto = document.getElementById('edit-lacunas-texto').value;
      const linhasGabarito = document.getElementById('edit-lacunas-gabarito').value.split('\n');
      const gabarito = {};
      linhasGabarito.forEach(linha => {
        const m = linha.match(/^\s*(\d+)\s*:\s*(.+)$/);
        if (m) gabarito[m[1]] = m[2].split(',').map(s => s.trim()).filter(Boolean);
      });
      return { alternativas: texto, gabarito };
    }
    case 'discursiva':
      return { alternativas: null, gabarito: null };
    default:
      return { alternativas: null, gabarito: null };
  }
}
