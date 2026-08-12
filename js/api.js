// api.js
// Única porta de comunicação com o backend. Content-Type text/plain evita que o
// navegador dispare um preflight de CORS, que o Apps Script não responde.
const Api = (function () {
  function token() { return localStorage.getItem('appmaximo_token') || ''; }
  function setToken(t) { if (t) localStorage.setItem('appmaximo_token', t); }
  function limparToken() { localStorage.removeItem('appmaximo_token'); }

  async function chamar(action, dados) {
    if (!API_URL || API_URL.indexOf('COLE_AQUI') !== -1) {
      throw new Error('O endereço do backend ainda não foi configurado em js/config.js.');
    }
    let resp;
    try {
      resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: token(), dados: dados || {} })
      });
    } catch (e) {
      throw new Error('Não foi possível falar com o servidor. Verifique sua internet.');
    }
    let corpo;
    try { corpo = await resp.json(); } catch (e) {
      throw new Error('Resposta inesperada do servidor.');
    }
    if (!corpo.success) {
      if (['SESSAO_INVALIDA', 'SESSAO_EXPIRADA', 'SEM_TOKEN'].includes(corpo.code)) {
        limparToken();
      }
      const erro = new Error(corpo.error || 'Erro desconhecido.');
      erro.code = corpo.code;
      throw erro;
    }
    return corpo.data;
  }

  return { chamar, token, setToken, limparToken };
})();
