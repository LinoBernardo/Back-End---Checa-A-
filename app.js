const express = require('express');
const cors = require('cors');
const db = require('./db');
const { ehLinkSimples, linkValido, normalizarLink, normalizarTexto, gerarHash, paginar } = require('./utils');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const VEREDITOS = ['falso', 'verdadeiro', 'enganoso', 'sem_checagem'];
const texto = (v) => (typeof v === 'string' ? v.trim() : '');

const q = {
  porHash: db.prepare('SELECT * FROM noticias WHERE hash = ?'),
  porId: db.prepare('SELECT * FROM noticias WHERE id = ?'),
  inserirNoticia: db.prepare('INSERT INTO noticias (hash, titulo, conteudo, link) VALUES (?, ?, ?, ?)'),
  inserirConsulta: db.prepare('INSERT INTO consultas (noticia_id) VALUES (?)'),
  atualizarConsulta: db.prepare(
    "UPDATE noticias SET total_consultas = total_consultas + 1, ultima_consulta_em = datetime('now') WHERE id = ?"
  ),
  inserirDenuncia: db.prepare('INSERT INTO denuncias (noticia_id, motivo) VALUES (?, ?)'),
  atualizarDenuncia: db.prepare('UPDATE noticias SET total_denuncias = total_denuncias + 1 WHERE id = ?'),
};

// Cadastra a notícia (se ainda não existir) e registra a consulta, tudo numa transação
const registrarConsulta = db.transaction(({ hash, titulo, conteudo, link }) => {
  let noticia = q.porHash.get(hash);
  let nova = false;
  if (!noticia) {
    const { lastInsertRowid } = q.inserirNoticia.run(hash, titulo, conteudo || null, link || null);
    noticia = q.porId.get(lastInsertRowid);
    nova = true;
  }
  q.inserirConsulta.run(noticia.id);
  q.atualizarConsulta.run(noticia.id);
  return { noticia: q.porId.get(noticia.id), nova };
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---------- CADASTRO ----------
// Body: { titulo?, conteudo?, link? }  (precisa de conteudo OU link)
app.post('/noticias', (req, res) => {
  const titulo = texto(req.body?.titulo);
  let conteudo = texto(req.body?.conteudo);
  let link = texto(req.body?.link);

  // Se o usuário colou só uma URL no campo "conteudo", tratamos como link
  if (!link && ehLinkSimples(conteudo)) {
    link = conteudo;
    conteudo = '';
  }

  if (!conteudo && !link) {
    return res.status(400).json({ erro: 'Envie "conteudo" (texto da notícia) e/ou "link".' });
  }
  if (link && !linkValido(link)) {
    return res.status(400).json({ erro: '"link" inválido. Use uma URL começando com http:// ou https://.' });
  }
  if (conteudo && (conteudo.length < 5 || conteudo.length > 10000)) {
    return res.status(400).json({ erro: '"conteudo" deve ter entre 5 e 10000 caracteres.' });
  }
  if (titulo.length > 200) {
    return res.status(400).json({ erro: '"titulo" deve ter no máximo 200 caracteres.' });
  }

  // Sem título? Gera um a partir do texto ou do domínio do link
  const tituloFinal = titulo || (conteudo ? conteudo.slice(0, 80) : new URL(link).hostname);
  const hash = gerarHash(link ? `link:${normalizarLink(link)}` : `texto:${normalizarTexto(conteudo)}`);

  const { noticia, nova } = registrarConsulta({ hash, titulo: tituloFinal, conteudo, link });
  res.status(nova ? 201 : 200).json({ ...noticia, ja_consultada_antes: !nova });
});

// ---------- CONSULTAR NOTÍCIAS JÁ CADASTRADAS ----------
// GET /noticias?q=vacina&pagina=1&limite=20   (q busca em título, conteúdo e link)
app.get('/noticias', (req, res) => {
  const { limite, pagina, offset } = paginar(req.query);
  const busca = texto(req.query.q);
  const filtro = busca ? 'WHERE titulo LIKE ? OR conteudo LIKE ? OR link LIKE ?' : '';
  const params = busca ? Array(3).fill(`%${busca}%`) : [];

  const itens = db
    .prepare(`SELECT * FROM noticias ${filtro} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limite, offset);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM noticias ${filtro}`).get(...params);
  res.json({ pagina, limite, total, itens });
});

app.get('/noticias/:id', (req, res) => {
  const noticia = q.porId.get(req.params.id);
  if (!noticia) return res.status(404).json({ erro: 'Notícia não encontrada.' });
  res.json(noticia);
});

// ---------- HISTÓRICO DE CONSULTAS ----------
// GET /historico?pagina=1&limite=20&noticia_id=3
app.get('/historico', (req, res) => {
  const { limite, pagina, offset } = paginar(req.query);
  const filtro = req.query.noticia_id ? 'WHERE c.noticia_id = ?' : '';
  const params = req.query.noticia_id ? [req.query.noticia_id] : [];

  const itens = db
    .prepare(
      `SELECT c.id, c.criado_em AS consultado_em, n.id AS noticia_id, n.titulo, n.link, n.conteudo, n.veredito
       FROM consultas c JOIN noticias n ON n.id = c.noticia_id
       ${filtro} ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limite, offset);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM consultas c ${filtro}`).get(...params);
  res.json({ pagina, limite, total, itens });
});

// ---------- RESULTADO DA CHECAGEM (usado pela integração com a API) ----------
app.patch('/noticias/:id/resultado', (req, res) => {
  const noticia = q.porId.get(req.params.id);
  if (!noticia) return res.status(404).json({ erro: 'Notícia não encontrada.' });

  const { veredito, fonte_checagem = null, url_checagem = null } = req.body || {};
  if (!VEREDITOS.includes(veredito)) {
    return res.status(400).json({ erro: `"veredito" deve ser um de: ${VEREDITOS.join(', ')}.` });
  }
  db.prepare('UPDATE noticias SET veredito = ?, fonte_checagem = ?, url_checagem = ? WHERE id = ?').run(
    veredito, fonte_checagem, url_checagem, noticia.id
  );
  res.json(q.porId.get(noticia.id));
});

// ---------- DENÚNCIA ----------
app.post('/noticias/:id/denunciar', (req, res) => {
  const noticia = q.porId.get(req.params.id);
  if (!noticia) return res.status(404).json({ erro: 'Notícia não encontrada.' });

  const motivo = texto(req.body?.motivo).slice(0, 500);
  db.transaction(() => {
    q.inserirDenuncia.run(noticia.id, motivo || null);
    q.atualizarDenuncia.run(noticia.id);
  })();
  res.status(201).json(q.porId.get(noticia.id));
});

// ---------- RANKING ----------
// GET /ranking?limite=10&dias=7
app.get('/ranking', (req, res) => {
  const { limite } = paginar(req.query, 10, 50);
  const dias = parseInt(req.query.dias, 10);
  const filtroData = dias > 0 ? `AND d.criado_em >= datetime('now', ?)` : '';
  const params = dias > 0 ? [`-${dias} days`] : [];

  const itens = db
    .prepare(
      `SELECT n.id, n.titulo, n.link, n.veredito, n.total_consultas, COUNT(d.id) AS denuncias
       FROM noticias n JOIN denuncias d ON d.noticia_id = n.id ${filtroData}
       GROUP BY n.id
       ORDER BY denuncias DESC, n.total_consultas DESC
       LIMIT ?`
    )
    .all(...params, limite);
  res.json({ periodo_dias: dias > 0 ? dias : null, itens: itens.map((it, i) => ({ posicao: i + 1, ...it })) });
});

app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno.' });
});

module.exports = app;
