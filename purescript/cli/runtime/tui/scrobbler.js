import {scrobbleTick,initialScrobbleState} from '../../../output/Rocksky.Cli.Tui.Model/index.js';
import {RockskyClient} from '../client.js';
import {playerController} from './player.js';
let state=initialScrobbleState;
export function scrobblerTick(token,onScrobbled){
 const status=playerController.status();
 const item=playerController.currentItem();
 const decision=scrobbleTick(state)(token??'')(status)(item);
 state=decision.state;
 if(!decision.submit) return;
 new RockskyClient(token).scrobbleNowPlaying({
  title:item.title,artist:item.artist,album:item.album||item.title,albumArtist:item.albumArtist||item.artist,
  duration:item.duration||0,albumArt:item.albumArt,timestamp:Math.floor(Date.now()/1000),
 }).then(()=>onScrobbled?.(item),()=>{});
}
