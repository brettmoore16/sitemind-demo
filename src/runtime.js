export async function connectRuntime() {
  let config;
  try {
    const response=await fetch('./api/config',{credentials:'same-origin'});
    if(response.status===404)return {mode:'demo'}; // GitHub Pages: fictional demo only.
    if(!response.ok)throw new Error('Server configuration is unavailable. Reload shortly.');
    config=await response.json();
  } catch(error){throw new Error(error.message || 'Cannot connect to the server.');}
  if(config.mode==='demo')return {mode:'demo'};
  if(config.mode!=='service')throw new Error('Invalid server mode');
  const runtime={mode:'service',aiEnabled:config.aiEnabled,revision:0,project:null};
  runtime.request=async(path,{method='GET',body,retry=true}={})=>{
    const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(response.status===401 && retry && !path.startsWith('/auth/')){
      await runtime.request('/auth/refresh',{method:'POST',body:{},retry:false});return runtime.request(path,{method,body,retry:false});
    }
    const result=await response.json();if(!response.ok)throw new Error(result.error || 'Request failed');return result;
  };
  runtime.load=async id=>{const snapshot=await runtime.request(`/projects/${id}/workspace`);runtime.project=snapshot.project;runtime.revision=snapshot.revision;return snapshot.state;};
  runtime.save=async state=>{const result=await runtime.request(`/projects/${runtime.project.id}/workspace`,{method:'PUT',body:{state,revision:runtime.revision,confirmed:true}});runtime.revision=result.revision;};
  runtime.analyze=async(note,date,timezone)=>{const result=await runtime.request(`/projects/${runtime.project.id}/analyze`,{method:'POST',body:{note,referenceDate:date,timezone}});if(result.revision!==runtime.revision)throw new Error('The project changed elsewhere. Reload it before reviewing this note.');return result.proposals;};
  return runtime;
}
