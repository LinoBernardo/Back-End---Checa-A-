process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');

let server, base;
test.before(() => new Promise((ok) => {
  server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; ok(); });
}));
test.after(() => { server.closeAllConnections?.(); server.close(); });

const enviar = (metodo, rota, corpo) =>
  fetch(base + rota, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo && JSON.stringify(corpo) });

test('cadastra notícia com título, conteúdo e link', async () => {
  const r = await enviar('POST', '/noticias', {
    titulo: 'Vacina causa X', conteudo: 'Dizem que a vacina causa X, compartilhe!', link: 'https://site.com/materia?utm_source=zap',
  });
  const n = await r.json();
  assert.equal(r.status, 201);
  assert.equal(n.id, 1);
  assert.equal(n.titulo, 'Vacina causa X');
  assert.equal(n.link, 'https://site.com/materia?utm_source=zap');
  assert.ok(n.criado_em);
  assert.equal(n.ja_consultada_antes, false);
});

test('mesma notícia não duplica (link com/sem utm) e conta nova consulta', async () => {
  const r = await enviar('POST', '/noticias', { link: 'https://SITE.com/materia/' });
  const n = await r.json();
  assert.equal(r.status, 200);
  assert.equal(n.id, 1);
  assert.equal(n.total_consultas, 2);
  assert.equal(n.ja_consultada_antes, true);
});

test('aceita só texto e gera título automático; URL no campo conteudo vira link', async () => {
  const a = await (await enviar('POST', '/noticias', { conteudo: 'Água com limão cura tudo, diz mensagem' })).json();
  assert.equal(a.titulo, 'Água com limão cura tudo, diz mensagem');
  const b = await (await enviar('POST', '/noticias', { conteudo: 'https://outro.com/x' })).json();
  assert.equal(b.link, 'https://outro.com/x');
  assert.equal(b.titulo, 'outro.com');
});

test('valida entradas inválidas', async () => {
  assert.equal((await enviar('POST', '/noticias', {})).status, 400);
  assert.equal((await enviar('POST', '/noticias', { conteudo: 'oi' })).status, 400);
  assert.equal((await enviar('POST', '/noticias', { link: 'nao-e-link' })).status, 400);
});

test('consulta notícias cadastradas (lista, busca e por id)', async () => {
  const lista = await (await fetch(base + '/noticias')).json();
  assert.equal(lista.total, 3);
  const busca = await (await fetch(base + '/noticias?q=vacina')).json();
  assert.equal(busca.total, 1);
  assert.equal((await fetch(base + '/noticias/1')).status, 200);
  assert.equal((await fetch(base + '/noticias/999')).status, 404);
});

test('histórico lista as consultas, mais recentes primeiro, com filtro por notícia', async () => {
  const h = await (await fetch(base + '/historico')).json();
  assert.equal(h.total, 4);
  assert.ok(h.itens[0].id > h.itens[1].id);
  const f = await (await fetch(base + '/historico?noticia_id=1')).json();
  assert.equal(f.total, 2);
});

test('denúncia, resultado da checagem e ranking', async () => {
  await enviar('POST', '/noticias/1/denunciar', { motivo: 'boato' });
  await enviar('POST', '/noticias/1/denunciar', {});
  await enviar('POST', '/noticias/2/denunciar', {});
  const r = await enviar('PATCH', '/noticias/1/resultado', { veredito: 'falso', fonte_checagem: 'Lupa' });
  assert.equal((await r.json()).veredito, 'falso');
  assert.equal((await enviar('PATCH', '/noticias/1/resultado', { veredito: 'talvez' })).status, 400);
  const rank = await (await fetch(base + '/ranking')).json();
  assert.equal(rank.itens[0].id, 1);
  assert.equal(rank.itens[0].denuncias, 2);
  assert.equal(rank.itens[0].posicao, 1);
});
