import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { StairsIcon, ClockIcon, CrosshairIcon, GearIcon, ArrowsClockwiseIcon, StackIcon, SquareIcon, CheckCircleIcon, CaretDownIcon } from '@phosphor-icons/react';
import { Button } from './panelui/button';
import { Input } from './panelui/input';
import { Frame } from './panelui/frame';
import { Select } from './panelui/select';
import { ButtonGroup } from './panelui/button-group';
import { Tooltip } from './panelui/tooltip';
import { callHost, HostTimeout, preview, type Selection } from './bridge';
import { VERSION } from './version';
import { checkUpdate, installUpdate, updateError, type Release } from './update';

const anchors = ['Haut gauche','Haut centre','Haut droite','Centre gauche','Centre','Centre droite','Bas gauche','Bas centre','Bas droite'];
const format = (n:number) => n.toLocaleString('fr-FR',{maximumFractionDigits:4});
function Tip({label,children}:{label:string;children:ReactElement}) {
  return <Tooltip><Tooltip.Trigger render={children} data-slot={children.type===CheckCircleIcon?'tooltip-trigger':'button'}/><Tooltip.Content arrow={false}>{label}</Tooltip.Content></Tooltip>;
}
function App() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState('');
  const [stalled,setStalled] = useState(false);
  const [notice, setNotice] = useState({text:'',error:false});
  const [value,setValue] = useState('50');
  const [unit,setUnit] = useState<'frames'|'seconds'>('frames');
  const [order,setOrder] = useState<'forward'|'reverse'>('forward');
  const [anchor,setAnchor] = useState(4);
  const [hoverAnchor,setHoverAnchor] = useState<number|null>(null);
  const [about,setAbout] = useState(false);
  const [release,setRelease] = useState<Release|null>(null);
  const [updateBusy,setUpdateBusy] = useState<'check'|'install'|''>('');
  const [updateMessage,setUpdateMessage] = useState('');
  const [updateFailed,setUpdateFailed] = useState(false);
  const [installed,setInstalled] = useState(false);
  const updateLock = useRef(false);
  const lock = useRef(false);
  const halted = useRef(false);
  async function searchUpdate(silent=false) {
    if(updateLock.current||installed) return;
    updateLock.current=true;setUpdateBusy('check');setUpdateFailed(false);
    if(!silent) setUpdateMessage('Recherche de mise à jour…');
    try { const result=await checkUpdate();setRelease(result);setUpdateMessage(result.available?`La version ${result.version} est disponible.`:'Tu utilises la dernière version.'); }
    catch(error) { setUpdateFailed(true);setUpdateMessage(updateError(error)); }
    finally {updateLock.current=false;setUpdateBusy('');}
  }
  async function update() {
    if(updateLock.current||lock.current||!release?.available||installed) return;
    updateLock.current=true;setUpdateBusy('install');setUpdateFailed(false);setUpdateMessage('Téléchargement et vérification…');
    try { const result=await installUpdate(release.version);halted.current=true;setInstalled(true);setUpdateMessage(`Version ${result.version} installée. Redémarre After Effects pour l’utiliser. Ton projet peut être enregistré normalement.`); }
    catch(error) {setUpdateFailed(true);setUpdateMessage(updateError(error));}
    finally {updateLock.current=false;setUpdateBusy('');}
  }
  async function run(command:'selection'|'cascade'|'duration'|'anchor', args:Record<string,unknown> = {}) {
    if(lock.current || halted.current || updateLock.current&&updateBusy==='install') return;
    lock.current=true;setBusy(command);
    if(command!=='selection') setNotice({text:'',error:false});
    try {
      if(command==='selection') setSelection(await callHost('selection'));
      else { const result = await callHost(command,args); setSelection(result.selection);setNotice({text:result.message,error:false}); }
      return true;
    } catch(e) {
      setNotice({text:e instanceof Error ? e.message : String(e),error:true});
      if(e instanceof HostTimeout) { halted.current=true;setStalled(true); }
      return false;
    } finally {lock.current=false;setBusy('');}
  }
  // CEP can emit focus events while AE is closing a panel. Never call the host there.
  // Explicit refresh and each action read the current native selection instead.
  useEffect(()=>{void run('selection');},[]);
  useEffect(()=>{if(!preview&&window.__adobe_cep__)void searchUpdate(true);},[]);
  const layers=selection?.layers ?? [];
  const hasSelection=!!selection?.comp && layers.length>0;
  const disabled=!!busy||stalled||!hasSelection||installed||updateBusy==='install';
  const number=Number(value.replace(',','.'));
  const frames=unit==='frames'?number:Math.round(number/(selection?.comp?.frameDuration??.04));
  const valid=Number.isFinite(number)&&number>0&&Number.isInteger(frames)&&frames>=1;
  const durationLabel=!valid?'Saisis une durée positive.':selection?.comp?`${format(frames)} images = ${format(frames*selection.comp.frameDuration)} s`:'Ouvre une composition pour convertir.';
  const ordered=order==='forward'?layers:[...layers].reverse();
  const first=ordered.slice(0,3);
  const total=first.reduce((sum,l)=>sum+l.outPoint-l.inPoint,0)||1;
  let cursor=0;
  return <Tooltip.Provider><main>
    <header className="brand"><img src="./assets/sloth-icon.png" alt=""/><h1>Lazy Motion</h1>
      <Tip label="À propos et aide"><Button className="icon-button" variant="ghost" aria-label="À propos et aide" aria-expanded={about} onClick={()=>setAbout(!about)}><GearIcon size={20}/></Button></Tip>
      {about&&<aside className="about" aria-label="À propos et mises à jour"><strong>Lazy Motion · {VERSION}</strong><p>Chaque action s’annule avec Ctrl + Z dans After Effects.</p><p>Ancrage : calques 2D, avant l’animation de rotation ou d’échelle. Position animée acceptée.</p><section className="updates" aria-label="Mises à jour"><h2>Mises à jour</h2><p role={updateFailed?'alert':'status'} className={updateFailed?'update-error':''}>{updateMessage||(preview?'Disponibles dans le panneau After Effects.':'Vérifie les nouvelles versions sur GitHub.')}</p>{release?.available&&!installed&&<><p className="release-notes">{release.notes||'Améliorations de Lazy Motion.'}</p><p>Après installation, redémarre After Effects.</p><Button loading={updateBusy==='install'} disabled={!!updateBusy||!!busy||stalled} onClick={()=>void update()}>Installer la version {release.version}</Button></>}{!installed&&<Button variant="outline" loading={updateBusy==='check'} disabled={!!updateBusy||preview} onClick={()=>void searchUpdate()}>Rechercher une mise à jour</Button>}</section><Button variant="ghost" onClick={()=>setAbout(false)}>Fermer</Button></aside>}
    </header>
    <div className="content">
      <div className="selection-strip" title={selection?.comp?.name}>
        <span>{hasSelection?`${layers.length} calque${layers.length>1?'s':''} sélectionné${layers.length>1?'s':''}`:'Sélectionne des calques'}</span>
        <span className="fps">{selection?.comp?`${format(selection.comp.frameRate)} i/s`:'— i/s'}</span>
        <Tip label="Actualiser la sélection"><Button className="icon-button refresh" variant="ghost" aria-label="Actualiser la sélection" disabled={!!busy||stalled||installed||updateBusy==='install'} onClick={()=>run('selection')}><ArrowsClockwiseIcon size={19} className={busy==='selection'?'spinning':''}/></Button></Tip>
      </div>
      <Frame variant="plain" className="tool cascade">
        <Frame.Header><Frame.Title as="h2"><StairsIcon/><span>Cascade</span><small>Bout à bout</small></Frame.Title></Frame.Header>
        <Frame.Panel>
          <div className="timeline-preview" role="img" aria-label="Aperçu de l’ordre : les calques se suivent sans intervalle">
            {first.length?first.map((layer,i)=>{const start=cursor;const length=(layer.outPoint-layer.inPoint)/total*100;cursor+=length;return <div className="timeline-row" key={layer.index}><span title={layer.name}>{preview?layer.name:`${layer.index}. ${layer.name}`}</span><div className="track"><meter min={0} max={100} value={100} style={{marginLeft:`${start}%`,width:`${length}%`}} aria-label={`Durée : ${layer.durationFrames} images`}/></div></div>}):<p className="empty-hint">Sélectionne au moins deux calques.</p>}
          </div>
          <div className="order-row"><label id="order-label">Ordre</label><Select value={order} onValueChange={v=>v&&setOrder(v)} items={{forward:'De haut en bas',reverse:'De bas en haut'}} disabled={!!busy}><Select.Trigger aria-labelledby="order-label" icon={<CaretDownIcon size={14}/>}><Select.Value/></Select.Trigger><Select.Content alignItemWithTrigger={false}><Select.Item value="forward">De haut en bas</Select.Item><Select.Item value="reverse">De bas en haut</Select.Item></Select.Content></Select></div>
          <Button className="primary-action" disabled={disabled||layers.length<2} loading={busy==='cascade'} onClick={()=>run('cascade',{order})}><StairsIcon size={20}/>Mettre en cascade</Button>
        </Frame.Panel>
      </Frame>
      <Frame variant="plain" className="tool duration">
        <Frame.Header><Frame.Title as="h2"><ClockIcon/><span>Durée commune</span></Frame.Title></Frame.Header>
        <Frame.Panel>
          <div className="duration-row"><Input.Group><Input id="duration" aria-label="Durée commune" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&valid&&!disabled)void run('duration',{value:number,unit});}} aria-invalid={!valid} disabled={!!busy}/></Input.Group><ButtonGroup className="units" aria-label="Unité de durée"><Button aria-pressed={unit==='frames'} variant={unit==='frames'?'default':'ghost'} onClick={()=>{if(unit!=='frames'){setValue(valid?String(frames):'50');setUnit('frames');}}}>Images</Button><Button aria-pressed={unit==='seconds'} variant={unit==='seconds'?'default':'ghost'} onClick={()=>{if(unit!=='seconds'){setValue(valid?String(Number((frames*(selection?.comp?.frameDuration??.04)).toFixed(8))):'2');setUnit('seconds');}}}>Secondes</Button></ButtonGroup></div>
          <p className="conversion">{durationLabel}</p>
          <Button variant="outline" className="duration-action" disabled={disabled||!valid} loading={busy==='duration'} onClick={()=>run('duration',{value:number,unit})}><StackIcon size={20}/>Appliquer la durée</Button>
        </Frame.Panel>
      </Frame>
      <Frame variant="plain" className="tool anchor">
        <Frame.Header><Frame.Title as="h2"><CrosshairIcon/><span>Point d’ancrage</span></Frame.Title></Frame.Header>
        <Frame.Panel><div className="anchor-layout"><ButtonGroup className="anchor-grid" aria-label="Les neuf points d’ancrage">{anchors.map((name,i)=><Tip label={name} key={name}><Button className="anchor-point" aria-label={name} aria-pressed={anchor===i} variant={anchor===i?'default':'outline'} disabled={disabled} onMouseEnter={()=>setHoverAnchor(i)} onMouseLeave={()=>setHoverAnchor(null)} onFocus={()=>setHoverAnchor(i)} onBlur={()=>setHoverAnchor(null)} onClick={async()=>{if(await run('anchor',{x:(i%3)/2,y:Math.floor(i/3)/2}))setAnchor(i);}}><SquareIcon size={6} weight="fill"/></Button></Tip>)}</ButtonGroup><div className="anchor-description"><h3>{anchors[hoverAnchor??anchor]}</h3><p>Position visuelle conservée</p></div></div></Frame.Panel>
      </Frame>
      {notice.text&&<p className={notice.error?'notice error':'notice'} role={notice.error?'alert':'status'}>{notice.text}</p>}
    </div>
    <footer><span>LazyApps</span><Button className={`version version-button${release?.available||installed?' update-available':''}`} variant="ghost" onClick={()=>setAbout(true)} aria-label={installed?'Mise à jour installée, redémarrer After Effects':release?.available?`Version ${release.version} disponible`:'Version et mises à jour'}>{preview?'Aperçu · ':''}v{VERSION}{installed?' · Redémarrer':release?.available?' · Mise à jour':release?' · À jour':updateFailed?' · À vérifier':''}<CheckCircleIcon size={17}/></Button></footer>
  </main></Tooltip.Provider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
