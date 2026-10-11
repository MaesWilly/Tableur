/* ============================================================================
 *  MES FINANCES — Assistant hors ligne
 *  Comprend des phrases courtes (mots-clés), pose une question quand une
 *  information manque, et ne garde que les phrases qu'il n'a PAS comprises
 *  (Paramètres → Assistant → Exporter) pour les prochaines mises à jour.
 *  Rien ne part sur internet.
 * ========================================================================== */
'use strict';
(function () {

const A = window.FWI;
const $ = id => document.getElementById(id);
const VERSION_DICO = 1;

/* ------------------------------- outils ---------------------------------- */
function norm(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[’'`]/g,' ').replace(/[!¡¿]/g,' ').replace(/\s+/g,' ').trim();
}
function rx(mot){ return new RegExp('(^|[^a-z0-9])'+mot.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z0-9])'); }
function cap(s){ return String(s).replace(/\b\p{L}/gu,c=>c.toUpperCase()); }
function htg(n){ return A.htg(n); }

/* Cherche des expressions dans le texte ; les plus longues d'abord, sans chevauchement. */
function trouver(t, dico){
  const cands=[];
  Object.keys(dico).forEach(cle=>dico[cle].forEach(m=>{
    const mn=norm(m); if(!mn) return;
    const r=new RegExp('(^|[^a-z0-9])('+mn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')(?=$|[^a-z0-9])','g');
    let x; while((x=r.exec(t))){ const d=x.index+x[1].length; cands.push({cle,d,f:d+mn.length,len:mn.length}); }
  }));
  cands.sort((a,b)=>b.len-a.len||a.d-b.d);
  const pris=[], out=[];
  cands.forEach(c=>{ if(pris.some(p=>c.d<p.f&&c.f>p.d)) return; pris.push(c); out.push(c); });
  return out.sort((a,b)=>a.d-b.d);
}

/* ----------------------------- dictionnaires ----------------------------- */
const ALIAS_COMPTES = {
  'Cash':['cash','kach','cach','espece','especes','liquide','en main'],
  'Moncash':['moncash','mon cash','mon-cash','mcash'],
  'Natcash':['natcash','nat cash','nat-cash','lajan cash'],
  'Sogebank':['sogebank','soge','sogebanque','sogexpress'],
  'Unibank':['unibank','uni bank','unibanque'],
  'Consignation':['consignation','consigne']
};
const DEP = {
  'Courses alimentaires':['nourriture','manger','courses','marche','epicerie','provision','provisions','riz','pain','viande','poulet','poisson','huile','legume','legumes','haricot','haricots','pois','farine','spaghetti','sucre','lait','oeuf','oeufs','fromage','banane','bananes','cassave','fruits','hareng','salami','epices','mais moulu'],
  'Repas à l\'extérieur':['restaurant','resto','diner','dejeuner','souper','repas','plat','fritay','lunch','griot'],
  'Boissons':['boisson','boissons','jus','soda','biere','cola','prestige','vin','rhum','kola'],
  'Eau':['eau','gallon','gallons','camion d eau','culligan'],
  'Électricité':['electricite','edh','courant','generatrice','inverter','inverteur','batterie','panneau solaire','delco'],
  'Gaz / Charbon':['gaz','propane','charbon','bonbonne'],
  'Loyer / Logement':['loyer','logement','maison','chambre','appartement'],
  'Entretien maison / Réparations':['reparation','reparations','plombier','plomberie','electricien','entretien maison','serrure','vitre'],
  'Meubles / Équipement':['meuble','meubles','matelas','chaise','chaises','table','lit','frigo','refrigerateur','televiseur','tv','ventilateur','cuisiniere','equipement','ustensile','ustensiles','marmite'],
  'Enfants':['enfant','enfants','bebe','couche','couches','garderie','babysitter','jouet','jouets'],
  'Écolage / Éducation':['ecolage','ecole','scolarite','frais scolaires','universite','fac','cours','formation','inscription','examen'],
  'Fournitures scolaires':['fourniture','fournitures','cahier','cahiers','uniforme','livre','livres','crayon','crayons','sac d ecole'],
  'Aide à la famille':['maman','papa','mere','pere','frere','soeur','cousin','cousine','tante','oncle','grand mere','famille','parents'],
  'Domestique / Personnel de maison':['domestique','menagere','bonne','gardien','jardinier','lavandiere'],
  'Carburant':['carburant','essence','gazoline','gasoline','diesel','gasoil','plein'],
  'Tap-tap / Moto / Taxi':['taptap','tap tap','tap-tap','taxi','moto taxi','bus','camionnette','transport','course moto','trajet'],
  'Entretien véhicule':['mecanicien','garage','pneu','pneus','vidange','huile moteur','piece moto','pieces moto','chaine moto','entretien moto','entretien voiture','lavage moto','lavage voiture'],
  'Recharge téléphone':['recharge','carte telephone','minutes','digicel','natcom','top up','topup'],
  'Internet':['internet','wifi','data','forfait','starlink'],
  'Médecin / Hôpital':['medecin','docteur','hopital','clinique','consultation','analyse','analyses','laboratoire','dentiste'],
  'Pharmacie':['pharmacie','medicament','medicaments','pilule','sirop','vitamine','vitamines'],
  'Vêtements / Chaussures':['vetement','vetements','chaussure','chaussures','habit','habits','robe','pantalon','chemise','tennis','jeans','sandale','sandales'],
  'Hygiène / Soins':['savon','dentifrice','shampoing','shampooing','hygiene','papier toilette','detergent','poudre','lessive','deodorant','creme'],
  'Coiffure / Beauté':['coiffure','coiffeur','barbier','salon','ongles','maquillage','tresse','tresses','perruque','meche'],
  'Cadeaux / Dons':['cadeau','cadeaux','don','dons','aumone'],
  'Fêtes / Évènements':['fete','anniversaire','mariage','bapteme','communion','funerailles','enterrement','evenement','soiree'],
  'Église / Offrandes':['eglise','offrande','offrandes','dime','quete','temple'],
  'Loisirs / Sorties':['loisir','loisirs','sortie','cinema','plage','voyage','vacances','match','bar','club','concert'],
  'Chantier / Matériel':['ciment','bloc','blocs','fer','sable','gravier','tole','toles','clou','clous','bois','planche','planches','chantier','materiaux','materiel','tuyau','peinture'],
  'Outillage':['outil','outils','outillage','marteau','perceuse','scie','pelle','brouette','tournevis'],
  'Personnel / Salaires':['ouvrier','ouvriers','travailleur','travailleurs','boss','main d oeuvre','journalier','macon','charpentier'],
  'Administratif / Documents':['papier','papiers','legalisation','passeport','acte de naissance','timbre','documents','document','notaire','photocopie','impression','permis'],
  'Épargne':['epargne','economie','economies','sol','tontine','mis de cote','mettre de cote'],
  'Frais bancaires':['frais bancaire','frais bancaires','frais de transfert'],
  'Taxes':['taxe','taxes','tca','impot','impots','dgi'],
  'Assurance':['assurance']
};
const REV = {
  'Salaire':['salaire','paie','mon salaire'],
  'Vente':['vente','vendu','vendre','ventes'],
  'Commission / Prime':['commission','prime','bonus','pourboire'],
  'Loyer reçu':['loyer recu','locataire','locataires'],
  'Intérêts':['interet','interets'],
  'Autres revenus':['autre revenu','autres revenus','cadeau recu','don recu']
};
const TYPES_TXT = {depense:'Dépense',revenu:'Revenu',transfert:'Transfert',pret:'Prêt accordé',emprunt:'Emprunt reçu',rembours:'Remboursement',initial:'Solde de départ'};

/* ------------------------------ extraction ------------------------------- */
function extraireDate(t){
  const auj=A.aujourdhui(); let d=null;
  const sub=(r,f)=>{ const m=t.match(r); if(m){ d=f(m); t=t.replace(m[0],' '); } };
  sub(/avant[ -]hier/,()=>A.veille(A.veille(auj)));
  if(!d) sub(/\bhier\b/,()=>A.veille(auj));
  if(!d) sub(/aujourd ?hui|\bce jour\b/,()=>auj);
  if(!d) sub(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/,m=>{
    let y=m[3]?Number(m[3]):Number(auj.slice(0,4)); if(y<100) y+=2000;
    const mo=Number(m[2]), j=Number(m[1]); if(mo<1||mo>12||j<1||j>31) return null;
    return y+'-'+String(mo).padStart(2,'0')+'-'+String(j).padStart(2,'0');
  });
  if(!d) sub(/\ble (\d{1,2})(?=$|[^0-9])(?! ?(mois|%|x))/,m=>{
    const j=Number(m[1]); if(j<1||j>31) return null; return auj.slice(0,8)+String(j).padStart(2,'0');
  });
  return {date:d,t};
}
function lireNombre(s){
  const m=String(s).match(/(\d{1,3}(?:[ .]\d{3})+|\d+)(?:,(\d{1,2})|\.(\d{1,2})(?!\d))?/);
  if(!m) return null;
  return Number(m[1].replace(/[ .]/g,'')+'.'+(m[2]||m[3]||'0'));
}
function extraireMontants(t){
  const r={};
  /* frais / taxe : « frais 1% », « frais 50 » */
  t=t.replace(/\bfrais (de )?(\d+(?:[.,]\d+)?) ?(%|pour ?cent|gd|gdes|gourdes|htg)?/,(m0,_,n,u)=>{ r.frais=Number(n.replace(',','.')); r.fraisUnite=(u&&/%|cent/.test(u))?'%':'HTG'; return ' '; });
  t=t.replace(/\b(tca|taxe) (de )?(\d+(?:[.,]\d+)?) ?(%|pour ?cent|gd|gdes|gourdes|htg)?/,(m0,_a,_b,n,u)=>{ r.tca=Number(n.replace(',','.')); r.tcaUnite=(u&&/%|cent/.test(u))?'%':'HTG'; return ' '; });
  /* plan : « en 6 mois », « 250 par mois » */
  t=t.replace(/(\d[\d .,]*)\s*(?:gd|gdes|gourdes|htg)?\s*(par mois|\/ ?mois|chaque mois|mensuel)/,(m0,n)=>{ r.parMois=lireNombre(n); return ' '; });
  t=t.replace(/\ben (\d{1,3}) mois\b/,(m0,n)=>{ r.nbMois=Number(n); return ' '; });
  t=t.replace(/\b(\d{1,3}) (tranches|fois|versements)\b/,(m0,n)=>{ r.nbMois=Number(n); return ' '; });
  /* montant principal */
  const m=t.match(/(\d{1,3}(?:[ .]\d{3})+|\d+)(?:,(\d{1,2})|\.(\d{1,2})(?!\d))?\s*(k\b|mil\b|mille\b)?\s*(\$ ?ht|\$|dollars?|dola|htd|gourdes?|gdes?|gd\b|htg)?/);
  if(m){
    let v=Number(m[1].replace(/[ .]/g,'')+'.'+(m[2]||m[3]||'0'));
    if(m[4]) v*=1000;
    r.montant=Math.round(v*100)/100;
    r.devise=(m[5]&&/\$|dol|htd/.test(m[5]))?'HTD':'HTG';
    t=t.replace(m[0],' ');
  }
  return {r,t};
}
function aliasComptes(){
  const d={};
  A.listeComptes().forEach(c=>{ d[c]=(ALIAS_COMPTES[c]||[]).concat([c]); });
  return d;
}
function extraireComptes(t){ return trouver(t,aliasComptes()); }
function extrairePersonne(t,orig){
  const pers=A.S.params.personnes||[];
  const d={}; pers.forEach(p=>d[p]=[p]);
  const f=trouver(t,d);
  if(f.length) return {nom:f[0].cle,connu:true};
  const exclus=new Set(A.listeComptes().map(norm).concat(['je','j','moi','mon','ma','mes','le','la','les','un','une','cash','hier','demain','aujourd']));
  const essais=[
    /(?:^|\s)(?:à|a|pour|de|chez|avec|par)\s+([A-ZÀ-Ý][\p{L}.\-]+(?:\s+[A-ZÀ-Ý][\p{L}.\-]+)?)/u,
    /^([A-ZÀ-Ý][\p{L}.\-]+)\s+(?:m'a|m’a|ma|me|rembourse|a rembours|a rendu|doit|paye|a payé|a paye|verse)/u
  ];
  for(const r of essais){
    const m=orig.match(r);
    if(m){ const n=m[1].trim(); if(!exclus.has(norm(n))&&!/^\d/.test(n)) return {nom:n,connu:false}; }
  }
  return null;
}
function extraireDossier(t){ const m=t.match(/\b(pre|emp)[ \-]?(\d{3,7})\b/); return m?(m[1].toUpperCase()+'-'+m[2]):null; }
function extraireCategorie(t,type){
  const mes=A.S.params.categories||[];
  const dicoMes={}; mes.forEach(c=>dicoMes[c]=[c]);
  const ordre= type==='revenu' ? [REV,dicoMes,DEP] : [dicoMes,DEP,REV];
  for(const dico of ordre){
    const f=trouver(t,dico).filter(x=>mes.indexOf(x.cle)!==-1||!A.S.params.retires||A.S.params.retires.indexOf('categories:'+x.cle)===-1);
    if(f.length) return f[0].cle;
  }
  return null;
}
function detecterType(t,nbComptes){
  if(/solde (de )?depart|solde initial|montant de depart|j ai au depart/.test(t)) return 'initial';
  if(/\b(retrait|retire|retirer)\b/.test(t)) return 'retrait';
  if(/\b(depot|depose|deposer)\b/.test(t)&&nbComptes<=1) return 'depot';
  if(/transf|virement|\bvire\b|\bvirer\b|\benvoye\b|\benvoie\b|\bpasse de\b/.test(t)) return 'transfert';
  if(/rembours|m a rendu|\brendu\b|a remis|sa dette|\btranche\b/.test(t)) return 'rembours';
  if(/emprunt|m a prete|m a avance|prete moi|pret de |\bavance de\b/.test(t)) return 'emprunt';
  if(/\bprete\b|\bpret\b|\bpreter\b|avance a|\bprete a\b/.test(t)) return 'pret';
  if(/\b(recu|recus|recue|gagne|encaisse|entree|revenu|revenus|vendu|vente|touche|rentre|commission|prime|salaire recu)\b/.test(t)) return 'revenu';
  if(/\b(depense|depenses|achete|achat|achats|paye|payer|paie|acheter|sortie|depenser|cout|coute)\b/.test(t)) return 'depense';
  if(nbComptes>=2&&/( vers | a | sur | dans |->|=>)/.test(t)) return 'transfert';
  return null;
}

/* Découpe « … et … » seulement si chaque morceau a un montant. */
function decouper(texte){
  const parts=texte.split(/\n|;| puis | ensuite /i).map(s=>s.trim()).filter(Boolean);
  const out=[];
  parts.forEach(p=>{
    const morceaux=p.split(/\s+et\s+/i);
    let acc='';
    morceaux.forEach((m,i)=>{
      acc=acc?acc+' et '+m:m;
      if(/\d/.test(m)||i===morceaux.length-1){ out.push(acc); acc=''; }
    });
  });
  return out.length?out:[texte];
}

/* -------------------------------- analyse -------------------------------- */
function brouillon(seg){
  const orig=seg;
  let t=norm(seg);
  const dossier=extraireDossier(t); if(dossier) t=t.replace(/\b(pre|emp)[ \-]?\d{3,7}\b/,' ');
  const D=extraireDate(t); t=D.t;
  const M=extraireMontants(t); t=M.t;
  const comptes=extraireComptes(t);
  let type=detecterType(t,comptes.length);
  const pers=extrairePersonne(t,orig);
  const b={type,date:D.date||A.aujourdhui(),montant:M.r.montant,devise:M.r.devise||'HTG',
           frais:M.r.frais||0,fraisUnite:M.r.fraisUnite||'%',tca:M.r.tca||0,tcaUnite:M.r.tcaUnite||'%',
           parMois:M.r.parMois,nbMois:M.r.nbMois,texte:orig};
  if(type==='retrait'){ b.type='transfert'; const c=comptes.map(x=>x.cle).filter(x=>x!=='Cash'); b.source=c[0]; b.destination='Cash'; }
  else if(type==='depot'){ b.type='transfert'; b.source='Cash'; b.destination=comptes.map(x=>x.cle).filter(x=>x!=='Cash')[0]; }
  else if(type==='transfert'){
    let src=null,dst=null;
    comptes.forEach(c=>{
      const avant=t.slice(Math.max(0,c.d-9),c.d);
      if(/(vers|a|sur|dans|pour|->|=>)\s*$/.test(avant)&&!dst) dst=c.cle;
      else if(/(de|depuis|du)\s*$/.test(avant)&&!src) src=c.cle;
    });
    const reste=comptes.map(c=>c.cle).filter(c=>c!==src&&c!==dst);
    if(!src) src=reste.shift(); if(!dst) dst=reste.shift();
    b.source=src; b.destination=dst;
  }
  else if(type==='pret'){ b.source=comptes[0]&&comptes[0].cle; }
  else if(type==='emprunt'){ b.destination=comptes[0]&&comptes[0].cle; }
  else { b.compte=comptes[0]&&comptes[0].cle; }
  if(type==='initial') b.signe=/negatif|decouvert|\bdette\b|moins/.test(t)?'-':'+';
  if(['pret','emprunt','rembours'].indexOf(b.type)!==-1&&pers){ b.personne=pers.nom; b.personneNouvelle=!pers.connu; }
  if(b.type==='rembours'){ b.dossier=dossier; b.compte=comptes[0]&&comptes[0].cle; }
  if(b.type==='depense'||b.type==='revenu'||!b.type){
    const cat=extraireCategorie(t,b.type||'depense');
    if(cat){ b.categorie=cat; if(!b.type) b.type=REVENUS_SET.has(cat)?'revenu':'depense'; }
  }
  return b;
}
const REVENUS_SET=new Set(A.REVENUS);

function estQuestion(t,aMontant){
  if(/\?\s*$/.test(t)) return true;
  if(aMontant) return false;
  return /^(combien|quel|quelle|quels|quelles|qui|ou en|solde|soldes|total|situation|bilan|montre|affiche|liste|etat|mes |prochain|prochaine|prochaines|echeance|depense|depenses|revenu|revenus|aide|help|bonjour|bonsoir|salut|merci|ok|reste|dossier|pret|prets|emprunt|emprunts|dette|dettes|j ai combien|je dois|on me doit)/.test(t);
}

/* ------------------------------- réponses -------------------------------- */
function periode(t){
  const auj=A.aujourdhui(), y=Number(auj.slice(0,4)), m=Number(auj.slice(5,7))-1;
  if(/aujourd ?hui/.test(t)) return {d0:auj,d1:auj,lib:'aujourd\'hui'};
  if(/hier/.test(t)){ const h=A.veille(auj); return {d0:h,d1:h,lib:'hier'}; }
  if(/semaine/.test(t)){ let d=auj; for(let i=0;i<6;i++) d=A.veille(d); return {d0:d,d1:auj,lib:'les 7 derniers jours'}; }
  if(/mois (dernier|passe|precedent)/.test(t)){ const yy=m===0?y-1:y, mm=m===0?11:m-1; return {d0:A.debutMois(yy,mm),d1:A.finMois(yy,mm),lib:A.MOIS[mm].toLowerCase()+' '+yy}; }
  if(/\bannee\b|cette annee/.test(t)) return {d0:y+'-01-01',d1:y+'-12-31',lib:'cette année'};
  return {d0:A.debutMois(y,m),d1:A.finMois(y,m),lib:'ce mois-ci ('+A.MOIS[m].toLowerCase()+')'};
}
function ligneDossier(d){
  const emp=/^EMP/i.test(d.dossier);
  return '• '+d.personne+' — '+d.dossier+' : '+htg(d.reste)+(emp?' à rendre':' à recevoir')+
    (d.prochaine?' · prochaine '+A.frDate(d.prochaine.date)+' ('+htg(d.prochaine.du)+')':'')+(d.statut==='En retard'?' ⚠️ en retard':'');
}
function repondre(texte){
  const t=norm(texte), auj=A.aujourdhui();
  if(/^(aide|help|\?|exemples?|que sais|comment (ca|ça) marche|tu sais faire)/.test(t)) return aide();
  if(/^(bonjour|bonsoir|salut|hello|bjr|bsr)/.test(t)) return 'Bonjour 👋 Que veux-tu savoir ou enregistrer ? Tape « aide » pour des exemples.';
  if(/^(merci|ok|d accord|parfait|super|top)\b/.test(t)) return 'Avec plaisir 👍';

  const comptes=extraireComptes(t).map(c=>c.cle);
  const pers=extrairePersonne(t,texte), dossier=extraireDossier(t);

  if(dossier){
    const i=A.IX.I.find(x=>x.dossier===dossier);
    if(!i) return 'Je ne trouve pas le dossier '+dossier+'.';
    const d=A.etatDossier(i,'9999-12-31');
    return ligneDossier(d)+'\nStatut : '+d.statut+' · remboursé '+htg(d.rembourse)+' sur '+htg(d.attendu)+'.';
  }
  if(/qui me doit|on me doit|mes prets|prets? en cours|a recevoir|ce qu on me doit/.test(t)){
    const l=A.dossiersOuverts().filter(d=>/^PRE/i.test(d.dossier));
    if(!l.length) return 'Personne ne te doit d\'argent en ce moment 👍';
    return 'On te doit '+htg(l.reduce((s,d)=>s+d.reste,0))+' :\n'+l.map(ligneDossier).join('\n');
  }
  if(/je dois|mes dettes|mes emprunts|emprunts? en cours|a rendre|ce que je dois/.test(t)){
    const l=A.dossiersOuverts().filter(d=>/^EMP/i.test(d.dossier));
    if(!l.length) return 'Tu ne dois rien à personne en ce moment 👍';
    return 'Tu dois '+htg(l.reduce((s,d)=>s+d.reste,0))+' :\n'+l.map(ligneDossier).join('\n');
  }
  if(pers&&pers.connu&&!/depense|revenu/.test(t)){
    const l=A.dossiersOuverts().filter(d=>norm(d.personne)===norm(pers.nom));
    if(!l.length) return pers.nom+' n\'a aucun dossier ouvert.';
    return l.map(ligneDossier).join('\n');
  }
  if(/echeance|prochain|a venir|a payer|a recevoir bientot|rappel/.test(t)){
    const fin=A.plusMois(auj,1);
    const ev=A.echeancesAuto('0000-01-01',fin).concat(A.evtsLibres().filter(e=>e.date>=auj&&e.date<=fin&&e.statut!=='Fait'&&e.statut!=='Annulé'));
    ev.sort((a,b)=>a.date<b.date?-1:1);
    if(!ev.length) return 'Rien de prévu dans les 30 prochains jours.';
    return 'Dans les 30 prochains jours :\n'+ev.slice(0,12).map(e=>'• '+A.frDate(e.date)+' — '+e.nom+(e.personne?' ('+e.personne+')':'')+(e.montant?' : '+htg(e.montant):'')).join('\n');
  }
  if(/depense|depenses|depense|j ai paye|achats/.test(t)){
    const P=periode(t), cat=extraireCategorie(t,'depense');
    const par={}; let tot=0;
    A.IX.J.forEach(x=>{ if(x.date<P.d0||x.date>P.d1||A.EXCLUS.indexOf(x.cat)!==-1||!x.debit) return; if(cat&&x.cat!==cat) return; par[x.cat]=(par[x.cat]||0)-x.debit; tot-=x.debit; });
    if(cat) return 'Dépenses « '+cat+' » '+P.lib+' : '+htg(tot)+'.';
    const l=Object.keys(par).sort((a,b)=>par[b]-par[a]);
    if(!l.length) return 'Aucune dépense '+P.lib+'.';
    return 'Dépenses '+P.lib+' : '+htg(tot)+'\n'+l.slice(0,10).map(c=>'• '+c+' : '+htg(par[c])).join('\n');
  }
  if(/revenu|revenus|gagne|entrees|rentre/.test(t)){
    const P=periode(t); const par={}; let tot=0;
    A.IX.J.forEach(x=>{ if(x.date<P.d0||x.date>P.d1||A.EXCLUS.indexOf(x.cat)!==-1||!x.credit) return; par[x.cat]=(par[x.cat]||0)+x.credit; tot+=x.credit; });
    const l=Object.keys(par).sort((a,b)=>par[b]-par[a]);
    if(!l.length) return 'Aucun revenu '+P.lib+'.';
    return 'Revenus '+P.lib+' : '+htg(tot)+'\n'+l.map(c=>'• '+c+' : '+htg(par[c])).join('\n');
  }
  if(/solde|combien|reste|j ai|argent|compte|disponible/.test(t)||comptes.length){
    const liste=comptes.length?comptes:A.listeComptes();
    const lignes=liste.map(c=>'• '+c+' : '+htg(A.soldeAu(c,auj)));
    if(comptes.length===1) return 'Solde '+comptes[0]+' : '+htg(A.soldeAu(comptes[0],auj))+'.';
    if(comptes.length) return lignes.join('\n');
    return soldes();
  }
  if(/total|en tout|situation|bilan|patrimoine|\bnet\b|resume|etat general/.test(t)) return soldes();
  return null;
}
function soldes(){
  const auj=A.aujourdhui(), l=A.listeComptes();
  const tot=l.reduce((s,c)=>s+A.soldeAu(c,auj),0);
  const o=A.dossiersOuverts();
  const p=o.filter(d=>/^PRE/i.test(d.dossier)).reduce((s,d)=>s+d.reste,0);
  const e=o.filter(d=>/^EMP/i.test(d.dossier)).reduce((s,d)=>s+d.reste,0);
  return 'Soldes au '+A.frDate(auj)+' :\n'+l.map(c=>'• '+c+' : '+htg(A.soldeAu(c,auj))).join('\n')+
    '\n\nTotal des comptes : '+htg(tot)+'\nOn te doit : '+htg(p)+'\nTu dois : '+htg(e)+'\nSituation nette : '+htg(tot+p-e);
}
function aide(){
  return 'Je comprends des phrases courtes, par exemple :\n'+
    '• dépense 500 cash carburant\n• hier payé 1 200 moncash pharmacie\n• reçu 15 000 sogebank salaire\n'+
    '• transfert 5 000 sogebank vers cash frais 1%\n• retrait 2 000 sogebank\n'+
    '• prêt 1 500 à Chibas cash en 6 mois\n• prêt 1 000 à Jean cash 250 par mois\n• Chibas rembourse 250 moncash\n• emprunt 2 000 de Andy cash\n\n'+
    'Questions : solde cash · total · qui me doit ? · je dois combien ? · dépenses du mois · dépenses carburant · revenus du mois · prochaines échéances · dossier PRE-1234\n\n'+
    'Plusieurs opérations : sépare-les par « et » ou « ; ».\nS\'il manque une info, je te la demande. Rien n\'est enregistré sans ton ✅.';
}

/* ---------------------------- champs manquants --------------------------- */
const REQUIS={
  initial:['montant','compte'], depense:['montant','compte','categorie'], revenu:['montant','compte','categorie'],
  transfert:['montant','source','destination'], pret:['montant','personne','source'],
  emprunt:['montant','personne','destination'], rembours:['montant','dossier','compte']
};
function manque(b){
  if(!b.type) return 'type';
  if(b.type==='rembours'&&!b.dossier){
    const l=A.dossiersOuverts().filter(d=>!b.personne||norm(d.personne)===norm(b.personne));
    if(l.length===1){ b.dossier=l[0].dossier; b.personne=l[0].personne; }
  }
  for(const c of REQUIS[b.type]) if(!b[c]) return c;
  if(b.type==='transfert'&&b.source===b.destination) { b.destination=null; return 'destination'; }
  return null;
}
const QUESTIONS={
  type:'C\'est quoi comme opération ?', montant:'Quel montant ?', compte:'Quel compte ?', source:'Depuis quel compte ?',
  destination:'Vers quel compte ?', categorie:'Quelle catégorie ?', personne:'Avec quelle personne ?', dossier:'Pour quel dossier ?'
};
function choix(b,champ){
  if(champ==='type') return Object.keys(TYPES_TXT).filter(k=>k!=='initial').map(k=>({v:k,l:TYPES_TXT[k]}));
  if(champ==='compte'||champ==='source'||champ==='destination') return A.listeComptes().map(c=>({v:c,l:c}));
  if(champ==='personne') return (A.S.params.personnes||[]).map(p=>({v:p,l:p}));
  if(champ==='dossier') return A.dossiersOuverts().filter(d=>!b.personne||norm(d.personne)===norm(b.personne))
    .filter(d=>b.type!=='rembours'||true).map(d=>({v:d.dossier,l:d.dossier+' · '+d.personne+' · '+htg(d.reste)}));
  if(champ==='categorie'){
    const u=A.usages().categories||{}, mes=A.S.params.categories||[];
    const pref=b.type==='revenu'?A.REVENUS:[];
    const top=mes.filter(c=>A.EXCLUS.indexOf(c)===-1).sort((x,y)=>(u[y]||0)-(u[x]||0)).slice(0,10);
    return pref.concat(top.filter(c=>pref.indexOf(c)===-1)).filter(c=>mes.indexOf(c)!==-1).slice(0,12).map(c=>({v:c,l:c}));
  }
  return [];
}
function lireReponse(b,champ,texte){
  const t=norm(texte);
  if(champ==='montant'){ const n=lireNombre(t); return n>0?n:null; }
  if(champ==='compte'||champ==='source'||champ==='destination'){ const f=extraireComptes(t); return f.length?f[0].cle:null; }
  if(champ==='type'){
    const m={depense:/depense|achat|paye/,revenu:/revenu|recu|entree|gagne/,transfert:/transf|virement/,pret:/^pret|prete/,emprunt:/emprunt/,rembours:/rembours/};
    for(const k in m) if(m[k].test(t)) return k; return null;
  }
  if(champ==='categorie'){
    const c=extraireCategorie(t,b.type); if(c) return c;
    const mes=A.S.params.categories||[]; const ex=mes.find(x=>norm(x)===t); if(ex) return ex;
    if(t.length>=3&&t.length<=40&&!/\d/.test(t)){ b.categorieNouvelle=true; return cap(texte.trim()); }
    return null;
  }
  if(champ==='personne'){
    const p=extrairePersonne(t,texte); if(p){ b.personneNouvelle=!p.connu; return p.nom; }
    if(texte.trim().length>=2&&texte.trim().length<=40&&!/\d/.test(texte)){ b.personneNouvelle=true; return cap(texte.trim()); }
    return null;
  }
  if(champ==='dossier'){
    const d=extraireDossier(t); if(d) return d;
    const l=choix(b,'dossier'); const n=Number(t); if(n>=1&&n<=l.length) return l[n-1].v;
    const f=l.find(x=>norm(x.l).indexOf(t)!==-1); return f?f.v:null;
  }
  return null;
}

/* ------------------------- transformation en opérations ------------------ */
function versOps(b){
  const tx=b.devise==='HTD'?A.S.params.taux:1;
  const base={type:b.type,date:b.date,montant:b.montant,devise:b.devise,commentaire:'',frais:b.frais||0,fraisUnite:b.fraisUnite,
              tca:b.tca||0,tcaUnite:b.tcaUnite,description:'',categorie:'',via:'assistant'};
  base.gourdes=A.r2(b.montant*tx);
  const e=Object.assign({},base);
  if(b.type==='initial'){ e.compte=b.compte; e.signe=b.signe||'+'; e.resume='Solde de départ '+b.compte; }
  if(b.type==='depense'||b.type==='revenu'){ e.compte=b.compte; e.categorie=b.categorie; e.description=b.categorie; e.consigne=false; e.resume=(b.type==='depense'?'Dépense ':'Revenu ')+b.categorie; }
  if(b.type==='transfert'){ e.source=b.source; e.destination=b.destination; e.resume='Transfert '+b.source+' → '+b.destination; }
  if(b.type==='pret'||b.type==='emprunt'){
    e.personne=b.personne; e.tauxPret=0; e.description=b.type==='pret'?'Prêt accordé':'Emprunt reçu';
    if(b.type==='pret'){ e.source=b.source; e.fraisCharge=false; } else e.destination=b.destination;
    const debut=A.plusMois(b.date,1);
    const plan= b.parMois ? {mode:'uniforme',par:'montant',valeur:String(b.parMois),debut}
              : b.nbMois ? {mode:'uniforme',par:'nb',valeur:String(b.nbMois),debut}
              : {mode:'unique',date:debut};
    const tr=A.calcTranches(plan,e.gourdes);
    e.plan=plan; e.echeance=tr.length?tr[tr.length-1].date:''; e.planTxt=A.resumePlan(tr);
    e.resume=(b.type==='pret'?'Prêt à ':'Emprunt de ')+b.personne;
  }
  if(b.type==='rembours'){
    const i=A.IX.I.find(x=>x.dossier===b.dossier); const d=i?A.etatDossier(i,'9999-12-31'):null;
    e.dossier=b.dossier; e.compte=b.compte; e.personne=d?d.personne:b.personne; e.description='Remboursement';
    e.resume='Remboursement '+b.dossier;
    if(d&&e.gourdes>d.reste+0.004){
      const surplus=A.r2(e.gourdes-d.reste), emp=/^EMP/i.test(b.dossier);
      e.montant=d.reste; e.devise='HTG'; e.gourdes=d.reste; e.resume+=' (solde)';
      return [e,{type:emp?'depense':'revenu',date:b.date,montant:surplus,devise:'HTG',gourdes:surplus,compte:b.compte,
        categorie:emp?'Divers':'Autres revenus',description:'Excédent — '+b.dossier,commentaire:'excédent sur '+b.dossier,
        frais:0,fraisUnite:'%',tca:0,tcaUnite:'%',resume:'Excédent '+b.dossier,via:'assistant'}];
    }
  }
  return [e];
}
function carte(b){
  const L=[];
  L.push('<b>'+TYPES_TXT[b.type]+'</b> · '+A.frDate(b.date));
  L.push('Montant : <b>'+A.esc(b.devise==='HTD'?b.montant+' $HT (= '+htg(b.montant*A.S.params.taux)+')':htg(b.montant))+'</b>');
  if(b.compte) L.push('Compte : '+A.esc(b.compte));
  if(b.source&&b.destination) L.push('De '+A.esc(b.source)+' → '+A.esc(b.destination));
  else if(b.source) L.push('Depuis : '+A.esc(b.source));
  else if(b.destination) L.push('Vers : '+A.esc(b.destination));
  if(b.categorie) L.push('Catégorie : '+A.esc(b.categorie)+(b.categorieNouvelle?' <i>(nouvelle)</i>':''));
  if(b.personne) L.push('Personne : '+A.esc(b.personne)+(b.personneNouvelle?' <i>(nouvelle)</i>':''));
  if(b.dossier) L.push('Dossier : '+A.esc(b.dossier));
  if(b.frais) L.push('Frais : '+b.frais+(b.fraisUnite==='%'?' %':' HTG'));
  if(b.tca) L.push('Taxe : '+b.tca+(b.tcaUnite==='%'?' %':' HTG'));
  if(b.type==='pret'||b.type==='emprunt'){ const o=versOps(b)[0]; L.push('Remboursement : '+A.esc(o.planTxt)); }
  return '<div class="carte">'+L.join('<br>')+'</div>';
}

/* ------------------------------ conversation ----------------------------- */
const B={attente:null, file:[]};   /* file = brouillons en cours de complétion */

function ajouter(contenu,cls,html){
  const m=document.createElement('div'); m.className='bm '+cls;
  if(html) m.innerHTML=contenu; else m.textContent=contenu;
  $('botMsgs').appendChild(m); $('botMsgs').scrollTop=$('botMsgs').scrollHeight;
  return m;
}
function puces(liste,auClic){
  const z=$('botChips'); z.innerHTML='';
  liste.forEach(x=>{ const b=document.createElement('button'); b.type='button'; b.textContent=x.l; b.onclick=()=>auClic(x); z.appendChild(b); });
}
function pucesDepart(){
  puces(['Aide','Solde','Total','Qui me doit ?','Je dois combien ?','Dépenses du mois','Prochaines échéances'].map(l=>({l,v:l})),
        x=>envoyer(x.v));
}

function suite(){
  for(let i=0;i<B.file.length;i++){
    const b=B.file[i], champ=manque(b);
    if(champ){
      if(b.type==='rembours'&&champ==='dossier'&&!choix(b,'dossier').length){
        ajouter((b.personne?'Je ne trouve aucun dossier ouvert pour '+b.personne+'.':'Il n\'y a aucun prêt ni emprunt en cours.')+' Je retire cette ligne.','bot err');
        B.file.splice(i,1); return suite();
      }
      B.attente={i,champ};
      const intro=B.file.length>1?'('+(i+1)+'/'+B.file.length+' · '+(b.type?TYPES_TXT[b.type]:'opération')+(b.montant?' '+htg(b.montant):'')+') ':'';
      ajouter(intro+QUESTIONS[champ],'bot');
      puces(choix(b,champ).concat([{v:'__annuler',l:'✕ Annuler'}]),x=>{
        if(x.v==='__annuler') return annuler();
        ajouter(x.l,'moi'); appliquer(x.v);
      });
      return;
    }
  }
  B.attente=null;
  if(!B.file.length){ pucesDepart(); return; }
  confirmer();
}
function appliquer(val){
  const a=B.attente; if(!a) return;
  const b=B.file[a.i];
  if(a.champ==='personne'&&!b.personneNouvelle){ b.personneNouvelle=(A.S.params.personnes||[]).indexOf(val)===-1; }
  b[a.champ]=val;
  if(a.champ==='dossier'){ const d=A.dossiersOuverts().find(x=>x.dossier===val); if(d) b.personne=d.personne; }
  suite();
}
function annuler(){ B.file=[]; B.attente=null; ajouter('D\'accord, j\'annule.','bot'); pucesDepart(); }

function confirmer(){
  const brs=B.file.slice();
  const m=ajouter('Je vais enregistrer'+(brs.length>1?' ces '+brs.length+' opérations':' ceci')+' :'+brs.map(carte).join('')+
    '<div class="acts2"><button class="btn primary" data-a="ok">✅ Enregistrer</button><button class="btn" data-a="edit">✏️ Modifier dans la saisie</button><button class="btn ghost" data-a="non">✕ Annuler</button></div>','bot',true);
  $('botChips').innerHTML='';
  m.querySelector('[data-a="ok"]').onclick=()=>{ desactiver(m); enregistrer(brs); };
  m.querySelector('[data-a="edit"]').onclick=()=>{ desactiver(m); preparerNouveaux(brs); A.ouvrirDansSaisie(brs.reduce((l,b)=>l.concat(versOps(b)),[])); B.file=[]; ajouter('C\'est dans la file d\'attente de la saisie : vérifie puis enregistre.','bot'); pucesDepart(); };
  m.querySelector('[data-a="non"]').onclick=()=>{ desactiver(m); annuler(); };
}
function desactiver(m){ m.querySelectorAll('button').forEach(b=>b.disabled=true); }
function preparerNouveaux(brs){
  brs.forEach(b=>{
    if(b.personne&&(A.S.params.personnes||[]).indexOf(b.personne)===-1) A.ajouterValeur('personnes',b.personne);
    if(b.categorie&&(A.S.params.categories||[]).indexOf(b.categorie)===-1) A.ajouterValeur('categories',b.categorie);
  });
}
function enregistrer(brs){
  preparerNouveaux(brs);
  const ops=brs.reduce((l,b)=>l.concat(versOps(b)),[]);
  const r=A.enregistrerOps(ops);
  A.sauver().then(()=>{
    const touches=new Set(); ops.forEach(o=>[o.compte,o.source,o.destination].forEach(c=>c&&touches.add(c)));
    const auj=A.aujourdhui();
    let txt='✅ '+r.ok+' opération'+(r.ok>1?'s':'')+' enregistrée'+(r.ok>1?'s':'')+'.';
    if(touches.size) txt+='\n'+Array.from(touches).map(c=>'Solde '+c+' : '+htg(A.soldeAu(c,auj))).join('\n');
    const nouv=ops.filter(o=>o.type==='pret'||o.type==='emprunt');
    if(nouv.length) txt+='\nLe plan de remboursement se modifie avec ✎ dans l\'onglet Investissement.';
    if(r.err.length) txt+='\n⚠️ '+r.err.join(' ; ');
    ajouter(txt,'bot');
    A.toast(r.ok+' opération(s) enregistrée(s).');
  });
  B.file=[]; pucesDepart();
}

function envoyer(texte){
  texte=String(texte||'').trim(); if(!texte) return;
  ajouter(texte,'moi');
  $('botIn').value='';
  /* Réponse à une question en cours */
  if(B.attente){
    if(/^(annuler|annule|stop|laisse|non merci)$/i.test(norm(texte))) return annuler();
    const b=B.file[B.attente.i], val=lireReponse(b,B.attente.champ,texte);
    if(val!=null) return appliquer(val);
    /* pas une réponse : peut-être une nouvelle demande */
    const essai=analyser(texte,true);
    if(!essai){ ajouter('Je n\'ai pas compris ta réponse. '+QUESTIONS[B.attente.champ]+' (ou « annuler »)','bot err'); return; }
    B.file=[]; B.attente=null;
    return traiter(essai,texte);
  }
  traiter(analyser(texte,false),texte);
}
function analyser(texte,silencieux){
  const t=norm(texte);
  const aMontant=/\d/.test(t.replace(/\b(pre|emp)[ \-]?\d+/g,'').replace(/\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/g,''));
  if(estQuestion(t,aMontant)){ const r=repondre(texte); if(r) return {q:r}; }
  if(aMontant){
    const brs=decouper(texte).map(brouillon).filter(b=>b.montant||b.type);
    if(brs.length&&brs.some(b=>b.type||b.categorie||b.compte||b.source)) return {ops:brs};
  }
  const r=repondre(texte); if(r) return {q:r};
  return null;
}
function traiter(res,texte){
  if(!res){
    A.noterNonCompris(texte);
    ajouter('Je n\'ai pas compris 🤔 Je l\'ai noté pour une prochaine mise à jour.\nTape « aide » pour voir ce que je sais faire.','bot err');
    pucesDepart(); return;
  }
  if(res.q){ ajouter(res.q,'bot'); pucesDepart(); return; }
  B.file=res.ops; suite();
}

/* --------------------------------- init ---------------------------------- */
let pret=false;
window.FWBot={
  init(){
    if(!pret){
      pret=true;
      $('botForm').addEventListener('submit',e=>{ e.preventDefault(); envoyer($('botIn').value); });
    }
    if(!$('botMsgs').children.length){
      ajouter('Bonjour 👋 Je suis ton assistant. Pose-moi une question (« solde cash », « qui me doit ? ») ou dicte une opération (« dépense 500 cash carburant »).','bot');
      pucesDepart();
    }
    this.focus();
  },
  focus(){ setTimeout(()=>{ const i=$('botIn'); if(i&&window.innerWidth>760) i.focus(); },50); },
  reset(){ B.file=[]; B.attente=null; const m=$('botMsgs'); if(m) m.innerHTML=''; const c=$('botChips'); if(c) c.innerHTML=''; },
  /* pour les tests */
  _analyser:analyser, _brouillon:brouillon, version:VERSION_DICO
};
})();
