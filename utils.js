const crypto = require('crypto');

const PARAMS_RASTREIO = /^(utm_|fbclid|gclid|igshid|mc_)/i;

function ehLinkSimples(texto) {
  return /^https?:\/\/\S+$/i.test(texto);
}

function linkValido(texto) {
  try {
    const u = new URL(texto);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Remove rastreadores (utm_, fbclid...), #âncora e "/" final: mesma matéria = mesmo link
function normalizarLink(link) {
  const url = new URL(link);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  for (const chave of [...url.searchParams.keys()]) {
    if (PARAMS_RASTREIO.test(chave)) url.searchParams.delete(chave);
  }
  return url.toString().replace(/\/$/, '');
}

function normalizarTexto(texto) {
  return texto.toLowerCase().replace(/\s+/g, ' ').trim();
}

function gerarHash(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

function paginar(query, limitePadrao = 20, limiteMax = 100) {
  const limite = Math.min(Math.max(parseInt(query.limite, 10) || limitePadrao, 1), limiteMax);
  const pagina = Math.max(parseInt(query.pagina, 10) || 1, 1);
  return { limite, pagina, offset: (pagina - 1) * limite };
}

module.exports = { ehLinkSimples, linkValido, normalizarLink, normalizarTexto, gerarHash, paginar };
