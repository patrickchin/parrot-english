import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const scenes = JSON.parse(await readFile('content/extra-scenes.json', 'utf8'));
const id = prefix => prefix + '_' + randomBytes(6).toString('base64url');
const selected = process.argv.slice(2);
for (const entry of scenes.filter(s => !selected.length || selected.includes(s.slug))) {
  const folder = `public/scenes/${entry.slug}`;
  await mkdir(folder, { recursive: true });
  let previous;
  try { previous = JSON.parse(await readFile(`${folder}/scene.json`, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const file = `${entry.slug}-v1.mp4`;
  const result = spawnSync('ffmpeg', ['-v','error','-ss',String(entry.start),'-i',`content/local-dubbing/${entry.input}`,'-t',String(entry.end-entry.start),'-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-b:a','96k','-movflags','+faststart','-y',`content/local-dubbing/${file}`]);
  if (result.status !== 0) throw new Error(`Cannot prepare ${entry.slug}`);
  const probe = spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',`content/local-dubbing/${file}`],{encoding:'utf8'});
  const duration = Math.round(Number(probe.stdout.trim())*1000)/1000;
  const roles = entry.roles.map((name,i) => ({id:previous?.roles[i]?.id ?? id('role'), name, portrait:previous?.roles[i]?.portrait, label:name, hint:'跟着角色的语气说。'}));
  const source = entry.source + `&t=${Math.floor((entry.sourceOffset ?? 0)+entry.start)}s`;
  const isPixar = ['Finding Nemo','Toy Story','Cars','Cars on the Road','Up','Ratatouille'].includes(entry.film);
  const attribution = isPixar ? '原作：Disney / Pixar' : entry.film === 'SpongeBob SquarePants' ? '原作：Nickelodeon / Paramount' : ['Despicable Me','Minions'].includes(entry.film) ? '原作：Universal Pictures / Illumination' : '原作：DreamWorks Animation';
  const scene = {version:1,id:previous?.id ?? id('scene'),title:entry.title,tags:entry.tags ?? previous?.tags,description:'成人原型配音测试；选角色，听原声，录下自己的版本。',duration,video:file,mediaBase:`https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/${entry.slug}/`,poster:previous?.poster,waveform:previous?.waveform,wordTiming:previous?.wordTiming,roles,
    lines:entry.lines.map(([role,start,end,text,hint],i) => ({id:previous?.lines[i]?.id ?? id('line'),roleId:roles[role].id,start,end:Math.min(end,duration),text,hint,words:previous?.lines[i]?.text===text && previous.lines[i].start===start && previous.lines[i].end===Math.min(end,duration) ? previous.lines[i].words : undefined})),
    rightsStatus:'redistribution-not-cleared',credit:{title:entry.film,attribution,source,licence:'未确认再分发许可',licenceUrl:'https://www.youtube.com/howyoutubeworks/policies/copyright/',changes:`原上传约 ${((entry.sourceOffset ?? 0)+entry.start).toFixed(2)}–${((entry.sourceOffset ?? 0)+entry.end).toFixed(2)} 秒的节选；添加中英台词和配音时间标记。`}};
  await writeFile(`${folder}/scene.json`, JSON.stringify(scene,null,2)+'\n');
  console.log(`${entry.slug}: ${duration}s; media prepared separately for OSS.`);
}
