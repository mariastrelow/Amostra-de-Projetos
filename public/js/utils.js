export const $ = s => document.querySelector(s);

export const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Reduz a imagem para no máx. 900px de largura e devolve um Blob JPEG. */
export function shrink(file, maxW = 900, quality = .75) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, maxW / img.width), c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(img.src);
            c.toBlob(b => b ? resolve(b) : reject(new Error('Imagem inválida')), 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
        img.src = URL.createObjectURL(file);
    });
}

/** Tipo de mídia: 'yt' (YouTube), 'video' (arquivo/link direto) ou 'img'. */
const YT = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i;
export const ytId = s => (YT.exec(s) || [])[1] || '';
export const kind = s => ytId(s) ? 'yt' : (/^\/api\/videos\//.test(s) || /\.(mp4|webm|mov)(\?.*)?$/i.test(s)) ? 'video' : 'img';
export const thumbOf = s => ytId(s) ? `https://i.ytimg.com/vi/${ytId(s)}/hqdefault.jpg` : s;
