# Checa Aí — Back-end

Back-end da plataforma **Checa Aí**, projeto de verificação e combate às fake news. O usuário cola uma notícia ou link, o sistema registra a consulta, mostra se ela já foi checada e guarda o histórico e as denúncias.

Este módulo é responsável por **receber, armazenar e disponibilizar os dados**: cadastro das notícias, histórico das consultas e ranking das fake news mais denunciadas.

## O que o back-end faz

- Cadastra as notícias enviadas, registrando **identificador, título, conteúdo, link e data**.
- Evita duplicidade: a mesma notícia (mesmo texto ou mesmo link, mesmo com `utm_*`/`fbclid` ou barra no final) vira um único registro, e cada envio conta como uma nova consulta.
- Mantém o **histórico de consultas**, da mais recente para a mais antiga.
- Permite **consultar as notícias já cadastradas**, com busca por título, conteúdo ou link.
- Registra **denúncias** e monta o **ranking** das mais denunciadas.
- Guarda o **resultado da checagem** (veredito, fonte, link), preenchido pela integração com a Google Fact Check Tools.

## Tecnologias

- [Node.js](https://nodejs.org/) 18 ou superior
- [Express](https://expressjs.com/) (API REST)
- [SQLite](https://www.sqlite.org/) via `better-sqlite3` (banco em arquivo, sem instalar servidor)
- `cors` (liberar acesso do front-end)

## Instalação e execução

```bash
npm install
npm start
```

O servidor sobe em `http://localhost:3000` (para mudar a porta: `PORT=4000 npm start`).
O banco é criado automaticamente no arquivo `checa-ai.db`. Para começar do zero, pare o servidor e apague esse arquivo.

Modo desenvolvimento (reinicia ao salvar): `npm run dev`.

### Testes automáticos

```bash
npm test
```

Roda 7 testes que cobrem cadastro, duplicidade, validações, consulta, histórico, denúncia e ranking, usando um banco em memória (não mexe no seu `checa-ai.db`).

## Estrutura

```
src/
  server.js   # inicia o servidor
  app.js      # rotas da API
  db.js       # conexão e criação das tabelas
  utils.js    # normalização de links/textos, hash e paginação
tests/
  api.test.js # testes automáticos
```

## Modelo de dados

**noticias**

| Campo | Descrição |
|---|---|
| `id` | Identificador da notícia |
| `titulo` | Título (se não for enviado, é gerado a partir do texto ou do domínio do link) |
| `conteudo` | Texto da notícia (opcional se houver link) |
| `link` | URL da notícia (opcional se houver conteúdo) |
| `criado_em` | Data do cadastro |
| `veredito`, `fonte_checagem`, `url_checagem` | Resultado da checagem (preenchidos pela integração com a API) |
| `total_consultas`, `total_denuncias`, `ultima_consulta_em` | Contadores e data da última consulta |

**consultas**: `id`, `noticia_id`, `criado_em` (uma linha para cada vez que alguém consulta).
**denuncias**: `id`, `noticia_id`, `motivo`, `criado_em`.

## Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| POST | `/noticias` | Cadastra a notícia (ou reaproveita a existente) e registra a consulta |
| GET | `/noticias` | Lista as notícias cadastradas. Query: `q`, `pagina`, `limite` |
| GET | `/noticias/:id` | Detalhe de uma notícia |
| GET | `/historico` | Histórico de consultas. Query: `noticia_id`, `pagina`, `limite` |
| POST | `/noticias/:id/denunciar` | Registra uma denúncia |
| GET | `/ranking` | Notícias mais denunciadas. Query: `limite`, `dias` |
| PATCH | `/noticias/:id/resultado` | Salva o resultado da checagem (usado pela integração com a API) |
| GET | `/health` | Verifica se o servidor está no ar |

### Exemplos

**Cadastrar / consultar uma notícia** — `POST /noticias`

É obrigatório enviar `conteudo` e/ou `link`. O `titulo` é opcional.

```json
{
  "titulo": "Vacina causa X",
  "conteudo": "Dizem que a vacina causa X, compartilhe!",
  "link": "https://site.com/materia"
}
```

Resposta (`201` se for nova, `200` se já existia):

```json
{
  "id": 1,
  "titulo": "Vacina causa X",
  "conteudo": "Dizem que a vacina causa X, compartilhe!",
  "link": "https://site.com/materia",
  "veredito": null,
  "fonte_checagem": null,
  "url_checagem": null,
  "total_consultas": 1,
  "total_denuncias": 0,
  "criado_em": "2026-10-31 18:58:48",
  "ultima_consulta_em": "2026-10-31 18:58:48",
  "ja_consultada_antes": false
}
```

Se o usuário colar só uma URL no campo `conteudo`, ela é tratada como `link`.

**Buscar notícias cadastradas** — `GET /noticias?q=vacina&pagina=1&limite=20`

```json
{ "pagina": 1, "limite": 20, "total": 1, "itens": [ { "id": 1, "titulo": "Vacina causa X", "...": "..." } ] }
```

**Histórico** — `GET /historico?pagina=1&limite=20` (ou `&noticia_id=1` para uma notícia só)

```json
{
  "pagina": 1, "limite": 20, "total": 2,
  "itens": [
    { "id": 2, "consultado_em": "2026-10-31 19:02:10", "noticia_id": 1, "titulo": "Vacina causa X", "link": "https://site.com/materia", "conteudo": "...", "veredito": "falso" }
  ]
}
```

**Denunciar** — `POST /noticias/1/denunciar`

```json
{ "motivo": "boato" }
```

**Ranking** — `GET /ranking?limite=10&dias=7` (`dias` é opcional; sem ele conta todo o período)

```json
{ "periodo_dias": 7, "itens": [ { "posicao": 1, "id": 1, "titulo": "Vacina causa X", "link": "...", "veredito": "falso", "total_consultas": 2, "denuncias": 3 } ] }
```

**Salvar resultado da checagem** — `PATCH /noticias/1/resultado`

Vereditos aceitos: `falso`, `verdadeiro`, `enganoso`, `sem_checagem`.

```json
{ "veredito": "falso", "fonte_checagem": "Lupa", "url_checagem": "https://lupa.news/..." }
```

### Erros

| Código | Quando |
|---|---|
| 400 | Dados inválidos (sem conteúdo/link, link inválido, texto curto demais, veredito desconhecido, JSON malformado) |
| 404 | Notícia ou rota não encontrada |
| 500 | Erro interno |

Todas as respostas de erro vêm no formato `{ "erro": "mensagem" }`.

## Guia rápido para o front-end

Quem for fazer o site só precisa de duas coisas: a **URL base** do back-end e as rotas acima. O CORS já está liberado, então o front pode rodar em qualquer porta (ou abrir o HTML direto).

**1. Rodar o back-end na sua máquina** (precisa do Node 18+): `npm install && npm start`. A URL base é `http://localhost:3000`. Se o back-end for publicado online, é só trocar a constante `API`.

**2. Exemplos prontos (JavaScript puro, funciona em React/Vue também):**

```js
const API = 'http://localhost:3000';

// Usuário colou uma notícia ou link na busca
async function consultar(titulo, conteudo, link) {
  const r = await fetch(`${API}/noticias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo, conteudo, link }), // basta enviar conteudo OU link
  });
  const dados = await r.json();
  if (!r.ok) throw new Error(dados.erro); // erros vêm como { "erro": "mensagem" }
  return dados;
}

