export type Role = { id: string; name: string; label: string; portrait?: string; hint: string };
export type Line = { id: string; roleId: string; start: number; end: number; text: string; hint: string };
export type Pack = {
  version: 1; id: string; title: string; description: string; duration: number;
  video: string; backing?: string; poster?: string; roles: Role[]; lines: Line[];
  base: string; mode?: 'local';
  credit: { title: string; attribution: string; source: string; licence: string; licenceUrl: string; changes: string };
};
export const packRoot = '/packs/sintel/';
export const asset = (pack: Pack, path: string) => pack.base + path;
export function validatePack(value: unknown, base = packRoot): Pack {
  const p = value as Pack;
  const safeFile = (s: unknown) => typeof s === 'string' && /^[a-zA-Z0-9_-]+\.(mp4|m4a|jpg)$/.test(s);
  if (!p || p.version !== 1 || !/^pack_[\w-]+$/.test(p.id) ||
      typeof p.title !== 'string' || typeof p.description !== 'string' ||
      !Number.isFinite(p.duration) || p.duration <= 0 || p.duration > 120 ||
      !safeFile(p.video) || ![p.backing, p.poster].every(v => v === undefined || safeFile(v)) ||
      (p.mode !== undefined && p.mode !== 'local') ||
      !Array.isArray(p.roles) || p.roles.length < 1 || p.roles.length > 8 ||
      !Array.isArray(p.lines) || p.lines.length < 1 || p.lines.length > 60) throw new Error('片段文件不完整，请重新加载。');
  const ids = new Set<string>();
  for (const role of p.roles) {
    if (!role || !/^role_[\w-]+$/.test(role.id) || ids.has(role.id) ||
        (role.portrait !== undefined && !safeFile(role.portrait)) || ![role.name, role.label, role.hint].every(v => typeof v === 'string' && v.length < 120)) throw new Error('角色资料有误。');
    ids.add(role.id);
  }
  const lineIds = new Set<string>();
  let end = 0;
  for (const line of p.lines) {
    if (!line || !/^line_[\w-]+$/.test(line.id) || lineIds.has(line.id) || !ids.has(line.roleId) ||
        !Number.isFinite(line.start) || !Number.isFinite(line.end) || line.start < end ||
        line.end <= line.start || line.end > p.duration + 0.01 ||
        ![line.text, line.hint].every(v => typeof v === 'string' && v.length < 300)) throw new Error('台词时间有误。');
    end = line.end; lineIds.add(line.id);
  }
  if (!p.credit || ![p.credit.title, p.credit.attribution, p.credit.source, p.credit.licence, p.credit.licenceUrl, p.credit.changes].every(v => typeof v === 'string' && v.length < 1000) ||
      ![p.credit.source, p.credit.licenceUrl].every(v => /^https:\/\//.test(v))) throw new Error('片段来源资料不完整。');
  return { ...p, base };
}
