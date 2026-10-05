/* Modo administrador: login, formulários, upload de fotos/vídeos, exclusão. */
import { $, esc, shrink, kind, thumbOf } from './utils.js';
import { dlg, closeDlg } from './ui.js';
import { state } from './state.js';
import { session, login, checkSession, saveProjects, uploadImage, uploadVideo } from './api.js';

const MAX_VIDEO = 5 * 1024 * 1024;
let render = () => { };
let fImgs = [], fId = null, vId = null, vSrc = '';

export function initAdmin(renderFn) {
    render = renderFn;
    $('#adbtn').onclick = openLogin;
    $('#bnew').onclick = () => openForm(null);
    $('#bvid').onclick = () => openVideoForm(null);
    $('#bout').onclick = logout;
}

/** Se já havia um token na sessão, confirma com o servidor. */
export async function restoreSession() {
    if (!session.token || !state.api) return;
    state.admin = await checkSession();
    if (!state.admin) session.token = '';
}

function logout() { state.admin = false; session.token = ''; render() }

function openLogin() {
    if (state.admin) return;
    dlg('<h3>Acesso do administrador</h3><input id="pw" type="password" placeholder="Senha" autocomplete="current-password"><div class="msg" id="msg"></div><div class="adc"><button class="btn" id="go">Entrar</button><button class="btn o" id="cx">Cancelar</button></div>');
    const go = async () => {
        if (!state.api) { $('#msg').textContent = 'O servidor não respondeu. Rode com "netlify dev" ou publique no Netlify.'; return }
        $('#msg').textContent = 'Verificando...';
        const r = await login($('#pw').value);
        if (!r.ok) { $('#msg').textContent = r.msg; return }
        session.token = r.token; state.admin = true; closeDlg(); render();
    };
    $('#go').onclick = go; $('#pw').onkeydown = e => { if (e.key === 'Enter') go() };
    $('#cx').onclick = closeDlg; $('#pw').focus();
}

const snapshot = () => ({ projects: state.projects, videos: state.videos });

/** Salva as listas atuais; se falhar, volta ao estado anterior. */
async function persist(snap, msgEl) {
    try { await saveProjects(state.projects, state.videos); return true }
    catch (e) {
        state.projects = snap.projects; state.videos = snap.videos; render();
        if (/senha|autoriz|sessão/i.test(e.message)) { state.admin = false; session.token = ''; render() }
        if (msgEl) msgEl.textContent = e.message; else alert(e.message);
        return false;
    }
}

function confirmDelete(name, apply) {
    dlg(`<h3>Excluir "${esc(name)}"?</h3><div class="msg" id="msg"></div><div class="adc"><button class="btn" id="y">Excluir</button><button class="btn o" id="n">Cancelar</button></div>`);
    $('#n').onclick = closeDlg;
    $('#y').onclick = async () => {
        const snap = snapshot(); apply(); render();
        if (await persist(snap, $('#msg'))) closeDlg();
    };
}
export const askDelete = p => confirmDelete(p.name, () => { state.projects = state.projects.filter(x => x.id !== p.id) });
export const askDeleteVideo = v => confirmDelete(v.title, () => { state.videos = state.videos.filter(x => x.id !== v.id) });

/** Envia os arquivos escolhidos (imagem ou vídeo) e devolve as URLs, na ordem. */
async function sendFiles(files, msg) {
    const urls = [];
    for (let n = 0; n < files.length; n++) {
        const f = files[n], isVid = f.type.startsWith('video/');
        if (isVid && f.size > MAX_VIDEO) throw new Error(`"${f.name}" passa de 5 MB. Suba o vídeo no YouTube e cole o link.`);
        msg.textContent = `Enviando ${isVid ? 'vídeo' : 'foto'} ${n + 1} de ${files.length}...`;
        urls.push(isVid ? await uploadVideo(f) : await uploadImage(await shrink(f)));
    }
    return urls;
}

/* ---------- projetos ---------- */
function renderGallery() {
    $('#gal').innerHTML = fImgs.map((s, k) => `<div>${kind(s) === 'video' ? '<span class="vt">▶ vídeo</span>' : `<img src="${esc(thumbOf(s))}" alt="">`}${k ? `<button class="mv" data-m="${k}" title="Mover para antes">‹</button>` : ''}<button data-k="${k}">×</button></div>`).join('');
    $('#gal').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { fImgs.splice(+b.dataset.k, 1); renderGallery() });
    $('#gal').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const k = +b.dataset.m;[fImgs[k - 1], fImgs[k]] = [fImgs[k], fImgs[k - 1]]; renderGallery() });
}

