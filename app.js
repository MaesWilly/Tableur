/* ============================================================================
 *  MES FINANCES — application de gestion financière (PWA)
 *  Fonctionne hors ligne. Données : IndexedDB du navigateur.
 *  Synchronisation + sauvegarde : Google Drive (dossier « Mes Finances »).
 * ========================================================================== */
'use strict';
(function () {

/* ============================== CONSTANTES =============================== */

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_C = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
const CONSIGN = 'Consignation';

const DEFAUT = {
  comptes: ['Cash','Moncash','Natcash','Sogebank','Unibank','Consignation'],
  categories: ['Nourriture','Transport','Chantier / Matériel','Outillage','Personnel / Salaires',
               'Administratif','Santé','Logement','Communication','Famille','Intérêts',
               'Frais bancaires','Taxes','Divers'],
  personnes: [],
  taux: 5,
  nomApp: 'Mes Finances'
};
/* Catégories techniques : jamais comptées comme dépense ou revenu réel. */
const EXCLUS = ['Transfert','Prêt','Emprunt','Remboursement','Solde initial'];

const TYPES = [
  {k:'depense',l:'Dépense'}, {k:'revenu',l:'Revenu'}, {k:'transfert',l:'Transfert'},
  {k:'pret',l:'Prêt accordé'}, {k:'emprunt',l:'Emprunt reçu'}, {k:'rembours',l:'Remboursement'},
  {k:'initial',l:'Solde de départ'}
];
const LIBELLE = {initial:'Solde de départ',depense:'Dépense',revenu:'Revenu',transfert:'Transfert',
                 pret:'Prêt accordé',emprunt:'Emprunt reçu',rembours:'Remboursement'};
const CHAMPS = {
  initial:   ['date','compte','montant','signe','commentaire'],
  depense:   ['date','compte','montant','categorie','description','frais','tca','consigne','commentaire'],
  revenu:    ['date','compte','montant','categorie','description','frais','tca','consigne','commentaire'],
  transfert: ['date','paire','montant','frais','tca','commentaire'],
  pret:      ['date','personne','source','montant','frais','tca','fraisCharge','tauxPret','echeance','description','commentaire'],
  emprunt:   ['date','personne','destination','montant','frais','tca','tauxPret','echeance','description','commentaire'],
  rembours:  ['date','dossier','compte','montant','ecart','frais','tca','description','commentaire']
};

/* ================================ OUTILS ================================= */

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,'0');
const NF = new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const r2 = n => Math.round((Number(n)||0)*100)/100;
const htg = n => NF.format(n||0)+' HTG';
const now = () => Date.now();
const uid = () => now().toString(36)+Math.random().toString(36).slice(2,8);
const clone = o => JSON.parse(JSON.stringify(o));

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function num(t){ const v=parseFloat(String(t==null?'':t).replace(/[\s\u202f\u00a0]/g,'').replace(',','.')); return isNaN(v)?0:v; }
function joindre(){ return Array.from(arguments).map(x=>String(x||'').trim()).filter(Boolean).join(' — '); }
function iso(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function aujourdhui(){ return iso(new Date()); }
function frDate(s){ if(!s) return ''; const p=s.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function debutMois(y,m){ return y+'-'+pad(m+1)+'-01'; }
function finMois(y,m){ return iso(new Date(y,m+1,0)); }
function veille(s){ const p=s.split('-').map(Number); return iso(new Date(p[0],p[1]-1,p[2]-1)); }
function plusMois(s,n){
  if(!s) return '';
  const p=s.split('-').map(Number); const d=new Date(p[0],p[1]-1+n,p[2]);
  if(d.getDate()!==p[2]) d.setDate(0);           // 31 janvier + 1 mois → 28/29 février
  return iso(d);
}
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ v==null ? localStorage.removeItem(k) : localStorage.setItem(k,v); }catch(e){} }

function toast(txt,err){
  const t=$('toast'); t.textContent=txt; t.className='on'+(err?' err':'');
  clearTimeout(toast._t); toast._t=setTimeout(()=>{ t.className=''; }, err?5000:2600);
}

/* Montants : séparateur de milliers pendant la frappe (1 500,00 et non 1500). */
function grouper(txt){
  const neg=/^-/.test(txt);
  const brut=txt.replace(/[^0-9,\.]/g,'').replace(/\./g,',');
  const p=brut.split(',');
  let ent=(p[0]||'').replace(/^0+(?=\d)/,'');
  const dec=p.length>1 ? ','+p.slice(1).join('').slice(0,2) : '';
  ent=ent.replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  return (neg?'-':'')+ent+dec;
}
function champMontant(i,onchange){
  i.addEventListener('input',()=>{
    const pos=i.value.length-i.selectionStart;
    i.value=grouper(i.value);
    const np=Math.max(0,i.value.length-pos);
    try{ i.setSelectionRange(np,np); }catch(e){}
    if(onchange) onchange();
  });
  i.addEventListener('blur',()=>{
    if(!i.value) return;
    const v=num(i.value); i.value=v?NF.format(v):'';
    if(onchange) onchange();
  });
}

/* ============================ STOCKAGE LOCAL ============================= */

const DB = {
  db:null,
  open(){
    return new Promise(res=>{
      try{
        const r=indexedDB.open('finance-willy',1);
        r.onupgradeneeded=()=>r.result.createObjectStore('kv');
        r.onsuccess=()=>{ DB.db=r.result; res(); };
        r.onerror=()=>res();
      }catch(e){ res(); }
    });
  },
  get(k){
    if(!DB.db){ const v=lsGet('fw_'+k); return Promise.resolve(v?JSON.parse(v):undefined); }
    return new Promise((res,rej)=>{ const q=DB.db.transaction('kv').objectStore('kv').get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); });
  },
  set(k,v){
    if(!DB.db){ lsSet('fw_'+k,JSON.stringify(v)); return Promise.resolve(); }
    return new Promise((res,rej)=>{ const tx=DB.db.transaction('kv','readwrite'); tx.objectStore('kv').put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });
  }
};

/* ================================ ÉTAT =================================== */
/*
 *  S.ops   : { id → opération }   chaque opération porte ses lignes calculées
 *  S.evts  : { id → évènement libre }
 *  S.params: listes, taux. Les suppressions sont marquées (deleted) et jamais
 *            effacées, pour que la fusion PC ↔ téléphone sache ce qui a disparu.
 */
let S = null;
let IX = {J:[],T:[],I:[]};
const UI = { annee:new Date().getFullYear(), mois:new Date().getMonth(), onglet:'dash' };

function etatVide(){
  return { schema:1, params:Object.assign(clone(DEFAUT),{retires:[],updatedAt:0}), ops:{}, evts:{} };
}

async function sauver(){
  await DB.set('etat',S);
  indexer();
  rendre();
  Sync.planifier();
}

/* ============================ ÉCRITURES ================================== */

function accessoire(base,valeur,unite,devise,taux){
  const v=Number(valeur)||0;
  if(v<=0) return 0;
  return unite==='HTG' ? r2(devise==='HTD'?v*taux:v) : r2(base*v/100);
}
function detailAcc(valeur,unite,base){ return unite==='HTG' ? 'montant fixe' : valeur+' % de '+NF.format(base)+' gd'; }

/** Transforme une opération en lignes : journal (j), tiers (t), dossier (i). */
function genLignes(op){
  const taux=op.tauxChange||S.params.taux||5;
  const m=op.devise==='HTD' ? r2(op.montant*taux) : r2(op.montant);
  const dev=op.devise==='HTD' ? 'saisi '+op.montant+' $HT × '+taux : '';
  const c=joindre(op.commentaire,dev);
  const L=[];
  const J=(compte,desc,cat,debit,credit,com)=>L.push({k:'j',compte,desc,cat,debit:r2(debit),credit:r2(credit),com:com===undefined?c:com});
  const T=(tab,dossier,mouv,desc,debit,credit,com)=>L.push({k:'t',tab,personne:op.personne,dossier,mouv,desc,debit:r2(debit),credit:r2(credit),com:com===undefined?c:com});
  const lib=op.description||op.categorie||LIBELLE[op.type];
  const frais=compte=>{
    const f=accessoire(m,op.frais,op.fraisUnite,op.devise,taux);
    if(f>0) J(compte,'Frais — '+lib,'Frais bancaires',-f,0,detailAcc(op.frais,op.fraisUnite,m));
    const t=accessoire(m,op.tca,op.tcaUnite,op.devise,taux);
    if(t>0) J(compte,'Taxe — '+lib,'Taxes',-t,0,detailAcc(op.tca,op.tcaUnite,m));
    return r2(f+t);
  };

  switch(op.type){
    case 'initial':
      if(op.signe==='-') J(op.compte,'Solde de départ','Solde initial',-m,0);
      else J(op.compte,'Solde de départ','Solde initial',0,m);
      break;

    case 'depense': {
      if(op.consigne){
        const note=joindre(c, op.pour?'consigné pour '+op.pour:'consignation');
        J(op.compte,'Transfer to '+CONSIGN,'Transfert',-m,0,note);
        J(CONSIGN,'Transfer from '+op.compte,'Transfert',0,m,note);
        J(CONSIGN,lib,op.categorie,-m,0,note);
      } else J(op.compte,lib,op.categorie,-m,0);
      frais(op.compte);
      break;
    }
    case 'revenu': {
      if(op.consigne){
        const note=joindre(c, op.pour?'consigné pour '+op.pour:'consignation');
        J(CONSIGN,lib,op.categorie,0,m,note);
        J(CONSIGN,'Transfer to '+op.compte,'Transfert',-m,0,note);
        J(op.compte,'Transfer from '+CONSIGN,'Transfert',0,m,note);
      } else J(op.compte,lib,op.categorie,0,m);
      frais(op.compte);
      break;
    }
    case 'transfert':
      J(op.source,'Transfer to '+op.destination,'Transfert',-m,0);
      J(op.destination,'Transfer from '+op.source,'Transfert',0,m);
      frais(op.source);
      break;

    case 'pret': {
      J(op.source,'Prêt à '+op.personne+' — '+op.dossier,'Prêt',-m,0);
      const fr=frais(op.source);
      /* Les frais ne font partie du dossier que si l'emprunteur doit les rembourser.
         Le même capital part dans Prêt et dans Investissement : les deux soldes concordent. */
      const cap=op.fraisCharge ? r2(m+fr) : m;
      const com=joindre(c, op.fraisCharge&&fr ? 'dont '+NF.format(fr)+' gd de frais à rembourser' : '');
      T('pret',op.dossier,'Prêt accordé',op.description||'Prêt accordé',0,cap,com);
      L.push({k:'i',dossier:op.dossier,personne:op.personne,debut:op.date,fin:op.echeance||'',
              desc:op.description||'Prêt accordé',capital:cap,taux:(Number(op.tauxPret)||0)/100});
      break;
    }
    case 'emprunt':
      J(op.destination,'Emprunt reçu de '+op.personne+' — '+op.dossier,'Emprunt',0,m);
      frais(op.destination);
      T('emprunt',op.dossier,'Emprunt reçu',op.description||'Emprunt reçu',0,m);
      L.push({k:'i',dossier:op.dossier,personne:op.personne,debut:op.date,fin:op.echeance||'',
              desc:op.description||'Emprunt reçu',capital:m,taux:(Number(op.tauxPret)||0)/100});
      break;

    case 'rembours': {
      const sortie=/^EMP/i.test(op.dossier);
      J(op.compte, sortie ? 'Remboursement à '+op.personne+' — '+op.dossier
                          : 'Remboursement de '+op.personne+' — '+op.dossier,
        'Remboursement', sortie?-m:0, sortie?0:m);
      T(sortie?'emprunt':'pret',op.dossier,'Remboursement',op.description||'Remboursement',-m,0);
      frais(op.compte);
      break;
    }
    default: throw new Error('Type inconnu : '+op.type);
  }
  return L;
}

