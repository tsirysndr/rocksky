import {File} from 'node-taglib-sharp';
import {Ok,Error as GError} from '../../gleam.mjs';
export const writeTrackGain=(path,gain,peak)=>{
 try{const file=File.createFromPath(path);try{file.tag.replayGainTrackGain=gain;file.tag.replayGainTrackPeak=peak;file.save();}finally{file.dispose();}return new Ok(undefined);}catch(e){return new GError(e);}
};
