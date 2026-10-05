/* Comunicação com o backend (Netlify Function) e fallback estático. */

const TOKEN_KEY = 'adm_tok';

/** A senha nunca é guardada: só um token temporário (4h) emitido pelo servidor. */
export const session = {
    get token() { try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch { return '' } },
    set token(v) { try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY) } catch { } },
};

const authHeaders = () => ({ Authorization: 'Bearer ' + session.token });
const fail = async (r, fallback) => { throw new Error((await r.json().catch(() => ({}))).error || fallback) };

/** Carrega projetos e vídeos: da API (se já houver dados salvos) ou do data/projects.json inicial. */
export async function loadProjects() {
    const seed = async () => await (await fetch('data/projects.json', { cache: 'no-store' })).json();
    try {
        const r = await fetch('/api/projects', { cache: 'no-store' });
        if (r.ok) {
            const d = await r.json(), s = Array.isArray(d.projects) && Array.isArray(d.videos) ? null : await seed();
            return {
                projects: Array.isArray(d.projects) ? d.projects : s.projects,
                videos: Array.isArray(d.videos) ? d.videos : (s.videos || []),
                api: true,
            };
        }
    } catch { }
    const s = await seed();
    return { projects: s.projects, videos: s.videos || [], api: false };
}

export async function login(password) {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (r.status === 401) return { ok: false, msg: 'Senha incorreta' };
    if (r.status === 429) return { ok: false, msg: 'Muitas tentativas. Aguarde alguns minutos.' };
    if (!r.ok) return { ok: false, msg: 'Servidor indisponível. Verifique a função e a variável ADMIN_PASSWORD no Netlify.' };
    return { ok: true, token: (await r.json()).token };
}

/** Confere se o token guardado ainda é válido. */
export async function checkSession() {
    try { return (await fetch('/api/session', { headers: authHeaders() })).ok } catch { return false }
}

export async function saveProjects(projects, videos) {
    const r = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ projects, videos }),
    });
    if (!r.ok) await fail(r, 'Falha ao salvar');
}

async function upload(route, blob, type, errMsg) {
    const r = await fetch(route, { method: 'POST', headers: { 'Content-Type': type, ...authHeaders() }, body: blob });
    if (!r.ok) await fail(r, errMsg);
    return (await r.json()).url;
}

/** Envia uma imagem (Blob JPEG) e devolve a URL pública. */
export const uploadImage = blob => upload('/api/upload', blob, blob.type || 'image/jpeg', 'Falha ao enviar imagem');

/** Envia um vídeo curto (até 5 MB) e devolve a URL pública. */
export const uploadVideo = file => upload('/api/upload-video', file, file.type, 'Falha ao enviar vídeo');
