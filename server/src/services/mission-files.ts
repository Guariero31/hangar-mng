import path from 'node:path';
import jwt from 'jsonwebtoken';
import yauzl from 'yauzl';
import { db } from '../db.js';
import { config } from '../config.js';
import { fail } from '../errors.js';

export type AssetKind = 'image' | 'briefing' | 'audio';
export interface AssetFile { path: string; mime: string; content: Buffer }
interface Asset { id: string; kind: AssetKind; name: string; entrypoint: string }
const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_EXPANDED = 80 * 1024 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const CHUNK_SIZE = 256 * 1024;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

export function safeAssetPath(name: string): string {
  if (!name || name.length > 240 || /[\\\x00-\x1f:#?%]/.test(name) || name.startsWith('/') || name.split('/').some((part) => part === '..' || part === '.' || !part)) {
    throw fail('VALIDATION', 'O pacote contém um caminho de arquivo inválido.');
  }
  return name;
}

function imageType(content: Buffer): { extension: string; mime: string } {
  if (content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: '.png', mime: 'image/png' };
  if (content[0] === 255 && content[1] === 216 && content[2] === 255) return { extension: '.jpg', mime: 'image/jpeg' };
  if (content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WEBP') return { extension: '.webp', mime: 'image/webp' };
  throw fail('VALIDATION', 'Envie uma imagem PNG, JPG ou WebP válida.');
}

function audioType(content: Buffer): { extension: string; mime: string } {
  if (content.toString('ascii', 0, 3) === 'ID3' || (content[0] === 0xff && (content[1] & 0xe0) === 0xe0)) return { extension: '.mp3', mime: 'audio/mpeg' };
  if (content.toString('ascii', 0, 4) === 'OggS') return { extension: '.ogg', mime: 'audio/ogg' };
  if (content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WAVE') return { extension: '.wav', mime: 'audio/wav' };
  throw fail('VALIDATION', 'Envie um áudio MP3, OGG ou WAV válido.');
}

export async function unpackBriefing(content: Buffer): Promise<{ files: AssetFile[]; entrypoint: string }> {
  if (content.length > MAX_UPLOAD) throw fail('VALIDATION', 'O ZIP deve ter até 25 MB.');
  const files = await new Promise<AssetFile[]>((resolve, reject) => {
    yauzl.fromBuffer(content, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (openError, zip) => {
      if (openError || !zip) return reject(fail('VALIDATION', 'Não foi possível ler o ZIP. Envie um pacote válido.'));
      const output: AssetFile[] = [];
      const paths = new Set<string>();
      let total = 0;
      let entries = 0;
      let stopped = false;
      const abort = (error: unknown) => { if (!stopped) { stopped = true; zip.close(); reject(error); } };
      zip.on('error', () => abort(fail('VALIDATION', 'O ZIP está corrompido ou contém arquivos inválidos.')));
      zip.on('end', () => { if (!stopped) { stopped = true; resolve(output); } });
      zip.on('entry', (entry: yauzl.Entry) => {
        try {
          if (++entries > 128) throw fail('VALIDATION', 'O pacote deve conter no máximo 128 itens.');
          const directory = entry.fileName.endsWith('/');
          const filename = safeAssetPath(directory ? entry.fileName.slice(0, -1) : entry.fileName);
          const fileType = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (fileType === 0xa000 || (entry.generalPurposeBitFlag & 1)) throw fail('VALIDATION', 'Links simbólicos e arquivos protegidos por senha não são aceitos.');
          if (directory || filename.startsWith('__MACOSX/') || path.posix.basename(filename) === '.DS_Store') { zip.readEntry(); return; }
          const mime = TYPES[path.posix.extname(filename).toLowerCase()];
          if (!mime || paths.has(filename.toLowerCase())) throw fail('VALIDATION', 'O pacote contém um tipo não permitido ou nomes duplicados.');
          paths.add(filename.toLowerCase());
          if (entry.uncompressedSize > MAX_FILE || total + entry.uncompressedSize > MAX_EXPANDED) throw fail('VALIDATION', 'O ZIP excede os limites: 20 MB por arquivo e 80 MB descompactado.');
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return abort(fail('VALIDATION', 'Não foi possível extrair um arquivo do ZIP.'));
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on('data', (chunk: Buffer) => {
              size += chunk.length; total += chunk.length;
              if (size > MAX_FILE || total > MAX_EXPANDED) { stream.destroy(); abort(fail('VALIDATION', 'O ZIP excede o tamanho permitido.')); return; }
              chunks.push(chunk);
            });
            stream.on('error', () => abort(fail('VALIDATION', 'O pacote está corrompido.')));
            stream.on('end', () => { if (!stopped) { output.push({ path: filename, mime, content: Buffer.concat(chunks) }); zip.readEntry(); } });
          });
        } catch (error) { abort(error); }
      });
      zip.readEntry();
    });
  });
  const pages = files.filter((file) => /\.html?$/i.test(file.path));
  const index = pages.find((file) => file.path.toLowerCase() === 'index.html')
    ?? (pages.length === 1 ? pages[0] : undefined);
  if (!index) throw fail('VALIDATION', 'Inclua um index.html na raiz do ZIP ou apenas um arquivo HTML de entrada.');
  return { files, entrypoint: index.path };
}

export function describeAsset(asset: Asset) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ assetId: asset.id, purpose: 'mission-file', iat: issuedAt }, config.jwtSecret, { expiresIn: '6h', audience: 'mission-files' });
  return { id: asset.id, name: asset.name, expiresAt: (issuedAt + 6 * 60 * 60) * 1000, url: `/api/mission-files/${token}/${asset.entrypoint.split('/').map(encodeURIComponent).join('/')}` };
}

