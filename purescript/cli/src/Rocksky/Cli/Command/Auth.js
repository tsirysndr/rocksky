export const listenImpl=callback=>async()=>{
 const {listen}=await import('../../cli/runtime/login-server.js');
 return listen(body=>callback(body)());
};
export const close=server=>()=>{server.close();};
export const appPasswordProfileImpl=async()=>{
 const {getDidAndHandle}=await import('../../cli/runtime/lib/getDidAndHandle.js');
 const {createAgent}=await import('../../cli/runtime/lib/agent.js');
 const {createUser}=await import('../../cli/runtime/cmd/sync.js');
 const [did,handle]=await getDidAndHandle();
 const agent=await createAgent(did,handle);
 return createUser(agent,did,handle);
};