// Tela de histórico
const historico = await (await fetch(`${API}/historico?pagina=1&limite=20`)).json();

// Tela de ranking
const ranking = await (await fetch(`${API}/ranking?limite=10`)).json();

// Botão "denunciar"
await fetch(`${API}/noticias/${id}/denunciar`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ motivo: 'boato' }),
});
```

**3. O que mostrar na tela de resultado** (com base na resposta do `POST /noticias`):

| Situação | O que exibir |
|---|---|
| `veredito` é `null` | "Ainda não foi checada" (a checagem é preenchida pela integração com a API, então a notícia pode aparecer sem veredito) |
| `veredito` é `falso`, `enganoso` ou `verdadeiro` | O veredito, a `fonte_checagem` e um link para `url_checagem` |
| `veredito` é `sem_checagem` | "Nenhuma agência checou esta notícia ainda" |
| `ja_consultada_antes` é `true` | Pode avisar "outras pessoas já consultaram esta notícia" (`total_consultas`) |

**4. Dicas**
- As datas vêm no formato `"2026-10-31 18:58:48"` (horário UTC).
- As listas (`/noticias`, `/historico`) trazem `total`, `pagina` e `limite`, o que dá pra usar na paginação.
- Para testar o front sem esperar a integração, dá pra simular um resultado com `PATCH /noticias/1/resultado` (veja o exemplo acima).

## Como o back-end se conecta ao resto do projeto

1. O **front-end** envia `POST /noticias` quando o usuário cola uma notícia ou link e usa o `id` retornado. Se `ja_consultada_antes` for `true` e houver `veredito`, já dá para exibir o resultado.
2. A **integração com a API** (Google Fact Check Tools), quando `veredito` é `null`, consulta a checagem e salva com `PATCH /noticias/:id/resultado`.
3. As páginas de **histórico** e **ranking** do front usam `GET /historico` e `GET /ranking`.

## Equipe

| Parte | Responsáveis |
|---|---|
| Back-end (cadastro, histórico, ranking) | Lino e Murilo |
| API (Google Fact Check Tools) | Patrick e colega |
| Chatbot | Júlia |
| Front-end | Yuri e João Vitor |
| Design | Fernanda |
| README | Armando e Otávio |
