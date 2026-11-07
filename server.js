const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Checa Aí back-end rodando em http://localhost:${PORT}`));
