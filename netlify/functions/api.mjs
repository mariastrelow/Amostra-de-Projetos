/*
 * API do site (Netlify Functions v2 + Netlify Blobs).
 *
 *  GET  /api/projects        -> lista pública de projetos
 *  PUT  /api/projects        -> salva a lista (admin)
 *  POST /api/auth            -> troca a senha por um token de sessão (4h) — com limite de tentativas
 *  GET  /api/session         -> confere se o token ainda vale (admin)
 *  POST /api/upload          -> envia uma imagem (admin)
 *  POST /api/upload-video    -> envia um vídeo curto (admin, até 5 MB)
 *  GET  /api/images/:id      -> serve uma imagem
 *  GET  /api/videos/:id      -> serve um vídeo (com suporte a Range, necessário no iPhone)
 *
 * A senha vem da variável de ambiente ADMIN_PASSWORD (Site settings > Environment variables).
 */
import { getStore } from '@netlify/blobs';
import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export const config = { path: '/api/*' };

const MAX_IMAGE = 4 * 1024 * 1024; // 4 MB
const MAX_PROJECTS = 100;
const TYPES = ['site', 'instagram', 'outro', 'semlink'];
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const IMG_PREFIX = '/api/images/';
const MAX_VIDEO = 5 * 1024 * 1024; // limite de payload das Netlify Functions ~6 MB
const VID_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const VID_PREFIX = '/api/videos/';
const YT = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{11}/i;
const DIRECT_VIDEO = /^https?:\/\/\S+\.(mp4|webm|mov)(\?\S*)?$/i;
const SESSION_MS = 4 * 3600e3, MAX_FAILS = 5, LOCK_MS = 15 * 60e3;

const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const sha = s => createHash('sha256').update(String(s)).digest();
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y) };

// Token de sessão assinado (HMAC) com chave derivada da senha: trocar a senha invalida todos os tokens.
const sign = p => createHmac('sha256', createHmac('sha256', 'afya-session').update(process.env.ADMIN_PASSWORD).digest()).update(p).digest('base64url');
const newToken = () => { const p = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS })).toString('base64url'); return `${p}.${sign(p)}` };
function validToken(t) {
    const [p, sig] = String(t).split('.');
    if (!p || !sig || !same(sig, sign(p))) return false;
    try { return JSON.parse(Buffer.from(p, 'base64url')).exp > Date.now() } catch { return false }
}

function isAdmin(req) {
    if (!process.env.ADMIN_PASSWORD) return null; // não configurada
    return validToken((req.headers.get('authorization') || '').replace(/^Bearer /i, ''));
}

const str = (v, max) => String(v ?? '').slice(0, max);

const okId = (s, prefix) => s.startsWith(prefix) && /^[\w.-]+$/.test(s.slice(prefix.length));
const okVideo = s => okId(s, VID_PREFIX) || YT.test(s) || DIRECT_VIDEO.test(s);
const okMedia = s => okId(s, IMG_PREFIX) || /^assets\/img\/[\w.-]+$/.test(s) || okVideo(s);

function cleanVideo(v) {
    if (!v || typeof v !== 'object') throw new Error('Vídeo inválido');
    const src = str(v.src, 500).trim(), title = str(v.title, 120).trim();
    if (!title) throw new Error('Vídeo sem título');
    if (!okVideo(src)) throw new Error(`Link de vídeo inválido em "${title}"`);
    return { id: /^[\w-]{1,40}$/.test(v.id) ? v.id : 'v' + Date.now(), title, desc: str(v.desc, 1000).trim(), src };
}

