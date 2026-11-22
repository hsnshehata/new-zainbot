// Optional local in-memory Mongo browser regression. External traffic blocked.
const assert=require('node:assert/strict');
process.env.NODE_ENV='test';process.env.JWT_SECRET='synthetic-browser-fixture-secret-32-bytes';process.env.CRON_JOBS_ENABLED='false';process.env.MONGOMS_VERSION='7.0.24';
const root=require('node:path').resolve(__dirname,'../..');const path=require('path');const cp=require('child_process');const R=p=>require(path.join(root,p));
const mongoose=R('node_modules/mongoose');const {MongoMemoryServer}=R('node_modules/mongodb-memory-server');const puppeteer=R('node_modules/puppeteer');
const tag='after';const outDir=process.env.QA_EVIDENCE_DIR||'/tmp/storefront-scroll-evidence';require('fs').mkdirSync(outDir,{recursive:true});

(async()=>{const db=await MongoMemoryServer.create();process.env.MONGODB_URI=db.getUri('sc');await mongoose.connect(process.env.MONGODB_URI);
const app=R('server/server');const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});const base=`http://127.0.0.1:${server.address().port}`;
const Store=R('server/models/Store'),Product=R('server/models/Product');
const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#f1ebe3"/><rect x="145" y="235" width="350" height="280" rx="32" fill="#9b6744"/></svg>');
const b=await puppeteer.launch({headless:true,args:['--no-sandbox']});
const res=[];
for (const n of [1,2,3]){
 const st=await new Store({userId:new mongoose.Types.ObjectId(),storeName:'متجر'+n,storeLink:'s'+n,templateId:1,primaryColor:'#2040ab',adminConfig:{enableCart:true,landingLayout:'layout'+n}}).save({validateBeforeSave:false});
 const long=await new Product({storeId:st._id,productName:'حقيبة جلد طويلة',price:750,stock:12,currency:'EGP',description:'وصف المنتج '.repeat(40),detailedDescription:'تفاصيل '.repeat(60),imageUrl:svg,images:[svg,svg],optionsEnabled:true,optionGroups:[{name:'اللون',values:['أحمر','أزرق'],required:true}]}).save({validateBeforeSave:false});
 const short=await new Product({storeId:st._id,productName:'حقيبة قصيرة',price:100,stock:12,currency:'EGP',description:'وصف',imageUrl:svg,images:[svg]}).save({validateBeforeSave:false});
 for (const [vp,w,h,mobile] of [['m390x667',390,667,true],['m390x844',390,844,true],['m360x640',360,640,true],['d1280x700',1280,700,false],['d1280x900',1280,900,false]]){
  for (const [pname,p] of [['long',long],['short',short]]){
   const pg=await b.newPage();await pg.setViewport({width:w,height:h,isMobile:mobile,hasTouch:mobile});await pg.setRequestInterception(true);
   pg.on('request',r=>{const u=r.url();const m=u.match(/\/css\/layout(\d)\.css/);(u.startsWith(base)||u.startsWith('data:'))?r.continue():r.abort()});
   await pg.goto(`${base}/store/s${n}/landing?product=${p._id}`,{waitUntil:'networkidle0'});await pg.waitForSelector('.product-detail-backdrop');await new Promise(r=>setTimeout(r,700));
   await pg.addStyleTag({content:'*{animation:none!important;transition:none!important}'});
   const m0=await pg.evaluate(()=>{const bd=document.querySelector('.product-detail-backdrop'),d=document.querySelector('.product-detail');const r=d.getBoundingClientRect();return {scrollable:bd.scrollHeight>bd.clientHeight+1,sh:bd.scrollHeight,ch:bd.clientHeight,top:Math.round(r.top),bottom:Math.round(innerHeight-r.bottom)}});
   const out={layout:n,vp,pname,...m0};
   if(pname==='short'){out.centred=Math.abs(m0.top-m0.bottom)<=2||m0.sh>m0.ch;}
   if(pname==='long'||pname==='short'){
    // physical scroll then physical click on add
    const sel=await pg.$('.product-detail-backdrop select');if(sel)await pg.select('.product-detail-backdrop select','أحمر');
    const vis=()=>pg.$eval('.product-detail-backdrop [data-add]',x=>{const r=x.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth});
    out.topReachable=await pg.$eval('.product-detail .close, .product-detail [data-close]',x=>{const r=x.getBoundingClientRect();return r.top>=0});
    if(['m390x667'].includes(vp)){await pg.screenshot({path:`${outDir}/l${n}-${vp}-top.png`});}
    out.addVisibleInitially=await vis();
    for(let i=0;i<30&&!(await vis());i++){await pg.mouse.move(w/2,h/2);await pg.mouse.wheel({deltaY:150});await new Promise(r=>setTimeout(r,60));}
    out.addVisibleAfterScroll=await vis();
    if(['m390x667'].includes(vp))await pg.screenshot({path:`${outDir}/l${n}-${vp}-scrolled.png`});
    if(out.addVisibleAfterScroll){
     const bx=await pg.$eval('.product-detail-backdrop [data-add]',x=>{const r=x.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
     const topEl=await pg.evaluate((x,y)=>{const e=document.elementFromPoint(x,y);return !!(e&&e.closest('[data-add]'))},bx.x,bx.y);
     out.hitTargetIsAdd=topEl;
     await pg.mouse.click(bx.x,bx.y);await new Promise(r=>setTimeout(r,300));
     out.cartAdded=await pg.evaluate(()=>Object.entries(localStorage).some(([k,v])=>/zain_cart_/.test(k)&&Object.keys(JSON.parse(v||'{}')).length>0));
     out.optionKept=await pg.evaluate(()=>Object.entries(localStorage).some(([k,v])=>/zain_cart_/.test(k)&&Object.keys(JSON.parse(v||'{}')).some(id=>decodeURIComponent(id).includes('أحمر'))));
    } else {out.hitTargetIsAdd=false;out.cartAdded=false;}
   } else if(['d1280x900','m390x667'].includes(vp)) await pg.screenshot({path:`${outDir}/l${n}-${vp}-short.png`});
   res.push(out);await pg.close();}}}
for(const r of res){console.log('R',JSON.stringify(r));for(const key of ['topReachable','addVisibleAfterScroll','hitTargetIsAdd','cartAdded'])assert.equal(r[key],true,JSON.stringify(r));if(r.pname==='long')assert.equal(r.optionKept,true,JSON.stringify(r));if(r.pname==='short'&&!r.scrollable)assert.ok(Math.abs(r.top-r.bottom)<=24,'Fits within backdrop padding: '+JSON.stringify(r));}
console.log('STOREFRONT_SCROLL_BROWSER_PASS',res.length);
await b.close();server.closeAllConnections();server.close();await mongoose.disconnect();await db.stop();})().catch(e=>{console.error(e);process.exit(1)});
