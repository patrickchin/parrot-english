import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Private authoring inputs stay out of public/ and out of Git. This command
// produces metadata and local excerpts for upload to Alibaba OSS.
const directory = 'content/local-dubbing';
const scenes = [
  {
    slug: 'patrick', title: '不，这是派大星！', source: 'https://www.youtube.com/watch?v=dwifOuuMkfo', duration: 14.2,
    roles: [['派大星', '用普通和生气两种语气接电话', '2 句台词 · 试试两种语气'], ['来电者', '打电话来问问题的人', '2 句相同的问题']],
    lines: [[1,3.0,4.95,'Is this the Krusty Krab?','请问是蟹堡王吗？'],[0,4.95,7.8,'No, this is Patrick.','不，这是派大星。'],[1,8.6,10.7,'Is this the Krusty Krab?','请问是蟹堡王吗？'],[0,10.7,14.2,'No! This is Patrick!','不！这是派大星！']],
    filter: '[0:v]trim=0:8,setpts=PTS-STARTPTS[v0];[0:a]atrim=0:8,asetpts=PTS-STARTPTS[a0];[0:v]trim=17:23.2,setpts=PTS-STARTPTS[v1];[0:a]atrim=17:23.2,asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
    changes: '选取原片 00:00–00:08 与 00:17–00:23.2，拼接、压缩并添加配音时间标记。',
  },
  {
    slug: 'chocolate', title: '巧克力？！', source: 'https://www.youtube.com/watch?v=NBhxIyT8Slg', duration: 11.4, start: 10.8,
    roles: [['顾客', '从好奇到激动的巧克力爱好者', '2 句台词 · 演出情绪变化'], ['派大星', '认真推销巧克力', '1 句台词 · with or without']],
    lines: [[0,0.2,4.2,'Chocolate? Did you say chocolate?','巧克力？你说的是巧克力吗？'],[1,4.2,7.2,'Yes, sir. With or without nuts?','是的，先生。要有坚果的，还是没有坚果的？'],[0,7.2,11.4,'Chocolate?! Chocolate!','巧克力？！巧克力！']],
    changes: '选取原片 00:10.8–00:22.2，压缩并添加配音时间标记。',
  },
  {
    slug: 'wumbo', title: '调成 Wumbo！', source: 'https://www.youtube.com/watch?v=--hsVknT1c0', duration: 6.8, start: 15.5,
    roles: [['派大星', '一本正经地解释虚构词 Wumbo', '2 句台词 · 试着模仿语气']],
    lines: [[0,0.2,3.1,'I wumbo, you wumbo.','我 wumbo，你 wumbo。'],[0,3.1,6.8,'He, she, me, wumbo.','他、她、我，wumbo。这是剧中的虚构词。']],
    changes: '选取原片 00:15.5–00:22.3，避开后续不适合儿童的对白，压缩并添加配音时间标记。Wumbo 是虚构词。',
  },
  {
    slug: 'onions', input: 'onions-landscape', title: '怪物就像洋葱', source: 'https://www.youtube.com/watch?v=aJQmVZSAqlc', duration: 15.7, start: 19.4,
    roles: [['史莱克', '认真地解释怪物与洋葱', '2 句台词 · 挑战一段解释'], ['驴子', '慢半拍理解朋友的意思', '1 句台词 · 模仿恍然大悟']],
    lines: [[0,0,7.6,'No! Layers! Onions have layers. Ogres have layers. Onions have layers.','不！层次！洋葱有层次，怪物也有层次。'],[0,7.6,9.9,'You get it? We both have layers.','你明白了吗？我们都有层次。'],[1,9.9,15.7,'Oh, you both have layers.','哦，你们都有层次。']],
    changes: '从同一段洋葱对话的横版上传中选取 00:19.4–00:35.1，压缩并添加配音时间标记。',
  },
];
const id = prefix => prefix + '_' + randomBytes(6).toString('base64url');
await mkdir(directory, { recursive: true });
for (const scene of scenes) {
  const path = `public/packs/${scene.slug}`;
  await mkdir(path, { recursive: true });
  let previous;
  try { previous = JSON.parse(await readFile(path + '/pack.json', 'utf8')); } catch { /* First authoring run. */ }
  const roles = scene.roles.map(([name,label,hint],i) => ({ id: previous?.roles[i]?.id ?? id('role'), name,label,hint }));
  const pack = {
    version:1, id:previous?.id ?? id('pack'), title:scene.title,
    mediaBase:`https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/${scene.slug}/`,
    description:'成人原型配音测试；选角色，听原声，录下自己的版本。', duration:scene.duration, video:`${scene.slug}-v1.mp4`, poster:previous?.poster, waveform:previous?.waveform, roles,
    lines:scene.lines.map(([role,start,end,text,hint],i) => ({ id:previous?.lines[i]?.id ?? id('line'),roleId:roles[role].id,start,end,text,hint })),
    rightsStatus:'redistribution-not-cleared',
    credit:{ title:scene.slug==='onions' ? 'Shrek' : 'SpongeBob SquarePants', attribution:scene.slug==='onions' ? '原作：DreamWorks Animation' : '原作：Nickelodeon / Viacom', source:scene.source, licence:'未确认再分发许可', licenceUrl:'https://www.youtube.com/howyoutubeworks/policies/copyright/', changes:scene.changes },
  };
  await writeFile(path + '/pack.json', JSON.stringify(pack, null, 2) + '\n');
  const args = ['-hide_banner','-loglevel','error'];
  if (scene.start !== undefined) args.push('-ss', String(scene.start));
  args.push('-i', `${directory}/${scene.input ?? scene.slug}.mp4`);
  if (scene.filter) args.push('-filter_complex',scene.filter,'-map','[v]','-map','[a]');
  args.push('-t',String(scene.duration),'-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-b:a','96k','-movflags','+faststart','-y',`${directory}/${pack.video}`);
  const result = spawnSync('ffmpeg',args,{stdio:'inherit'});
  if (result.status !== 0) throw new Error(`Unable to prepare ${scene.slug}; provide its private source video first.`);
  console.log(`Prepared ${scene.slug}: ${scene.duration}s, ${pack.lines.length} turns. Upload the prepared file to its OSS clip path.`);
}
await writeFile(`${directory}/START-HERE.txt`, 'Parrotbook private test clips\n\nOpen https://parrotbook.com/ and choose the matching scene, the hosted clips now open directly. These files are retained as local authoring copies.\n\nThese third-party clips have not been cleared for redistribution or public hosting. No licence is granted by this prototype.\n');