export async function uploadMissionAsset(adminId: string, kind: AssetKind, name: string, content: Buffer) {
  if (!content.length || content.length > MAX_UPLOAD) throw fail('VALIDATION', 'Envie um arquivo com até 25 MB.');
  let files: AssetFile[];
  let entrypoint: string;
  if (kind === 'image') {
    if (content.length > 10 * 1024 * 1024) throw fail('VALIDATION', 'A imagem deve ter até 10 MB.');
    const image = imageType(content);
    entrypoint = `map${image.extension}`;
    files = [{ path: entrypoint, mime: image.mime, content }];
  } else if (kind === 'audio') {
    const audio = audioType(content);
    entrypoint = `music${audio.extension}`;
    files = [{ path: entrypoint, mime: audio.mime, content }];
  } else {
    // Briefing: um único arquivo HTML (ZIP não é mais aceito no envio).
    if (content.toString('ascii', 0, 2) === 'PK') throw fail('VALIDATION', 'Envie apenas um arquivo HTML (ZIP não é aceito).');
    if (!looksLikeHtml(content)) throw fail('VALIDATION', 'Envie um arquivo HTML válido.');
    entrypoint = 'index.html';
    files = [{ path: entrypoint, mime: TYPES['.html'], content }];
  }
  return saveMissionAssetFiles(adminId, kind, name, files, entrypoint);
}

/** Aceita HTML completo ou fragmento (ex.: começando em <title>/<style>), procurando uma tag HTML conhecida no início. */
function looksLikeHtml(content: Buffer) {
  const head = content.toString('utf8', 0, 65536).replace(/^\uFEFF/, '');
  return /<\s*(!doctype|html|head|body|title|meta|link|style|script|div|main|section|canvas|svg)\b/i.test(head);
}

/** Grava os arquivos já validados de um recurso da missão (em blocos) e devolve o recurso descrito. */
export async function saveMissionAssetFiles(adminId: string, kind: AssetKind, name: string, files: AssetFile[], entrypoint: string) {
  const asset = await db.tx(async (query) => {
    const { rows } = await query.query<Asset>('insert into mission_assets(kind, name, entrypoint, created_by) values ($1,$2,$3,$4) returning *', [kind, name, entrypoint, adminId]);
    for (const file of files) {
      const chunkSize = CHUNK_SIZE;
      const chunks = Math.ceil(file.content.length / chunkSize);
      await query.query('insert into mission_asset_files(asset_id,path,mime,chunks) values ($1,$2,$3,$4)', [rows[0].id, file.path, file.mime, chunks]);
      for (let index = 0; index < chunks; index++) await query.query('insert into mission_asset_chunks(asset_id,path,chunk_index,content) values ($1,$2,$3,$4)', [rows[0].id, file.path, index, file.content.subarray(index * chunkSize, (index + 1) * chunkSize)]);
    }
    return rows[0];
  });
  return describeAsset(asset);
}

export async function validateMissionAssets(imageId: string | null | undefined, briefingId: string | null | undefined, audioId?: string | null) {
  for (const [id, kind] of [[imageId, 'image'], [briefingId, 'briefing'], [audioId, 'audio']] as const) {
    if (!id) continue;
    const { rows } = await db.query('select id from mission_assets where id=$1 and kind=$2', [id, kind]);
    if (!rows.length) throw fail('VALIDATION', 'Um dos arquivos da missão não está disponível. Envie novamente.');
  }
}

export async function missionAssetMetadata(ids: string[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof describeAsset>>();
  const { rows } = await db.query<Asset>('select id,kind,name,entrypoint from mission_assets where id=any($1)', [ids]);
  return new Map(rows.map((asset) => [asset.id, describeAsset(asset)]));
}

export async function getMissionFile(token: string, filename: string) {
  let assetId: string;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { audience: 'mission-files', algorithms: ['HS256'] });
    if (typeof payload === 'string' || payload.purpose !== 'mission-file' || typeof payload.assetId !== 'string') throw new Error();
    assetId = payload.assetId;
  } catch { throw fail('VALIDATION', 'O acesso ao arquivo expirou. Reabra a página da missão.'); }
  safeAssetPath(filename);
  const { rows } = await db.query<{ mime: string; chunks: number; lastSize: number }>(
    `select file.mime,file.chunks,coalesce(octet_length(last.content),0) as "lastSize"
     from mission_asset_files file left join mission_asset_chunks last
       on last.asset_id=file.asset_id and last.path=file.path and last.chunk_index=file.chunks-1
     where file.asset_id=$1 and file.path=$2`, [assetId, filename]);
  if (!rows.length) throw fail('MISSION_NOT_FOUND');
  const size = rows[0].chunks ? (rows[0].chunks - 1) * CHUNK_SIZE + rows[0].lastSize : 0;
  return {
    mime: rows[0].mime, size,
    async read(range = { start: 0, end: size - 1 }) {
      if (!size) return Buffer.alloc(0);
      const first = Math.floor(range.start / CHUNK_SIZE);
      const last = Math.floor(range.end / CHUNK_SIZE);
      const chunks: Buffer[] = [];
      for (let index = first; index <= last; index++) {
        const chunk = await db.query<{ content: Buffer }>('select content from mission_asset_chunks where asset_id=$1 and path=$2 and chunk_index=$3', [assetId, filename, index]);
        const content = Buffer.from(chunk.rows[0].content);
        chunks.push(content.subarray(Math.max(0, range.start - index * CHUNK_SIZE), Math.min(content.length, range.end - index * CHUNK_SIZE + 1)));
      }
      return Buffer.concat(chunks);
    },
  };
}

export async function readMissionFile(token: string, filename: string) {
  const file = await getMissionFile(token, filename);
  return { mime: file.mime, content: await file.read() };
}
