export type Release = { version:string; available:boolean; notes:string };
type Updater = {check:()=>Promise<Release>; install:(version:string)=>Promise<{version:string}>};
let runtime:Updater|undefined;
function backend():Updater {
  if (runtime) return runtime;
  const node = (window as unknown as {cep_node?:{require:(path:string)=>{createUpdater:()=>Updater}}}).cep_node;
  if (!node || !window.__adobe_cep__) throw new Error('Les mises à jour sont disponibles dans After Effects, après installation du panneau.');
  const url = new URL('./updater.cjs',window.location.href);
  if (url.protocol!=='file:') throw new Error('Ouvre la version installée du panneau.');
  const file = decodeURIComponent(url.pathname).replace(/^\/(?=[A-Za-z]:)/,'');
  runtime = node.require(file).createUpdater();
  return runtime!;
}
export const checkUpdate = () => backend().check();
export const installUpdate = (version:string) => backend().install(version);
// Errors from CEP's Node context do not share the browser Error prototype.
export const updateError = (error:unknown) => typeof error==='object'&&error!==null&&'message' in error ? String(error.message) : String(error);
