(()=>{'use strict';
  const SUPABASE_URL='https://pbzukefsrtmymowlsdrp.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_fIWTEv4S7qnetQuMbyxQjA_3KffY1lf';
  const LOGIN_DOMAIN='admin.afrroleplay-apv.nl',SESSION_KEY='afr-admin-session';
  const $=s=>document.querySelector(s),overlay=$('#adminOverlay'),loginView=$('#adminLogin'),dashboard=$('#adminDashboard'),quickLinks=$('.admin-quick-links'),adminOpen=$('.admin-open');
  let session=null,profile=null,accounts=[],selectedArticleFiles=[],managedArticles=[];

  function status(el,message,type=''){el.textContent=message;el.className='admin-status'+(type?' '+type:'')}
  async function parseResponse(response){const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch(e){data=text}if(!response.ok){const message=data?.msg||data?.message||data?.error_description||data?.error||'Er ging iets mis.';throw new Error(message)}return data}
  async function publicRequest(path,options={}){return parseResponse(await fetch(SUPABASE_URL+path,{...options,headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json',...(options.headers||{})}}))}
  async function authRequest(path,options={}){if(!session?.access_token)throw new Error('Log opnieuw in.');return parseResponse(await fetch(SUPABASE_URL+path,{...options,headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',...(options.headers||{})}}))}
  function saveSession(value){session=value;try{value?localStorage.setItem(SESSION_KEY,JSON.stringify(value)):localStorage.removeItem(SESSION_KEY)}catch(e){}}
  function storedSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){return null}}
  async function refreshSession(){if(!session?.refresh_token)throw new Error('Sessie verlopen.');const next=await publicRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});next.expires_at=Math.floor(Date.now()/1000)+next.expires_in;saveSession(next)}
  async function ensureSession(){if(session?.expires_at&&session.expires_at<Math.floor(Date.now()/1000)+60)await refreshSession()}
  async function loadProfile(){await ensureSession();const rows=await authRequest('/rest/v1/admin_profiles?id=eq.'+encodeURIComponent(session.user.id)+'&select=*');const item=rows?.[0];if(!item||!item.active)throw new Error('Dit account heeft geen actieve beheerdersrechten.');profile=item;return item}
  const can=permission=>profile?.role==='owner'||profile?.permissions?.includes(permission);

  function openPanel(){overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';setTimeout(()=>$('#adminUsername')?.focus(),80)}
  function closePanel(){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');document.body.style.overflow=''}
  adminOpen.addEventListener('click',()=>{if(profile){selectAdminTab('overview');openPanel()}else openPanel()});$('.admin-close').addEventListener('click',closePanel);overlay.addEventListener('click',e=>{if(e.target===overlay)closePanel()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))closePanel()});

  function showDashboard(){loginView.hidden=true;dashboard.hidden=false;document.body.classList.add('admin-authenticated');quickLinks.hidden=false;adminOpen.querySelector('span:last-child').textContent=profile.display_name;$('#adminDisplayName').textContent=profile.display_name;$('#adminRole').textContent=profile.role;$('#adminRoleStat').textContent=profile.role;document.querySelectorAll('.admin-tab,[data-open-admin]').forEach(button=>{const tab=button.dataset.adminTab||button.dataset.openAdmin;button.hidden=(tab==='accounts'&&!can('manage_accounts'))||(tab==='audit'&&!can('view_audit_log'))||(tab==='articles'&&!can('manage_articles'))||(tab==='maintenance'&&!can('manage_maintenance'))||(tab==='countdown'&&profile?.role!=='owner')});document.querySelectorAll('[data-owner-only]').forEach(node=>node.hidden=profile?.role!=='owner');window.AFRLaunchControl?.ownerAuthenticated(profile);loadOverview()}
  function showLogin(){dashboard.hidden=true;loginView.hidden=false;profile=null;accounts=[];document.body.classList.remove('admin-authenticated');quickLinks.hidden=true;adminOpen.querySelector('span:last-child').textContent='Beheer'}
  $('#adminLoginForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter,username=$('#adminUsername').value.trim().toLowerCase(),password=$('#adminPassword').value;status($('#adminLoginStatus'),'Beveiligd controleren…');button.disabled=true;try{if(!/^[a-z0-9._-]{3,32}$/.test(username))throw new Error('Controleer de gebruikersnaam.');const data=await publicRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:username+'@'+LOGIN_DOMAIN,password})});data.expires_at=Math.floor(Date.now()/1000)+data.expires_in;saveSession(data);await loadProfile();$('#adminPassword').value='';showDashboard();closePanel();status($('#adminLoginStatus'),'')}catch(err){saveSession(null);status($('#adminLoginStatus'),err.message,'error')}finally{button.disabled=false}});
  async function logoutAdmin(){try{if(session)await authRequest('/auth/v1/logout',{method:'POST'})}catch(e){}saveSession(null);showLogin();closePanel();window.AFRLaunchControl?.ownerLoggedOut()}
  $('#adminLogout').addEventListener('click',logoutAdmin);$('#adminQuickLogout').addEventListener('click',logoutAdmin);

  function selectAdminTab(tab){if(tab==='countdown'&&profile?.role!=='owner')tab='overview';document.querySelectorAll('.admin-tab').forEach(x=>x.classList.toggle('active',x.dataset.adminTab===tab));document.querySelectorAll('.admin-view').forEach(view=>view.classList.toggle('active',view.dataset.adminView===tab));if(tab==='articles')loadArticlePublisher();if(tab==='maintenance')loadMaintenanceForm();if(tab==='countdown')loadLaunchForm();if(tab==='accounts')loadAccounts();if(tab==='audit')loadAudit();if(tab==='overview')loadOverview()}
  document.querySelectorAll('.admin-tab').forEach(button=>button.addEventListener('click',()=>selectAdminTab(button.dataset.adminTab)));
  document.querySelectorAll('[data-open-admin]').forEach(button=>button.addEventListener('click',()=>{selectAdminTab(button.dataset.openAdmin);openPanel()}));

  async function loadOverview(){try{accounts=await authRequest('/rest/v1/admin_profiles?select=id,active');$('#adminAccountCount').textContent=accounts.length;$('#adminActiveCount').textContent=accounts.filter(x=>x.active).length}catch(e){$('#adminAccountCount').textContent='—';$('#adminActiveCount').textContent='—'}}

  const allowedArticleExtensions=new Set(['png','jpg','jpeg','webp','gif','pdf','txt','docx']);
  function fileSizeLabel(size){return size<1024*1024?(size/1024).toFixed(0)+' KB':(size/1024/1024).toFixed(1)+' MB'}
  function renderSelectedFiles(){const box=$('#articleFilesList');box.textContent='';if(!selectedArticleFiles.length){const empty=document.createElement('span');empty.textContent='Nog geen bestanden gekozen.';box.append(empty);return}selectedArticleFiles.forEach((file,index)=>{const row=document.createElement('div');row.className='article-file-item';if(file.type.startsWith('image/')){const img=document.createElement('img');img.src=URL.createObjectURL(file);img.onload=()=>URL.revokeObjectURL(img.src);img.alt='';row.append(img)}else{const icon=document.createElement('span');icon.className='article-file-icon';icon.textContent='↧';row.append(icon)}const copy=document.createElement('div'),name=document.createElement('strong'),size=document.createElement('small'),remove=document.createElement('button');name.textContent=file.name;size.textContent=fileSizeLabel(file.size);copy.append(name,size);remove.type='button';remove.textContent='Verwijder uit selectie';remove.addEventListener('click',()=>{selectedArticleFiles.splice(index,1);renderSelectedFiles()});row.append(copy,remove);box.append(row)})}
  $('#articleFiles').addEventListener('change',e=>{const incoming=[...e.target.files],combined=[...selectedArticleFiles,...incoming];let total=0;for(const file of combined){const extension=file.name.split('.').pop().toLowerCase();if(!allowedArticleExtensions.has(extension)){status($('#articlePublishStatus'),'Bestandstype niet toegestaan: '+file.name,'error');e.target.value='';return}if(file.size>4*1024*1024){status($('#articlePublishStatus'),file.name+' is groter dan 4 MB.','error');e.target.value='';return}total+=file.size}if(combined.length>5){status($('#articlePublishStatus'),'Je kunt maximaal 5 bestanden toevoegen.','error');e.target.value='';return}if(total>10*1024*1024){status($('#articlePublishStatus'),'De bestanden zijn samen groter dan 10 MB.','error');e.target.value='';return}selectedArticleFiles=combined;e.target.value='';status($('#articlePublishStatus'),'');renderSelectedFiles()});
  function filePayload(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type||'application/octet-stream',data:String(reader.result).split(',')[1]||''});reader.onerror=()=>reject(new Error(file.name+' kon niet worden gelezen.'));reader.readAsDataURL(file)})}
  async function callArticleFunction(payload){await ensureSession();const response=await fetch(SUPABASE_URL+'/functions/v1/admin-publish-article',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(payload)});return parseResponse(response)}
  const articlePageNames={informatie:'Informatie',apv:'APV',wetboek:'Wetboek AFR',onderwereld:'Onderwereld',hulpdiensten:'Hulpdiensten',risico:'Risicogebieden'};
  function renderArticlePreview(){const title=$('#articleTitle').value.trim(),content=$('#articleContent').value.trim(),category=$('#articleCategory').value;$('#articlePreviewTitle').textContent=title||'Jouw artikeltitel';$('#articlePreviewContent').textContent=content||'De artikeltekst verschijnt hier terwijl je typt.';$('#articlePreviewCategory').textContent=category;$('#articlePreviewCategory').hidden=!category}
  ['#articleTitle','#articleContent','#articleCategory'].forEach(selector=>$(selector).addEventListener('input',renderArticlePreview));
  async function loadRecentPublished(){const box=$('#recentPublishedList');if(!can('view_audit_log')){box.textContent='Alleen zichtbaar met activiteitenrechten.';return}try{const rows=await authRequest('/rest/v1/admin_audit_log?action=eq.article_created&select=id,target,details,created_at&order=created_at.desc&limit=8');box.textContent='';rows.forEach(item=>{const row=document.createElement('div');row.className='recent-published-item';const title=document.createElement('strong'),meta=document.createElement('small');title.textContent=item.details?.title||'Artikel';meta.textContent=(item.details?.page||item.target||'')+' · '+new Date(item.created_at).toLocaleString('nl-NL');row.append(title,meta);box.append(row)});if(!rows.length)box.textContent='Nog geen artikelen gepubliceerd.'}catch(e){box.textContent='Publicatiegeschiedenis kon niet worden geladen.'}}
  function loadArticlePublisher(){renderArticlePreview();renderSelectedFiles();loadRecentPublished();loadManagedArticles()}
  $('#articlePublishForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter,el=$('#articlePublishStatus');status(el,'Artikel en bestanden worden veilig naar GitHub gestuurd…');button.disabled=true;try{const attachments=await Promise.all(selectedArticleFiles.map(filePayload));const payload={action:'publish',page:$('#articlePage').value,title:$('#articleTitle').value.trim(),content:$('#articleContent').value.trim(),category:$('#articleCategory').value,attachments};const result=await callArticleFunction(payload);const selectedPage=$('#articlePage').value;e.target.reset();$('#articlePage').value=selectedPage;selectedArticleFiles=[];renderSelectedFiles();renderArticlePreview();status(el,(result?.message||'Artikel gepubliceerd.')+' De site wordt binnen enkele minuten bijgewerkt.','success');loadRecentPublished();loadManagedArticles()}catch(err){status(el,err.message,'error')}finally{button.disabled=false}});

  function renderManagedArticles(){const box=$('#managedArticlesList'),query=$('#managedArticleSearch').value.trim().toLowerCase();box.textContent='';const shown=managedArticles.filter(item=>(item.title+' '+(articlePageNames[item.page]||item.page)).toLowerCase().includes(query));shown.forEach(item=>{const row=document.createElement('article');row.className='managed-article-row';const copy=document.createElement('div'),title=document.createElement('strong'),page=document.createElement('small');title.textContent=item.title;page.textContent=articlePageNames[item.page]||item.page;copy.append(title,page);row.append(copy);if(can('delete_articles')){const remove=document.createElement('button');remove.type='button';remove.className='owner-delete-article';remove.textContent='Verwijderen';remove.addEventListener('click',()=>deleteManagedArticle(item,remove));row.append(remove)}box.append(row)});if(!shown.length)box.textContent=query?'Geen artikelen gevonden.':'Geen artikelen gevonden.'}
  async function loadManagedArticles(){const el=$('#managedArticlesStatus');status(el,'Artikelen ophalen…');try{const result=await callArticleFunction({action:'list'});managedArticles=(result.articles||[]).sort((a,b)=>(articlePageNames[a.page]||a.page).localeCompare(articlePageNames[b.page]||b.page,'nl')||a.title.localeCompare(b.title,'nl'));renderManagedArticles();status(el,managedArticles.length+' artikelen geladen.','success')}catch(err){status(el,err.message,'error')}}
  $('#managedArticleSearch').addEventListener('input',renderManagedArticles);
  async function deleteManagedArticle(item,button){if(!can('delete_articles'))return;const answer=prompt('Typ VERWIJDER om dit artikel definitief uit GitHub te verwijderen:\n\n'+item.title);if(answer!=='VERWIJDER')return;button.disabled=true;const el=$('#managedArticlesStatus');status(el,'Artikel verwijderen uit GitHub…');try{const result=await callArticleFunction({action:'delete',page:item.page,title:item.title});status(el,result.message||'Artikel verwijderd.','success');await loadManagedArticles();loadRecentPublished()}catch(err){status(el,err.message,'error');button.disabled=false}}

  async function getMaintenance(){const rows=await publicRequest('/rest/v1/site_settings?key=eq.maintenance&select=value');return rows?.[0]?.value||null}
  async function applyMaintenance(){const banner=$('.maintenance-banner');if(!banner)return;try{const cfg=await getMaintenance();if(!cfg)throw new Error();banner.dataset.noticeId=cfg.notice_id||'maintenance';banner.dataset.tone=cfg.tone||'warning';banner.querySelector('.maintenance-copy strong').textContent=cfg.title||'Onderhoud';banner.querySelector('.maintenance-copy span').textContent=cfg.message||'';let dismissed=false;try{dismissed=sessionStorage.getItem('afr-dismissed-maintenance')===banner.dataset.noticeId}catch(e){}banner.classList.toggle('is-hidden',!cfg.enabled||dismissed);banner.classList.add('admin-configured')}catch(e){banner.classList.add('admin-configured')}}
  async function loadMaintenanceForm(){try{const cfg=await getMaintenance();$('#maintenanceEnabled').checked=!!cfg?.enabled;$('#maintenanceTitle').value=cfg?.title||'';$('#maintenanceMessage').value=cfg?.message||'';$('#maintenanceTone').value=cfg?.tone||'warning';status($('#maintenanceStatus'),'')}catch(e){status($('#maintenanceStatus'),e.message,'error')}}
  $('#maintenanceForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;status($('#maintenanceStatus'),'Opslaan…');button.disabled=true;try{const current=await getMaintenance()||{};const value={...current,enabled:$('#maintenanceEnabled').checked,title:$('#maintenanceTitle').value.trim(),message:$('#maintenanceMessage').value.trim(),tone:$('#maintenanceTone').value,notice_id:'notice-'+Date.now()};await ensureSession();await authRequest('/rest/v1/site_settings?key=eq.maintenance',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({value,updated_by:session.user.id})});status($('#maintenanceStatus'),'Onderhoudsmelding opgeslagen.','success');await applyMaintenance()}catch(err){status($('#maintenanceStatus'),err.message,'error')}finally{button.disabled=false}});


  function launchLocalValue(value){
    const date=value?new Date(value):new Date(Date.now()+24*60*60*1000);
    if(Number.isNaN(date.getTime()))return'';
    const pad=value=>String(value).padStart(2,'0');
    return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());
  }
  function updateLaunchPreview(){
    const title=$('#launchTitle').value.trim()||'De APV opent binnenkort';
    const target=new Date($('#launchTarget').value);
    $('#launchPreviewTitle').textContent=title;
    $('#launchPreviewTime').textContent=Number.isNaN(target.getTime())?'Kies een openingsmoment':target.toLocaleString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  async function loadLaunchForm(){
    if(profile?.role!=='owner')return;
    try{
      const root=await getMaintenance()||{},cfg=root.launch||{};
      $('#launchEnabled').checked=!!cfg.enabled;
      $('#launchTitle').value=cfg.title||'De APV opent binnenkort';
      $('#launchMessage').value=cfg.message||'De vernieuwde regelgeving wordt klaargezet.';
      $('#launchTarget').value=launchLocalValue(cfg.target_at);
      updateLaunchPreview();
      const active=cfg.enabled&&new Date(cfg.target_at).getTime()>Date.now();
      status($('#launchStatus'),active?'Countdown is actief voor alle bezoekers.':'Countdown staat uit.',active?'success':'');
    }catch(err){status($('#launchStatus'),err.message,'error')}
  }
  ['#launchTitle','#launchTarget'].forEach(selector=>$(selector).addEventListener('input',updateLaunchPreview));
  document.querySelectorAll('[data-launch-add]').forEach(button=>button.addEventListener('click',()=>{
    const hours=Number(button.dataset.launchAdd)||1;
    $('#launchTarget').value=launchLocalValue(new Date(Date.now()+hours*60*60*1000));
    updateLaunchPreview();
  }));
  $('#launchControlForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(profile?.role!=='owner')return;
    const button=e.submitter,el=$('#launchStatus');
    status(el,'Launch countdown opslaan…');button.disabled=true;
    try{
      const target=new Date($('#launchTarget').value);
      if(Number.isNaN(target.getTime()))throw new Error('Kies een geldige openingsdatum en tijd.');
      if($('#launchEnabled').checked&&target.getTime()<=Date.now())throw new Error('De openingsdatum moet in de toekomst liggen.');
      const root=await getMaintenance()||{};
      const launch={
        enabled:$('#launchEnabled').checked,
        title:$('#launchTitle').value.trim()||'De APV opent binnenkort',
        message:$('#launchMessage').value.trim()||'De vernieuwde regelgeving wordt klaargezet.',
        target_at:target.toISOString(),
        live_title:'WE ZIJN LIVE',
        event_id:'launch-'+Date.now()
      };
      const value={...root,launch};
      await ensureSession();
      await authRequest('/rest/v1/site_settings?key=eq.maintenance',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({value,updated_by:session.user.id})});
      window.AFRLaunchControl?.ownerAuthenticated(profile);
      await window.AFRLaunchControl?.refresh();
      status(el,launch.enabled?'Countdown geactiveerd. Bezoekers zien nu alleen de timer.':'Countdowninstellingen opgeslagen.','success');
    }catch(err){status(el,err.message,'error')}finally{button.disabled=false}
  });
  $('#launchDisable').addEventListener('click',async()=>{
    if(profile?.role!=='owner')return;
    const button=$('#launchDisable'),el=$('#launchStatus');
    status(el,'Countdown uitschakelen…');button.disabled=true;
    try{
      const root=await getMaintenance()||{},previous=root.launch||{};
      const value={...root,launch:{...previous,enabled:false,event_id:'launch-'+Date.now()}};
      await ensureSession();
      await authRequest('/rest/v1/site_settings?key=eq.maintenance',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({value,updated_by:session.user.id})});
      $('#launchEnabled').checked=false;
      await window.AFRLaunchControl?.refresh();
      status(el,'Countdown uitgeschakeld. De APV is weer zichtbaar voor iedereen.','success');
    }catch(err){status(el,err.message,'error')}finally{button.disabled=false}
  });

  function accountNode(item){const row=document.createElement('article');row.className='admin-account';const dot=document.createElement('span');dot.className='account-state'+(item.active?' active':'');const copy=document.createElement('div'),name=document.createElement('strong'),user=document.createElement('small'),role=document.createElement('span');name.textContent=item.display_name;user.textContent='@'+item.username;role.className='account-role';role.textContent=item.role;copy.append(name,user);row.append(dot,copy,role);return row}
  async function loadAccounts(){const box=$('#adminAccountsList');box.textContent='Accounts laden…';try{accounts=await authRequest('/rest/v1/admin_profiles?select=id,username,display_name,role,permissions,active,created_at&order=created_at.asc');box.textContent='';accounts.forEach(item=>box.append(accountNode(item)));if(!accounts.length)box.textContent='Geen accounts gevonden.'}catch(e){box.textContent=e.message}}
  $('#createAccountForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter,el=$('#createAccountStatus');status(el,'Account veilig aanmaken…');button.disabled=true;try{await ensureSession();const permissions=[...document.querySelectorAll('input[name="permission"]:checked')].map(x=>x.value);if(permissions.includes('delete_articles')&&!permissions.includes('manage_articles'))permissions.push('manage_articles');const response=await fetch(SUPABASE_URL+'/functions/v1/admin-create-user',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({username:$('#newUsername').value.trim().toLowerCase(),display_name:$('#newDisplayName').value.trim(),password:$('#newPassword').value,role:$('#newRole').value,permissions})});await parseResponse(response);e.target.reset();status(el,'Account is aangemaakt.','success');loadAccounts();loadOverview()}catch(err){const message=/Failed to fetch|404|FunctionsFetchError/i.test(err.message)?'De beveiligde accountfunctie moet nog worden geïnstalleerd.':err.message;status(el,message,'error')}finally{button.disabled=false}});

  async function loadAudit(){const box=$('#adminAuditList');box.textContent='Activiteiten laden…';try{const rows=await authRequest('/rest/v1/admin_audit_log?select=id,action,target,created_at,user_id&order=created_at.desc&limit=40');box.textContent='';rows.forEach(item=>{const row=document.createElement('article');row.className='admin-audit-item';const copy=document.createElement('div'),title=document.createElement('strong'),date=document.createElement('small');title.textContent=item.action+(item.target?' · '+item.target:'');date.textContent=new Date(item.created_at).toLocaleString('nl-NL');copy.append(title,date);row.append(copy);box.append(row)});if(!rows.length)box.textContent='Nog geen activiteiten.'}catch(e){box.textContent=e.message}}

  async function resume(){session=storedSession();if(session){try{await loadProfile();showDashboard()}catch(e){saveSession(null);showLogin()}}applyMaintenance()}
  resume();setInterval(applyMaintenance,5*60*1000);
})();