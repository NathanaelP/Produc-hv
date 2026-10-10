import {makeSheet,parseCount,itemsOf,isFilled,filledCount,textSummary,csvSummary,validateBackup} from './core.js';

const $ = id => document.getElementById(id);
let state, db, edit = false, filled = false, categoryId = 'produce', toastTimer, installPrompt, registration;
let saveQueue = Promise.resolve(), saveRevision = 0, saveStatus = 'Saved';
const sheet = () => state.sheets.find(s => s.id === state.activeId);
const el = (tag, className, text) => {const e=document.createElement(tag); if(className)e.className=className; if(text!==undefined)e.textContent=text; return e;};
function toast(message) {clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false; toastTimer=setTimeout(() => $('toast').hidden=true,3500);}
function storageError(message) {$('storage-error').textContent=message; $('storage-error').hidden=false;}
function openDialog(title, content) {$('dialog-title').textContent=title; $('dialog-body').replaceChildren(content); if(!$('dialog').open)$('dialog').showModal();}
function action(text, handler, primary=false) {const b=el('button',`btn${primary?' primary':''}`,text);b.type='button';b.addEventListener('click',handler);return b;}
function confirmDialog(title, message, button, handler) {
  const box=el('div');box.append(el('p','',message),action(button,async () => {try {await handler();$('dialog').close();} catch(e){toast(e.message);}},true));openDialog(title,box);
}
function openDatabase() {
  return new Promise((resolve,reject) => {
    const request=indexedDB.open(`produce-hv:${new URL('./',location.href).pathname}`,1);
    request.onupgradeneeded=() => request.result.createObjectStore('app');
    request.onsuccess=() => resolve(request.result);
    request.onerror=() => reject(request.error);
    request.onblocked=() => reject(new Error('Close other tabs of this app and reload.'));
  });
}
function readState() {
  return new Promise((resolve,reject) => {
    const transaction=db.transaction('app','readonly'), request=transaction.objectStore('app').get('state');
    request.onsuccess=() => resolve(request.result);request.onerror=() => reject(request.error);
  });
}
function writeState(snapshot) {
  return new Promise((resolve,reject) => {
    const transaction=db.transaction('app','readwrite');
    transaction.objectStore('app').put(snapshot,'state');
    transaction.oncomplete=resolve;transaction.onerror=() => reject(transaction.error);transaction.onabort=() => reject(transaction.error || new Error('Save aborted'));
  });
}
async function persist() {
  const revision=++saveRevision;
  if(!db) {updateSummary('Not saved');return false;}
  const snapshot=structuredClone(state);
  updateSummary('Saving…');
  saveQueue=saveQueue.catch(() => {}).then(() => writeState(snapshot));
  try {
    await saveQueue;
    if(revision===saveRevision){$('storage-error').hidden=true;updateSummary('Saved');}
    return true;
  } catch(e) {
    storageError('Counts could not be saved. Keep this page open and use Backup to download them.');updateSummary('Not saved');return false;
  }
}
function changed() {sheet().updated=new Date().toISOString();void persist();}
function updateSummary(status) {
  const current=sheet(), n=filledCount(current);
  if(status)saveStatus=status;
  const saveText=db ? saveStatus : 'Not saved';
  $('summary').textContent=n ? `${n} of ${itemsOf(current).length} entered · ${saveText}` : 'Nothing entered';
  $('copy').disabled=!n;
  $('item-total').textContent=`${itemsOf(current).length} items.`;
  for(const c of current.categories){const progress=document.getElementById(`progress-${c.id}`);if(progress)progress.textContent=`${c.items.filter(i => isFilled(current,i.id)).length} / ${c.items.length}`;}
}
function updateDate() {
  $('date').value=sheet().date;
  $('date-label').textContent=new Date(`${sheet().date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function rename(title, value, done) {
  const form=el('form'), input=el('input','form-input');input.value=value;input.maxLength=120;input.required=true;
  const label=el('label','form-label','Name');label.htmlFor='rename-input';input.id='rename-input';
  const button=el('button','btn primary','Save name');button.type='submit';form.append(label,input,button);
  form.addEventListener('submit',event => {event.preventDefault();if(!input.value.trim())return;done(input.value.trim());changed();render();$('dialog').close();});
  openDialog(title,form);input.focus();input.select();
}
function setCount(item,input,value) {
  if(value===null)delete sheet().counts[item.id];else sheet().counts[item.id]=value;
  input.value=value===null?'':String(value);input.dataset.filled=String(value!==null);input.removeAttribute('aria-invalid');input.setCustomValidity('');
  input.closest('.row').querySelector('[data-decrease]').disabled=value===null||value===0;
  changed();
}
function buildRow(item) {
  const row=el('li','row');row.dataset.item=item.id;
  if(edit) {
    const name=el('button','name-edit');name.append(document.createTextNode(item.name),el('span','edit-mark','✎'));name.setAttribute('aria-label',`Rename ${item.name}`);
    name.onclick=() => rename('Edit item',item.name,value => item.name=value);
    const remove=el('button','step remove','×');remove.setAttribute('aria-label',`Remove ${item.name}`);
    remove.onclick=() => confirmDialog('Remove item?',`Remove ${item.name} from this sheet? Other saved sheets will keep their own lists.`,'Remove item',() => {
      for(const c of sheet().categories)c.items=c.items.filter(i => i.id!==item.id);delete sheet().counts[item.id];changed();render();
    });row.append(name,remove);return row;
  }
  const label=el('label','item-label',item.name);label.htmlFor=`count-${item.id}`;
  const minus=el('button','step','−');minus.setAttribute('aria-label',`Decrease ${item.name}`);minus.dataset.decrease='';minus.disabled=!isFilled(sheet(),item.id)||sheet().counts[item.id]===0;
  const input=el('input','count-input');input.id=label.htmlFor;input.type='text';input.inputMode='decimal';input.autocomplete='off';input.enterKeyHint='next';input.setAttribute('aria-label',`${item.name} count`);input.value=isFilled(sheet(),item.id)?String(sheet().counts[item.id]):'';input.dataset.filled=String(isFilled(sheet(),item.id));
  input.addEventListener('input',() => {
    try {const number=parseCount(input.value);if(number===null)delete sheet().counts[item.id];else sheet().counts[item.id]=number;input.dataset.filled=String(number!==null);minus.disabled=number===null||number===0;input.removeAttribute('aria-invalid');input.setCustomValidity('');changed();}
    catch(e){input.setAttribute('aria-invalid','true');input.setCustomValidity(e.message);}
  });
  input.addEventListener('blur',() => {
    if(input.getAttribute('aria-invalid')==='true'){toast(input.validationMessage);input.value=isFilled(sheet(),item.id)?String(sheet().counts[item.id]):'';input.removeAttribute('aria-invalid');input.setCustomValidity('');}
    else if(input.value!=='')input.value=String(sheet().counts[item.id]);
    if(filled&&!isFilled(sheet(),item.id))render();
  });
  input.addEventListener('keydown',e => {if(e.key==='Enter'){e.preventDefault();const inputs=[...document.querySelectorAll('.count-input')];const next=inputs[inputs.indexOf(input)+1];if(next){next.focus();next.select();}else input.blur();}});
  const plus=el('button','step','+');plus.setAttribute('aria-label',`Increase ${item.name}`);
  minus.onclick=() => setCount(item,input,Math.max(0,Math.round(((sheet().counts[item.id]||0)-1)*1000)/1000));
  plus.onclick=() => {const n=Math.round(((sheet().counts[item.id]||0)+1)*1000)/1000;if(n>999999){toast('Maximum count is 999,999.');return;}setCount(item,input,n);};
  row.append(label,minus,input,plus);return row;
}
function render() {
  const current=sheet();if(!current.categories.some(c => c.id===categoryId))categoryId=current.categories[0].id;
  const chips=el('div');
  for(const c of current.categories) {
    const b=el('button','chip',c.name);b.setAttribute('aria-current',String(categoryId===c.id));b.onclick=() => {
      categoryId=c.id;for(const chip of $('chips').querySelectorAll('[aria-current]'))chip.setAttribute('aria-current',String(chip===b));
      document.getElementById(`section-${c.id}`).scrollIntoView({block:'start'});
    };chips.append(b);
  }
  const editButton=el('button','chip',edit?'Done':'Edit');editButton.setAttribute('aria-pressed',String(edit));editButton.onclick=() => {edit=!edit;render();};
  const filledButton=el('button','chip','Filled');filledButton.setAttribute('aria-pressed',String(filled));filledButton.onclick=() => {filled=!filled;render();};chips.append(editButton,filledButton);
  $('chips').replaceChildren(...chips.childNodes);
  const sections=[];
  for(const c of current.categories) {
    const section=el('section','section');section.id=`section-${c.id}`;section.setAttribute('aria-labelledby',`label-${c.id}`);
    const heading=el('div','section-label'), h=el('h2','',c.name);h.id=`label-${c.id}`;
    if(edit){const renameButton=el('button','text-btn',`${c.name} ✎`);renameButton.setAttribute('aria-label',`Rename category ${c.name}`);renameButton.onclick=() => rename('Edit category',c.name,value => c.name=value);heading.append(renameButton);}else heading.append(h);
    // Preserve the section's accessible label in edit mode too.
    if(edit){h.hidden=true;heading.append(h);}
    const progress=el('span','section-progress');progress.id=`progress-${c.id}`;heading.append(progress);section.append(heading);
    const list=el('ul');const visible=c.items.filter(i => edit||!filled||isFilled(current,i.id));list.append(...visible.map(buildRow));section.append(list);
    if(!visible.length)section.append(el('p','empty',filled&&!edit?'No counts entered in this section yet.':'No items in this section.'));
    if(edit) {
      const form=el('form','add-row'), input=el('input','add-input');input.placeholder='Add an item';input.maxLength=120;input.required=true;input.setAttribute('aria-label',`New ${c.name} item`);
      const add=el('button','step','+');add.type='submit';add.setAttribute('aria-label',`Add ${c.name} item`);form.append(input,add);
      form.onsubmit=e => {e.preventDefault();if(!input.value.trim())return;c.items.push({id:crypto.randomUUID(),name:input.value.trim()});changed();render();};section.append(form);
    }
    sections.push(section);
  }
  $('sections').replaceChildren(...sections);updateDate();updateSummary();
}
function download(name,content,type) {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(() => URL.revokeObjectURL(url),10000);
}
function history() {
  const box=el('div');box.append(el('p','',`${state.sheets.length} saved sheet${state.sheets.length===1?'':'s'} on this device.`));
  for(const s of [...state.sheets].sort((a,b) => b.date.localeCompare(a.date)||b.updated.localeCompare(a.updated))) {
    const button=el('button','history-row');button.setAttribute('aria-current',String(s.id===state.activeId));
    const title=el('div');title.append(el('strong','',new Date(`${s.date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})),el('span','',new Date(s.updated).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})));
    button.append(title,el('span','',`${filledCount(s)} / ${itemsOf(s).length} entered`));button.onclick=() => {state.activeId=s.id;edit=false;changed();render();$('dialog').close();window.scrollTo(0,0);};box.append(button);
  }openDialog('Past sheets',box);
}
function toolsDialog() {
  const box=el('div');box.append(el('p','','Back up your counts before clearing browser data or moving to another phone.'));
  box.append(action('Download backup',() => download(`produce-hv-backup-${sheet().date}.json`,JSON.stringify(state,null,2),'application/json')),
    action('Export this sheet as CSV',() => download(`produce-hv-${sheet().date}.csv`,csvSummary(sheet()),'text/csv;charset=utf-8')));
  const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
  const restore=action('Restore a backup',() => input.click());box.append(restore,input);
  input.onchange=async () => {
    const file=input.files[0];if(!file)return;
    try {
      if(file.size>10*1024*1024)throw new Error('Backup is too large (maximum 10 MB).');
      const backup=validateBackup(JSON.parse(await file.text()));
      confirmDialog('Restore backup?',`This will replace the ${state.sheets.length} sheet(s) on this device with ${backup.sheets.length} sheet(s) from the backup. Download a backup first if you want to keep the current sheets.`,'Restore backup',async () => {
        if(!db)throw new Error('Storage is unavailable. Reload in a browser that allows device storage.');
        await saveQueue.catch(() => {});await writeState(backup);state=backup;edit=false;filled=false;render();toast('Backup restored.');
      });
    }catch(e){toast(e instanceof SyntaxError?'That file is not a valid JSON backup.':e.message);}
  };
  box.append(el('p','','Install: on iPhone, open in Safari, tap Share, then Add to Home Screen. On Android, use the browser menu’s Install app or Add to Home screen option. Open the installed app online once before relying on it offline.'));
  if(installPrompt)box.append(action('Install Produce & HV',async () => {await installPrompt.prompt();installPrompt=null;$('dialog').close();}));
  if(registration?.waiting)box.append(action('Apply available update',async () => {await saveQueue;if($('storage-error').hidden)registration.waiting.postMessage('ACTIVATE_UPDATE');else toast('Back up unsaved counts before updating.');}));
  box.append(action('Keep storage on this device',async () => {
    if(!navigator.storage?.persist){toast('Persistent storage is managed by this browser. Keep a backup.');return;}
    const granted=await navigator.storage.persist();toast(granted?'Persistent storage enabled. Keep backups too.':'The browser manages storage. Keep a backup.');
  }));openDialog('Your data & app',box);
}
async function offlineSetup() {
  if(!('serviceWorker' in navigator)){$('offline-status').textContent='Offline access requires a supported browser.';return;}
  try {
    registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    const updateStatus=async () => {
      const ready=!!registration.active;
      $('offline-status').textContent=registration.waiting?'Update available · open Backup, export & install':ready?(navigator.onLine?'Ready for offline use · Add to Home Screen':'Offline · counts save on this device'):'Preparing offline access…';
    };
    registration.addEventListener('updatefound',() => {registration.installing?.addEventListener('statechange',updateStatus);});
    await navigator.serviceWorker.ready;updateStatus();window.addEventListener('online',updateStatus);window.addEventListener('offline',updateStatus);
    let hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',() => {if(hadController)location.reload();hadController=true;updateStatus();});
  }catch(e){$('offline-status').textContent='Offline access unavailable. Open over HTTPS or localhost.';}
}
$('close-dialog').onclick=() => $('dialog').close();
$('dialog').addEventListener('click',e => {if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
$('past').onclick=history;$('tools').onclick=toolsDialog;
$('new').onclick=() => confirmDialog('Start a new sheet?','Your current sheet stays in Past. The new sheet uses the same item list, with blank counts and today’s date.','Start new sheet',() => {
  const next=makeSheet(sheet().categories);state.sheets.push(next);state.activeId=next.id;edit=false;filled=false;changed();render();window.scrollTo(0,0);
});
$('copy').onclick=async () => {
  const text=textSummary(sheet());
  try {await navigator.clipboard.writeText(text);toast('Counts copied.');}
  catch {const box=el('div'), area=el('textarea','copy-text');area.value=text;area.readOnly=true;box.append(el('p','','Select and copy this summary.'),area);openDialog('Copy counts',box);area.focus();area.select();}
};
$('date').onchange=() => {if(!$('date').value){updateDate();return;}sheet().date=$('date').value;changed();updateDate();};
window.addEventListener('beforeinstallprompt',e => {e.preventDefault();installPrompt=e;});
new ResizeObserver(entries => {document.documentElement.style.setProperty('--chrome-height',`${entries[0].target.getBoundingClientRect().height}px`);}).observe($('chrome'));
try {
  db=await openDatabase();const saved=await readState();
  if(saved)state=validateBackup(saved);
  else {const first=makeSheet();state={version:1,activeId:first.id,sheets:[first]};await writeState(state);}
}catch(e) {
  db?.close();db=null;const first=makeSheet();state={version:1,activeId:first.id,sheets:[first]};
  storageError('Device storage is unavailable or could not be read. Changes are temporary; use Backup to download your counts. Existing stored data has not been overwritten.');
}
render();for(const id of ['past','new','date','tools'])$(id).disabled=false;void offlineSetup();