/* ============================== INDEX ==================================== */
/* Toutes les lignes, triées par date puis ordre de saisie. Les soldes sont
   cumulés depuis le tout début : le report d'un mois sur l'autre est automatique. */

function indexer(){
  const ops=Object.values(S.ops).filter(o=>!o.deleted)
    .sort((a,b)=> a.date<b.date?-1 : a.date>b.date?1 : (a.createdAt-b.createdAt));
  const J=[],T=[],I=[];
  ops.forEach(o=>(o.lignes||[]).forEach(l=>{
    const x=Object.assign({},l,{date:o.date,opId:o.id,type:o.type});
    if(l.k==='j') J.push(x); else if(l.k==='t') T.push(x); else I.push(x);
  }));
  const sc={}; J.forEach(x=>{ sc[x.compte]=r2((sc[x.compte]||0)+x.debit+x.credit); x.solde=sc[x.compte]; });
  const sd={}; T.forEach(x=>{ sd[x.dossier]=r2((sd[x.dossier]||0)+x.debit+x.credit); x.soldeDossier=sd[x.dossier]; });
  IX={J,T,I};
}

function listeComptes(){
  const l=S.params.comptes.slice();
  IX.J.forEach(x=>{ if(l.indexOf(x.compte)===-1) l.push(x.compte); });
  return l;
}
/** Solde d'un compte à la fin du jour donné. */
function soldeAu(c,jour){
  let s=0;
  for(const x of IX.J){ if(x.date>jour) break; if(x.compte===c) s=x.solde; }
  return s;
}
function etatDossier(i,auJour){
  let remb=0;
  IX.T.forEach(x=>{ if(x.dossier===i.dossier && x.date<=auJour) remb-=x.debit; });
  remb=r2(remb);
  const interet=r2(i.capital*i.taux), att=r2(i.capital+interet), reste=r2(att-remb);
  const ref=auJour<aujourdhui()?auJour:aujourdhui();
  const statut= reste<=0.004 ? 'Soldé' : (i.fin && i.fin<ref ? 'En retard' : 'En cours');
  return Object.assign({},i,{interet,attendu:att,rembourse:remb,reste,pct:att?remb/att:0,statut});
}
function dossiersOuverts(){
  return IX.I.map(i=>etatDossier(i,'9999-12-31')).filter(d=>d.reste>0.004);
}
function evtsLibres(){ return Object.values(S.evts).filter(e=>!e.deleted).sort((a,b)=>a.date<b.date?-1:1); }
function echeancesAuto(d0,d1){
  return IX.I.filter(i=>i.fin && i.fin>=d0 && i.fin<=d1).map(i=>etatDossier(i,'9999-12-31'))
    .filter(d=>d.statut!=='Soldé').map(d=>{
      const emp=/^EMP/i.test(d.dossier);
      return {date:d.fin,nom:(emp?'Remboursement à verser — ':'Remboursement à recevoir — ')+d.dossier,
              personne:d.personne,montant:emp?-d.reste:d.reste,auto:true};
    });
}

/* ============================== RENDU ==================================== */

function cellM(n,toujours){
  if(!n && !toujours) return '<td class="num"></td>';
  return '<td class="num '+(n<0?'neg':n>0?'pos':'')+'">'+NF.format(n||0)+'</td>';
}
function badge(st){ return '<span class="badge '+(st==='Soldé'?'b-ok':st==='En retard'?'b-ret':'b-cours')+'">'+esc(st)+'</span>'; }
function actes(opId){
  return '<td class="acts"><button class="ib" data-edit="'+opId+'" title="Modifier">✎</button>'+
         '<button class="ib del" data-del="'+opId+'" title="Supprimer">🗑</button></td>';
}
function moisPrec(y,m){ return m===0 ? 'Décembre '+(y-1) : MOIS[m-1]; }

function nomApp(){ return (S.params.nomApp||'Mes Finances').trim()||'Mes Finances'; }
function rendre(){
  document.title=nomApp(); $('brandNom').textContent=nomApp();
  rendreAnnees(); rendreMois(); rendreOnglets(); rendreVue();
}

function rendreAnnees(){
  const ans=new Set([new Date().getFullYear(), new Date().getFullYear()+1, UI.annee]);
  Object.values(S.ops).forEach(o=>{ if(!o.deleted&&o.date) ans.add(Number(o.date.slice(0,4))); });
  const sel=$('annee');
  sel.innerHTML=Array.from(ans).sort().map(a=>'<option'+(a===UI.annee?' selected':'')+'>'+a+'</option>').join('');
}
function rendreMois(){
  const actifs=new Set(IX.J.map(x=>x.date.slice(0,7)));
  $('moisBar').innerHTML=MOIS.map((n,i)=>{
    const cle=UI.annee+'-'+pad(i+1);
    return '<button data-m="'+i+'" aria-current="'+(i===UI.mois)+'" class="'+(actifs.has(cle)?'':'vide')+'">'+n+'</button>';
  }).join('');
  const cur=$('moisBar').querySelector('[aria-current="true"]');
  if(cur && cur.scrollIntoView) cur.scrollIntoView({block:'nearest',inline:'nearest'});
}
function onglets(){
  return [['dash','📊 Tableau de bord']]
    .concat(listeComptes().map(c=>['c:'+c,'💳 '+c]))
    .concat([['pret','🤝 Prêt'],['emprunt','🏦 Emprunté'],['invest','📈 Investissement'],['evts','📅 Évènements']]);
}
function rendreOnglets(){
  const l=onglets();
  if(!l.some(o=>o[0]===UI.onglet)) UI.onglet='dash';
  $('ongletsBar').innerHTML=l.map(o=>'<button data-o="'+esc(o[0])+'" aria-current="'+(o[0]===UI.onglet)+'">'+esc(o[1])+'</button>').join('');
}
function rendreVue(){
  const y=UI.annee, m=UI.mois, o=UI.onglet;
  let h='';
  if(o==='dash') h=vueDash(y,m);
  else if(o.indexOf('c:')===0) h=vueCompte(o.slice(2),y,m);
  else if(o==='pret'||o==='emprunt') h=vueTiers(o,y,m);
  else if(o==='invest') h=vueInvest(y,m);
  else if(o==='evts') h=vueEvts(y,m);
  $('vue').innerHTML=h;
  lsSet('fw_ui',JSON.stringify(UI));
}

