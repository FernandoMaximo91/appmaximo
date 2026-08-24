// api.js
// Única porta de comunicação com o backend. Content-Type text/plain evita que o
// navegador dispare um preflight de CORS, que o Apps Script não responde.
const Api = (function () {
  function token() { return localStorage.getItem('appmaximo_token') || ''; }
  function setToken(t) { if (t) localStorage.setItem('appmaximo_token', t); }
  function limparToken() { localStorage.removeItem('appmaximo_token'); }

  function _esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  /**
   * Faz UMA tentativa de chamada. Separado de `chamar` pra permitir retry (ver abaixo) sem
   * duplicar a lógica de fetch + parse.
   */
  async function _tentarChamada(action, dados) {
    let resp;
    try {
      resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: token(), dados: dados || {} })
      });
    } catch (e) {
      const erro = new Error('Não foi possível falar com o servidor. Verifique sua internet.');
      erro.transitorio = true; // falha de rede — vale tentar de novo
      throw erro;
    }
    let corpo;
    try { corpo = await resp.json(); } catch (e) {
      // O Apps Script Web App responde via um redirecionamento pra uma URL própria
      // (script.googleusercontent.com) que serve o conteúdo de verdade. Esporadicamente esse
      // redirecionamento retorna 404 mesmo com o script tendo rodado com sucesso do outro lado
      // (confirmado no histórico de Execuções do Apps Script) — é uma instabilidade conhecida
      // do próprio Google, não um bug do nosso código. Por isso vale tentar de novo automaticamente
      // (ver `chamar` abaixo) antes de mostrar erro pro usuário.
      const erro = new Error('Resposta inesperada do servidor.');
      erro.transitorio = true;
      throw erro;
    }
    if (!corpo.success) {
      if (['SESSAO_INVALIDA', 'SESSAO_EXPIRADA', 'SEM_TOKEN'].includes(corpo.code)) {
        limparToken();
      }
      const erro = new Error(corpo.error || 'Erro desconhecido.');
      erro.code = corpo.code;
      throw erro; // erro "de verdade" (o servidor respondeu certinho dizendo que algo deu errado) — nunca tenta de novo
    }
    return corpo.data;
  }

  /**
   * Tenta a chamada até 3 vezes (1 tentativa + 2 retries) SÓ quando a falha for classificada como
   * transitória (rede ou resposta não-JSON do redirecionamento do Apps Script — ver comentário em
   * `_tentarChamada`). Um erro "de verdade" vindo do backend (corpo.success === false) nunca é
   * repetido, pra não mascarar um problema real nem duplicar uma ação (criar questão, entregar
   * lista etc.) por engano.
   */
  async function chamar(action, dados) {
    if (!API_URL || API_URL.indexOf('COLE_AQUI') !== -1) {
      throw new Error('O endereço do backend ainda não foi configurado em js/config.js.');
    }
    const ATRASOS_MS = [500, 1200]; // entre a 1ª e 2ª tentativa, e entre a 2ª e 3ª
    let ultimoErro;
    for (let tentativa = 0; tentativa <= ATRASOS_MS.length; tentativa++) {
      try {
        return await _tentarChamada(action, dados);
      } catch (e) {
        ultimoErro = e;
        if (!e.transitorio || tentativa === ATRASOS_MS.length) throw e;
        await _esperar(ATRASOS_MS[tentativa]);
      }
    }
    throw ultimoErro; // nunca deveria chegar aqui, mas mantém o retorno seguro
  }

  return { chamar, token, setToken, limparToken };
})();
