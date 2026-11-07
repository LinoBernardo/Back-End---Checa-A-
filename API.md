# Checa Aí — Back-end (rotas)

Rodar: `npm install && npm start` (porta 3000, ou `PORT=xxxx`). O banco SQLite é criado sozinho em `checa-ai.db`.

| Método | Rota | Para quê | Body / query |
|---|---|---|---|
| POST | `/noticias` | Front: usuário cola notícia/link. Cadastra (ou reaproveita) e registra a consulta | `{ "conteudo": "texto ou link" }` |
| GET | `/noticias` | Lista notícias cadastradas | `?pagina=1&limite=20` |
| GET | `/noticias/:id` | Detalhe de uma notícia | - |
| PATCH | `/noticias/:id/resultado` | Integração (Patrick): salva o resultado da checagem | `{ "veredito": "falso", "fonte_checagem": "Lupa", "url_checagem": "https://..." }` |
| POST | `/noticias/:id/denunciar` | Usuário denuncia a notícia | `{ "motivo": "opcional" }` |
| GET | `/historico` | Histórico de consultas (mais recentes primeiro) | `?pagina=1&limite=20&noticia_id=3` |
| GET | `/ranking` | Fake news mais denunciadas | `?limite=10&dias=7` (dias é opcional) |
| GET | `/health` | Teste de vida | - |

Vereditos aceitos: `falso`, `verdadeiro`, `enganoso`, `sem_checagem`.

## Fluxo sugerido com o resto da equipe
1. Front manda `POST /noticias` e recebe o `id` (e o `veredito`, se já foi checada: `ja_consultada_antes: true`).
2. Se `veredito` é `null`, quem faz a integração chama a Google Fact Check API e salva com `PATCH /noticias/:id/resultado`.
3. Front mostra o resultado e o botão "denunciar" (`POST /noticias/:id/denunciar`).
4. As páginas de histórico e ranking usam `GET /historico` e `GET /ranking`.

## Detalhes
- Mesma notícia = mesmo registro: o texto é normalizado (caixa/espaços) e links perdem `utm_*`, `fbclid` etc. antes de gerar o hash.
- CORS liberado para o front acessar de outra porta.
