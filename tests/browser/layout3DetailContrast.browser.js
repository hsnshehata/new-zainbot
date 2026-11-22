// Optional local in-memory Mongo contrast regression; NOSUP=1 simulates fallback.
const assert=require('node:assert/strict');
process.env.NODE_ENV='test';process.env.JWT_SECRET='synthetic-browser-fixture-secret-32-bytes';process.env.CRON_JOBS_ENABLED='false';process.env.MONGOMS_VERSION='7.0.24';
const root=require('node:path').resolve(__dirname,'../..');const path=require('path');const R=p=>require(path.join(root,p));const PNG=null;
const mongoose=R('node_modules/mongoose');const {MongoMemoryServer}=R('node_modules/mongodb-memory-server');const puppeteer=R('node_modules/puppeteer');
const tag='after';const evidence=process.env.QA_EVIDENCE_DIR||'/tmp/storefront-contrast-evidence';require('fs').mkdirSync(evidence,{recursive:true});
(async()=>{const db=await MongoMemoryServer.create();process.env.MONGODB_URI=db.getUri('cmp');await mongoose.connect(process.env.MONGODB_URI);
const app=R('server/server');const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});const base=`http://127.0.0.1:${server.address().port}`;
const Store=R('server/models/Store'),Product=R('server/models/Product');
const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#f1ebe3"/><rect x="145" y="235" width="350" height="280" rx="32" fill="#9b6744"/></svg>');
const b=await puppeteer.launch({headless:true,args:['--no-sandbox']});
const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};const L=c=>.2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);const ratio=(a,c)=>{const x=L(a),y=L(c);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const sels={title:'.product-detail .title',price:'.product-detail .price-line .now',was:'.product-detail .price-line .was',desc:'.product-detail .desc',label:'.product-detail .option-group label',pill:'.product-detail .offer-pill',btnPrimary:'.product-detail .actions .btn-primary',btnShare:'.product-detail [data-share]',btnBack:'.product-detail [data-close]'};
const brands=[['none',undefined],['black','#000000'],['dark','#111111'],['blue','#4f46e5'],['green','#16a34a'],['red','#e11d48'],['lightyellow','#fde68a'],['yellow','#ffff00'],['white','#ffffff'],['lightgrey','#e5e7eb']];
const rows=[];let min=99;
for (const [name,color] of brands){
 const st=await new Store({userId:new mongoose.Types.ObjectId(),storeName:'m'+name,storeLink:name,templateId:1,primaryColor:color,adminConfig:{enableCart:true,landingLayout:'layout3'}}).save({validateBeforeSave:false});
 const p=await new Product({storeId:st._id,productName:'حقيبة جلد',price:600,hasOffer:true,originalPrice:750,discountedPrice:600,stock:12,currency:'EGP',description:'وصف قصير',detailedDescription:'تفاصيل أطول',imageUrl:svg,images:[svg],optionsEnabled:true,optionGroups:[{name:'اللون',values:['أحمر','أزرق'],required:true}]}).save({validateBeforeSave:false});
 for (const [vp,w,h] of [['desktop',1280,900],['mobile',390,800]]){
  const pg=await b.newPage();await pg.setViewport({width:w,height:h});await pg.setRequestInterception(true);pg.on('request',async r=>{const u=r.url();if(process.env.NOSUP&&u.endsWith('/css/layout3.css')){const fs=require('fs');let c=fs.readFileSync(path.join(root,'public/css/layout3.css'),'utf8').replace('@supports (color: oklch(from red l c h))','@supports (color: oklch(from red l c h)) and (foo: bar)');return r.respond({status:200,contentType:'text/css',body:c});}(u.startsWith(base)||u.startsWith('data:'))?r.continue():r.abort();});
  await pg.goto(`${base}/store/${name}/landing?product=${p._id}`,{waitUntil:'networkidle0'});await pg.waitForSelector('.product-detail-backdrop');await new Promise(r=>setTimeout(r,900));
  await pg.addStyleTag({content:'.pd-stars{display:none!important}*{animation:none!important;transition:none!important}'});
  const out={};
  for (const [k,s] of Object.entries(sels)){
    const info=await pg.evaluate((s)=>{const e=document.querySelector(s);if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#000';x.fillStyle=getComputedStyle(e).color;x.fillRect(0,0,1,1);const d=x.getImageData(0,0,1,1).data;return {rect:[r.x,r.y,r.width,r.height],color:[d[0],d[1],d[2]]}},s);
    if(!info){out[k]=null;continue}
    await pg.evaluate((s)=>{const e=document.querySelector(s);e.dataset.oc=e.style.cssText;e.style.setProperty('color','transparent','important');e.style.setProperty('text-shadow','none','important');e.querySelectorAll('*').forEach(c=>{c.style.setProperty('color','transparent','important')})},s);
    const [x,y,wd,ht]=info.rect;const clip={x:Math.max(0,x),y:Math.max(0,y),width:Math.max(1,Math.min(wd,w-Math.max(0,x))),height:Math.max(1,ht)};
    const buf=await pg.screenshot({clip,encoding:'base64'});
    const px=await pg.evaluate(async(b64)=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;const rs=[],gs=[],bs=[];for(let i=0;i<d.length;i+=4){rs.push(d[i]);gs.push(d[i+1]);bs.push(d[i+2])}const m=a=>a.sort((p,q)=>p-q)[a.length>>1];return [m(rs),m(gs),m(bs)]},buf);
    await pg.evaluate((s)=>{const e=document.querySelector(s);e.style.cssText=e.dataset.oc;e.querySelectorAll('*').forEach(c=>c.style.removeProperty('color'))},s);
    out[k]=+ratio(info.color,px).toFixed(2);if(out[k]<min)min=out[k];
  }
  rows.push(`${name.padEnd(12)} ${vp.padEnd(8)} `+Object.entries(out).map(([k,v])=>k+'='+v).join(' '));
  if (tag==='after'&&['none','lightyellow','white','blue'].includes(name)) { await pg.evaluate(()=>window.scrollTo(0,0)); await pg.screenshot({path:`${evidence}/l3c-${process.env.NOSUP?'fb-':''}${name}-${vp}.png`}); }
  await pg.close();}}
console.log(rows.join('\n'));console.log('MIN',min);assert.ok(min>=4.5,'Minimum text contrast must be at least 4.5: '+min);console.log('STOREFRONT_CONTRAST_BROWSER_PASS',process.env.NOSUP?'fallback':'enhanced');
await b.close();server.closeAllConnections();server.close();await mongoose.disconnect();await db.stop();})().catch(e=>{console.error(e);process.exit(1)});
