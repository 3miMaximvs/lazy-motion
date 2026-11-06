export type Layer = { index: number; name: string; inPoint: number; outPoint: number; durationFrames: number; locked: boolean; threeD: boolean };
export type Selection = { host: string; comp: null | {name: string; frameRate: number; frameDuration: number; duration: number}; layers: Layer[] };
export type ActionResult = { selection: Selection; message: string; frames?: number };
export type Command = 'selection' | 'cascade' | 'duration' | 'anchor';
declare global { interface Window { __adobe_cep__?: { evalScript: (code: string, callback: (result: string) => void) => void } } }

export const preview = !window.__adobe_cep__ && new URLSearchParams(window.location.search).has('preview');
let demo: Selection = { host: 'Aperçu', comp: {name:'Composition',frameRate:25,frameDuration:0.04,duration:10},
  layers: [3,2,1].map((seconds,i) => ({index:i+1,name:`Calque ${i+1}`,inPoint:0,outPoint:seconds,durationFrames:seconds*25,locked:false,threeD:false})) };
function simulate(command: Command, args: Record<string, unknown>): Selection | ActionResult {
  // Preview is explicitly labelled. These values never reach an Adobe project.
  if (command === 'selection') return structuredClone(demo);
  if (command === 'cascade') {
    const ordered = args.order === 'reverse' ? [...demo.layers].reverse() : demo.layers;
    let cursor = ordered[0].inPoint;
    for (const layer of ordered) { const duration=layer.outPoint-layer.inPoint; layer.inPoint=cursor; layer.outPoint=cursor+duration; cursor=layer.outPoint; }
  }
  if (command === 'duration') {
    const frames = args.unit === 'frames' ? Number(args.value) : Math.round(Number(args.value) / demo.comp!.frameDuration);
    if (frames<1 || !Number.isFinite(frames) || !Number.isInteger(frames)) throw new Error('Saisis une durée positive en images entières.');
    if(demo.layers.some(l=>l.inPoint+frames*demo.comp!.frameDuration>demo.comp!.duration)) throw new Error('Le résultat dépasserait la fin de la composition.');
    demo={...demo,layers:demo.layers.map(l=>({...l,outPoint:l.inPoint+frames*demo.comp!.frameDuration,durationFrames:frames}))};
  }
  return {selection:structuredClone(demo),message:command==='anchor'?'Ancrage appliqué à 3 calques (aperçu).':command==='cascade'?'3 calques mis bout à bout (aperçu).':'Durée commune appliquée (aperçu).'};
}
export class HostTimeout extends Error {}
export async function callHost(command: 'selection'): Promise<Selection>;
export async function callHost(command: Exclude<Command,'selection'>, args: Record<string,unknown>): Promise<ActionResult>;
export async function callHost(command: Command, args: Record<string,unknown> = {}): Promise<Selection | ActionResult> {
  if (preview) return simulate(command,args);
  const cep = window.__adobe_cep__;
  if (!cep) throw new Error('Ouvre Lazy Motion depuis Fenêtre → Extensions dans After Effects.');
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new HostTimeout('After Effects ne répond pas. Ferme ses boîtes de dialogue, puis rouvre le panneau avant de réessayer.')), 15000);
    const payload = JSON.stringify(args).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    cep.evalScript(`LazyMotion.dispatch(${JSON.stringify(command)},${payload})`, (raw) => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(raw);
        if (!result.ok) throw new Error(result.error);
        resolve(result.data);
      } catch (error) { reject(new Error(raw === 'EvalScript error.' ? 'Le script du panneau n’est pas chargé. Rouvre Lazy Motion.' : error instanceof Error ? error.message : String(error))); }
    });
  });
}
