import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const scenes = JSON.parse(await readFile('content/extra-scenes.json', 'utf8'));
const id = prefix => prefix + '_' + randomBytes(6).toString('base64url');
const selected = process.argv.slice(2);
for (const scene of scenes.filter(s => !selected.length || selected.includes(s.slug))) {
  const folder = `public/packs/${scene.slug}`;
  await mkdir(folder, { recursive: true });
  let previous;
  try { previous = JSON.parse(await readFile(`${folder}/pack.json`, 'utf8')); } catch { /* New content pack. */ }
  const file = `${scene.slug}-v1.mp4`;
  const result = spawnSync('ffmpeg', ['-v','error','-ss',String(scene.start),'-i',`content/local-dubbing/${scene.input}`,'-t',String(scene.end-scene.start),'-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-b:a','96k','-movflags','+faststart','-y',`content/local-dubbing/${file}`]);
  if (result.status !== 0) throw new Error(`Cannot prepare ${scene.slug}`);
  const probe = spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',`content/local-dubbing/${file}`],{encoding:'utf8'});
  const duration = Math.round(Number(probe.stdout.trim())*1000)/1000;
  const roles = scene.roles.map((name,i) => ({id:previous?.roles[i]?.id ?? id('role'), name, label:name, hint:'跟着角色的语气说。'}));
  const source = scene.source + `&t=${Math.floor((scene.sourceOffset ?? 0)+scene.start)}s`;
  const isPixar = ['Finding Nemo','Toy Story','Cars','Cars on the Road','Up','Ratatouille'].includes(scene.film);
  const attribution = isPixar ? '原作：Disney / Pixar' : scene.film === 'SpongeBob SquarePants' ? '原作：Nickelodeon / Paramount' : ['Despicable Me','Minions'].includes(scene.film) ? '原作：Universal Pictures / Illumination' : '原作：DreamWorks Animation';
  const pack = {version:1,id:previous?.id ?? id('pack'),title:scene.title,description:'成人原型配音测试；选角色，听原声，录下自己的版本。',duration,video:file,mediaBase:`https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/${scene.slug}/`,poster:previous?.poster,waveform:previous?.waveform,wordTiming:previous?.wordTiming,roles,
    lines:scene.lines.map(([role,start,end,text,hint],i) => ({id:previous?.lines[i]?.id ?? id('line'),roleId:roles[role].id,start,end:Math.min(end,duration),text,hint,words:previous?.lines[i]?.text===text && previous.lines[i].start===start && previous.lines[i].end===Math.min(end,duration) ? previous.lines[i].words : undefined})),
    rightsStatus:'redistribution-not-cleared',credit:{title:scene.film,attribution,source,licence:'未确认再分发许可',licenceUrl:'https://www.youtube.com/howyoutubeworks/policies/copyright/',changes:`原上传约 ${((scene.sourceOffset ?? 0)+scene.start).toFixed(2)}–${((scene.sourceOffset ?? 0)+scene.end).toFixed(2)} 秒的节选；添加中英台词和配音时间标记。`}};
  await writeFile(`${folder}/pack.json`, JSON.stringify(pack,null,2)+'\n');
  console.log(`${scene.slug}: ${duration}s; media prepared separately for OSS.`);
}
await writeFile('src/extra-clips.json',JSON.stringify(scenes.map(s=>({slug:s.slug,title:s.title,english:s.english,note:s.film,source:s.source+`&t=${Math.floor((s.sourceOffset ?? 0)+s.start)}s`})),null,2)+'\n');
