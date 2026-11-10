import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const C={bg:'#F6F8F6',white:'#FFFFFF',ink:'#17322D',muted:'#6B807B',line:'#DDE8E1',green:'#087A5C',mint:'#E2F4EA',soft:'#EDF2EE',red:'#A64D45'};
const surfaces=[];
function surface(name,file,x,y,draw){
  let n=0; const parent='@root';
  const ops=[{op:'frame',ref:'root',name,x,y,width:1440,height:900,fill:C.bg,clip:true}];
  const rect=(label,x,y,width,height,fill=C.white,extra={})=>ops.push({op:'rect',parent,name:`${++n} ${label}`,x,y,width,height,fill,...extra});
  const txt=(label,characters,x,y,size=14,color=C.ink,style='Regular',width=250,extra={})=>ops.push({op:'text',parent,name:`${++n} ${label}`,characters,x,y,size,color,font:{family:'Inter',style},width,...extra});
  const chrome=(section)=>{
    rect('Top bar',0,0,1440,56);rect('Top bar line',0,55,1440,1,C.line);
    rect('Brand mark',18,11,33,33,C.green,{radius:9});txt('Brand initial','E',28,16,18,C.white,'Bold',20);
    txt('Brand','EasyPOS',62,17,17,C.ink,'Bold',125);rect('Section badge',205,14,Math.max(78,section.length*9+20),28,C.mint,{radius:14});
    txt('Section',section,219,21,12,C.green,'Bold',160);
    txt('Store','Droguerie Générale',1180,20,12,C.muted,'Medium',220);
  };
  const heading=(title,sub,button)=>{
    txt('Page title',title,34,92,25,C.ink,'Bold',650);txt('Page description',sub,34,131,12,C.muted,'Regular',780);
    if(button){rect('Primary action',1210,91,196,39,C.green,{radius:8});txt('Primary action label',button,1222,103,12,C.white,'Bold',172,{align:'CENTER'});}
  };
  const stat=(x,label,value)=>{rect(`Metric ${label}`,x,169,440,94,C.white,{radius:10,stroke:C.line,strokeWeight:1});txt(`Metric label ${label}`,label,x+18,187,11,C.muted,'Regular',390);txt(`Metric value ${label}`,value,x+18,213,24,C.ink,'Bold',390);};
  const button=(label,x,y,w,primary=false)=>{rect(`Button ${label}`,x,y,w,42,primary?C.green:C.white,{radius:8,stroke:primary?undefined:C.line,strokeWeight:1});txt(`Button label ${label}`,label,x+8,y+13,12,primary?C.white:C.ink,'Bold',w-16,{align:'CENTER'});};
  const field=(label,placeholder,x,y,w)=>{txt(`Field label ${label}`,label,x,y,11,C.muted,'Bold',w);rect(`Field ${label}`,x,y+23,w,46,C.white,{radius:8,stroke:C.line,strokeWeight:1});txt(`Placeholder ${label}`,placeholder,x+14,y+39,12,C.muted,'Regular',w-28);};
  chrome(draw.section);draw.call({rect,txt,heading,stat,button,field,C});
  const out=path.join(dir,file);fs.writeFileSync(out,JSON.stringify({ops},null,2));surfaces.push({file,name,ops:ops.length});
}