/* ----------------------------- tableau de bord --------------------------- */
function vueDash(y,m){
  const d0=debutMois(y,m), d1=finMois(y,m);
  let h='';
  if(!IX.J.length){
    h+='<div class="accueil"><h3>Bienvenue 👋</h3><p>Commence par enregistrer le <b>solde de départ</b> de chacun de tes comptes. '+
       'Ensuite, les soldes se reportent tout seuls d\'un mois à l\'autre.</p>'+
       '<button class="btn primary" data-saisie="initial">Saisir un solde de départ</button></div>';
  }
  const rows=listeComptes().map(c=>{
    const deb=soldeAu(c,veille(d0)); let ent=0,sor=0;
    IX.J.forEach(x=>{ if(x.compte===c&&x.date>=d0&&x.date<=d1){ ent+=x.credit; sor+=x.debit; } });
    return {c,deb,ent:r2(ent),sor:r2(sor),fin:r2(deb+ent+sor)};
  });
  const tot=rows.reduce((a,r)=>({deb:a.deb+r.deb,ent:a.ent+r.ent,sor:a.sor+r.sor,fin:a.fin+r.fin}),{deb:0,ent:0,sor:0,fin:0});

  const dossiers=IX.I.filter(i=>i.debut<=d1).map(i=>etatDossier(i,d1)).filter(d=>d.reste>0.004);
  const prets=dossiers.filter(d=>/^PRE/i.test(d.dossier)), emps=dossiers.filter(d=>/^EMP/i.test(d.dossier));
  const sP=r2(prets.reduce((a,d)=>a+d.reste,0)), sE=r2(emps.reduce((a,d)=>a+d.reste,0));
  const nette=r2(tot.fin+sP-sE);

  const dep={}, rev={};
  IX.J.forEach(x=>{
    if(x.date<d0||x.date>d1||EXCLUS.indexOf(x.cat)!==-1) return;
    if(x.debit) dep[x.cat]=(dep[x.cat]||0)-x.debit;
    if(x.credit) rev[x.cat]=(rev[x.cat]||0)+x.credit;
  });
  const tDep=r2(Object.values(dep).reduce((a,b)=>a+b,0)), tRev=r2(Object.values(rev).reduce((a,b)=>a+b,0));

  h+='<div class="kpis">'+
    kpi('Total des comptes',tot.fin,'fin '+MOIS[m].toLowerCase())+
    kpi('Situation nette',nette,'comptes + prêts − emprunts')+
    kpi('Dépenses du mois',-tDep,Object.keys(dep).length+' catégorie(s)')+
    kpi('Revenus du mois',tRev,'hors transferts et prêts')+
  '</div><div class="dash">';

  h+='<div class="sheet wide"><div class="band"><h2>💰 Comptes — '+MOIS[m]+' '+y+'</h2></div><div class="tw"><table class="g">'+
     '<tr><th>Compte</th><th class="num">Début</th><th class="num">Entrées</th><th class="num">Sorties</th><th class="num">Fin du mois</th></tr>'+
     rows.map(r=>'<tr><td><a href="#" data-o="c:'+esc(r.c)+'">'+esc(r.c)+'</a></td>'+cellM(r.deb,1)+cellM(r.ent)+cellM(r.sor)+cellM(r.fin,1).replace('<td','<td style="font-weight:700"')+'</tr>').join('')+
     '<tr class="tot"><td>TOTAL</td>'+cellM(r2(tot.deb),1)+cellM(r2(tot.ent))+cellM(r2(tot.sor))+cellM(r2(tot.fin),1)+'</tr></table></div></div>';

  const cats=Object.keys(dep).sort((a,b)=>dep[b]-dep[a]);
  const max=cats.length?dep[cats[0]]:1;
  h+='<div class="sheet"><div class="band"><h2>🧾 Dépenses par catégorie</h2><span class="v">'+htg(tDep)+'</span></div>'+
     (cats.length ? '<div class="barres">'+cats.map(c=>'<div class="barre"><div class="t"><span>'+esc(c)+'</span><b>'+htg(dep[c])+'</b></div><div class="r"><i style="width:'+Math.max(2,dep[c]/max*100)+'%"></i></div></div>').join('')+'</div>'
                  : '<div class="empty" style="margin:14px">Aucune dépense ce mois-ci.</div>')+'</div>';

  h+='<div class="sheet"><div class="band"><h2>🤝 Prêts en cours</h2><span class="v">'+htg(sP)+'</span></div><div class="tw"><table class="g">'+
     '<tr><th>Personne</th><th>Dossier</th><th class="num">Reste dû</th><th class="c">Statut</th></tr>'+
     (prets.length?prets.map(d=>'<tr><td>'+esc(d.personne)+'</td><td>'+esc(d.dossier)+'</td>'+cellM(d.reste,1)+'<td class="c">'+badge(d.statut)+'</td></tr>').join('')
                  :'<tr class="vide"><td colspan="4">Aucun prêt en cours</td></tr>')+'</table></div></div>';

  h+='<div class="sheet"><div class="band"><h2>🏦 Emprunts en cours</h2><span class="v">'+htg(-sE)+'</span></div><div class="tw"><table class="g">'+
     '<tr><th>Personne</th><th>Dossier</th><th class="num">Reste à rendre</th><th class="c">Statut</th></tr>'+
     (emps.length?emps.map(d=>'<tr><td>'+esc(d.personne)+'</td><td>'+esc(d.dossier)+'</td>'+cellM(-d.reste,1)+'<td class="c">'+badge(d.statut)+'</td></tr>').join('')
                 :'<tr class="vide"><td colspan="4">Aucun emprunt en cours</td></tr>')+'</table></div></div>';

  const ev=evtsLibres().filter(e=>e.date>=d0&&e.date<=d1).concat(echeancesAuto(d0,d1)).sort((a,b)=>a.date<b.date?-1:1);
  h+='<div class="sheet"><div class="band"><h2>📅 Évènements du mois</h2></div><div class="tw"><table class="g">'+
     '<tr><th>Date</th><th>Évènement</th><th>Personne</th><th class="num">Montant</th></tr>'+
     (ev.length?ev.map(e=>'<tr><td class="c">'+frDate(e.date)+'</td><td>'+(e.auto?'⚙️ ':'')+esc(e.nom)+'</td><td>'+esc(e.personne)+'</td>'+cellM(e.montant)+'</tr>').join('')
               :'<tr class="vide"><td colspan="4">Rien de prévu</td></tr>')+'</table></div></div>';
  return h+'</div>';
}
function kpi(l,v,s){ return '<div class="kpi"><div class="l">'+esc(l)+'</div><div class="v '+(v<0?'neg':v>0?'pos':'')+'">'+htg(v)+'</div><div class="s">'+esc(s)+'</div></div>'; }

/* ------------------------------ journal compte --------------------------- */
function vueCompte(c,y,m){
  const d0=debutMois(y,m), d1=finMois(y,m);
  const deb=soldeAu(c,veille(d0));
  const L=IX.J.filter(x=>x.compte===c&&x.date>=d0&&x.date<=d1);
  const fin=L.length?L[L.length-1].solde:deb;
  let sd=0,sc=0; L.forEach(x=>{ sd+=x.debit; sc+=x.credit; });
  let h='<div class="sheet"><div class="band"><h2>💳 '+esc(c)+' — '+MOIS[m]+' '+y+'</h2>'+
        '<span class="k">Solde fin de mois</span><span class="v">'+htg(fin)+'</span>'+
        '<button class="btn" data-saisie="depense" data-compte="'+esc(c)+'">＋ Saisie</button></div><div class="tw"><table class="g">'+
        '<tr><th class="c">Date</th><th>Description</th><th>Catégorie</th><th class="num">Débit (-)</th><th class="num">Crédit (+)</th><th class="num">Solde</th><th>Commentaire</th><th></th></tr>'+
        '<tr class="report"><td class="c">01/'+pad(m+1)+'/'+y+'</td><td>Report de '+moisPrec(y,m)+'</td><td></td><td></td><td></td>'+cellM(deb,1)+'<td></td><td></td></tr>';
  h+= L.length ? L.map(x=>'<tr><td class="c">'+frDate(x.date)+'</td><td>'+esc(x.desc)+'</td><td>'+esc(x.cat)+'</td>'+
        cellM(x.debit)+cellM(x.credit)+cellM(x.solde,1).replace('<td class="num','<td class="num b')+'<td>'+esc(x.com)+'</td>'+actes(x.opId)+'</tr>').join('')
      : '<tr class="vide"><td colspan="8">Aucune écriture en '+MOIS[m].toLowerCase()+'.</td></tr>';
  h+='<tr class="tot"><td></td><td>Total du mois</td><td></td>'+cellM(r2(sd))+cellM(r2(sc))+cellM(fin,1)+'<td></td><td></td></tr></table></div></div>';
  return h;
}

/* ------------------------------ prêt / emprunté -------------------------- */
function vueTiers(tab,y,m){
  const d0=debutMois(y,m), d1=finMois(y,m);
  const L=IX.T.filter(x=>x.tab===tab&&x.date>=d0&&x.date<=d1)
    .sort((a,b)=> a.dossier<b.dossier?-1:a.dossier>b.dossier?1:(a.date<b.date?-1:a.date>b.date?1:0));
  const pref=tab==='pret'?/^PRE/i:/^EMP/i;
  const enCours=r2(IX.I.filter(i=>pref.test(i.dossier)&&i.debut<=d1).map(i=>etatDossier(i,d1)).reduce((a,d)=>a+Math.max(0,d.reste),0));
  let h='<div class="sheet"><div class="band"><h2>'+(tab==='pret'?'🤝 Prêts accordés':'🏦 Emprunts reçus')+' — '+MOIS[m]+' '+y+'</h2>'+
        '<span class="k">Total en cours</span><span class="v">'+htg(enCours)+'</span>'+
        '<button class="btn" data-saisie="'+tab+'">＋ '+(tab==='pret'?'Prêt':'Emprunt')+'</button></div><div class="tw"><table class="g">'+
        '<tr><th>Personne</th><th class="c">N° Dossier</th><th class="c">Date</th><th>Mouvement</th><th>Description</th><th class="num">Débit (-)</th><th class="num">Crédit (+)</th><th class="num">Solde dossier</th><th>Commentaire</th><th></th></tr>';
  h+= L.length ? L.map(x=>'<tr><td>'+esc(x.personne)+'</td><td class="c">'+esc(x.dossier)+'</td><td class="c">'+frDate(x.date)+'</td><td>'+esc(x.mouv)+'</td><td>'+esc(x.desc)+'</td>'+
        cellM(x.debit)+cellM(x.credit)+cellM(x.soldeDossier,1).replace('<td class="num','<td class="num b')+'<td>'+esc(x.com)+'</td>'+actes(x.opId)+'</tr>').join('')
      : '<tr class="vide"><td colspan="10">Aucun mouvement en '+MOIS[m].toLowerCase()+'.</td></tr>';
  return h+'</table></div></div>';
}

/* ------------------------------ investissement --------------------------- */
function vueInvest(y,m){
  const d0=debutMois(y,m), d1=finMois(y,m), v=veille(d0);
  const D=IX.I.filter(i=>i.debut<=d1).map(i=>etatDossier(i,d1))
    .filter(d=> d.debut>=d0 || etatDossier(d,v).reste>0.004);
  const reste=r2(D.reduce((a,d)=>a+(d.statut==='Soldé'?0:d.reste),0));
  let h='<div class="sheet"><div class="band"><h2>📈 Dossiers — '+MOIS[m]+' '+y+'</h2><span class="k">Reste dû total</span><span class="v">'+htg(reste)+'</span></div><div class="tw"><table class="g">'+
        '<tr><th>N° Dossier</th><th>Personne</th><th class="c">Début</th><th class="c">Échéance</th><th>Description</th><th class="num">Capital</th><th class="c">Taux</th><th class="num">Intérêt</th><th class="num">Total attendu</th><th class="num">Remboursé</th><th class="num">Reste dû</th><th class="c">% Remb.</th><th class="c">Statut</th></tr>';
  h+= D.length ? D.map(d=>'<tr><td class="b">'+esc(d.dossier)+'</td><td>'+esc(d.personne)+'</td><td class="c">'+frDate(d.debut)+'</td><td class="c">'+frDate(d.fin)+'</td><td>'+esc(d.desc)+'</td>'+
        cellM(d.capital,1)+'<td class="c">'+(d.taux*100).toFixed(1).replace('.',',')+' %</td>'+cellM(d.interet)+cellM(d.attendu,1)+cellM(d.rembourse)+cellM(d.reste,1)+
        '<td class="c">'+Math.round(d.pct*100)+' %</td><td class="c">'+badge(d.statut)+'</td></tr>').join('')
      : '<tr class="vide"><td colspan="13">Aucun dossier actif ce mois-ci.</td></tr>';
  return h+'</table></div></div>';
}

