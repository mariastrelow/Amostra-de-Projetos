# Open Day Afya — Mostra de Projetos

## Estrutura

```
public/                  ← o site (é isso que o Netlify publica)
  index.html
  css/   base.css · cards.css · modal.css · responsive.css
  js/    main.js · api.js · ui.js · admin.js · state.js · utils.js
  data/projects.json     ← projetos iniciais (usados até alguém salvar algo pelo Admin)
  assets/img/            ← logo e fotos iniciais
netlify/functions/api.mjs ← backend (salva projetos e fotos)
netlify.toml · package.json
```

## Como funciona a persistência

- Os projetos e as fotos ficam no **Netlify Blobs** (armazenamento do próprio Netlify, grátis no plano básico).
- Ao entrar no Admin e salvar/editar/excluir, a alteração vale na hora para **todos os visitantes**.
- Enquanto ninguém salvar nada, o site mostra os projetos de `public/data/projects.json`.
- A senha **não fica no código**: ela é a variável de ambiente `ADMIN_PASSWORD`. O navegador nunca a guarda: após o login o servidor entrega um token temporário (4 h), e depois de 5 tentativas erradas o IP fica bloqueado por 15 min. Use uma senha longa (uma frase, não `afya2026`).
- **Vídeos**: em cada projeto (carrossel) e na seção "Conheça mais sobre nosso curso". Aceita link do YouTube, link direto de `.mp4`/`.webm` ou upload de arquivo de até **5 MB** (limite das Netlify Functions). Para vídeos maiores, suba no YouTube (pode ser "não listado") e cole o link.

## Publicar

1. Suba esta pasta para um repositório no GitHub.
2. No Netlify: **Add new site → Import an existing project** → escolha o repositório (não precisa mudar nada, o `netlify.toml` já configura).
3. **Site configuration → Environment variables** → crie `ADMIN_PASSWORD` com a senha que quiser (uma frase longa).
4. Faça um novo deploy (Deploys → Trigger deploy) para a variável valer.

> Arrastar a pasta no "Netlify Drop" **não** funciona: ele não instala as dependências da função. Use GitHub ou a CLI (`npm i -g netlify-cli` → `netlify deploy --prod`).

## Testar no computador

```
npm install
npm i -g netlify-cli
ADMIN_PASSWORD='minha-frase-de-teste' netlify dev
```
Abra o endereço que o comando mostrar (os módulos JS não funcionam abrindo o `index.html` direto com duplo clique).

## Mudar projetos iniciais "no código"
Edite `public/data/projects.json` (só vale se ainda não houve nenhum salvamento pelo Admin).