surface('16 · Commandes en attente | Vue opérationnelle','16-commandes-en-attente.json',0,3300,{
  section:'Commandes',
  call({rect,txt,heading,button,C}){
    heading('Commandes en attente','Retrouvez une vente, reprenez son panier ou passez à l’encaissement.','↻  Actualiser');
    rect('Tabs base',34,170,520,40,C.white,{radius:8,stroke:C.line,strokeWeight:1});
    rect('All tab',38,174,132,32,C.mint,{radius:7});txt('All tab label','Toutes',52,184,12,C.green,'Bold',105);
    txt('Hold tab label','Ventes en attente',184,184,12,C.muted,'Medium',165);txt('Customer tab label','Commandes clients',366,184,12,C.muted,'Medium',175);
    rect('Search',968,170,438,40,C.white,{radius:8,stroke:C.line,strokeWeight:1});txt('Search placeholder','⌕  Référence, client ou numéro',984,182,12,C.muted,'Regular',390);
    rect('Orders card',34,229,925,573,C.white,{radius:11,stroke:C.line,strokeWeight:1});
    rect('Table header',50,248,893,40,'#F4F7F5',{radius:6});
    ['RÉFÉRENCE','CLIENT','DATE','ARTICLES','TOTAL','ACTION'].forEach((h,i)=>txt(`Header ${h}`,h,[65,267,463,641,757,858][i],262,10,C.muted,'Bold',140));
    const rows=[['CHANTIER-042','Mohamed El Amrani','10/11/2026 14:35','3 articles','285,50 MAD'],['CMD-105','Client comptoir','10/11/2026 13:12','2 articles','129,00 MAD'],['OULED-ZIANE','S. Benali','09/11/2026 16:42','5 articles','790,00 MAD'],['DEVIS-018','Atlas Bâtiment','09/11/2026 11:20','4 articles','420,00 MAD'],['CLIENT-238','K. Berrada','08/11/2026 17:05','1 article','65,00 MAD']];
    rows.forEach((r,i)=>{const y=299+i*68;rect(`Row divider ${i}`,50,y+55,893,1,C.line);r.forEach((v,j)=>txt(`Order ${i} cell ${j}`,v,[65,267,463,641,757][j],y+15,11,j===0||j===4?C.ink:C.muted,j===0||j===4?'Bold':'Regular',[190,180,160,110,100][j]));txt(`Order ${i} action`,'Voir →',864,y+15,11,C.green,'Bold',70);});
    txt('Pager','1–5 sur 18 commandes',56,760,11,C.muted,'Regular',230);button('Précédent',725,748,100);button('Suivant',836,748,100);
    rect('Details panel',975,229,431,573,C.white,{radius:11,stroke:C.line,strokeWeight:1});txt('Details label','VENTE EN ATTENTE',998,253,10,C.green,'Bold',200);txt('Details title','CHANTIER-042',998,282,20,C.ink,'Bold',370);txt('Details sub','Mohamed El Amrani · 10/11/2026',998,313,11,C.muted,'Regular',370);
    rect('Details divider',998,344,385,1,C.line);txt('Details items heading','Produits de la commande',998,366,13,C.ink,'Bold',345);
    [['Tube PPR Ø20 · 4 m','2 × 40,00'],['Clé à molette 250 mm','1 × 125,50'],['Ruban PTFE 12 mm','1 × 80,00']].forEach((r,i)=>{const y=397+i*48;txt(`Detail product ${i}`,r[0],998,y,11,C.ink,'Regular',230);txt(`Detail price ${i}`,r[1],1251,y,11,C.muted,'Medium',132,{align:'RIGHT'});rect(`Detail line ${i}`,998,y+31,385,1,C.line);});
    txt('Details total label','Total',998,565,13,C.ink,'Bold',150);txt('Details total','285,50 MAD',1217,562,18,C.green,'Bold',166,{align:'RIGHT'});
    button('Reprendre',998,644,181);button('Encaisser',1190,644,193,true);button('Supprimer',998,698,385);
  }
});

surface('17 · Utilisateurs | Équipe et accès','17-utilisateurs.json',1600,3300,{
  section:'Utilisateurs',
  call({rect,txt,heading,stat,button,C}){
    heading('Utilisateurs','Gérez les comptes et les accès à la caisse.','+  Nouveau compte');
    stat(34,'Comptes','8');stat(500,'Administrateurs','2');stat(966,'Sessions ouvertes','3');
    rect('Team card',34,284,1372,518,C.white,{radius:11,stroke:C.line,strokeWeight:1});
    txt('Team heading','Équipe',55,307,17,C.ink,'Bold',260);
    rect('Search',999,299,383,40,'#F4F7F5',{radius:8});txt('Search label','⌕  Rechercher par nom ou identifiant',1015,312,12,C.muted,'Regular',350);
    rect('Table head',55,360,1327,43,'#F4F7F5',{radius:6});
    ['UTILISATEUR','IDENTIFIANT','ACCÈS','ÉTAT','ACTIONS'].forEach((h,i)=>txt(`Column ${h}`,h,[72,437,715,976,1200][i],375,10,C.muted,'Bold',160));
    const users=[['AP','Administrateur principal','admin','Administrateur','En ligne'],['MB','Mohamed Benali','m.benali','Équipe','En ligne'],['FA','Fatima Ait','f.ait','Équipe','Hors ligne'],['YA','Youssef Amrani','y.amrani','Administrateur','Hors ligne'],['NB','Nadia Berrada','n.berrada','Équipe','En ligne']];
    users.forEach((u,i)=>{const y=414+i*70;rect(`Row divider ${i}`,55,y+58,1327,1,C.line);rect(`Avatar ${i}`,72,y+8,34,34,C.mint,{radius:17});txt(`Initials ${i}`,u[0],80,y+17,11,C.green,'Bold',24);txt(`Name ${i}`,u[1],119,y+18,12,C.ink,'Bold',265);txt(`Username ${i}`,u[2],437,y+19,11,C.muted,'Regular',205);rect(`Role pill ${i}`,715,y+12,u[3]==='Administrateur'?130:76,27,u[3]==='Administrateur'?'#EAF1FB':C.soft,{radius:13});txt(`Role ${i}`,u[3],724,y+20,10,u[3]==='Administrateur'?'#456C9B':C.muted,'Bold',150);rect(`Status pill ${i}`,976,y+12,78,27,u[4]==='En ligne'?C.mint:C.soft,{radius:13});txt(`Status ${i}`,u[4],985,y+20,10,u[4]==='En ligne'?C.green:C.muted,'Bold',105);txt(`Edit ${i}`,'✎  Modifier',1196,y+19,11,C.green,'Bold',110);txt(`Delete ${i}`,'🗑',1316,y+18,11,C.red,'Bold',40);});
    txt('List footer','5 comptes affichés sur 8',55,774,11,C.muted,'Regular',300);
  }
});