/* ------------------------------ évènements ------------------------------- */
function vueEvts(y,m){
  const d0=debutMois(y,m), d1=finMois(y,m);
  const lib=evtsLibres().filter(e=>e.date>=d0&&e.date<=d1);
  const auto=echeancesAuto(d0,d1);
  const def=(aujourdhui()>=d0&&aujourdhui()<=d1)?aujourdhui():d0;
  let h='<div class="sheet"><div class="band"><h2>📅 Évènements — '+MOIS[m]+' '+y+'</h2></div>'+
    '<form class="evform" id="evForm">'+
      '<div class="field"><label>Date</label><input type="date" name="date" value="'+def+'" required></div>'+
      '<div class="field" style="grid-column:span 2"><label>Évènement</label><input name="nom" required placeholder="ex. Mariage de Santa"></div>'+
      '<div class="field"><label>Type</label><input name="type" placeholder="facultatif"></div>'+
      '<div class="field"><label>Personne</label><input name="personne" list="dlPers"></div>'+
      '<div class="field"><label>Lieu</label><input name="lieu"></div>'+
      '<div class="field"><label>Montant prévu</label><input name="montant" inputmode="decimal" placeholder="0,00"></div>'+
      '<div class="field"><label>Statut</label><select name="statut"><option>À venir</option><option>Planifié</option><option>Fait</option><option>Annulé</option></select></div>'+
      '<div class="field"><button class="btn primary" type="submit">Ajouter</button></div>'+
      '<datalist id="dlPers">'+S.params.personnes.map(p=>'<option value="'+esc(p)+'">').join('')+'</datalist>'+
    '</form><div class="tw"><table class="g">'+
    '<tr><th class="c">Date</th><th>Évènement</th><th>Type</th><th>Personne</th><th>Lieu</th><th class="num">Montant prévu</th><th class="c">Statut</th><th></th></tr>'+
    (lib.length ? lib.map(e=>'<tr><td class="c">'+frDate(e.date)+'</td><td>'+esc(e.nom)+'</td><td>'+esc(e.type)+'</td><td>'+esc(e.personne)+'</td><td>'+esc(e.lieu)+'</td>'+cellM(e.montant)+
       '<td class="c"><select class="inp" data-evstat="'+e.id+'" style="width:auto;padding:3px 6px">'+['À venir','Planifié','Fait','Annulé'].map(s=>'<option'+(s===e.statut?' selected':'')+'>'+s+'</option>').join('')+'</select></td>'+
       '<td class="acts"><button class="ib del" data-evdel="'+e.id+'" title="Supprimer">🗑</button></td></tr>').join('')
      : '<tr class="vide"><td colspan="8">Aucun évènement saisi ce mois-ci.</td></tr>')+
    '</table></div></div>';
  h+='<div class="sheet"><div class="band"><h2>⚙️ Échéances automatiques</h2><span class="k">calculées depuis les dossiers</span></div><div class="tw"><table class="g">'+
    '<tr><th class="c">Date</th><th>Échéance</th><th>Personne</th><th class="num">Montant</th></tr>'+
    (auto.length?auto.map(e=>'<tr><td class="c">'+frDate(e.date)+'</td><td>'+esc(e.nom)+'</td><td>'+esc(e.personne)+'</td>'+cellM(e.montant,1)+'</tr>').join('')
                :'<tr class="vide"><td colspan="4">Aucune échéance ce mois-ci.</td></tr>')+'</table></div></div>';
  return h;
}

/* ============================ ÉVÈNEMENTS UI ============================== */

document.addEventListener('click',e=>{
  const t=e.target.closest('[data-m],[data-o],[data-edit],[data-del],[data-saisie],[data-evdel]');
  if(!t) return;
  if(t.dataset.m!=null){ UI.mois=Number(t.dataset.m); rendre(); return; }
  if(t.dataset.o!=null){ e.preventDefault(); UI.onglet=t.dataset.o; rendreOnglets(); rendreVue(); $('vue').scrollTop=0; return; }
  if(t.dataset.edit){ const op=S.ops[t.dataset.edit]; if(op) ouvrirSaisie({edit:op}); return; }
  if(t.dataset.del){ supprimerOp(t.dataset.del); return; }
  if(t.dataset.saisie){ ouvrirSaisie({type:t.dataset.saisie,compte:t.dataset.compte}); return; }
  if(t.dataset.evdel){
    const ev=S.evts[t.dataset.evdel]; if(!ev||!confirm('Supprimer « '+ev.nom+' » ?')) return;
    S.evts[ev.id]={id:ev.id,deleted:true,updatedAt:now()}; sauver(); return;
  }
});
document.addEventListener('change',e=>{
  const s=e.target.closest('[data-evstat]'); if(!s) return;
  const ev=S.evts[s.dataset.evstat]; if(!ev) return;
  ev.statut=s.value; ev.updatedAt=now(); sauver();
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='evForm') return;
  e.preventDefault();
  const f=new FormData(e.target);
  const ev={id:uid(),date:f.get('date'),nom:String(f.get('nom')).trim(),type:String(f.get('type')||'').trim(),
            personne:String(f.get('personne')||'').trim(),lieu:String(f.get('lieu')||'').trim(),
            montant:r2(num(f.get('montant'))),statut:f.get('statut'),updatedAt:now()};
  if(!ev.date||!ev.nom) return;
  S.evts[ev.id]=ev;
  const mo=ev.date.split('-'); UI.annee=Number(mo[0]); UI.mois=Number(mo[1])-1;
  sauver(); toast('Évènement ajouté.');
});
$('annee').addEventListener('change',e=>{ UI.annee=Number(e.target.value); rendre(); });

function supprimerOp(id){
  const op=S.ops[id]; if(!op) return;
  const n=(op.lignes||[]).length;
  let txt='Supprimer cette opération ('+LIBELLE[op.type]+' du '+frDate(op.date)+') ?\n'+n+' ligne(s) liée(s) seront retirées de tous les onglets.';
  if(op.type==='pret'||op.type==='emprunt'){
    const lies=Object.values(S.ops).filter(o=>!o.deleted&&o.type==='rembours'&&o.dossier===op.dossier).length;
    if(lies) txt+='\n⚠️ Le dossier '+op.dossier+' a '+lies+' remboursement(s) : supprime-les d\'abord.';
    if(lies){ alert(txt); return; }
  }
  if(!confirm(txt)) return;
  S.ops[id]={id,deleted:true,updatedAt:now(),date:op.date,createdAt:op.createdAt};
  sauver(); toast('Opération supprimée.');
}

/* =============================== SAISIE ================================== */

const Q={type:'depense',queue:[],seq:1,edit:null,preset:null};

function ouvrirSaisie(o){
  o=o||{};
  Q.edit=o.edit?clone(o.edit):null;
  Q.preset=o;
  if(Q.edit) Q.type=Q.edit.type; else if(o.type) Q.type=o.type;
  $('saisie').classList.remove('hidden');
  $('saisieTitre').textContent=Q.edit?'Modifier l\'opération':'Saisie financière';
  $('queuePane').classList.toggle('hidden',!!Q.edit);
  $('addBtn').textContent=Q.edit?'💾 Enregistrer la modification':'➕ Ajouter à la file';
  $('tauxLbl').textContent='1 $HT = '+S.params.taux+' HTG';
  say('formMsg','');
  drawForm();
  if(Q.edit) remplir(Q.edit);
  else if(o.compte){ const c=$('f_compte')||$('f_source'); if(c) c.value=o.compte; }
  drawQueue();
}
function fermerSaisie(){ $('saisie').classList.add('hidden'); Q.edit=null; }
$('saisieFermer').onclick=()=>{
  if(Q.queue.length&&!Q.edit&&!confirm('La file contient '+Q.queue.length+' opération(s) non enregistrée(s). Fermer quand même ? Elles restent dans la file.')) return;
  fermerSaisie();
};
$('btnSaisie').onclick=()=>ouvrirSaisie({});

function el(t,c,x){ const e=document.createElement(t); if(c) e.className=c; if(x!=null) e.textContent=x; return e; }
function say(box,txt,cls){ const b=$(box); b.innerHTML=''; if(txt) b.appendChild(el('div','msg '+(cls||'ok'),txt)); }