function cleanProject(p) {
    if (!p || typeof p !== 'object') throw new Error('Projeto inválido');
    const type = TYPES.includes(p.type) ? p.type : 'site';
    const url = str(p.url, 500).trim();
    if (type !== 'semlink' && !/^https?:\/\//i.test(url)) throw new Error(`Link inválido em "${str(p.name, 60)}"`);
    const imgs = (Array.isArray(p.imgs) ? p.imgs : []).slice(0, 30).map(s => String(s)).filter(okMedia);
    const name = str(p.name, 120).trim();
    if (!name) throw new Error('Projeto sem nome');
    return {
        id: /^[\w-]{1,40}$/.test(p.id) ? p.id : 'p' + Date.now(),
        name, type, url: type === 'semlink' ? '' : url,
        text: str(p.text, 400).trim(), desc: str(p.desc, 5000).trim(), imgs,
    };
}

const mediaOf = (projects, videos) => [...projects.flatMap(p => p.imgs), ...videos.map(v => v.src)];
const idsOf = (list, prefix) => list.filter(s => s.startsWith(prefix)).map(s => s.slice(prefix.length));

export default async (req, context) => {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    const site = getStore('site');
    const images = getStore('images');
    const videos = getStore('videos');

    // ---------- público ----------
    if (req.method === 'GET' && path === '/api/projects') {
        const data = await site.get('projects', { type: 'json' });
        return json({ projects: data?.projects ?? null, videos: data?.videos ?? null });
    }

    if (req.method === 'GET' && path.startsWith(IMG_PREFIX)) {
        const id = decodeURIComponent(path.slice(IMG_PREFIX.length));
        if (!/^[\w.-]+$/.test(id)) return new Response('Not found', { status: 404 });
        const r = await images.getWithMetadata(id, { type: 'arrayBuffer' });
        if (!r) return new Response('Not found', { status: 404 });
        return new Response(r.data, {
            headers: { 'Content-Type': r.metadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
        });
    }

    if (req.method === 'GET' && path.startsWith(VID_PREFIX)) {
        const id = decodeURIComponent(path.slice(VID_PREFIX.length));
        if (!/^[\w.-]+$/.test(id)) return new Response('Not found', { status: 404 });
        const r = await videos.getWithMetadata(id, { type: 'arrayBuffer' });
        if (!r) return new Response('Not found', { status: 404 });
        const buf = Buffer.from(r.data), size = buf.length;
        const h = { 'Content-Type': r.metadata?.contentType || 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' };
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
        if (!m) return new Response(buf, { headers: { ...h, 'Content-Length': String(size) } });
        let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
        let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
        if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        return new Response(buf.subarray(start, end + 1), { status: 206, headers: { ...h, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
    }

    if (!process.env.ADMIN_PASSWORD) return json({ error: 'ADMIN_PASSWORD não configurada no Netlify' }, 500);

    // ---------- login (com limite de tentativas por IP) ----------
    if (req.method === 'POST' && path === '/api/auth') {
        const guard = getStore({ name: 'security', consistency: 'strong' });
        const k = createHash('sha256').update(context?.ip || req.headers.get('x-nf-client-connection-ip') || 'x').digest('hex').slice(0, 32);
        const g = (await guard.get(k, { type: 'json' }).catch(() => null)) || { n: 0, t: 0 };
        const recent = Date.now() - g.t < LOCK_MS;
        if (recent && g.n >= MAX_FAILS) return json({ error: 'Muitas tentativas. Tente de novo em alguns minutos.' }, 429);
        let body; try { body = await req.json() } catch { body = {} }
        if (same(sha(body?.password ?? '').toString('hex'), sha(process.env.ADMIN_PASSWORD).toString('hex'))) {
            if (g.n) await guard.delete(k).catch(() => { });
            return json({ token: newToken() });
        }
        await guard.setJSON(k, { n: (recent ? g.n : 0) + 1, t: Date.now() });
        await new Promise(r => setTimeout(r, 600)); // atrasa ataques de tentativa e erro
        return json({ error: 'Senha incorreta' }, 401);
    }

    // ---------- admin (exige token) ----------
    if (!isAdmin(req)) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);

    if (req.method === 'GET' && path === '/api/session') return json({ ok: true });

    if (req.method === 'POST' && path === '/api/upload-video') {
        const type = (req.headers.get('content-type') || '').split(';')[0].trim();
        const ext = VID_TYPES[type];
        if (!ext) return json({ error: 'Formato de vídeo não suportado (use MP4 ou WebM)' }, 415);
        const buf = await req.arrayBuffer();
        if (!buf.byteLength) return json({ error: 'Vídeo vazio' }, 400);
        if (buf.byteLength > MAX_VIDEO) return json({ error: 'Vídeo maior que 5 MB. Use um link do YouTube.' }, 413);
        const id = `${randomUUID()}.${ext}`;
        await videos.set(id, buf, { metadata: { contentType: type } });
        return json({ url: VID_PREFIX + id });
    }

    if (req.method === 'POST' && path === '/api/upload') {
        const type = (req.headers.get('content-type') || '').split(';')[0].trim();
        const ext = IMG_TYPES[type];
        if (!ext) return json({ error: 'Formato de imagem não suportado' }, 415);
        const buf = await req.arrayBuffer();
        if (!buf.byteLength) return json({ error: 'Imagem vazia' }, 400);
        if (buf.byteLength > MAX_IMAGE) return json({ error: 'Imagem maior que 4 MB' }, 413);
        const id = `${randomUUID()}.${ext}`;
        await images.set(id, buf, { metadata: { contentType: type } });
        return json({ url: IMG_PREFIX + id });
    }

    if (req.method === 'PUT' && path === '/api/projects') {
        let body;
        try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
        if (!Array.isArray(body?.projects) || body.projects.length > MAX_PROJECTS) return json({ error: 'Lista de projetos inválida' }, 400);
        if (body.videos !== undefined && (!Array.isArray(body.videos) || body.videos.length > MAX_PROJECTS)) return json({ error: 'Lista de vídeos inválida' }, 400);
        const before = await site.get('projects', { type: 'json' });
        let projects, vids;
        try {
            projects = body.projects.map(cleanProject);
            vids = body.videos ? body.videos.map(cleanVideo) : (before?.videos ?? []);
        } catch (e) { return json({ error: e.message }, 400) }

        await site.setJSON('projects', { projects, videos: vids, updatedAt: new Date().toISOString() });

        // apaga arquivos que deixaram de ser usados
        const now = mediaOf(projects, vids), old = mediaOf(before?.projects ?? [], before?.videos ?? []);
        for (const [prefix, store] of [[IMG_PREFIX, images], [VID_PREFIX, videos]]) {
            const keep = new Set(idsOf(now, prefix));
            await Promise.all(idsOf(old, prefix).filter(id => !keep.has(id)).map(id => store.delete(id).catch(() => { })));
        }
        return json({ ok: true, projects, videos: vids });
    }

    return json({ error: 'Rota não encontrada' }, 404);
};