surface('18 · Catégories | Liste et organisation','18-categories.json',3200,3300,{
  section:'Catégories',
  call({rect,txt,heading,stat,button,C}){
    heading('Catégories','Organisez vos produits pour les retrouver rapidement à la caisse.','+  Nouvelle catégorie');
    stat(34,'Catégories','12');stat(500,'Produits classés','1 284');stat(966,'Sans catégorie','18');
    rect('Categories card',34,284,1372,518,C.white,{radius:11,stroke:C.line,strokeWeight:1});
    txt('List heading','Liste des catégories',55,307,17,C.ink,'Bold',380);
    rect('Search',999,299,383,40,'#F4F7F5',{radius:8});txt('Search label','⌕  Rechercher une catégorie',1015,312,12,C.muted,'Regular',345);
    rect('Table head',55,360,1327,43,'#F4F7F5',{radius:6});txt('Category column','CATÉGORIE',72,375,10,C.muted,'Bold',300);txt('Product count column','PRODUITS',861,375,10,C.muted,'Bold',150);txt('Action column','ACTIONS',1188,375,10,C.muted,'Bold',150);
    const categories=[['Plomberie','286'],['Électricité','248'],['Peinture','192'],['Quincaillerie','179'],['Outillage','145'],['Sanitaire','116']];
    categories.forEach(([name,count],i)=>{const y=412+i*59;rect(`Row divider ${i}`,55,y+49,1327,1,C.line);rect(`Category icon ${i}`,72,y+7,34,34,C.mint,{radius:8});txt(`Icon ${i}`,'#',83,y+15,17,C.green,'Bold',18);txt(`Category ${i}`,name,121,y+17,12,C.ink,'Bold',360);txt(`Count ${i}`,`${count} produits`,861,y+17,11,C.muted,'Regular',160);txt(`Edit ${i}`,'✎  Modifier',1188,y+17,11,C.green,'Bold',105);txt(`Delete ${i}`,'🗑',1311,y+17,11,C.red,'Bold',35);});
    txt('List footer','6 catégories affichées sur 12',55,774,11,C.muted,'Regular',320);
  }
});

surface('19 · Stock | Ajuster le stock','19-ajuster-stock.json',4800,3300,{
  section:'Stock',
  call({rect,txt,field,button,C}){
    txt('Page title','Stock',34,92,25,C.ink,'Bold',600);rect('Backdrop',0,0,1440,900,'#102A22B0');
    rect('Dialog',370,132,700,636,C.white,{radius:16,shadow:{color:'#071D1799',blur:40,x:0,y:18}});
    rect('Icon box',401,163,44,44,C.mint,{radius:10});txt('Icon','↕',412,171,23,C.green,'Bold',22);txt('Heading','Ajuster le stock',463,161,24,C.ink,'Bold',480);txt('Context','Enregistrez une entrée, une sortie ou un inventaire.',463,193,12,C.muted,'Regular',465);rect('Close',1010,163,30,30,C.soft,{radius:8});txt('Close sign','×',1018,166,20,C.muted,'Regular',20);rect('Header line',370,229,700,1,C.line);
    field('Produit *','Nom, référence ou code-barres',401,255,638);rect('Product result',401,331,638,57,'#F8FAF8',{radius:8,stroke:C.line,strokeWeight:1});txt('Result name','Tube PPR Ø20 · 4 m',417,345,12,C.ink,'Bold',380);txt('Result stock','Stock actuel : 42',831,345,11,C.muted,'Medium',190,{align:'RIGHT'});
    txt('Operation label','Opération',401,414,11,C.muted,'Bold',280);button('Entrée (+)',401,438,203,true);button('Sortie (−)',615,438,203);button('Inventaire',829,438,210);
    field('Quantité *','0',401,510,305);field('Note (facultatif)','Motif ou référence',734,510,305);
    rect('Footer line',370,671,700,1,C.line);txt('Footer hint','Les mouvements sont visibles dans la page Stock.',401,708,11,C.muted,'Regular',380);button('Annuler',782,692,115);button('Enregistrer',908,692,131,true);
  }
});