function drawTypes(){
  const s=$('typeSeg'); s.innerHTML=''; s.classList.toggle('lock',!!Q.edit);
  TYPES.forEach(t=>{
    const b=el('button',null,t.l); b.type='button';
    b.setAttribute('aria-pressed',Q.type===t.k?'true':'false');
    b.onclick=()=>{ if(Q.edit) return; Q.type=t.k; drawForm(); say('formMsg',''); };
    s.appendChild(b);
  });
}
function mkSelect(id,label,opts,extra,cls){
  const f=el('div','field'+(cls?' '+cls:'')); f.appendChild(el('label',null,label));
  const s=document.createElement('select'); s.id='f_'+id;
  s.appendChild(new Option('— choisir —',''));
  opts.forEach(v=>s.appendChild(new Option(v.l||v, v.v!==undefined?v.v:v)));
  if(extra) s.appendChild(new Option(extra,'__new__'));
  f.appendChild(s); return f;
}
function mkInput(id,label,type,ph,val,hint,cls){
  const f=el('div','field'+(cls?' '+cls:'')); f.appendChild(el('label',null,label));
  const i=document.createElement('input'); i.id='f_'+id; i.type=type||'text';
  if(ph) i.placeholder=ph; if(val!=null) i.value=val;
  if(type==='number'){ i.step='0.01'; i.min='0'; }
  f.appendChild(i); if(hint) f.appendChild(el('div','hint',hint));
  return f;
}
function mkMontant(){
  const f=el('div','field'); f.appendChild(el('label',null,'Montant'));
  const row=el('div','row');
  const i=document.createElement('input'); i.id='f_montant'; i.type='text'; i.inputMode='decimal'; i.placeholder='0,00';
  const s=document.createElement('select'); s.id='f_devise';
  s.appendChild(new Option('HTG','HTG')); s.appendChild(new Option('$HT','HTD'));
  row.appendChild(i); row.appendChild(s); f.appendChild(row);
  const c=el('div','conv',''); f.appendChild(c);
  const maj=()=>{ const v=num(i.value); c.textContent=(s.value==='HTD'&&v>0)?'= '+htg(v*S.params.taux):''; majEcart(); };
  champMontant(i,maj); s.addEventListener('change',maj);
  return f;
}
function mkAccessoire(id,label,aide){
  const f=el('div','field'); f.appendChild(el('label',null,label));
  const row=el('div','row');
  const i=document.createElement('input'); i.id='f_'+id; i.type='text'; i.inputMode='decimal'; i.placeholder='0';
  const u=document.createElement('select'); u.id='f_'+id+'Unite';
  u.appendChild(new Option('%','%')); u.appendChild(new Option('HTG','HTG')); u.style.width='72px';
  row.appendChild(i); row.appendChild(u); f.appendChild(row);
  const c=el('div','conv',''); f.appendChild(c);
  const maj=()=>{ const v=num(i.value), b=num(($('f_montant')||{}).value); c.textContent=(v>0&&u.value==='%'&&b>0)?'= '+htg(b*v/100):''; };
  champMontant(i,maj); u.addEventListener('change',maj);
  f.appendChild(el('div','hint',aide));
  return f;
}
function mkCheck(id,label,aide,zoneLabel,zonePh){
  const f=el('div','field full');
  const row=el('div','check');
  const i=document.createElement('input'); i.type='checkbox'; i.id='f_'+id;
  const l=document.createElement('label'); l.htmlFor='f_'+id; l.textContent=label;
  row.appendChild(i); row.appendChild(l); f.appendChild(row);
  if(zoneLabel){
    const z=el('div','hidden'); z.id='f_'+id+'Zone'; z.style.marginTop='8px';
    z.appendChild(el('label',null,zoneLabel));
    const t=document.createElement('input'); t.type='text'; t.id='f_pour'; t.placeholder=zonePh||'';
    t.style.cssText='border:1px solid var(--line);border-radius:6px;padding:7px 9px;width:100%';
    z.appendChild(t); f.appendChild(z);
    i.addEventListener('change',()=>z.classList.toggle('hidden',!i.checked));
  }
  if(aide) f.appendChild(el('div','hint',aide));
  return f;
}
function mkPaire(){
  const f=el('div','field full'); f.appendChild(el('label',null,'Comptes'));
  const row=el('div','row');
  const a=document.createElement('select'); a.id='f_source'; a.className='grow';
  const b=document.createElement('select'); b.id='f_destination'; b.className='grow';
  a.appendChild(new Option('— depuis —','')); b.appendChild(new Option('— vers —',''));
  listeComptes().forEach(v=>{ a.appendChild(new Option(v,v)); b.appendChild(new Option(v,v)); });
  row.appendChild(a); row.appendChild(el('div','arrow','→')); row.appendChild(b);
  f.appendChild(row); return f;
}
function mkEcart(){
  const f=el('div','field full');
  const info=el('div','ecart',''); info.id='ecartInfo'; f.appendChild(info);
  const z=el('div','hidden'); z.id='ecartZone'; z.style.marginTop='8px';
  z.appendChild(el('label',null,'Nature de l\'excédent'));
  const sel=document.createElement('select'); sel.id='f_motifEcart';
  sel.style.cssText='border:1px solid var(--line);border-radius:6px;padding:7px 9px;width:100%';
  ['Intérêt','Geste / pourboire','Ajustement de change','Correction d\'arrondi','Autre'].forEach(v=>sel.appendChild(new Option(v,v)));
  z.appendChild(sel); z.appendChild(el('div','hint','une écriture séparée sera ajoutée à la file'));
  f.appendChild(z); return f;
}
function dossierChoisi(){
  const e=$('f_dossier'); if(!e||!e.value) return null;
  return dossiersPourSaisie().filter(x=>x.dossier===e.value)[0]||null;
}
function dossiersPourSaisie(){
  const l=dossiersOuverts();
  if(Q.edit&&Q.edit.dossier&&!l.some(d=>d.dossier===Q.edit.dossier)){
    const i=IX.I.filter(x=>x.dossier===Q.edit.dossier)[0];
    if(i) l.push(etatDossier(i,'9999-12-31'));
  }
  return l;
}
function majEcart(){
  const info=$('ecartInfo'); if(!info) return;
  const z=$('ecartZone'), d=dossierChoisi();
  if(!d||Q.edit){ info.textContent=d?'Reste dû : '+htg(d.reste):''; info.className='ecart'; z.classList.add('hidden'); return; }
  const ver=num(($('f_montant')||{}).value)*((($('f_devise')||{}).value==='HTD')?S.params.taux:1);
  const diff=r2(ver-d.reste), emp=/^EMP/i.test(d.dossier);
  if(!ver){ info.textContent='Dû sur ce dossier : '+htg(d.reste); info.className='ecart'; z.classList.add('hidden'); }
  else if(Math.abs(diff)<0.005){ info.textContent='Montant exact — le dossier passera à Soldé.'; info.className='ecart ok'; z.classList.add('hidden'); }
  else if(diff<0){ info.textContent='Versement partiel — il restera '+htg(-diff)+'.'; info.className='ecart partiel'; z.classList.add('hidden'); }
  else { info.textContent='Excédent de '+htg(diff)+' — '+(emp?'tu verses plus que tu ne dois':'on te rend plus que prévu')+'.'; info.className='ecart plus'; z.classList.remove('hidden'); }
}

function drawForm(){
  drawTypes();
  const g=$('formGrid'); g.innerHTML='';
  const auj=aujourdhui();
  const defDate=(auj.slice(0,7)===UI.annee+'-'+pad(UI.mois+1))?auj:debutMois(UI.annee,UI.mois);
  CHAMPS[Q.type].forEach(c=>{
    let n;
    switch(c){
      case 'date': n=mkInput('date','Date','date',null,defDate); break;
      case 'compte': n=mkSelect('compte','Compte',listeComptes()); break;
      case 'source': n=mkSelect('source','Compte source',listeComptes()); break;
      case 'destination': n=mkSelect('destination','Compte destination',listeComptes()); break;
      case 'paire': n=mkPaire(); break;
      case 'montant': n=mkMontant(); break;
      case 'signe': n=mkSelect('signe','Sens du solde',[{v:'+',l:'Positif (argent disponible)'},{v:'-',l:'Négatif (découvert)'}]); break;
      case 'frais': n=mkAccessoire('frais','Frais','0 si gratuit'); break;
      case 'tca': n=mkAccessoire('tca','Taxe / TCA','0 si pas de taxe'); break;
      case 'ecart': n=mkEcart(); break;
      case 'consigne': n=mkCheck('consigne','Cet argent transite par Consignation','coché : le passage par Consignation est écrit automatiquement','Pour qui / motif','ex. Santa — achat carpet'); break;
      case 'fraisCharge': n=mkCheck('fraisCharge','Les frais sont à rembourser par l\'emprunteur','coché : les frais s\'ajoutent au montant du dossier'); break;
      case 'tauxPret': n=mkInput('tauxPret','Taux d\'intérêt %','number','0','0','0 si sans intérêt'); break;
      case 'echeance': n=mkInput('echeance','Échéance','date',null,plusMois(defDate,1),'par défaut : 1 mois — crée l\'échéance automatiquement'); break;
      case 'description': n=mkInput('description','Description','text','reprend la catégorie si vide',null,null,'full'); break;
      case 'commentaire': n=mkInput('commentaire','Commentaire','text','facultatif',null,null,'full'); break;
      case 'categorie': n=mkSelect('categorie','Catégorie',S.params.categories,'➕ Nouvelle catégorie…'); break;
      case 'personne': n=mkSelect('personne','Personne',S.params.personnes,'➕ Nouvelle personne…'); break;
      case 'dossier': n=mkSelect('dossier','Dossier',dossiersPourSaisie().map(d=>({v:d.dossier,l:d.dossier+' · '+d.personne+' · reste '+htg(d.reste)})),null,'full'); break;
    }
    if(n) g.appendChild(n);
  });
  const sg=$('f_signe'); if(sg) sg.value='+';
  ['categorie','personne'].forEach(k=>{
    const s=$('f_'+k); if(!s) return;
    s.addEventListener('change',()=>{
      if(s.value!=='__new__') return;
      const nom=(prompt(k==='categorie'?'Nom de la nouvelle catégorie :':'Nom de la nouvelle personne :')||'').trim();
      if(!nom){ s.value=''; return; }
      ajouterValeur(k==='categorie'?'categories':'personnes',nom);
      if(!Array.from(s.options).some(o=>o.value===nom)) s.insertBefore(new Option(nom,nom),s.lastChild);
      s.value=nom; s.dispatchEvent(new Event('change'));
    });
  });
  const cat=$('f_categorie'), desc=$('f_description');
  if(cat&&desc) cat.addEventListener('change',()=>{
    if(cat.value==='__new__') return;
    if(!desc.value||desc.value===desc.dataset.auto){ desc.value=cat.value; desc.dataset.auto=cat.value; }
  });
  const dos=$('f_dossier');
  if(dos) dos.addEventListener('change',()=>{
    const d=dossierChoisi();
    if(d&&!Q.edit){
      $('f_montant').value=NF.format(d.reste);
      say('formMsg',/^EMP/i.test(d.dossier)?'Dossier d\'emprunt : l\'argent sort de ton compte.':'Dossier de prêt : l\'argent entre sur ton compte.','info');
    }
    majEcart();
  });
  const dt=$('f_date'), ech=$('f_echeance');
  if(dt&&ech) dt.addEventListener('change',()=>{ if(!Q.edit) ech.value=plusMois(dt.value,1); });
  majEcart();
}

function remplir(op){
  const set=(id,v)=>{
    const e=$('f_'+id); if(!e||v==null||v==='') return;
    if(e.type==='checkbox'){ e.checked=!!v; e.dispatchEvent(new Event('change')); return; }
    if(e.tagName==='SELECT'&&!Array.from(e.options).some(o=>o.value===String(v))) e.insertBefore(new Option(v,v),e.options[1]||null);
    e.value=v;
  };
  set('date',op.date); set('compte',op.compte); set('source',op.source); set('destination',op.destination);
  set('montant',NF.format(op.montant)); set('devise',op.devise); set('signe',op.signe);
  set('categorie',op.categorie); set('description',op.description); set('commentaire',op.commentaire);
  set('frais',op.frais?NF.format(op.frais):''); set('fraisUnite',op.fraisUnite);
  set('tca',op.tca?NF.format(op.tca):''); set('tcaUnite',op.tcaUnite);
  set('consigne',op.consigne); set('pour',op.pour); set('fraisCharge',op.fraisCharge);
  set('personne',op.personne); set('tauxPret',op.tauxPret); set('echeance',op.echeance); set('dossier',op.dossier);
  majEcart();
}