export function openForm(id) {
    fId = id;
    const p = id ? state.projects.find(x => x.id === id) : { name: '', type: 'site', url: '', text: '', desc: '', imgs: [] };
    fImgs = (p.imgs || []).slice();
    dlg(`<h3>${id ? 'Editar projeto' : 'Novo projeto'}</h3>
<label>Nome</label><input id="f1" value="${esc(p.name)}">
<label>Tipo</label><select id="f2"><option value="site">Site (mostra só o site)</option><option value="instagram">Instagram</option><option value="outro">Outro link</option><option value="semlink">Sem link (só fotos e explicação)</option></select>
<div id="fu"><label>Link (https://...)</label><input id="f3" value="${esc(p.url)}"></div>
<label>Resumo (aparece no card)</label><textarea id="f4" rows="2">${esc(p.text)}</textarea>
<label>Explicação detalhada (aparece ao abrir)</label><textarea id="f6" rows="6">${esc(p.desc)}</textarea>
<label>Fotos e vídeos (carrossel) — use ‹ para mudar a ordem</label><div class="gal" id="gal"></div>
<input id="f5" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple>
<label>Ou cole o link de um vídeo (YouTube ou .mp4)</label>
<div class="row"><input id="f7" placeholder="https://youtu.be/..."><button class="btn s" id="av" type="button">Adicionar</button></div>
<div class="msg" id="msg"></div>
<div class="adc"><button class="btn" id="sv">Salvar</button><button class="btn o" id="cx">Cancelar</button></div>`);
    $('#f2').value = p.type;
    const toggle = () => { $('#fu').style.display = $('#f2').value === 'semlink' ? 'none' : '' };
    $('#f2').onchange = toggle; toggle(); renderGallery();
    $('#av').onclick = () => {
        const v = $('#f7').value.trim();
        if (!/^https?:\/\//i.test(v) || kind(v) === 'img') { $('#msg').textContent = 'Use um link do YouTube ou de um arquivo .mp4/.webm'; return }
        fImgs.push(v); $('#f7').value = ''; $('#msg').textContent = ''; renderGallery();
    };
    $('#cx').onclick = closeDlg; $('#sv').onclick = save;
}

async function save() {
    const msg = $('#msg'), btn = $('#sv');
    const name = $('#f1').value.trim(), url = $('#f3').value.trim(), type = $('#f2').value;
    const noLink = type === 'semlink';
    if (!name) { msg.textContent = 'Informe o nome do projeto'; return }
    if (!noLink && !/^https?:\/\//.test(url)) { msg.textContent = 'Informe um link começando com https://'; return }

    btn.disabled = true;
    const snap = snapshot(); let imgs;
    try { imgs = [...fImgs, ...await sendFiles([...$('#f5').files], msg)] }
    catch (e) { msg.textContent = e.message; btn.disabled = false; return }

    msg.textContent = 'Salvando...';
    const o = { id: fId || 'p' + Date.now(), name, url: noLink ? '' : url, type, text: $('#f4').value.trim(), desc: $('#f6').value.trim(), imgs };
    state.projects = fId ? snap.projects.map(x => x.id === fId ? o : x) : [...snap.projects, o];
    render();
    if (await persist(snap, msg)) closeDlg(); else btn.disabled = false;
}

/* ---------- vídeos (seção "Conheça mais sobre nosso curso") ---------- */
export function openVideoForm(id) {
    vId = id;
    const v = id ? state.videos.find(x => x.id === id) : { title: '', desc: '', src: '' };
    vSrc = v.src;
    const sent = vSrc.startsWith('/api/videos/');
    dlg(`<h3>${id ? 'Editar vídeo' : 'Novo vídeo'}</h3>
<label>Título</label><input id="v1" value="${esc(v.title)}">
<label>Descrição (opcional)</label><textarea id="v2" rows="3">${esc(v.desc)}</textarea>
<label>Link do vídeo (YouTube ou .mp4)</label><input id="v3" value="${sent ? '' : esc(vSrc)}" placeholder="https://youtu.be/...">
<label>Ou envie um arquivo (MP4/WebM, até 5 MB)${sent ? ' — já há um vídeo enviado; escolher outro substitui' : ''}</label><input id="v4" type="file" accept="video/mp4,video/webm,video/quicktime">
<div class="msg" id="msg"></div>
<div class="adc"><button class="btn" id="sv">Salvar</button><button class="btn o" id="cx">Cancelar</button></div>`);
    $('#cx').onclick = closeDlg; $('#sv').onclick = saveVideo;
}

async function saveVideo() {
    const msg = $('#msg'), btn = $('#sv');
    const title = $('#v1').value.trim(), link = $('#v3').value.trim(), file = $('#v4').files[0];
    if (!title) { msg.textContent = 'Informe o título do vídeo'; return }
    if (link && (!/^https?:\/\//i.test(link) || kind(link) === 'img')) { msg.textContent = 'Use um link do YouTube ou de um arquivo .mp4/.webm'; return }

    btn.disabled = true;
    const snap = snapshot(); let src = link || vSrc;
    try { if (file) src = (await sendFiles([file], msg))[0] }
    catch (e) { msg.textContent = e.message; btn.disabled = false; return }
    if (!src) { msg.textContent = 'Informe um link ou envie um arquivo'; btn.disabled = false; return }

    msg.textContent = 'Salvando...';
    const o = { id: vId || 'v' + Date.now(), title, desc: $('#v2').value.trim(), src };
    state.videos = vId ? snap.videos.map(x => x.id === vId ? o : x) : [...snap.videos, o];
    render();
    if (await persist(snap, msg)) closeDlg(); else btn.disabled = false;
}
