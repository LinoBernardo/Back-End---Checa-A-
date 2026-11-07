const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'checa-ai.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS noticias (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,   -- identificador da notícia
    hash               TEXT NOT NULL UNIQUE,                -- evita cadastrar a mesma notícia duas vezes
    titulo             TEXT NOT NULL,
    conteudo           TEXT,                                -- texto da notícia (opcional se tiver link)
    link               TEXT,                                -- URL da notícia (opcional se tiver conteúdo)
    veredito           TEXT,                                -- preenchido pela integração com a API de checagem
    fonte_checagem     TEXT,
    url_checagem       TEXT,
    total_consultas    INTEGER NOT NULL DEFAULT 0,
    total_denuncias    INTEGER NOT NULL DEFAULT 0,
    criado_em          TEXT NOT NULL DEFAULT (datetime('now')),   -- data do cadastro
    ultima_consulta_em TEXT
  );

  CREATE TABLE IF NOT EXISTS consultas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    noticia_id INTEGER NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS denuncias (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    noticia_id INTEGER NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
    motivo     TEXT,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_consultas_noticia ON consultas(noticia_id);
  CREATE INDEX IF NOT EXISTS idx_denuncias_noticia ON denuncias(noticia_id);
  CREATE INDEX IF NOT EXISTS idx_denuncias_data ON denuncias(criado_em);
`);

module.exports = db;