function v(n){ const e=$('f_'+n); if(!e) return ''; return e.type==='checkbox'?e.checked:String(e.value).trim(); }

function construire(){
  const t=Q.type, m=r2(num(v('montant'))), dev=v('devise')||'HTG';
  if(!v('date')) return {err:'Choisis une date.'};
  if(m<=0) return {err:'Le montant doit être supérieur à zéro.'};
  const e={type:t,date:v('date'),montant:m,devise:dev,commentaire:v('commentaire'),
           frais:r2(num(v('frais'))),fraisUnite:v('fraisUnite')||'%',tca:r2(num(v('tca'))),tcaUnite:v('tcaUnite')||'%',
           description:v('description'),categorie:v('categorie')};
  const tx=dev==='HTD'?S.params.taux:1;
  e.gourdes=r2(m*tx);

  if(t==='initial'){
    e.compte=v('compte'); e.signe=v('signe')||'+';
    if(!e.compte) return {err:'Choisis un compte.'};
    e.resume='Solde de départ '+e.compte;
  }
  if(t==='depense'||t==='revenu'){
    e.compte=v('compte');
    if(!e.compte) return {err:'Choisis un compte.'};
    if(!e.categorie||e.categorie==='__new__') return {err:'Choisis une catégorie.'};
    if(!e.description) e.description=e.categorie;
    e.consigne=!!v('consigne'); e.pour=e.consigne?v('pour'):'';
    if(e.consigne&&e.compte===CONSIGN) return {err:'Le compte est déjà '+CONSIGN+' — décoche la case.'};
    e.resume=(t==='depense'?'Dépense ':'Revenu ')+e.description;
  }
  if(t==='transfert'){
    e.source=v('source'); e.destination=v('destination');
    if(!e.source||!e.destination) return {err:'Choisis les deux comptes.'};
    if(e.source===e.destination) return {err:'Source et destination doivent être différentes.'};
    e.resume='Transfert '+e.source+' → '+e.destination;
  }
  if(t==='pret'||t==='emprunt'){
    e.personne=v('personne'); e.tauxPret=num(v('tauxPret')); e.echeance=v('echeance');
    if(!e.personne||e.personne==='__new__') return {err:'Choisis la personne.'};
    if(t==='pret'){ e.source=v('source'); e.fraisCharge=!!v('fraisCharge'); if(!e.source) return {err:'Choisis le compte source.'}; e.resume='Prêt à '+e.personne; }
    else { e.destination=v('destination'); if(!e.destination) return {err:'Choisis le compte de destination.'}; e.resume='Emprunt de '+e.personne; }
    e.description=e.description||LIBELLE[t];
    if(Q.edit) e.dossier=Q.edit.dossier;
  }
  if(t==='rembours'){
    e.dossier=v('dossier'); e.compte=v('compte'); e.description=e.description||'Remboursement';
    if(!e.dossier) return {err:'Choisis le dossier.'};
    if(!e.compte) return {err:'Choisis le compte.'};
    const d=dossiersPourSaisie().filter(x=>x.dossier===e.dossier)[0];
    e.personne=d?d.personne:(Q.edit?Q.edit.personne:'');
    e.resume='Remboursement '+e.dossier;
    /* Excédent : la part au-delà du reste dû part dans sa propre écriture,
       sinon le solde du dossier passerait sous zéro. */
    if(d&&!Q.edit){
      const diff=r2(e.gourdes-d.reste);
      if(diff>0.004){
        const emp=/^EMP/i.test(e.dossier), motif=v('motifEcart')||'Autre';
        e.montant=d.reste; e.devise='HTG'; e.gourdes=d.reste; e.resume+=' (solde)';
        if(dev==='HTD') e.commentaire=joindre(e.commentaire,'versé '+m+' $HT');
        const sup={type:emp?'depense':'revenu',date:e.date,montant:diff,devise:'HTG',gourdes:diff,compte:e.compte,
          categorie:motif==='Intérêt'?'Intérêts':'Divers',description:motif+' — '+e.dossier,
          commentaire:'excédent sur '+e.dossier,frais:0,fraisUnite:'%',tca:0,tcaUnite:'%',resume:motif+' '+e.dossier};
        if(sup.categorie==='Intérêts'&&S.params.categories.indexOf('Intérêts')===-1) ajouterValeur('categories','Intérêts');
        return {ok:[e,sup]};
      }
    }
  }
  return {ok:[e]};
}

function meta(e){
  const acc=[]; const f=n=>String(n).replace('.',',');
  if(e.frais>0) acc.push('frais '+f(e.frais)+(e.fraisUnite==='%'?' %':' HTG')); if(e.tca>0) acc.push('taxe '+f(e.tca)+(e.tcaUnite==='%'?' %':' HTG'));
  const a=acc.length?' · '+acc.join(' · '):'';
  if(e.type==='initial') return e.compte+(e.signe==='-'?' · négatif':'');
  if(e.type==='depense'||e.type==='revenu') return e.compte+' · '+e.categorie+(e.consigne?' · via Consignation':'')+a;
  if(e.type==='transfert') return e.source+' → '+e.destination+a;
  if(e.type==='pret') return 'depuis '+e.source+a+(e.tauxPret?' · '+e.tauxPret+' %':'')+(e.echeance?' · échéance '+frDate(e.echeance):'');
  if(e.type==='emprunt') return 'vers '+e.destination+a+(e.echeance?' · échéance '+frDate(e.echeance):'');
  return e.dossier+' · '+e.compte+a;
}

function drawQueue(){
  const b=$('queueBox'); b.innerHTML='';
  $('qCount').textContent=Q.queue.length;
  if(!Q.queue.length){ b.appendChild(el('div','empty','Rien en attente. Remplis le formulaire puis « Ajouter à la file ».')); $('runBtn').disabled=true; return; }
  const list=el('div','queue');
  Q.queue.forEach(e=>{
    const it=el('div','qitem'+(e.on?'':' off'));
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=e.on;
    cb.onchange=()=>{ e.on=cb.checked; drawQueue(); };
    it.appendChild(cb);
    const body=el('div','qbody'), top=el('div','qtop');
    top.appendChild(el('span','chip '+e.type,TYPES.filter(t=>t.k===e.type)[0].l));
    top.appendChild(el('span','qdesc',e.resume));
    body.appendChild(top); body.appendChild(el('div','qmeta',frDate(e.date)+' · '+meta(e)));
    it.appendChild(body);
    const r=el('div'); r.style.cssText='display:flex;flex-direction:column;align-items:flex-end;gap:3px';
    r.appendChild(el('div','qamt',htg(e.gourdes)));
    const d=el('button','ib del','✕'); d.type='button'; d.title='Retirer';
    d.onclick=()=>{ Q.queue=Q.queue.filter(x=>x.qid!==e.qid); drawQueue(); };
    r.appendChild(d); it.appendChild(r); list.appendChild(it);
  });
  b.appendChild(list);
  $('runBtn').disabled=!Q.queue.some(e=>e.on);
}

$('addBtn').onclick=()=>{
  const r=construire();
  if(r.err){ say('formMsg',r.err,'err'); return; }
  if(Q.edit){ enregistrerEdition(r.ok[0]); return; }
  r.ok.forEach(x=>{ x.qid=Q.seq++; x.on=true; Q.queue.push(x); });
  say('formMsg',r.ok.length>1?r.ok.length+' écritures ajoutées (excédent séparé).':'Ajouté à la file.','ok');
  const garde={date:v('date'),compte:v('compte')};
  drawQueue(); drawForm();
  if($('f_date')) $('f_date').value=garde.date;
  if($('f_compte')&&garde.compte) $('f_compte').value=garde.compte;
};
$('resetBtn').onclick=()=>{ drawForm(); if(Q.edit) remplir(Q.edit); say('formMsg',''); };
$('clearBtn').onclick=()=>{ Q.queue=[]; drawQueue(); say('runMsg',''); };

function nouveauDossier(prefixe,pris){
  for(let k=0;k<500;k++){ const n=prefixe+'-'+Math.floor(1000+Math.random()*9000); if(!pris.has(n)){ pris.add(n); return n; } }
  return prefixe+'-'+now().toString().slice(-6);
}
function nettoyer(e){
  const op=clone(e); delete op.qid; delete op.on; delete op.resume; delete op.gourdes; return op;
}

$('runBtn').onclick=()=>{
  const sel=Q.queue.filter(e=>e.on); if(!sel.length) return;
  const pris=new Set(IX.I.map(i=>i.dossier));
  let ok=0, lignes=0; const err=[];
  const t0=now();
  sel.forEach((e,k)=>{
    try{
      const op=nettoyer(e);
      op.id=uid(); op.createdAt=t0+k; op.updatedAt=t0+k; op.tauxChange=S.params.taux;
      if((op.type==='pret'||op.type==='emprunt')&&!op.dossier) op.dossier=nouveauDossier(op.type==='pret'?'PRE':'EMP',pris);
      op.lignes=genLignes(op);
      S.ops[op.id]=op; ok++; lignes+=op.lignes.length;
    }catch(x){ err.push(e.resume+' : '+x.message); }
  });
  Q.queue=Q.queue.filter(e=>!e.on);
  const last=sel[sel.length-1].date.split('-'); UI.annee=Number(last[0]); UI.mois=Number(last[1])-1;
  sauver().then(()=>{
    drawQueue(); drawForm();
    say('runMsg',ok+' opération(s) enregistrée(s) · '+lignes+' ligne(s) écrite(s)'+(err.length?' · échecs : '+err.join(' ; '):''),err.length?'err':'ok');
    toast(ok+' opération(s) enregistrée(s).');
  });
};

function enregistrerEdition(e){
  const ancien=S.ops[Q.edit.id];
  const op=nettoyer(e);
  op.id=ancien.id; op.createdAt=ancien.createdAt; op.updatedAt=now();
  op.tauxChange=(op.devise==='HTD'&&ancien.devise==='HTD')?ancien.tauxChange:S.params.taux;
  if(ancien.dossier&&(op.type==='pret'||op.type==='emprunt')) op.dossier=ancien.dossier;
  try{ op.lignes=genLignes(op); }catch(x){ say('formMsg',x.message,'err'); return; }
  S.ops[op.id]=op;
  fermerSaisie();
  sauver().then(()=>toast('Modification enregistrée.'));
}

/* ============================== PARAMÈTRES =============================== */

