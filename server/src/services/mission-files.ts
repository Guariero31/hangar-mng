import path from 'node:path';
import jwt from 'jsonwebtoken';
import yauzl from 'yauzl';
import { db } from '../db.js';
import { config } from '../config.js';
import { fail } from '../errors.js';

export type AssetKind = 'image' | 'briefing';
interface AssetFile { path: string; mime: string; content: Buffer }
interface Asset { id: string; kind: AssetKind; name: string; entrypoint: string }
const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_EXPANDED = 80 * 1024 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
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
  const token = jwt.sign({ assetId: asset.id, purpose: 'mission-file' }, config.jwtSecret, { expiresIn: '6h', audience: 'mission-files' });
  return { id: asset.id, name: asset.name, url: `/api/mission-files/${token}/${asset.entrypoint.split('/').map(encodeURIComponent).join('/')}` };
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
  } else {
    ({ files, entrypoint } = await unpackBriefing(content));
  }
  const asset = await db.tx(async (query) => {
    const { rows } = await query.query<Asset>('insert into mission_assets(kind, name, entrypoint, created_by) values ($1,$2,$3,$4) returning *', [kind, name, entrypoint, adminId]);
    for (const file of files) {
      const chunkSize = 256 * 1024;
      const chunks = Math.ceil(file.content.length / chunkSize);
      await query.query('insert into mission_asset_files(asset_id,path,mime,chunks) values ($1,$2,$3,$4)', [rows[0].id, file.path, file.mime, chunks]);
      for (let index = 0; index < chunks; index++) await query.query('insert into mission_asset_chunks(asset_id,path,chunk_index,content) values ($1,$2,$3,$4)', [rows[0].id, file.path, index, file.content.subarray(index * chunkSize, (index + 1) * chunkSize)]);
    }
    return rows[0];
  });
  return describeAsset(asset);
}

export async function validateMissionAssets(imageId: string | null | undefined, briefingId: string | null | undefined) {
  for (const [id, kind] of [[imageId, 'image'], [briefingId, 'briefing']] as const) {
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

export async function readMissionFile(token: string, filename: string) {
  let assetId: string;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { audience: 'mission-files', algorithms: ['HS256'] });
    if (typeof payload === 'string' || payload.purpose !== 'mission-file' || typeof payload.assetId !== 'string') throw new Error();
    assetId = payload.assetId;
  } catch { throw fail('VALIDATION', 'O acesso ao arquivo expirou. Reabra a página da missão.'); }
  safeAssetPath(filename);
  const { rows } = await db.query<{ mime: string; chunks: number }>('select mime,chunks from mission_asset_files where asset_id=$1 and path=$2', [assetId, filename]);
  if (!rows.length) throw fail('MISSION_NOT_FOUND');
  const chunks: Buffer[] = [];
  for (let index = 0; index < rows[0].chunks; index++) {
    const chunk = await db.query<{ content: Buffer }>('select content from mission_asset_chunks where asset_id=$1 and path=$2 and chunk_index=$3', [assetId, filename, index]);
    chunks.push(Buffer.from(chunk.rows[0].content));
  }
  return { mime: rows[0].mime, content: Buffer.concat(chunks) };
}
