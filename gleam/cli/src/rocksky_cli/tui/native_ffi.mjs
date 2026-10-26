// Direct Rockbox API bindings; queue, settings, and playback policy live in Gleam.
export const create=async s=>{
 const {Player}=await import('rockbox-ffi/node');
 const player=new Player({volume:s.volume,output:s.output||undefined,sampleRate:s.output?44100:undefined,bufferSeconds:24,crossfadeMode:s.crossfade,fadeInDelayMs:s.fade_in_delay*1000,fadeInDurationMs:s.fade_in_duration*1000,fadeOutDelayMs:s.fade_out_delay*1000,fadeOutDurationMs:s.fade_out_duration*1000,mixMode:s.mix_mode});
 configure(player,s);return player;
};
export const configure=(p,s)=>{
 p.setVolume(s.volume);p.setShuffle(s.shuffle);p.setRepeat(s.repeat);p.setEqEnabled(s.eq_enabled);
 Array.from(s.bands).forEach((gain,index)=>p.setEqBand(index,[32,64,125,250,500,1000,2000,4000,8000,16000][index],1,gain));
 p.setBass(s.bass);p.setTreble(s.treble);
 p.setCrossfade(s.crossfade,s.fade_in_delay*1000,s.fade_in_duration*1000,s.fade_out_delay*1000,s.fade_out_duration*1000,s.mix_mode);
 p.setReplaygain(s.replaygain,s.replaygain_preamp,s.replaygain_clip);
};
export const queue=(p,urls,index)=>{p.setQueue(Array.from(urls));p.play();if(index>0)p.skipTo(index);};
export const command=(p,name,argument)=>{if(!['play','pause','stop','next','previous','seek','skipTo','remove'].includes(name))throw new Error('Unknown player operation');p[name](argument);};
export const status=p=>p.status();
export const insert=(p,urls,position,index)=>{p.insert(Array.from(urls),position,index);};
export const close=p=>{p.close();};
