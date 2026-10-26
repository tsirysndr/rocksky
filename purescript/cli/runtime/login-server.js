import express from 'express';
import cors from 'cors';
export function listen(callback){
 return new Promise((resolve,reject)=>{
  const app=express();app.use(cors());app.use(express.json());
  const server=app.listen(6996,()=>resolve(server));
  server.once('error',reject);
  app.post('/token',async(request,response)=>{
   try{response.json(await callback(request.body));server.close();}
   catch(error){response.status(400).json({error:error.message});}
  });
 });
}