let pOnglet='listes';
function ouvrirParams(o){ pOnglet=o||pOnglet; $('params').classList.remove('hidden'); dessinerParams(); }
$('btnParams').onclick=()=>ouvrirParams();
$('paramsFermer').onclick=()=>$('params').classList.add('hidden');
document.querySelectorAll('#pTabs .tab').forEach(t=>t.onclick=()=>{ pOnglet=t.dataset.p; dessinerParams(); });

function usages(){
  const u={comptes:{},categories:{},personnes:{}};
  IX.J.forEach(x=>{ u.comptes[x.compte]=(u.comptes[x.compte]||0)+1; u.categories[x.cat]=(u.categories[x.cat]||0)+1; });
  IX.T.forEach(x=>{ u.personnes[x.personne]=(u.personnes[x.personne]||0)+1; });
  return u;
}
function ajouterValeur(cle,val){
  val=String(val||'').trim(); if(!val) return;
  const p=S.params;
  if(p[cle].indexOf(val)===-1) p[cle].push(val);
  p.retires=(p.retires||[]).filter(x=>x!==cle+':'+val);
  p.updatedAt=now(); sauver();
}
function supprimerValeur(cle,val){
  const n=(usages()[cle]||{})[val]||0;
  if(n>0){ toast('« '+val+' » est utilisée '+n+' fois — suppression refusée.',true); return; }
  const p=S.params; p[cle]=p[cle].filter(x=>x!==val);
  p.retires=(p.retires||[]).concat([cle+':'+val]);
  p.updatedAt=now(); sauver();
}

function dessinerParams(){
  document.querySelectorAll('#pTabs .tab').forEach(t=>t.setAttribute('aria-selected',t.dataset.p===pOnglet?'true':'false'));
  const b=$('pBody');
  if(pOnglet==='listes'){
    const u=usages();
    b.innerHTML='<div class="cols">'+[['comptes','Comptes'],['categories','Catégories'],['personnes','Personnes']].map(([k,l])=>
      '<div class="col"><h3>'+l+'</h3><ul>'+(S.params[k].length?S.params[k].map(x=>{
        const n=u[k][x]||0;
        return '<li><span class="n">'+esc(x)+'</span><span class="used">'+(n?n+'×':'inutilisé')+'</span>'+
               '<button class="ib del" data-pdel="'+k+'" data-val="'+esc(x)+'" '+(n?'disabled title="Utilisé — suppression bloquée"':'title="Supprimer"')+'>✕</button></li>';
      }).join(''):'<li><span class="n hint">— vide —</span></li>')+'</ul>'+
      '<form data-padd="'+k+'"><input placeholder="Ajouter…"><button class="btn primary" type="submit">+</button></form></div>').join('')+'</div>'+
      '<div class="box" style="margin-top:14px;max-width:320px"><h3>Nom de l\'appli</h3><p>Affiché en haut de l\'écran et dans l\'onglet du navigateur.</p>'+
      '<input class="inp" id="pNom" maxlength="40" value="'+esc(nomApp())+'"></div>'+
      '<div class="box" style="max-width:320px"><h3>Taux $HT → HTG</h3><p>1 dollar haïtien = ce nombre de gourdes.</p>'+
      '<input class="inp" type="number" step="0.01" min="0.01" id="pTaux" value="'+S.params.taux+'"></div>'+
      '<div class="msg info">Un compte ajouté apparaît aussitôt comme onglet dans les 12 mois. Une valeur déjà utilisée ne peut pas être supprimée.</div>';
    b.querySelectorAll('[data-pdel]').forEach(x=>x.onclick=()=>{ supprimerValeur(x.dataset.pdel,x.dataset.val); dessinerParams(); });
    b.querySelectorAll('[data-padd]').forEach(f=>f.onsubmit=ev=>{ ev.preventDefault(); const i=f.querySelector('input'); ajouterValeur(f.dataset.padd,i.value); dessinerParams(); });
    $('pNom').onchange=e=>{ const n=e.target.value.trim(); if(!n) return; S.params.nomApp=n; S.params.updatedAt=now(); sauver(); toast('Nom enregistré.'); };
    $('pTaux').onchange=e=>{ const t=Number(e.target.value); if(!(t>0)) return; S.params.taux=t; S.params.updatedAt=now(); sauver(); toast('Taux enregistré.'); };
  }
  if(pOnglet==='sync') Sync.dessiner(b);
  if(pOnglet==='sauv'){
    b.innerHTML='<div class="box"><h3>Exporter une copie</h3><p>Télécharge toutes tes données dans un fichier (.json). À garder en lieu sûr ou à importer sur un autre appareil.</p>'+
      '<button class="btn primary" id="bExport">⬇ Télécharger la sauvegarde</button> <button class="btn" id="bCsv">⬇ Exporter '+UI.annee+' en CSV (Excel)</button></div>'+
      '<div class="box"><h3>Importer une sauvegarde</h3><p>Les données du fichier sont <b>fusionnées</b> avec celles de cet appareil : rien n\'est perdu, la version la plus récente de chaque opération est gardée.</p>'+
      '<input type="file" id="bImport" accept=".json,application/json"></div>'+
      '<div class="box"><h3>Sur cet appareil</h3><p>'+Object.values(S.ops).filter(o=>!o.deleted).length+' opération(s) · '+IX.J.length+' ligne(s) de compte · '+
      evtsLibres().length+' évènement(s).</p></div>';
    $('bExport').onclick=()=>telecharger('finances-'+aujourdhui()+'.json',JSON.stringify(S),'application/json');
    $('bCsv').onclick=exporterCsv;
    $('bImport').onchange=async e=>{
      const f=e.target.files[0]; if(!f) return;
      try{
        const d=JSON.parse(await f.text());
        if(!d||!d.ops||!d.params) throw new Error('Fichier non reconnu.');
        S=fusionner(S,d); await sauver(); dessinerParams(); toast('Sauvegarde importée et fusionnée.');
      }catch(x){ toast('Import impossible : '+x.message,true); }
    };
  }
}
document.addEventListener('click',e=>{ /* liens internes au panneau sync */
  const t=e.target.closest('[data-psync]'); if(t) ouvrirParams('sync');
});

function telecharger(nom,contenu,type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([contenu],{type}));
  a.download=nom; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
