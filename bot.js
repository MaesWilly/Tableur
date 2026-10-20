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
const VERSION_DICO = 4;
const JOURS_N={dimanche:0,lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6};

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
  'Moncash':['moncash','mon cash','mon-cash','mcash','monncash','moncach','moncas'],
  'Natcash':['natcash','nat cash','nat-cash','lajan cash'],
  'Sogebank':['sogebank','soge','sogebanque','sogexpress'],
  'Unibank':['unibank','uni bank','unibanque'],
  'Consignation':['consignation','consigne']
};
const DEP = {
  'Courses alimentaires':['nourriture','raisin','raisins','pomme','pommes','fruit','mangue','mangues','manger','courses','marche','epicerie','provision','provisions','riz','pain','viande','poulet','poisson','huile','legume','legumes','haricot','haricots','pois','farine','spaghetti','sucre','lait','oeuf','oeufs','fromage','banane','bananes','cassave','fruits','hareng','salami','epices','mais moulu'],
  'Repas à l\'extérieur':['restaurant','resto','diner','dejeuner','souper','repas','sandwich','sandwichs','pate','pates','hot dog','hamburger','pizza','plat','fritay','lunch','griot'],
  'Boissons':['boisson','boissons','jus','soda','biere','bierre','bieres','cola','prestige','vin','rhum','kola'],
  'Eau':['eau','gallon','gallons','camion d eau','culligan'],
  'Électricité':['electricite','fils panneau','fil panneau','panneau','cable electrique','edh','courant','generatrice','inverter','inverteur','batterie','panneau solaire','delco'],
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
  'Entretien véhicule':['mecanicien','carburateur','spray carburateur','carburteur','spray carburteur','depannage','chambre a air','chambre air','reparation moto','bougie','garage','pneu','pneus','vidange','huile moteur','piece moto','pieces moto','chaine moto','entretien moto','entretien voiture','lavage moto','lavage voiture'],
  'Recharge téléphone':['recharge','carte telephone','minutes','digicel','natcom','top up','topup'],
  'Internet':['internet','wifi','data','forfait','starlink'],
  'Médecin / Hôpital':['medecin','docteur','hopital','clinique','consultation','analyse','analyses','laboratoire','dentiste'],
  'Pharmacie':['pharmacie','medicament','medicaments','pilule','sirop','vitamine','vitamines'],
  'Vêtements / Chaussures':['vetement','vetements','chaussure','chaussures','habit','habits','robe','pantalon','chemise','tennis','jeans','sandale','sandales'],
  'Hygiène / Soins':['savon','dentifrice','shampoing','shampooing','hygiene','papier toilette','detergent','poudre','lessive','deodorant','creme'],
  'Coiffure / Beauté':['coiffure','coiffeur','barbier','salon','ongles','maquillage','tresse','tresses','perruque','meche'],
  'Cadeaux / Dons':['cadeau','cadeaux','don','dons','aumone'],
  'Fêtes / Évènements':['fete','anniversaire','mariage','bapteme','communion','funerailles','enterrement','evenement'],
  'Église / Offrandes':['eglise','offrande','offrandes','dime','quete','temple'],
  'Loisirs / Sorties':['loisir','loisirs','sortie','soiree','cinema','plage','voyage','vacances','match','bar','club','concert'],
  'Chantier / Matériel':['ciment','silicone','tape','scotch','cheville','chevilles','vis','colle','bloc','blocs','fer','sable','gravier','tole','toles','clou','clous','bois','planche','planches','chantier','materiaux','materiel','tuyau','peinture'],
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
const TYPES_TXT = {depense:'Dépense',revenu:'Revenu',transfert:'Transfert',pret:'Prêt accordé',emprunt:'Emprunt reçu',rembours:'Remboursement',consign:'Consignation',consreg:'Règlement de consignation',initial:'Solde de départ'};

/* ------------------------------ extraction ------------------------------- */
function lireDateTexte(m){
  const auj=A.aujourdhui();
  let y=m[2]?Number(m[2]):Number(auj.slice(0,4)); if(y<100) y+=2000;
  const mo=Number(m[1]), j=Number(m[0]); if(mo<1||mo>12||j<1||j>31) return null;
  return y+'-'+String(mo).padStart(2,'0')+'-'+String(j).padStart(2,'0');
}
function extraireLimite(t){
  let limite=null;
  t=t.replace(/(?:avant le|pour le|d ici le|limite(?: le)?|a regler (?:le|avant(?: le)?))\s+(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/,(m0,a1,a2,a3)=>{ limite=lireDateTexte([a1,a2,a3]); return ' '; });
  if(!limite) t=t.replace(/dans (\d{1,2}|une|un|deux|trois) (jours?|semaines?)/,(m0,n,u)=>{
    const k={une:1,un:1,deux:2,trois:3}[n]||Number(n); limite=A.plusJours(A.aujourdhui(),/sem/.test(u)?7*k:k); return ' '; });
  return {limite,t};
}
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
function extraireMontants(t,opt){
  const r={};
  /* frais / taxe : « frais 1% », « frais 50 » */
  t=t.replace(/\bfrais (de )?(\d+(?:[.,]\d+)?) ?(%|pour ?cent|gd|gdes|gourdes|htg)?/,(m0,_,n,u)=>{ r.frais=Number(n.replace(',','.')); r.fraisUnite=(u&&/%|cent/.test(u))?'%':'HTG'; return ' '; });
  t=t.replace(/\b(tca|taxe) (de )?(\d+(?:[.,]\d+)?) ?(%|pour ?cent|gd|gdes|gourdes|htg)?/,(m0,_a,_b,n,u)=>{ r.tca=Number(n.replace(',','.')); r.tcaUnite=(u&&/%|cent/.test(u))?'%':'HTG'; return ' '; });
  /* plan : « 250 par mois », « 120 chaque 2 semaines le mardi », « en 6 mois », « en 10 tranches » */
  const FREQ='(2 semaines?|deux semaines?|15 jours|quinze jours|14 jours|quinzaine|semaines?|7 jours|8 jours|huit jours|mois)';
  const fr=x=>/2|deux|15|quinz|14/.test(x)?'2sem':/sem|7|8|huit/.test(x)?'sem':'mois';
  t=t.replace(new RegExp('(?:,|\\bet\\b)?\\s*(?:(?:il|elle|on|je|j)\\s+)?(?:(?:me|te|lui|va|vais|doit|dois|devra)\\s+)*(?:rembours\\w*|pay\\w*|vers\\w*|donn\\w*|rend\\w*)?\\s*(\\d[\\d .,]*?)\\s*(?:gd|gdes|gourdes|htg)?\\s*(?:par|chaque|toutes les|tous les|a chaque|\\/)\\s*'+FREQ),
    (m0,n,f)=>{ r.parTranche=lireNombre(n); r.freq=fr(f); return ' '; });
  t=t.replace(/\b(hebdomadaire|mensuel|mensuelle|bimensuel|chaque semaine|toutes les (?:2|deux) semaines|tous les (?:15|quinze) jours|chaque mois)\b/,(m0)=>{ r.freq=/2|deux|15|quinz|bimens/.test(m0)?'2sem':/sem|hebdo/.test(m0)?'sem':'mois'; return ' '; });
  t=t.replace(/\b(?:le|en|chaque|tous les|les)?\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?\b/,(m0,j)=>{ r.jour=JOURS_N[j]; return ' '; });
  t=t.replace(/\ben (\d{1,3}) mois\b/,(m0,n)=>{ r.nbTranches=Number(n); r.freq=r.freq||'mois'; return ' '; });
  t=t.replace(/\ben (\d{1,3}) semaines\b/,(m0,n)=>{ r.nbTranches=Number(n); r.freq=r.freq||'sem'; return ' '; });
  t=t.replace(/\b(?:en )?(\d{1,3}) (tranches|fois|versements)\b/,(m0,n)=>{ r.nbTranches=Number(n); return ' '; });
  /* consignation : « achat 4 500 », « rendu 500 » (seulement pour un règlement) */
  if(opt&&opt.cons) t=t.replace(/\b(?:achat|achete|depense)\s+(?:de\s+)?(\d[\d .,]*)/,(m0,n)=>{ r.achat=lireNombre(n); return ' '; });
  if(opt&&opt.cons) t=t.replace(/\b(?:rendu|rend|monnaie|reste rendu)\s+(?:la monnaie\s+)?(?:de\s+)?(\d[\d .,]*)/,(m0,n)=>{ r.rendu=lireNombre(n); return ' '; });
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
  if(/\bcon-?\s?\d|\b(regle|regler|reglement|solde la consign)/.test(t)&&/consign|\bcon-?\s?\d|achat|rendu|monnaie/.test(t)) return 'consreg';
  if(/j ai confie|je confie|\bconfie a\b|donne .* pour (m acheter|acheter|achat)|pour m acheter/.test(t)) return 'consign:confie';
  if(/m a confie|me confie|m a consigne|consign|garde pour|a garder pour|pour le compte de/.test(t)) return 'consign:recu';
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
  /* le texte entre « » n'est jamais découpé */
  const prot=[]; texte=String(texte).replace(/«[^»]*»|"[^"]*"/g,m=>{ prot.push(m); return '\u0001'+(prot.length-1)+'\u0002'; });
  const remettre=s=>s.replace(/\u0001(\d+)\u0002/g,(m,i)=>prot[Number(i)]);
  return decouper2(texte).map(remettre);
}
function decouper2(texte){
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
  /* « libellé » puis « commentaire » facultatifs : retirés avant l'analyse. */
  const guil=[]; seg=String(seg).replace(/«\s*([^»]+?)\s*»|"([^"]+)"/g,(m0,a,c)=>{ guil.push((a||c).trim()); return ' '; });
  const orig=seg;
  let t=norm(seg);
  const dossier=extraireDossier(t); if(dossier) t=t.replace(/\b(pre|emp)[ \-]?\d{3,7}\b/,' ');
  const conM=t.match(/\bcon[ \-]?(\d{3,7})\b/); if(conM) t=t.replace(conM[0],' ');
  const Lm=extraireLimite(t); t=Lm.t;
  const D=extraireDate(t); t=D.t;
  const t00=norm(seg), estReg=(/\bcon[ \-]?\d/.test(t00)||/\b(regle|regler|reglement)\b/.test(t00))&&/achat|rendu|monnaie|consign|\bcon[ \-]?\d/.test(t00);
  const M=extraireMontants(t,{cons:estReg}); t=M.t;
  const comptes=extraireComptes(t);
  const t0=norm(seg);
  let type=estReg ? 'consreg' : detecterType(t,comptes.length);
  let sens=null; if(type&&type.indexOf('consign:')===0){ sens=type.split(':')[1]; type='consign'; }
  const pers=extrairePersonne(t,orig);
  const P=A.S.params;
  const b={type,date:D.date||A.aujourdhui(),montant:M.r.montant,devise:M.r.devise||'HTG',
           frais:M.r.frais||0,fraisUnite:M.r.fraisUnite||P.defFraisUnite||'%',
           tca:M.r.tca!=null?M.r.tca:(P.defTca!=null?P.defTca:0.1),tcaUnite:M.r.tcaUnite||(M.r.tca!=null?'%':(P.defTcaUnite||'F%')),
           libelle:guil[0]||'', note:guil[1]||'',
           parTranche:M.r.parTranche,nbTranches:M.r.nbTranches,freq:M.r.freq,jour:M.r.jour,achat:M.r.achat,rendu:M.r.rendu,texte:orig};
  if(type==='consign'){
    b.sens=sens; b.limite=Lm.limite; b.compte=comptes[0]&&comptes[0].cle; if(pers){ b.personne=pers.nom; b.personneNouvelle=!pers.connu; }
    const mot=orig.match(/pour\s+(?:acheter\s+|l'achat d[eu']\s*|achat\s+)?([^,;]+?)(?:\s+(?:cash|moncash|natcash|sogebank|unibank|avant|pour le|d'ici|dans)\b|$)/i);
    if(mot&&!/^\d/.test(mot[1])&&!/^(le|la)\s+compte/i.test(mot[1])) b.description=mot[1].trim().slice(0,60);
    return b;
  }
  if(type==='consreg'){
    if(conM) b.dossierCon='CON-'+conM[1];
    if(!b.dossierCon&&pers){ const l=A.consOuvertes().filter(c=>norm(c.personne)===norm(pers.nom)); if(l.length===1) b.dossierCon=l[0].dossier; }
    if(!b.achat&&!b.rendu&&b.montant){ if(/rendu|monnaie/.test(t)) b.rendu=b.montant; else b.achat=b.montant; }
    b.compte=comptes[0]&&comptes[0].cle;
    const c=b.dossierCon&&A.consOuvertes().find(x=>x.dossier===b.dossierCon);
    if(c&&c.sens==='confie'&&b.achat){ const cat=extraireCategorie(t,'depense'); if(cat) b.categorie=cat; }
    return b;
  }
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
  return /^(combien|quel|quelle|quels|quelles|qui|ou en|solde|soldes|total|situation|bilan|montre|affiche|liste|etat|mes |prochain|prochaine|prochaines|echeance|echeancier|depense|depenses|revenu|revenus|aide|help|bonjour|bonsoir|salut|merci|ok|reste|dossier|pret|prets|emprunt|emprunts|dette|dettes|j ai combien|je dois|on me doit|consignation|consignations|tranches|evenements|evenement|agenda|categories|personnes)/.test(t);
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

  const con=t.match(/\bcon[ \-]?(\d{3,7})\b/);
  if(con||/consign/.test(t)){
    const l=con?A.IX.C.filter(c=>c.dossier==='CON-'+con[1]).map(c=>A.etatConsign(c,'9999-12-31')):A.consOuvertes();
    if(!l.length) return con?'Je ne trouve pas CON-'+con[1]+'.':'Aucune consignation à régler 👍';
    return (con?'':'Consignations à régler :\n')+l.map(c=>'• '+c.dossier+' — '+c.personne+' ('+(c.sens==='confie'?'je confie':'on me confie')+') : '+htg(-c.reste)+
      ' · avant le '+A.frDate(c.limite)+(c.statut==='En retard'?' ⚠️ en retard':'')+(c.statut==='Réglée'?' ✓ réglée':'')).join('\n');
  }
  if(/a confirmer|tranches? (echue|du jour|arrivee)/.test(t)){
    const l=A.tranchesAConfirmer();
    if(!l.length) return 'Aucune tranche à confirmer 👍';
    setTimeout(()=>carteTranches(l),0);
    return l.length+' tranche'+(l.length>1?'s':'')+' à confirmer :';
  }
  if(dossier&&/echeancier|tranches|plan|calendrier/.test(t)){
    const i=A.IX.I.find(x=>x.dossier===dossier); if(!i) return 'Je ne trouve pas le dossier '+dossier+'.';
    const d=A.etatDossier(i,'9999-12-31');
    return 'Échéancier '+dossier+' ('+d.personne+') :\n'+d.tranches.map(x=>'• '+x.n+'. '+A.JOURS[A.jourDe(x.date)]+' '+A.frDate(x.date)+' : '+htg(x.montant)+' — '+x.statut+(x.paye&&x.du?' (payé '+htg(x.paye)+')':'')).join('\n');
  }
  if(/evenement|agenda|rappels?\b/.test(t)){
    const P=periode(t); const ev=A.evtsLibres().filter(e=>e.date>=P.d0&&e.date<=P.d1).concat(A.echeancesAuto(P.d0,P.d1)).sort((a,b)=>a.date<b.date?-1:1);
    if(!ev.length) return 'Aucun évènement '+P.lib+'.';
    return 'Évènements '+P.lib+' :\n'+ev.map(e=>'• '+A.frDate(e.date)+' — '+e.nom+(e.personne?' ('+e.personne+')':'')+(e.montant?' : '+htg(e.montant):'')).join('\n');
  }
  if(/^(categories|mes categories|liste des categories)/.test(t)) return 'Tes catégories :\n'+(A.S.params.categories||[]).join(', ');
  if(/^(personnes|mes contacts|liste des personnes)/.test(t)) return 'Personnes : '+((A.S.params.personnes||[]).join(', ')||'aucune');
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
  if(/echeance|prochain|a venir|a payer|a recevoir bientot/.test(t)){
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
  const auj=A.aujourdhui(), l=A.listeComptes().filter(c=>c!==A.CONSIGN);
  const tot=l.reduce((s,c)=>s+A.soldeAu(c,auj),0);
  const co=A.consOuvertes(), cR=co.filter(c=>c.sens!=='confie').reduce((s,c)=>s+c.reste,0), cC=co.filter(c=>c.sens==='confie').reduce((s,c)=>s+c.reste,0);
  const o=A.dossiersOuverts();
  const p=o.filter(d=>/^PRE/i.test(d.dossier)).reduce((s,d)=>s+d.reste,0);
  const e=o.filter(d=>/^EMP/i.test(d.dossier)).reduce((s,d)=>s+d.reste,0);
  return 'Soldes au '+A.frDate(auj)+' :\n'+l.map(c=>'• '+c+' : '+htg(A.soldeAu(c,auj))).join('\n')+
    '\n\nTotal des comptes : '+htg(tot)+'\nOn te doit : '+htg(p)+'\nTu dois : '+htg(e)+
    (co.length?'\nConsignations à régler : '+htg(-(cR+cC)):'')+'\nSituation nette : '+htg(tot+p-e-cR+cC);
}
function aide(){
  return 'Je comprends des phrases courtes, par exemple :\n'+
    '• dépense 500 cash carburant\n• hier payé 1 200 moncash pharmacie\n• reçu 15 000 sogebank salaire\n'+
    '• transfert 5 000 sogebank vers cash frais 1%\n• retrait 2 000 sogebank\n'+
    '• prêt 1 500 à Chibas cash en 6 mois\n• prêt 1 200 à Chibas cash, il me rembourse 120 chaque 2 semaines le mardi\n• Chibas rembourse 250 moncash\n• emprunt 2 000 de Andy cash 500 par mois\n'+
    '• Flore m\'a confié 5 000 cash pour acheter un carpet\n• j\'ai confié 3 000 cash à Jean pour acheter du ciment\n• régler CON-1234 achat 4 500 rendu 500\n'+
    '• dépense 1 500 cash carburant « Gazoline moto » « trajet Sud »  (libellé puis commentaire)\n'+
    '• « montre mes catégories », « mes comptes », « mes personnes », « dossiers en cours »\n'+
    '• pendant une question : « liste » (tout voir), « cherche maison », « je sais pas », « aide »\n'+
    '• une liste brute (tirets, $ et gdes mélangés, ou lignes copiées du tableur) : je la numérote, je demande le compte et les dates, puis tu valides\n'+
    '• rappel 25/10 anniversaire Flore 2 000\n• nouvelle personne Marc · nouvelle catégorie Moto\n• annule la dernière · modifie la dernière · taux dollar 7,5\n\n'+
    'Questions : solde cash · total · qui me doit ? · je dois combien ? · consignations · tranches à confirmer · dépenses du mois · dépenses carburant · revenus du mois · prochaines échéances · évènements du mois · échéancier PRE-1234\n\n'+
    'Plusieurs opérations : sépare-les par « et » ou « ; ».\nS\'il manque une info, je te la demande. Rien n\'est enregistré sans ton ✅.';
}

/* ---------------------------- champs manquants --------------------------- */
const REQUIS={
  initial:['montant','compte'], depense:['montant','compte','categorie'], revenu:['montant','compte','categorie'],
  transfert:['montant','source','destination'], pret:['montant','personne','source'],
  emprunt:['montant','personne','destination'], rembours:['montant','dossier','compte'],
  consign:['montant','personne','compte'], consreg:['dossierCon','compte','reglement']
};
function manque(b){
  if(!b.type) return 'type';
  if(b.type==='rembours'&&!b.dossier){
    const l=A.dossiersOuverts().filter(d=>!b.personne||norm(d.personne)===norm(b.personne));
    if(l.length===1){ b.dossier=l[0].dossier; b.personne=l[0].personne; }
  }
  if(b.type==='consreg'){
    if(!b.dossierCon){ const l=A.consOuvertes(); if(l.length===1) b.dossierCon=l[0].dossier; }
    const c=b.dossierCon&&A.consOuvertes().find(x=>x.dossier===b.dossierCon);
    if(c){ b.personne=c.personne; if(!b.compte) b.compte=c.compte; }
    b.reglement=(b.achat||0)+(b.rendu||0)>0?1:0;
    if(c&&c.sens==='confie'&&b.achat&&!b.categorie&&c.desc){ const k=extraireCategorie(norm(c.desc),'depense'); if(k) b.categorie=k; }
    if(c&&c.sens==='confie'&&b.achat&&!b.categorie&&b.compte&&b.reglement) return 'categorie';
  }
  for(const c of REQUIS[b.type]) if(!b[c]) return c;
  if(b.type==='transfert'&&b.source===b.destination) { b.destination=null; return 'destination'; }
  return null;
}
const QUESTIONS={
  type:'C\'est quoi comme opération ?', montant:'Quel montant ?', compte:'Quel compte ?', source:'Depuis quel compte ?',
  destination:'Vers quel compte ?', categorie:'Quelle catégorie ?', personne:'Avec quelle personne ?', dossier:'Pour quel dossier ?',
  dossierCon:'Quelle consignation régler ?', reglement:'Combien a été acheté et/ou rendu ? (ex. « achat 4500 rendu 500 »)'
};
function choix(b,champ){
  if(champ==='type') return Object.keys(TYPES_TXT).filter(k=>k!=='initial'&&k!=='consreg').map(k=>({v:k,l:TYPES_TXT[k]}));
  if(champ==='compte'||champ==='source'||champ==='destination') return A.listeComptes().map(c=>({v:c,l:c}));
  if(champ==='personne') return (A.S.params.personnes||[]).map(p=>({v:p,l:p}));
  if(champ==='dossierCon') return A.consOuvertes().map(c=>({v:c.dossier,l:c.dossier+' · '+c.personne+' · '+htg(-c.reste)}));
  if(champ==='reglement'){ const c=A.consOuvertes().find(x=>x.dossier===b.dossierCon); return c?[{v:'achat:'+c.reste,l:'Tout acheté ('+htg(c.reste)+')'},{v:'rendu:'+c.reste,l:'Tout rendu ('+htg(c.reste)+')'}]:[]; }
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
    const m={depense:/depense|achat|paye/,revenu:/revenu|recu|entree|gagne/,transfert:/transf|virement/,pret:/^pret|prete/,emprunt:/emprunt/,rembours:/rembours/,consign:/consign/};
    for(const k in m) if(m[k].test(t)) return k; return null;
  }
  if(champ==='categorie'){
    const c=extraireCategorie(t,b.type); if(c) return c;
    const mes=A.S.params.categories||[]; const ex=mes.find(x=>norm(x)===t); if(ex) return ex;
    if(t.length>=3&&t.length<=40&&!/\d/.test(t)&&!estMeta(texte)&&t.split(' ').length<=5){ b.categorieNouvelle=true; return cap(texte.trim()); }
    return null;
  }
  if(champ==='personne'){
    const p=extrairePersonne(t,texte); if(p){ b.personneNouvelle=!p.connu; return p.nom; }
    if(texte.trim().length>=2&&texte.trim().length<=40&&!/\d/.test(texte)&&!estMeta(texte)&&t.split(' ').length<=4){ b.personneNouvelle=true; return cap(texte.trim()); }
    return null;
  }
  if(champ==='dossierCon'){
    const m=t.match(/con[ \-]?(\d{3,7})/); if(m) return 'CON-'+m[1];
    const l=choix(b,'dossierCon'); const f=l.find(x=>norm(x.l).indexOf(t)!==-1); return f?f.v:null;
  }
  if(champ==='reglement'){
    if(/^(achat|rendu):/.test(texte)){ const p=texte.split(':'); b[p[0]]=Number(p[1]); return 1; }
    const M=extraireMontants(t,{cons:true}).r; if(M.achat) b.achat=M.achat; if(M.rendu) b.rendu=M.rendu;
    if(!M.achat&&!M.rendu&&M.montant){ if(/rendu|monnaie/.test(t)) b.rendu=M.montant; else b.achat=M.montant; }
    return (b.achat||0)+(b.rendu||0)>0?1:null;
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
  e.commentaire=[b.type==='depense'||b.type==='revenu'?'':b.libelle,b.note].filter(Boolean).join(' — ');
  if(b.type==='initial'){ e.compte=b.compte; e.signe=b.signe||'+'; e.resume='Solde de départ '+b.compte; }
  if(b.type==='depense'||b.type==='revenu'){ e.compte=b.compte; e.categorie=b.categorie; e.description=b.libelle||b.categorie; e.consigne=false; e.resume=(b.type==='depense'?'Dépense ':'Revenu ')+b.categorie; }
  if(b.type==='transfert'){ e.source=b.source; e.destination=b.destination; e.resume='Transfert '+b.source+' → '+b.destination; }
  if(b.type==='pret'||b.type==='emprunt'){
    e.personne=b.personne; e.tauxPret=0; e.description=b.type==='pret'?'Prêt accordé':'Emprunt reçu';
    if(b.type==='pret'){ e.source=b.source; e.fraisCharge=false; } else e.destination=b.destination;
    const freq=b.freq||'mois', jour=b.jour!=null?String(b.jour):'';
    const debut= freq==='mois' ? A.plusMois(b.date,1) : A.plusJours(b.date, jour!=='' ? (freq==='sem'?1:8) : (freq==='sem'?7:14));
    const plan= b.parTranche ? {mode:'uniforme',par:'montant',valeur:String(b.parTranche),debut,freq,jour}
              : b.nbTranches ? {mode:'uniforme',par:'nb',valeur:String(b.nbTranches),debut,freq,jour}
              : {mode:'unique',date:debut};
    const tr=A.calcTranches(plan,e.gourdes);
    e.plan=plan; e.echeance=tr.length?tr[tr.length-1].date:''; e.planTxt=A.resumePlan(tr);
    e.resume=(b.type==='pret'?'Prêt à ':'Emprunt de ')+b.personne;
  }
  if(b.type==='consign'){
    e.sens=b.sens||'recu'; e.personne=b.personne; e.compte=b.compte; e.limite=b.limite||A.plusJours(b.date,7);
    e.description=b.description||(e.sens==='confie'?'Argent confié':'Argent consigné'); e.frais=0; e.tca=0;
    e.resume=(e.sens==='confie'?'Confié à ':'Consigné par ')+b.personne;
  }
  if(b.type==='consreg'){
    const c=A.consOuvertes().find(x=>x.dossier===b.dossierCon);
    let ach=A.r2(b.achat||0), ren=A.r2(b.rendu||0);
    if(c&&ach+ren>c.reste+0.004){ const tr=A.r2(ach+ren-c.reste); if(ren>=tr) ren=A.r2(ren-tr); else { ach=A.r2(ach-(tr-ren)); ren=0; } }
    Object.assign(e,{montant:A.r2(ach+ren),gourdes:A.r2(ach+ren),devise:'HTG',achat:ach,rendu:ren,dossier:b.dossierCon,compte:b.compte,
      sens:c?c.sens:'recu',personne:c?c.personne:b.personne,categorie:c&&c.sens==='confie'&&ach?b.categorie:'',description:'',frais:0,tca:0,resume:'Règlement '+b.dossierCon});
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
  if(b.type!=='consreg') L.push('Montant : <b>'+A.esc(b.devise==='HTD'?b.montant+' $HT (= '+htg(b.montant*A.S.params.taux)+')':htg(b.montant))+'</b>');
  if(b.compte) L.push('Compte : '+A.esc(b.compte));
  if(b.source&&b.destination) L.push('De '+A.esc(b.source)+' → '+A.esc(b.destination));
  else if(b.source) L.push('Depuis : '+A.esc(b.source));
  else if(b.destination) L.push('Vers : '+A.esc(b.destination));
  if(b.categorie) L.push('Catégorie : '+A.esc(b.categorie)+(b.categorieNouvelle?' <i>(nouvelle)</i>':''));
  if(b.libelle) L.push('Libellé : '+A.esc(b.libelle));
  if(b.note) L.push('Commentaire : '+A.esc(b.note));
  if(b.personne) L.push('Personne : '+A.esc(b.personne)+(b.personneNouvelle?' <i>(nouvelle)</i>':''));
  if(b.dossier) L.push('Dossier : '+A.esc(b.dossier));
  if(b.frais){ const g=b.montant*(b.devise==='HTD'?A.S.params.taux:1);
    const ft=A.fraisEtTaxe(g,{frais:b.frais,fraisUnite:b.fraisUnite,tca:b.tca,tcaUnite:b.tcaUnite,devise:'HTG'},1);
    L.push('Frais : '+htg(ft.f)+(ft.t?' · taxe : '+htg(ft.t):'')); }
  if(b.type==='pret'||b.type==='emprunt'){ const o=versOps(b)[0]; L.push('Remboursement : '+A.esc(o.planTxt)); }
  if(b.type==='consign'){ const o=versOps(b)[0]; L.push((o.sens==='confie'?'Je confie mon argent':'On me confie de l\'argent')+' · motif : '+A.esc(o.description)); L.push('À régler avant le '+A.frDate(o.limite)+' (évènement + alerte)'); }
  if(b.type==='consreg'){ const o=versOps(b)[0]; L.push('Consignation : '+A.esc(o.dossier)+' ('+A.esc(o.personne)+')'); if(o.achat) L.push('Acheté : '+htg(o.achat)); if(o.rendu) L.push('Rendu : '+htg(o.rendu));
    const c=A.consOuvertes().find(x=>x.dossier===o.dossier); if(c){ const d=A.r2(c.reste-o.montant); L.push(d<=0.004?'✓ La consignation sera réglée (0)':'Il restera '+htg(-d)); } }
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
/* ======================= DEMANDES « MÉTA » PENDANT UNE QUESTION =======================
 *  « montre-moi toutes les catégories », « liste », « je sais pas », « cherche maison »…
 *  ne sont pas des réponses : on affiche les choix au lieu de les enregistrer.
 * ===================================================================================== */
const META_VERBE=/\b(montre|montrer|montres|sort|sors|sortir|affiche|afficher|voir|vois|voire|liste|lister|donne|donner|quelles?|quels?|quoi|tous|toutes|tout|autres?|choix|options?|propose|proposer|rappelle|dis moi)\b/;
const META_NOM=/\b(categories?|categorie|comptes?|personnes?|gens|contacts?|dossiers?|choix|options?|liste|possibilites?)\b/;
function metaChamp(texte){
  const t=norm(texte).replace(/[?!.]+$/,'').trim();
  if(!t||/^\?+$/.test(t)) return {k:'doute'};
  if(/^(je (ne )?(sais|connais) pas|j sais pas|sais pas|chais pas|aucune idee|pas d idee|je ne sais|je sais plus|n importe|peu importe|aucun|aucune|bof|mwen pa konnen|m pa konnen)\b/.test(t)) return {k:'doute'};
  if(/^(aide|help|comment|explique|je comprends pas|quoi)$/.test(t)) return {k:'aide'};
  if(/^(tous|toutes|tout|tout voir|liste|la liste|les choix|choix|autres?|les autres|autre chose|plus|encore|voir plus|voir tout|montre|affiche|options?)$/.test(t)) return {k:'tout'};
  if(META_VERBE.test(t)&&META_NOM.test(t)) return {k:'tout'};
  const m=t.match(/^(?:cherche|chercher|recherche|rechercher|trouve|trouver|filtre)\s+(?:la |le |les |une |un )?(?:categorie |compte |personne )?(.+)$/); if(m) return {k:'cherche',q:m[1]};
  return null;
}
function estMeta(texte){ const t=norm(texte); return META_NOM.test(t)&&META_VERBE.test(t)||/^(liste|tous|toutes|aide|je sais pas)$/.test(t); }
/* Toutes les valeurs possibles d'un champ (catégories par groupe). */
function toutesValeurs(b,champ){
  if(champ==='categorie'){
    const mes=(A.S.params.categories||[]).filter(c=>A.EXCLUS.indexOf(c)===-1), vus=new Set(), grp=[];
    const r=A.REVENUS.filter(c=>mes.indexOf(c)!==-1); r.forEach(c=>vus.add(c));
    if(b.type==='revenu'&&r.length) grp.push(['💰 Revenus',r]);
    (A.GROUPES||[]).forEach(([g,l])=>{ const x=l.filter(c=>mes.indexOf(c)!==-1&&!vus.has(c)); x.forEach(c=>vus.add(c)); if(x.length) grp.push([g,x]); });
    const autres=mes.filter(c=>!vus.has(c)); if(autres.length) grp.push(['➕ Mes catégories',autres]);
    return grp;
  }
  const l=choix(b,champ); return l.length?[['',l]]:[];
}
/* Affiche une liste cliquable dans la bulle. */
function afficherChoix(titre,groupes,auClic){
  if(!groupes.length){ ajouter(titre+'\nIl n\'y a rien dans cette liste pour le moment.','bot'); return; }
  const html=A.esc(titre)+groupes.map(([g,l])=>'<div class="grp">'+(g?'<div class="gt">'+A.esc(g)+'</div>':'')+
    l.map(x=>{ const o=typeof x==='string'?{v:x,l:x}:x; return '<button type="button" data-v="'+A.esc(o.v)+'">'+A.esc(o.l)+'</button>'; }).join('')+'</div>').join('');
  const m=ajouter(html,'bot',true);
  m.querySelectorAll('button[data-v]').forEach(bt=>bt.onclick=()=>{ desactiver(m); ajouter(bt.textContent,'moi'); auClic(bt.getAttribute('data-v')); });
}
const NOM_CHAMP={categorie:'catégories',compte:'comptes',source:'comptes',destination:'comptes',personne:'personnes',dossier:'dossiers en cours',dossierCon:'consignations en cours',type:'types d\'opération'};
/* Répond à une demande méta pendant une question. Renvoie true si traité. */
function repondreMeta(texte,b,champ,auClic){
  const mt=metaChamp(texte); if(!mt) return false;
  const nom=NOM_CHAMP[champ]||'choix';
  if(mt.k==='aide'){
    ajouter('Réponds avec un nom de la liste ou clique un bouton.\n• « liste » ou « montre toutes les '+nom+' » : tout voir\n• « cherche maison » : filtrer\n'+(champ==='categorie'?'• « je sais pas » : je mets Divers\n':'')+'• « annuler » : abandonner','bot');
    return true;
  }
  if(mt.k==='doute'&&champ==='categorie'){
    afficherChoix('Pas de souci. Choisis « Divers » si tu ne sais pas, ou une catégorie :',[['',['Divers']]].concat(toutesValeurs(b,champ)),auClic);
    return true;
  }
  let g=toutesValeurs(b,champ);
  if(mt.k==='cherche'){
    const q=norm(mt.q);
    g=g.map(([n,l])=>[n,l.filter(x=>{ const o=typeof x==='string'?x:x.l; return norm(o).indexOf(q)!==-1||norm(n).indexOf(q)!==-1; })]).filter(([n,l])=>l.length);
    if(!g.length){ ajouter('Rien ne correspond à « '+mt.q+' ». Écris « liste » pour tout voir.','bot err'); return true; }
    afficherChoix('Résultats pour « '+mt.q+' » :',g,auClic); return true;
  }
  afficherChoix('Voici '+(champ==='categorie'?'toutes les ':'les ')+nom+' :',g,auClic);
  return true;
}
/* Catégories qui contiennent le mot tapé (« maison » → Loyer, Entretien maison…). */
function categoriesProches(t){
  t=norm(t); if(t.length<3) return [];
  const mes=(A.S.params.categories||[]).filter(c=>A.EXCLUS.indexOf(c)===-1);
  const grp=(A.GROUPES||[]).filter(([g])=>norm(g).indexOf(t)!==-1).reduce((a,[,l])=>a.concat(l),[]);
  return mes.filter(c=>norm(c).split(/[^a-z0-9]+/).some(w=>w.length>=3&&(w.indexOf(t)===0||t.indexOf(w)===0))||grp.indexOf(c)!==-1).slice(0,10);
}

function pucesDepart(){
  puces(['Aide','Solde','Total','Qui me doit ?','Je dois combien ?','Consignations','Dépenses du mois','Prochaines échéances'].map(l=>({l,v:l})),
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
  if(a.champ==='type'&&val==='consign'&&!b.sens) b.sens='recu';
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
  if(B.attenteMontant){
    const t=B.attenteMontant, n=lireNombre(norm(texte)); B.attenteMontant=null;
    if(n>0){ A.confirmerTranche(t,'ok',n).then(()=>ajouter('✅ '+htg(n)+' enregistré sur '+t.dossier+'.','bot')); return; }
  }
  if(B.liste) return listeReponse(texte);
  /* Réponse à une question en cours */
  if(B.attente){
    if(/^(annuler|annule|stop|laisse|non merci)$/i.test(norm(texte))) return annuler();
    const b=B.file[B.attente.i], champ=B.attente.champ;
    if(repondreMeta(texte,b,champ,v=>appliquer(v))) return;
    const val=lireReponse(b,champ,texte);
    /* mot proche de catégories existantes (« maison ») : proposer avant de créer une nouvelle */
    if(champ==='categorie'&&b.categorieNouvelle&&val!=null){
      const pr=categoriesProches(texte);
      if(pr.length){ b.categorieNouvelle=false;
        afficherChoix('« '+val+' » n\'existe pas. Tu veux dire :',[['',pr.concat([{v:'__new:'+val,l:'➕ Créer « '+val+' »'}])]],v=>{
          if(v.indexOf('__new:')===0){ b.categorieNouvelle=true; appliquer(v.slice(6)); } else appliquer(v); });
        return; }
    }
    if(val!=null) return appliquer(val);
    /* pas une réponse : peut-être une nouvelle demande */
    const essai=analyser(texte,true);
    if(!essai){ ajouter('Je n\'ai pas compris ta réponse. '+QUESTIONS[B.attente.champ]+' (ou « annuler »)','bot err'); return; }
    B.file=[]; B.attente=null;
    return traiter(essai,texte);
  }
  traiter(analyser(texte,false),texte);
}
/* Commandes qui ne sont pas des opérations d'argent. */
function commande(texte){
  const t=norm(texte), orig=texte.trim();
  let m=t.match(/^(?:ajoute|ajouter|nouvelle|nouveau|cree|creer)\s+(?:la |une |un |le )?(personne|categorie|compte)\s+(.+)$/);
  if(m){
    const cle={personne:'personnes',categorie:'categories',compte:'comptes'}[m[1]];
    const mots=orig.split(/\s+/), i=mots.findIndex(w=>norm(w)===m[1]);
    const nom=cap(mots.slice(i+1).join(' ').trim());
    if(!nom) return null;
    return {html:'Ajouter '+(m[1]==='categorie'?'la catégorie':m[1]==='compte'?'le compte':'la personne')+' <b>'+A.esc(nom)+'</b> ?',ok:()=>{ A.ajouterValeur(cle,nom); return 'Ajouté : '+nom+'.'; }};
  }
  /* « montre mes catégories », « liste des comptes », « mes personnes », « dossiers en cours »… */
  if(!/\d/.test(t)&&(META_VERBE.test(t)&&META_NOM.test(t)||/^(mes|les|liste des?|la liste des?)\s+(categories|comptes|personnes|contacts|dossiers)$/.test(t))){
    if(/categorie/.test(t)){ const g=toutesValeurs({type:/revenu/.test(t)?'revenu':'depense'},'categorie');
      return {info:'Tes catégories ('+g.reduce((n,[,l])=>n+l.length,0)+') :'+g.map(([n,l])=>'<div class="grp"><div class="gt">'+A.esc(n)+'</div>'+l.map(c=>'<span class="tag">'+A.esc(c)+'</span>').join('')+'</div>').join('')+'<div class="petit">Pour en ajouter : « ajoute la catégorie Rideaux ».</div>'}; }
    if(/compte/.test(t)){ const auj=A.aujourdhui(); return {info:'Tes comptes :'+'<div class="carte">'+A.listeComptes().filter(c=>c!==A.CONSIGN).map(c=>A.esc(c)+' : <b>'+htg(A.soldeAu(c,auj))+'</b>').join('<br>')+'</div>'}; }
    if(/personne|contact|gens/.test(t)){ const l=A.S.params.personnes||[]; return {info:l.length?'Tes personnes ('+l.length+') :<div class="grp">'+l.map(p=>'<span class="tag">'+A.esc(p)+'</span>').join('')+'</div>':'Aucune personne enregistrée.'}; }
    if(/dossier/.test(t)){ const l=A.dossiersOuverts(); return {info:l.length?'Dossiers en cours :<div class="carte">'+l.map(d=>A.esc(d.dossier+' · '+d.personne)+' : <b>'+htg(d.reste)+'</b>').join('<br>')+'</div>':'Aucun dossier en cours.'}; }
  }
  if(/^(annule|supprime|efface|retire)\s+(?:la |l |le )?(derniere|dernier)/.test(t)){
    const op=A.derniereOp(); if(!op) return {texte:'Aucune opération à supprimer.'};
    const lies=['pret','emprunt','consign'].indexOf(op.type)!==-1&&Object.values(A.S.ops).some(o=>!o.deleted&&(o.type==='rembours'||o.type==='consreg')&&o.dossier===op.dossier);
    if(lies) return {texte:'La dernière opération ('+A.LIBELLE[op.type]+' '+op.dossier+') a des règlements : supprime-la depuis le tableau.'};
    return {html:'Supprimer la dernière opération ?<div class="carte"><b>'+A.LIBELLE[op.type]+'</b> · '+A.frDate(op.date)+'<br>'+htg(op.montant*(op.devise==='HTD'?A.S.params.taux:1))+' · '+A.esc(op.description||op.categorie||op.dossier||'')+'</div>',
            ok:()=>{ A.supprimerDirect(op.id); return 'Supprimée. Les soldes sont recalculés.'; }};
  }
  if(/^(modifie|corrige|change|edite)\s+(?:la |l |le )?(derniere|dernier)/.test(t)){
    const op=A.derniereOp(); if(!op) return {texte:'Aucune opération à modifier.'};
    A.ouvrirEdition(op.id); return {texte:'J\'ouvre la dernière opération dans la saisie.'};
  }
  m=t.match(/^taux(?: du)?(?: dollar| \$| \$ht)?\s*(?:a|=|:)?\s*(\d+(?:[.,]\d+)?)/);
  if(m){ const x=Number(m[1].replace(',','.')); return {html:'Mettre le taux à <b>1 $HT = '+String(x).replace('.',',')+' HTG</b> ?',ok:()=>{ A.setTaux(x); return 'Taux enregistré.'; }}; }
  if(/^(rappel|rappelle moi|rappelle-moi|evenement|note|noter|ajoute un evenement)\b/.test(t)){
    const D=extraireDate(t); const M=extraireMontants(D.t);
    const pers=extrairePersonne(t,orig);
    let nom=orig.replace(/^(rappel|rappelle[- ]moi|évènement|evenement|événement|note|noter|ajoute un évènement)\s*:?\s*/i,'')
      .replace(/\b(le\s+)?\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/,'').replace(/\b(demain|aujourd'hui|hier)\b/i,'')
      .replace(/\d[\d .,]*\s*(htg|gd|gourdes)?/i,'').replace(/\s+/g,' ').trim();
    let date=D.date||A.aujourdhui(); if(/\bdemain\b/.test(t)) date=A.plusJours(A.aujourdhui(),1);
    if(!nom) return {texte:'Quel est l\'évènement ? Exemple : « rappel 25/10 anniversaire Flore 2000 ».'};
    const ev={date,nom:nom.charAt(0).toUpperCase()+nom.slice(1),type:'',personne:pers&&pers.connu?pers.nom:'',lieu:'',montant:M.r.montant||0,statut:'À venir'};
    return {html:'Ajouter cet évènement ?<div class="carte"><b>'+A.esc(ev.nom)+'</b><br>'+A.frDate(ev.date)+(ev.montant?' · '+htg(ev.montant):'')+(ev.personne?' · '+A.esc(ev.personne):'')+'</div>',
            ok:()=>{ A.ajouterEvt(ev); return 'Évènement ajouté au '+A.frDate(ev.date)+'.'; }};
  }
  return null;
}
function analyser(texte,silencieux){
  const t=norm(texte);
  const cmd=commande(texte); if(cmd) return {cmd};
  const ls=analyserListe(texte); if(ls) return {liste:ls};
  const aMontant=/\d/.test(t.replace(/\b(pre|emp)[ \-]?\d+/g,'').replace(/\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/g,''));
  if(estQuestion(t,aMontant)){ const r=repondre(texte); if(r) return {q:r}; }
  if(aMontant){
    const brs=decouper(texte).map(brouillon).filter(b=>b.montant||b.type||b.achat||b.rendu);
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
  if(res.cmd){
    if(res.cmd.texte){ ajouter(res.cmd.texte,'bot'); pucesDepart(); return; }
    if(res.cmd.info){ ajouter(res.cmd.info,'bot',true); pucesDepart(); return; }
    const m=ajouter(res.cmd.html+'<div class="acts2"><button class="btn primary" data-a="ok">✅ Oui</button><button class="btn ghost" data-a="non">✕ Non</button></div>','bot',true);
    m.querySelector('[data-a="ok"]').onclick=()=>{ desactiver(m); const r=res.cmd.ok(); ajouter(r,'bot'); pucesDepart(); };
    m.querySelector('[data-a="non"]').onclick=()=>{ desactiver(m); ajouter('D\'accord.','bot'); pucesDepart(); };
    return;
  }
  if(res.liste) return demarrerListe(res.liste);
  B.file=res.ops; suite();
}

/* ============================== MODE LISTE ===============================
 *  Une liste brute (tirets, $ et gdes mélangés, ou lignes copiées du tableur)
 *  devient une liste numérotée. L'assistant demande ensuite : la valeur du $,
 *  le compte (et les exceptions), les lignes douteuses, puis les dates par
 *  groupes — et dit s'il en manque — avant la validation finale.
 * ======================================================================== */
const RX_MONTANT=/(-?\d{1,3}(?:[  .]\d{3})+|-?\d+)(?:,(\d{1,2})|\.(\d{1,2})(?!\d))?\s*(\$ ?ht|\$|dollars?|dola|htd|gourdes?|gdes?|gde|gd\b|htg)?/gi;
const AMBIGU=/\b(pret|prete|emprunt|rembours|avance)\b/;

function compterMontants(t){
  const s=String(t).replace(/\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/g,' ').replace(/\b(pre|emp|con)[ \-]?\d+/gi,' ');
  return (s.match(/\d[\d  .,]*\s*(\$|dollars?|gourdes?|gdes?|gde|gd\b|htg)|\d{2,}/gi)||[]).length;
}
/* Lignes copiées du tableur : « 03/10/2026  Description  Catégorie  -10 000,00 HTG  …  Commentaire » */
function lignesTableur(texte){
  if(!/\t/.test(texte)||!/\d{2}\/\d{2}\/\d{4}/.test(texte)) return null;
  const rows=texte.split(/(?=\b\d{2}\/\d{2}\/\d{4}\t)/).map(r=>r.trim()).filter(r=>/^\d{2}\/\d{2}\/\d{4}\t/.test(r));
  if(rows.length<2) return null;
  const val=s=>{ if(!s) return 0; const n=lireNombre(String(s).replace(/-/g,'')); return n||0; };
  return rows.map(r=>{
    const c=r.split('\t').map(x=>x.trim());
    const d=c[0].split('/'); const date=d[2]+'-'+d[1]+'-'+d[0];
    const deb=val(c[3]), cre=val(c[4]);
    return {libelle:c[1]||'', catTableur:c[2]||'', montant:deb||cre, sens:deb?'sortie':'entree', note:c[6]||'', date, devise:'HTG'};
  }).filter(x=>x.montant>0);
}
/* Liste brute à tirets : coupe aux tirets (pas dans « tap-tap »), aux parenthèses de groupe et entre deux montants. */
function lignesBrutes(texte){
  const out=[]; let groupe='';
  const morceaux=String(texte).replace(/\r/g,'').split(/\s+-\s*|(?<=\d|\$|gdes?|gde|gd|htg)\s*-\s*|\s*-\s+|\n|;/i);
  const pousser=(txt,grp)=>{
    txt=txt.trim(); if(!txt) return;
    /* plusieurs montants dans le même morceau → plusieurs lignes */
    const re=new RegExp(RX_MONTANT.source,'gi'); let m, dernier=0, avant='', trouve=false;
    const parts=[];
    while((m=re.exec(txt))){
      if(!m[0].trim()||/^\d{1,2}$/.test(m[1])&&!m[4]&&!/\d{2,}/.test(m[1])) continue;
      const fin=m.index+m[0].length;
      const lib=(avant+' '+txt.slice(dernier,m.index)).trim();
      parts.push({lib, m}); avant=''; dernier=fin; trouve=true;
    }
    if(!trouve){ if(out.length&&txt.length<40) out[out.length-1].libelle+=' '+txt; return; }
    const reste=txt.slice(dernier).trim();
    parts.forEach((p,i)=>{
      let lib=p.lib; if(i===parts.length-1&&reste&&!/^(tout|toutes|tous)\b/i.test(reste)) lib=(lib+' '+reste).trim();
      const v=Number(p.m[1].replace(/[  .]/g,'').replace('-','')+'.'+(p.m[2]||p.m[3]||'0'));
      if(!(v>0)) return;
      out.push({libelle:lib.replace(/^[\s,:)(]+|[\s,:(]+$/g,''), montant:Math.round(v*100)/100,
                devise:p.m[4]&&/\$|dol|htd/i.test(p.m[4])?'HTD':'HTG', note:grp});
    });
  };
  morceaux.forEach(mo=>{
    let s=mo;
    const o=s.indexOf('(');
    if(o!==-1){ groupe=s.slice(0,o).trim(); s=s.slice(o+1); }
    const f=s.indexOf(')');
    if(f!==-1){ pousser(s.slice(0,f),groupe); groupe=''; pousser(s.slice(f+1),''); }
    else pousser(s,groupe);
  });
  return out;
}
function analyserListe(texte){
  const tab=lignesTableur(texte);
  if(tab) return tab.map(x=>preparerLigne(x));
  if(compterMontants(texte)<3) return null;
  /* déjà des phrases complètes (« dépense 500 cash … ; … ») → traitement normal */
  const segs=decouper(texte);
  if(segs.length>1&&segs.every(s=>/^\s*(depense|dépense|revenu|reçu|recu|transfert|retrait|pret|prêt|emprunt|rembours|solde|regle|régle|consign)/i.test(s))) return null;
  const l=lignesBrutes(texte);
  if(l.length<3) return null;
  return l.map(x=>preparerLigne(x));
}
function preparerLigne(x){
  const t=norm(x.libelle+' '+(x.catTableur||''));
  const cpt=extraireComptes(norm(x.libelle)).map(c=>c.cle);
  const it={libelle:cap1(x.libelle.trim()), note:x.note||'', montant:x.montant, devise:x.devise||'HTG', date:x.date||null,
            type:'depense', compte:null, source:null, destination:null, categorie:null, doute:''};
  if(x.sens==='entree') it.type='revenu';
  if(/\b(retrait|retire)\b/.test(t)){ it.type='transfert'; it.source=cpt.find(c=>c!=='Cash')||cpt[0]; it.destination='Cash'; }
  else if(/\b(depot|depose)\b/.test(t)&&cpt.length){ it.type='transfert'; it.source='Cash'; it.destination=cpt.find(c=>c!=='Cash'); }
  else if(/transf/.test(t)&&cpt.length>=2){ it.type='transfert'; it.source=cpt[0]; it.destination=cpt[1]; }
  else if(cpt.length) it.compte=cpt[0];
  if(/transfer (from|to) /.test(t)&&x.catTableur){ it.type='transfert'; }
  if(it.type==='transfert'&&(!it.source||!it.destination)) it.doute='transfert';
  if(it.type!=='transfert'){
    const tc=x.catTableur&&x.catTableur!=='Divers'&&(A.S.params.categories||[]).indexOf(x.catTableur)!==-1?x.catTableur:null;
    it.categorie=tc||extraireCategorie(norm(x.libelle),it.type)||extraireCategorie(norm(x.libelle+' '+(x.note||'')),it.type)||(x.catTableur&&EXCLUS_TAB.indexOf(x.catTableur)===-1?x.catTableur:null);
    if(/\b(recu|vente|vendu|salaire recu|encaisse)\b/.test(t)) it.type='revenu';
  }
  if(AMBIGU.test(t)) it.doute='ambigu';
  else if(it.type!=='transfert'&&!it.categorie) it.doute='categorie';
  return it;
}
const EXCLUS_TAB=['Transfert','Prêt','Emprunt','Remboursement','Divers'];
function cap1(s){ s=String(s||'').replace(/\s+/g,' ').trim(); return s.charAt(0).toUpperCase()+s.slice(1); }

function ligneTxt(it,i){
  const m=it.devise==='HTD'?A.NF.format(it.montant)+' $':A.NF.format(it.montant)+' gdes';
  const quoi= it.type==='transfert' ? 'Transfert '+(it.source||'?')+' → '+(it.destination||'?')
            : (it.type==='revenu'?'Revenu · ':'')+(it.categorie||'❓ catégorie');
  const d= it.date ? ' · '+A.frDate(it.date) : '';
  return (i+1)+'. '+it.libelle+(it.note?' ('+it.note+')':'')+' — '+m+' — '+quoi+(it.compte?' · '+it.compte:'')+d+(it.doute==='ambigu'?' ❓':'');
}
function demarrerListe(items){
  B.liste={items,etape:null,files:[]};
  ajouter('J\'ai trouvé '+items.length+' lignes :\n'+items.map(ligneTxt).join('\n'),'bot');
  B.liste.etapes=[];
  if(items.some(x=>x.devise==='HTD')) B.liste.etapes.push('devise');
  if(items.some(x=>x.type!=='transfert'&&!x.compte)) B.liste.etapes.push('compte','exceptions');
  items.forEach((x,i)=>{ if(x.doute) B.liste.etapes.push('ligne:'+i); });
  if(items.some(x=>!x.date)) B.liste.etapes.push('dates');
  etapeSuivante();
}
function etapeSuivante(){
  const L=B.liste; if(!L) return;
  const e=L.etapes.shift(); L.etape=e;
  const ann={v:'__annuler',l:'✕ Annuler'};
  if(!e) return finirListe();
  if(e==='devise'){ ajouter('Le $, c\'est le dollar haïtien (1 $ = '+String(A.S.params.taux).replace('.',',')+' gdes) ?','bot');
    return puces([{v:'oui',l:'Oui, dollar haïtien'},{v:'us',l:'Non, dollar US'},ann],x=>{ ajouter(x.l,'moi'); listeReponse(x.v); }); }
  if(e==='compte'){ ajouter('Quel compte pour ces lignes ?','bot');
    return puces(A.listeComptes().filter(c=>c!==A.CONSIGN).map(c=>({v:c,l:c})).concat([ann]),x=>{ ajouter(x.l,'moi'); listeReponse(x.v); }); }
  if(e==='exceptions'){ ajouter('Des lignes sur un autre compte ? Écris par exemple « 10 moncash » ou « 3 à 5 sogebank », sinon « non ».','bot');
    return puces([{v:'non',l:'Non, toutes'},ann],x=>{ ajouter(x.l,'moi'); listeReponse(x.v); }); }
  if(e.indexOf('ligne:')===0){
    const i=Number(e.split(':')[1]), it=L.items[i];
    if(it.doute==='ambigu'){ ajouter('N° '+(i+1)+' « '+it.libelle+' » ('+htgLigne(it)+') : c\'est quoi ?','bot');
      return puces([{v:'depense',l:'Une dépense'},{v:'pret',l:'J\'ai prêté de l\'argent'},{v:'emprunt',l:'On m\'a prêté de l\'argent'},{v:'ignorer',l:'Ignorer cette ligne'},ann],x=>{ ajouter(x.l,'moi'); listeReponse(x.v); }); }
    if(it.doute==='transfert'){ ajouter('N° '+(i+1)+' « '+it.libelle+' » : de quel compte vers quel compte ? (ex. « moncash vers cash »)','bot');
      return puces([ann],()=>annulerListe()); }
    ajouter('N° '+(i+1)+' « '+it.libelle+' » : quelle catégorie ?','bot');
    return puces(choix({type:it.type},'categorie').concat([{v:'Divers',l:'Divers'},ann]),x=>{ ajouter(x.l,'moi'); listeReponse(x.v); });
  }
  if(e==='dates'){
    ajouter('Donne-moi les dates par groupes, par exemple :\n« 13/10 : 5,6,8,9 · 14/10 : 1 à 4,7,10 »\nou « tout le 14/10 ».','bot');
    return puces([{v:'tout aujourd\'hui',l:'Tout aujourd\'hui'},ann],x=>{ ajouter(x.l,'moi'); listeReponse(x.v); });
  }
}
function htgLigne(it){ return it.devise==='HTD'?A.NF.format(it.montant)+' $':A.NF.format(it.montant)+' gdes'; }
function annulerListe(){ B.liste=null; ajouter('D\'accord, j\'abandonne cette liste.','bot'); pucesDepart(); }
function plages(s,n){
  const out=new Set(); const t=norm(s);
  if(/\b(tout|toutes|tous|le reste|reste)\b/.test(t)&&!/\d+\s*(a|à|-)\s*\d+/.test(t)&&!/\d/.test(t.replace(/\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/g,''))) { for(let i=1;i<=n;i++) out.add(i); return out; }
  t.replace(/\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/g,' ').replace(/(\d+)\s*(?:a|à|-|au|jusqu a)\s*(\d+)|(\d+)/g,(m0,a,b,c)=>{
    if(c){ const k=Number(c); if(k>=1&&k<=n) out.add(k); }
    else { for(let k=Number(a);k<=Number(b);k++) if(k>=1&&k<=n) out.add(k); }
    return ' ';
  });
  return out;
}
function lireDates(texte,n){
  const res={}; const auj=A.aujourdhui();
  const t=norm(texte);
  if(/^tout (aujourd ?hui|ce jour)$/.test(t)){ for(let i=1;i<=n;i++) res[i]=auj; return res; }
  const re=/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/g; const pos=[]; let m;
  while((m=re.exec(t))){ let y=m[3]?Number(m[3]):Number(auj.slice(0,4)); if(y<100) y+=2000;
    const mo=Number(m[2]), j=Number(m[1]); if(mo<1||mo>12||j<1||j>31) continue;
    pos.push({i:m.index,f:m.index+m[0].length,d:y+'-'+String(mo).padStart(2,'0')+'-'+String(j).padStart(2,'0')}); }
  pos.forEach((p,k)=>{
    const avant=t.slice(k?pos[k-1].f:0,p.i), apres=t.slice(p.f,k<pos.length-1?pos[k+1].i:t.length);
    /* « 13/10 : 5,6 » (numéros après la date) ou « 5,6 le 13/10 » (avant) */
    let nums=plages(apres,n);
    if(!nums.size&&/\b(tout|toutes|tous|le reste|reste)\b/.test(apres)) { for(let i=1;i<=n;i++) if(!res[i]) nums.add(i); }
    if(!nums.size) nums=plages(avant,n);
    nums.forEach(i=>res[i]=p.d);
  });
  return res;
}
function listeReponse(texte){
  const L=B.liste, e=L.etape, t=norm(texte);
  if(/^(annuler|annule|stop|abandonne)$/.test(t)||texte==='__annuler') return annulerListe();
  if(e==='devise'){
    if(/^us|dollar us|americain/.test(t)){ ajouter('Combien de gourdes pour 1 dollar US ?','bot'); L.etape='tauxUS'; return puces([{v:'__annuler',l:'✕ Annuler'}],()=>annulerListe()); }
    return etapeSuivante();
  }
  if(e==='tauxUS'){ const x=lireNombre(t); if(!(x>0)){ ajouter('Donne un nombre, par exemple 132.','bot'); return; }
    L.items.forEach(it=>{ if(it.devise==='HTD'){ it.montant=Math.round(it.montant*x*100)/100; it.devise='HTG'; it.note=[it.note,'US$ × '+String(x).replace('.',',')].filter(Boolean).join(' — '); } });
    return etapeSuivante(); }
  if(e==='compte'&&repondreMeta(texte,{},'compte',v=>listeReponse(v))) return;
  if(e&&e.indexOf('ligne:')===0&&L.items[Number(e.split(':')[1])].doute==='categorie'&&repondreMeta(texte,{type:L.items[Number(e.split(':')[1])].type},'categorie',v=>listeReponse(v))) return;
  if(e==='compte'){ const c=extraireComptes(t)[0]; if(!c){ ajouter('Je ne reconnais pas ce compte. Choisis-en un ci-dessous.','bot err'); return; }
    L.items.forEach(it=>{ if(it.type!=='transfert'&&!it.compte) it.compte=c.cle; }); return etapeSuivante(); }
  if(e==='exceptions'){
    if(/^(non|aucune?|rien|non toutes)\b/.test(t)) return etapeSuivante();
    let fait=0;
    t.split(/[,;·]|\bet\b/).forEach(part=>{
      const c=extraireComptes(part)[0]; if(!c) return;
      plages(part.replace(rx(norm(c.cle)),' '),L.items.length).forEach(i=>{ const it=L.items[i-1]; if(it.type!=='transfert'){ it.compte=c.cle; fait++; } });
    });
    if(!fait){ ajouter('Je n\'ai pas compris. Exemple : « 10 moncash » ou « 3 à 5 sogebank », ou « non ».','bot err'); return; }
    ajouter(fait+' ligne'+(fait>1?'s':'')+' modifiée'+(fait>1?'s':'')+'.','bot'); return etapeSuivante();
  }
  if(e&&e.indexOf('ligne:')===0){
    const i=Number(e.split(':')[1]), it=L.items[i];
    if(it.doute==='ambigu'){
      if(texte==='ignorer'||/ignor/.test(t)){ it.ignorer=true; return etapeSuivante(); }
      if(texte==='pret'||texte==='emprunt'){ it.type=texte; it.categorie=null; it.doute=''; return etapeSuivante(); }
      it.type='depense'; it.doute='';
      if(!it.categorie){ it.doute='categorie'; L.etapes.unshift(e); }
      return etapeSuivante();
    }
    if(it.doute==='transfert'){ const c=extraireComptes(t).map(x=>x.cle); if(c.length<2){ ajouter('Indique les deux comptes, par exemple « moncash vers cash ».','bot err'); return; }
      it.source=c[0]; it.destination=c[1]; it.doute=''; return etapeSuivante(); }
    const k=extraireCategorie(t,it.type)||(A.S.params.categories||[]).find(c=>norm(c)===t)||(t.length>=3&&!/\d/.test(t)&&!estMeta(texte)?cap1(texte):null);
    if(!k){ ajouter('Choisis une catégorie ou écris son nom.','bot err'); return; }
    it.categorie=k; it.doute=''; return etapeSuivante();
  }
  if(e==='dates'){
    const vis=L.items.map((x,i)=>i).filter(i=>!L.items[i].ignorer);
    const d=lireDates(texte,L.items.length); let n=0;
    Object.keys(d).forEach(k=>{ const it=L.items[Number(k)-1]; if(it&&!it.ignorer){ it.date=d[k]; n++; } });
    const manquent=vis.filter(i=>!L.items[i].date).map(i=>i+1);
    if(!n&&manquent.length){ ajouter('Je n\'ai lu aucune date. Exemple : « 13/10 : 5,6,8,9 · 14/10 : 1 à 4 ».','bot err'); return; }
    if(manquent.length){ ajouter('Il manque la date pour : '+manquent.join(', ')+'. Donne-les (ex. « '+manquent[0]+' = 15/10 »).','bot'); return; }
    return etapeSuivante();
  }
}
function finirListe(){
  const L=B.liste; B.liste=null;
  const P=A.S.params;
  const brs=L.items.filter(it=>!it.ignorer).map(it=>({
    type:it.type, date:it.date||A.aujourdhui(), montant:it.montant, devise:it.devise,
    frais:0, fraisUnite:P.defFraisUnite||'%', tca:P.defTca!=null?P.defTca:0.1, tcaUnite:P.defTcaUnite||'F%',
    compte:it.compte, source:it.type==='pret'?it.compte:it.source, destination:it.type==='emprunt'?it.compte:it.destination,
    categorie:it.categorie, libelle:it.libelle, note:it.note, texte:it.libelle
  }));
  if(!brs.length){ ajouter('Aucune ligne à enregistrer.','bot'); return pucesDepart(); }
  B.file=brs; suite();
}


function carteTranches(l){
  l.slice(0,6).forEach(t=>{
    const m=ajouter('<div class="carte">📌 <b>'+A.esc(t.personne)+'</b> · '+t.dossier+(t.N>1?' · tranche '+t.n+'/'+t.N:'')+'<br>'+A.JOURS[A.jourDe(t.date)]+' '+A.frDate(t.date)+' · <b>'+htg(t.du)+'</b> · '+A.esc(t.compte)+'</div>'+
      '<div class="acts2"><button class="btn primary" data-a="ok">✅ '+(t.emp?'Payé':'Reçu')+'</button><button class="btn" data-a="part">Partiel</button><button class="btn ghost" data-a="non">'+(t.emp?'Pas payé':'Pas reçu')+'</button></div>','bot',true);
    m.querySelector('[data-a="ok"]').onclick=()=>{ desactiver(m); A.confirmerTranche(t,'ok').then(()=>ajouter('✅ Enregistré. Solde '+t.compte+' : '+htg(A.soldeAu(t.compte,A.aujourdhui())),'bot')); };
    m.querySelector('[data-a="non"]').onclick=()=>{ desactiver(m); A.confirmerTranche(t,'non').then(()=>ajouter('Noté : la tranche reste en retard.','bot')); };
    m.querySelector('[data-a="part"]').onclick=()=>{ desactiver(m); B.attenteMontant=t; ajouter('Combien as-tu '+(t.emp?'payé':'reçu')+' ?','bot'); };
  });
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
      const tc=A.tranchesAConfirmer();
      if(tc.length){ ajouter('📌 '+tc.length+' tranche'+(tc.length>1?'s':'')+' à confirmer :','bot'); carteTranches(tc); }
      const co=A.consOuvertes().filter(c=>c.statut==='En retard');
      if(co.length) ajouter('⚠️ '+co.length+' consignation'+(co.length>1?'s':'')+' en retard : '+co.map(c=>c.dossier+' ('+c.personne+')').join(', ')+'.','bot err');
      pucesDepart();
    }
    this.focus();
  },
  focus(){ setTimeout(()=>{ const i=$('botIn'); if(i&&window.innerWidth>760) i.focus(); },50); },
  reset(){ B.file=[]; B.attente=null; B.liste=null; const m=$('botMsgs'); if(m) m.innerHTML=''; const c=$('botChips'); if(c) c.innerHTML=''; },
  /* pour les tests */
  _analyser:analyser, _brouillon:brouillon, version:VERSION_DICO
};
})();
