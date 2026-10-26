import os from 'node:os';
import {Ok,Error as GleamError} from '../../../gleam_stdlib/gleam.mjs';
export const connect=async(name,url,token,command)=>{
 try{const {RemotePlayer}=await import('@rocksky/sdk/remote');const remote=new RemotePlayer({name,url,token});for(const event of ['play','pause','next','previous','seek','queueJump','queueRemove','enqueue'])remote.on(event,data=>command(event,data));remote.connect();return new Ok(remote);}catch(e){return new GleamError(e.message);}
};
export const push=(remote,status,track,queue,index)=>{remote.setStatus(status);if(track)remote.setNowPlaying(track);remote.setQueue(Array.from(queue),index);};
export const disconnect=remote=>{remote.disconnect();};
export const mpris=async command=>{
 if(os.platform()!=='linux')return new GleamError('MPRIS is only available on Linux');
 try{const {default:Player}=await import('mpris-service');const player=Player({name:'rocksky',identity:'Rocksky',supportedInterfaces:['player']});for(const name of ['canControl','canPlay','canPause','canGoNext','canGoPrevious','canSeek'])player[name]=true;
 for(const name of ['playpause','play','pause','stop','next','previous','volume','shuffle','seek','position'])player.on(name,data=>command(name,data));return new Ok(player);}catch(e){return new GleamError(e.message);}
};
export const mpris_update=(player,status,track,index)=>{
 player.playbackStatus=status==='playing'?'Playing':status==='paused'?'Paused':'Stopped';
 if(track){player.getPosition=()=>track.elapsedMs*1000;player.metadata={'mpris:trackid':player.objectPath(`track/${index}`),'mpris:length':track.durationMs*1000,'xesam:title':track.title,'xesam:artist':[track.artist],'xesam:albumArtist':[track.albumArtist],'xesam:album':track.album,'mpris:artUrl':track.albumArt};}
};
export const mpris_close=player=>{try{player.playbackStatus='Stopped';}catch{}};
export const interval=(ms,callback)=>{let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{await callback();}catch{}finally{busy=false;}},ms);return ()=>clearInterval(timer);};