function exporterCsv(){
  const y=String(UI.annee);
  const q=s=>'"'+String(s==null?'':s).replace(/"/g,'""')+'"';
  const n=x=>x?String(x).replace('.',','):'';
  const rows=[['Date','Compte','Description','Catégorie','Débit','Crédit','Solde','Commentaire'].map(q).join(';')];
  IX.J.filter(x=>x.date.slice(0,4)===y).forEach(x=>rows.push([q(frDate(x.date)),q(x.compte),q(x.desc),q(x.cat),n(x.debit),n(x.credit),n(x.solde),q(x.com)].join(';')));
  telecharger('finances-'+y+'.csv','\ufeff'+rows.join('\r\n'),'text/csv;charset=utf-8');
}

/* ================================ FUSION ================================= */
/*  PC et téléphone peuvent travailler hors ligne en même temps. À la
 *  synchronisation, chaque opération est comparée par son identifiant : la
 *  version modifiée le plus récemment l'emporte. Les suppressions voyagent
 *  aussi (marque deleted). Les listes sont réunies, sauf ce qui a été retiré.  */

function fusionner(a,b){
  if(!b) return a; if(!a) return b;
  const r={schema:1,ops:{},evts:{}};
  ['ops','evts'].forEach(col=>{
    const A=a[col]||{}, B=b[col]||{};
    new Set(Object.keys(A).concat(Object.keys(B))).forEach(id=>{
      const x=A[id], y=B[id];
      r[col][id]=!x?y:!y?x:((y.updatedAt||0)>(x.updatedAt||0)?y:x);
    });
  });
  const pa=a.params||{}, pb=b.params||{};
  const rec=(pb.updatedAt||0)>(pa.updatedAt||0)?pb:pa, anc=rec===pa?pb:pa;
  const retires=new Set((rec.retires||[]).concat(anc.retires||[]));
  /* Une valeur retirée d'un côté mais présente dans la version la plus récente reste. */
  const p={taux:rec.taux||anc.taux||5,nomApp:rec.nomApp||anc.nomApp||'Mes Finances',updatedAt:Math.max(pa.updatedAt||0,pb.updatedAt||0)};
  ['comptes','categories','personnes'].forEach(k=>{
    const l=(rec[k]||[]).slice();
    (anc[k]||[]).forEach(x=>{ if(l.indexOf(x)===-1&&!retires.has(k+':'+x)) l.push(x); });
    p[k]=l;
  });
  p.retires=Array.from(retires).filter(x=>{ const i=x.indexOf(':'); return p[x.slice(0,i)].indexOf(x.slice(i+1))===-1; });
  r.params=p;
  return r;
}

/* ============================ GOOGLE DRIVE =============================== */

const DRIVE='https://www.googleapis.com/drive/v3/files';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const NOM_DOSSIER='Mes Finances';
const NOM_FICHIER='finances-donnees.json';
const SCOPE='https://www.googleapis.com/auth/drive.file';

const Sync={
  busy:false, encore:false, timer:null, statut:'off', erreur:'',
  get clientId(){ return lsGet('fw_clientId')||''; },

  etat(s,txt){
    this.statut=s;
    const b=$('btnSync'); b.dataset.s=s;
    const last=lsGet('fw_lastSync');
    const h=last?new Date(Number(last)):null;
    const lbl={off:'Drive : non configuré',deconnecte:'Drive : se connecter',encours:'Synchro…',
               ok:'Drive ✓ '+(h?pad(h.getHours())+':'+pad(h.getMinutes()):''),
               erreur:'Drive : erreur',attente:'Drive : à synchroniser',horsligne:'Hors ligne'}[s];
    $('syncTxt').textContent=txt||lbl;
    b.title=s==='erreur'?this.erreur:'Synchronisation Google Drive';
    if(!$('params').classList.contains('hidden')&&pOnglet==='sync') this.dessiner($('pBody'));
  },

  chargerGIS(){
    return new Promise((res,rej)=>{
      if(window.google&&google.accounts&&google.accounts.oauth2) return res();
      const s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.async=true;
      s.onload=()=>res(); s.onerror=()=>rej(new Error('Impossible de joindre Google (hors ligne ?)'));
      document.head.appendChild(s);
    });
  },

  jetonValide(){
    const t=lsGet('fw_token'), e=Number(lsGet('fw_tokenExp')||0);
    return (t&&now()<e-60000)?t:null;
  },

  /** Doit être appelé depuis un clic quand une fenêtre Google peut s'ouvrir. */
  jeton(interactif){
    const t=this.jetonValide(); if(t) return Promise.resolve(t);
    if(!interactif) return Promise.resolve(null);
    if(!this.clientId) return Promise.reject(new Error('Identifiant Google non configuré.'));
    if(!(window.google&&google.accounts&&google.accounts.oauth2)) return Promise.reject(new Error('Google pas encore chargé — réessaie dans 2 secondes.'));
    return new Promise((res,rej)=>{
      const tc=google.accounts.oauth2.initTokenClient({
        client_id:this.clientId, scope:SCOPE,
        callback:r=>{
          if(r.error){ rej(new Error(r.error_description||r.error)); return; }
          lsSet('fw_token',r.access_token);
          lsSet('fw_tokenExp',String(now()+(Number(r.expires_in)||3600)*1000));
          lsSet('fw_connecte','1');
          res(r.access_token);
        },
        error_callback:x=>rej(new Error(x&&x.type==='popup_closed'?'Fenêtre Google fermée.':(x&&x.message)||'Connexion refusée.'))
      });
      tc.requestAccessToken({prompt:lsGet('fw_connecte')?'':'consent'});
    });
  },

  async api(url,opt){
    opt=opt||{};
    const tok=this.jetonValide();
    if(!tok) throw new Error('Session Google expirée — clique sur le bouton Drive.');
    const r=await fetch(url,Object.assign({},opt,{headers:Object.assign({},opt.headers||{},{Authorization:'Bearer '+tok})}));
    if(r.status===401){ lsSet('fw_token',null); throw new Error('Session Google expirée — clique sur le bouton Drive.'); }
    if(!r.ok){ const t=await r.text(); const e=new Error('Drive '+r.status+' : '+t.slice(0,180)); e.code=r.status; throw e; }
    return r;
  },
  async chercher(q){
    const r=await this.api(DRIVE+'?spaces=drive&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&q='+encodeURIComponent(q));
    return (await r.json()).files||[];
  },
  async dossier(){
    let id=lsGet('fw_folderId');
    if(id){
      try{ const r=await this.api(DRIVE+'/'+id+'?fields=id,trashed'); const j=await r.json(); if(!j.trashed) return id; }
      catch(e){ if(e.code!==404) throw e; }
    }
    const f=await this.chercher("name='"+NOM_DOSSIER+"' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    if(f.length) id=f[0].id;
    else{
      const r=await this.api(DRIVE+'?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:NOM_DOSSIER,mimeType:'application/vnd.google-apps.folder'})});
      id=(await r.json()).id;
    }
    lsSet('fw_folderId',id); lsSet('fw_fileId',null);
    return id;
  },
  async creer(nom,parent,contenu){
    const b='fw'+Math.random().toString(36).slice(2);
    const body='--'+b+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:nom,parents:[parent],mimeType:'application/json'})+
               '\r\n--'+b+'\r\nContent-Type: application/json\r\n\r\n'+contenu+'\r\n--'+b+'--';
    const r=await this.api(UPLOAD+'?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body});
    return (await r.json()).id;
  },
  async ecrire(id,contenu){
    await this.api(UPLOAD+'/'+id+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':'application/json'},body:contenu});
  },

  planifier(){
    if(!this.clientId){ this.etat('off'); return; }
    if(this.busy){ this.encore=true; return; }
    this.etat('attente');
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.lancer(false),3000);
  },

  async lancer(interactif){
    if(!this.clientId){ this.etat('off'); if(interactif) ouvrirParams('sync'); return; }
    if(!navigator.onLine){ this.etat('horsligne'); return; }
    if(this.busy){ this.encore=true; return; }
    this.busy=true; clearTimeout(this.timer);
    try{
      const tok=await this.jeton(interactif);
      if(!tok){ this.etat('deconnecte'); return; }
      this.etat('encours');
      const parent=await this.dossier();
      let fid=lsGet('fw_fileId');
      if(!fid){ const f=await this.chercher("name='"+NOM_FICHIER+"' and '"+parent+"' in parents and trashed=false"); fid=f.length?f[0].id:null; }
      let distant=null;
      if(fid){
        try{ distant=await (await this.api(DRIVE+'/'+fid+'?alt=media')).json(); }
        catch(e){ if(e.code===404){ fid=null; lsSet('fw_fileId',null); } else throw e; }
      }
      S=fusionner(S,distant);                      /* S courant : rien de ce qui a été saisi pendant ce temps n'est perdu */
      const contenu=JSON.stringify(S);
      if(fid) await this.ecrire(fid,contenu); else fid=await this.creer(NOM_FICHIER,parent,contenu);
      lsSet('fw_fileId',fid);
      const jour=aujourdhui();
      if(lsGet('fw_lastBackup')!==jour){
        await this.creer('sauvegarde-'+jour+'.json',parent,contenu);
        lsSet('fw_lastBackup',jour);
      }
      await DB.set('etat',S); indexer(); rendre();
      lsSet('fw_lastSync',String(now()));
      this.etat('ok');
    }catch(e){
      this.erreur=e.message; this.etat('erreur');
      if(interactif) toast(e.message,true);
    }finally{
      this.busy=false;
      if(this.encore){ this.encore=false; this.planifier(); }
    }
  },

  deconnecter(){
    const t=lsGet('fw_token');
    if(t&&window.google&&google.accounts&&google.accounts.oauth2) google.accounts.oauth2.revoke(t,()=>{});
    ['fw_token','fw_tokenExp','fw_connecte','fw_fileId','fw_folderId'].forEach(k=>lsSet(k,null));
    this.etat('deconnecte'); toast('Déconnecté de Google Drive.');
  },

  dessiner(b){
    const last=lsGet('fw_lastSync');
    b.innerHTML=
      '<div class="box"><h3>État</h3><p>'+
        (!this.clientId?'Non configuré : suis les étapes ci-dessous une seule fois.':
          this.jetonValide()?'Connecté à Google Drive.':'Configuré — clique sur « Synchroniser » pour te connecter.')+
        (last?'<br>Dernière synchronisation : '+new Date(Number(last)).toLocaleString('fr-FR'):'')+
        (this.statut==='erreur'?'<br><span class="neg">'+esc(this.erreur)+'</span>':'')+'</p>'+
        '<button class="btn primary" id="sNow" '+(this.clientId?'':'disabled')+'>🔄 Synchroniser maintenant</button> '+
        (lsGet('fw_connecte')?'<button class="btn danger" id="sOut">Se déconnecter</button>':'')+
        '<p class="hint" style="margin-top:10px">Les données vont dans le dossier <b>'+NOM_DOSSIER+'</b> de ton Drive : le fichier <code>'+NOM_FICHIER+'</code> '+
        '(lu et mis à jour par le PC et le téléphone) et une copie datée chaque jour <code>sauvegarde-AAAA-MM-JJ.json</code>.</p></div>'+
      '<div class="box"><h3>Identifiant client Google</h3>'+
        '<input class="inp" id="sCid" placeholder="xxxxxxxx.apps.googleusercontent.com" value="'+esc(this.clientId)+'">'+
        '<div class="actions" style="margin-top:8px"><button class="btn primary" id="sSave">Enregistrer</button></div></div>'+
      '<div class="box"><h3>Configuration (une seule fois)</h3><ol>'+
        '<li>Va sur <code>console.cloud.google.com</code> avec ton compte Google → crée un projet (par ex. « Mes Finances »).</li>'+
        '<li>Menu <b>API et services → Bibliothèque</b> → active <b>Google Drive API</b>.</li>'+
        '<li><b>Écran de consentement OAuth</b> → type <b>Externe</b> → nom de l\'appli, ton e-mail → ajoute ton adresse dans <b>Utilisateurs test</b>.</li>'+
        '<li><b>Identifiants → Créer → ID client OAuth</b> → type <b>Application Web</b>.</li>'+
        '<li>Dans <b>Origines JavaScript autorisées</b>, ajoute l\'adresse de l\'appli : <code>'+esc(location.origin)+'</code></li>'+
        '<li>Copie l\'<b>ID client</b> obtenu, colle-le ci-dessus, Enregistrer, puis « Synchroniser ».</li>'+
        '<li>Sur le téléphone : ouvre la même adresse, colle le même ID client, Synchroniser. Les deux appareils partagent alors les mêmes données.</li>'+
      '</ol></div>';
    $('sSave').onclick=()=>{
      const v=$('sCid').value.trim();
      if(v&&!/\.apps\.googleusercontent\.com$/.test(v)){ toast('Cet identifiant ne ressemble pas à un ID client Google.',true); return; }
      lsSet('fw_clientId',v||null);
      if(v) this.chargerGIS().catch(()=>{});
      this.etat(v?'deconnecte':'off'); toast('Identifiant enregistré.');
    };
    const n=$('sNow'); if(n) n.onclick=()=>this.lancer(true);
    const o=$('sOut'); if(o) o.onclick=()=>this.deconnecter();
  }
};
$('btnSync').onclick=()=>{ if(!Sync.clientId) ouvrirParams('sync'); else Sync.lancer(true); };
window.addEventListener('online',()=>{ if(Sync.jetonValide()) Sync.lancer(false); else if(Sync.clientId) Sync.etat('deconnecte'); });
window.addEventListener('offline',()=>Sync.etat('horsligne'));
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&Sync.jetonValide()) Sync.lancer(false); });

/* ============================== DÉMARRAGE ================================ */

async function demarrer(){
  await DB.open();
  try{ S=await DB.get('etat'); }catch(e){ S=null; }
  if(!S||!S.params) S=etatVide();
  S.ops=S.ops||{}; S.evts=S.evts||{};
  try{ const u=JSON.parse(lsGet('fw_ui')||'null'); if(u){ UI.annee=u.annee; UI.mois=u.mois; UI.onglet=u.onglet; } }catch(e){}
  indexer(); rendre();
  if(Sync.clientId){
    Sync.chargerGIS().catch(()=>{});
    if(Sync.jetonValide()) Sync.lancer(false); else Sync.etat(navigator.onLine?'deconnecte':'horsligne');
  } else Sync.etat('off');
  if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('sw.js').catch(()=>{});
  if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(()=>{});
}

/* Accès pour les tests. */
window.FW={get S(){return S;},get IX(){return IX;},fusionner,genLignes};

demarrer();
})();
