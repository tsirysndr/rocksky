import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Settings from '../../../output/Rocksky.Cli.Tui.Settings/index.js';
export const DEFAULT_SETTINGS = Settings.defaultSettings;
const settingsPath=()=>path.join(os.homedir(),'.rocksky','settings.toml');
export function loadSettings(){
 try {return Settings.parseSettings(fs.readFileSync(settingsPath(),'utf8'));}
 catch {return structuredClone(DEFAULT_SETTINGS);}
}
export function saveSettings(settings){
 try {
  const disk=loadSettings();
  fs.mkdirSync(path.dirname(settingsPath()),{recursive:true});
  fs.writeFileSync(settingsPath(), Settings.serialize({...settings,output:disk.output,mpd:disk.mpd,remote:disk.remote}));
 } catch {}
}
