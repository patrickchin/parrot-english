import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
const repo=process.cwd();
const local='content/local-dubbing', canonical=local+'/release-metadata'; await mkdir(canonical,{recursive:true});
const root='https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/';
const names={Dory:'多莉',Marlin:'马林',Sharks:'鲨鱼合声',Bruce:'布鲁斯',Chum:'查姆',Anchor:'安可',Woody:'胡迪',Buzz:'巴斯光年',Mater:'板牙','Lightning McQueen':'闪电麦昆','Chick Hicks':'奇克·海克斯',Margo:'玛戈',Agnes:'艾格尼丝',Edith:'伊迪丝','Carnival attendant':'游乐场摊主',Gru:'格鲁',Dug:'道格',Carl:'卡尔',Russell:'罗素',Gusteau:'古斯托',Remy:'小米','Mr. Ping':'平先生',Po:'阿宝',Oogway:'乌龟大师',"Boy's father":'男孩的爸爸',Boy:'小男孩',Shrek:'史莱克',Fiona:'菲奥娜',Donkey:'驴子',Pinocchio:'匹诺曹','Little pig':'小猪',SpongeBob:'海绵宝宝',Squidward:'章鱼哥',Patrick:'派大星',Plankton:'痞老板',Skipper:'队长',Kowalski:'科瓦斯基',Private:'菜鸟',Peppa:'佩奇','Daddy Pig':'猪爸爸','Mummy Pig':'猪妈妈','Danny Dog':'小狗丹尼',George:'乔治','Suzy Sheep':'小羊苏西',Holly:'霍莉',Ben:'本','Nanny Plum':'梅姨','Madame Gazelle':'羚羊夫人','Speed announcer':'测速播报员'};
const english=Object.fromEntries(Object.entries(names).map(([en,zh])=>[zh,en]));
const catalog=JSON.parse(await readFile('src/review-clips.json','utf8'));
const summaries=Object.fromEntries(catalog.map(entry=>[entry.slug,entry.english]));
const routeSlugs=Object.fromEntries(catalog.filter(entry=>entry.routeSlug).map(entry=>[entry.slug,entry.routeSlug]));
const generated=[]; const changed=[]; const media=[]; const translations={...english};
for (const [cohort,file] of [['older-audience','content/meme-review-scenes.json'],['younger-age-5','content/preschool-review-scenes.json']]) {
 const recipe=JSON.parse(await readFile(file,'utf8'));
 for (const entry of recipe.scenes) {
  const libraryFolder=cohort==='younger-age-5'&&entry.beginnerSuitable!==true?'older-audience':cohort;
  const slug=cohort==='younger-age-5'?entry.slug.replace(/^\d+-/,''):entry.slug;
  const source=recipe.sources.find(s=>s.id===entry.sourceId); let head,working;
  try {working=JSON.parse(await readFile(`public/scenes/${slug}/scene.json`,'utf8'));} catch (error) {if(error.code!=='ENOENT')throw error;}
  try {head=JSON.parse(execFileSync('git',['show',`HEAD:public/scenes/${slug}/scene.json`],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));} catch {head=working;}
  if (entry.preserveMedia) {
   generated.push({id:head.id,slug,title:head.title,english:({patrick:'No, this is Patrick.',chocolate:'Chocolate!',onions:'Ogres are like onions.'}[slug]??head.lines[0].text),note:head.credit.title,source:head.credit.source,cohort:libraryFolder,poster:root+slug+'/'+head.poster});continue;
  }
  entry.sceneId ??=head?.id??'scene_'+randomBytes(8).toString('base64url');entry.publicSlug=slug;
  const original=`${local}/review/${cohort}/${entry.file??entry.slug+'.mp4'}`;
  const digest=createHash('sha256').update(await readFile(original)).digest('hex').slice(0,12); const video=`${slug}-review-${digest}.mp4`;
  await copyFile(original,`${local}/${video}`);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',`${local}/${video}`],{encoding:'utf8'}));
  const roleIds=new Map();
  const roles=entry.roles.map(r=>{
   const previous=head?.roles.find(old=>(english[old.name]??old.name)===r.name); const id=previous?.id??r.id;roleIds.set(r.id,id);
   const name=names[r.name]??r.name; const count=entry.lines.filter(l=>l.roleId===r.id).length;const hint=`${count} 句台词`;translations[hint]=`${count} ${count===1?'line':'lines'}`;
   return {id,name,label:name,hint,...(r.selectable === false ? {selectable:false} : {}),...(previous?.portrait?{portrait:previous.portrait}:{})};
  });
  const lines=entry.lines.map(l=>({id:l.id,roleId:roleIds.get(l.roleId),start:+(l.start-entry.start).toFixed(3),end:+(l.end-entry.start).toFixed(3),text:l.text,hint:l.hint,...(l.words?{words:l.words.map(w=>({...w,start:+(w.start-entry.start).toFixed(3),end:+(w.end-entry.start).toFixed(3)}))}:{})}));
  const title=cohort==='younger-age-5'||entry.editType==='replacement'?entry.titleZh:head.title;translations[title]=entry.title;
  const offset=source.sourceOffset??0;const sourceUrl=source.url+`&t=${Math.floor(entry.start+offset)}s`;
  const scene={version:1,id:entry.sceneId,title,tags:entry.tags,description:'内部原型测试；选角色，听原声，录下自己的版本。',duration:+Number(probe.format.duration).toFixed(3),video,mediaBase:root+slug+'/',poster:`${slug}-poster-${digest}.jpg`,waveform:`waveform-${digest}.json`,roles,lines,wordTiming:entry.wordTiming,rightsStatus:'redistribution-not-cleared',credit:{title:source.series??source.title,attribution:source.attribution,source:sourceUrl,licence:'未确认再分发许可',licenceUrl:'https://www.youtube.com/howyoutubeworks/policies/copyright/',changes:`内部原型测试；原上传 ${+(entry.start+offset).toFixed(3)}–${+(entry.end+offset).toFixed(3)} 秒的节选。${entry.editNote??''}`}};
  const overlay=structuredClone(scene);
  for (const r of overlay.roles) {const prior=working?.roles.find(old=>old.id===r.id);if(prior?.portrait)r.portrait=prior.portrait;}
  await mkdir(`public/scenes/${slug}`,{recursive:true});await writeFile(`public/scenes/${slug}/scene.json`,JSON.stringify(overlay,null,2)+'\n');await writeFile(`${canonical}/${slug}.json`,JSON.stringify(scene,null,2)+'\n');
  changed.push(slug);media.push({file:`${local}/${video}`,key:`clips/${slug}/${video}`},{file:`${local}/${scene.poster}`,key:`clips/${slug}/${scene.poster}`});
  generated.push({id:scene.id,slug,title,english:summaries[slug]??(cohort==='younger-age-5'?entry.title:entry.editType==='replacement'?entry.title:head.lines[0].text),note:scene.credit.title,source:scene.credit.source,cohort,poster:scene.mediaBase+scene.poster});
 }
 await writeFile(file,JSON.stringify(recipe,null,2)+'\n');
}
await writeFile(`${canonical}/translations.json`,JSON.stringify(translations,null,2)+'\n');await writeFile(`${canonical}/media.json`,JSON.stringify(media,null,2)+'\n');await writeFile(`${canonical}/changed.json`,JSON.stringify(changed)+'\n');
// Preserve the familiar older-scene order; the preschool folder is a separate selection.
const order=['patrick','chocolate','wumbo','onions',...JSON.parse(await readFile('src/extra-clips.json','utf8')).map(s=>s.slug)];generated.sort((a,b)=>(a.cohort===b.cohort?(a.cohort==='older-audience'?order.indexOf(a.slug)-order.indexOf(b.slug):a.slug.localeCompare(b.slug)):a.cohort==='older-audience'?-1:1));
const changedSlugs=new Set(generated.map(scene=>scene.slug));
const untouched=catalog.filter(scene=>!changedSlugs.has(scene.slug));
await writeFile('src/review-clips.json',JSON.stringify([...generated.map(entry=>({...entry,...(routeSlugs[entry.slug]?{routeSlug:routeSlugs[entry.slug]}:{})})),...untouched],null,2)+'\n');
console.log(`Prepared ${generated.length} catalogue entries, ${changed.length} revised/new scenes, and ${media.length} media uploads. Existing portrait work is preserved separately.`);

execFileSync(process.execPath, ['scripts/prepare-waveforms.mjs', ...changed], {stdio:'inherit'});
for (const slug of changed) {
 const clean=JSON.parse(await readFile(`${canonical}/${slug}.json`,'utf8'));
 const rendered=JSON.parse(await readFile(`public/scenes/${slug}/scene.json`,'utf8'));
 clean.waveform=rendered.waveform; clean.poster=rendered.poster;
 await writeFile(`${canonical}/${slug}.json`,JSON.stringify(clean,null,2)+'\n');
}