surface('20 · Utilisateurs | Compte utilisateur','20-compte-utilisateur.json',6400,3300,{
  section:'Utilisateurs',
  call({rect,txt,field,button,C}){
    txt('Page title','Utilisateurs',34,92,25,C.ink,'Bold',600);rect('Backdrop',0,0,1440,900,'#102A22B0');
    rect('Dialog',326,60,788,780,C.white,{radius:16,shadow:{color:'#071D1799',blur:40,x:0,y:18}});
    rect('Icon box',357,91,44,44,C.mint,{radius:10});txt('Icon','✚',368,100,22,C.green,'Bold',25);txt('Heading','Nouveau compte',419,89,24,C.ink,'Bold',510);txt('Context','Définissez les informations et les accès de ce compte.',419,121,12,C.muted,'Regular',535);rect('Close',1054,91,30,30,C.soft,{radius:8});txt('Close sign','×',1062,94,20,C.muted,'Regular',20);rect('Header line',326,157,788,1,C.line);
    field('Nom complet *','Nom et prénom',357,183,354);field('Identifiant *','Identifiant de connexion',729,183,354);
    field('Mot de passe *','Mot de passe',357,278,354);field('Confirmation *','Répéter le mot de passe',729,278,354);
    rect('Permissions panel',357,389,726,320,'#F8FAF8',{radius:10,stroke:C.line,strokeWeight:1});txt('Permission heading','Autorisations',377,409,14,C.ink,'Bold',300);txt('Permission help','Sélectionnez les pages accessibles à cet utilisateur.',377,434,11,C.muted,'Regular',470);
    [['Produits et stock',477],['Catégories',519],['Ventes et rapports',561],['Utilisateurs et accès',603],['Paramètres',645]].forEach(([label,y],i)=>{rect(`Check ${i}`,378,y,17,17,i<2?C.green:C.white,{radius:4,stroke:i<2?undefined:C.line,strokeWeight:1});if(i<2)txt(`Checkmark ${i}`,'✓',381,y+2,11,C.white,'Bold',13);txt(`Permission ${i}`,label,407,y+1,12,C.ink,'Medium',300);});
    rect('Footer line',326,733,788,1,C.line);txt('Footer hint','* Champs obligatoires',357,771,11,C.muted,'Regular',230);button('Annuler',813,752,119);button('Enregistrer',944,752,139,true);
  }
});

surface('21 · Paramètres | Configuration réseau','21-configuration-reseau.json',8000,3300,{
  section:'Paramètres',
  call({rect,txt,field,button,C}){
    txt('Page title','Paramètres',34,92,25,C.ink,'Bold',600);rect('Backdrop',0,0,1440,900,'#102A22B0');
    rect('Dialog',400,151,640,598,C.white,{radius:16,shadow:{color:'#071D1799',blur:40,x:0,y:18}});
    rect('Icon box',431,182,44,44,C.mint,{radius:10});txt('Icon','⌁',442,190,23,C.green,'Bold',25);txt('Heading','Configuration réseau',493,181,24,C.ink,'Bold',490);txt('Context','Choisissez le mode de fonctionnement de cette caisse.',493,212,12,C.muted,'Regular',495);rect('Close',980,182,30,30,C.soft,{radius:8});txt('Close sign','×',988,185,20,C.muted,'Regular',20);rect('Header line',400,248,640,1,C.line);
    txt('Mode label','Mode de l’application',431,275,11,C.muted,'Bold',420);rect('Mode select',431,299,578,46,C.white,{radius:8,stroke:C.line,strokeWeight:1});txt('Mode value','Terminal réseau',446,314,12,C.ink,'Medium',470);txt('Chevron','⌄',978,307,20,C.muted,'Regular',18);
    rect('Mode info',431,365,578,65,C.mint,{radius:8});txt('Mode info title','Terminal connecté au serveur',447,379,12,C.ink,'Bold',390);txt('Mode info text','Cette caisse utilise la base de données de l’ordinateur principal.',447,401,11,C.muted,'Regular',540);
    field('Adresse IP du serveur *','192.168.1.10',431,456,578);field('Numéro de caisse *','2',431,547,270);field('Identifiant matériel','Détecté automatiquement',719,547,290);
    rect('Footer line',400,657,640,1,C.line);txt('Reload note','Enregistrer la configuration redémarre l’application.',431,692,11,C.muted,'Regular',355);button('Annuler',774,676,101);button('Enregistrer',887,676,122,true);
  }
});

console.log(surfaces.map(item=>`${item.file}: ${item.ops} operations`).join('\n'));
