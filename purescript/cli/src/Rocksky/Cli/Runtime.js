import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import relative from 'dayjs/plugin/relativeTime.js';
import { c } from '../../cli/runtime/theme.js';
import { loadToken as token } from '../../cli/runtime/lib/token.js';
dayjs.extend(relative);
export const args = () => process.argv.slice(2);
export const env = name => () => process.env[name] ?? '';
export const print = value => () => console.log(value);
export const printError = value => () => console.error(value);
export const setExitCode = value => () => { process.exitCode = value; };
export const loadToken = () => token() ?? '';
export const readStateImpl = name => () => fs.readFile(path.join(os.homedir(), '.rocksky', name), 'utf8');
export const writeStateImpl = name => content => async () => {
 const dir = path.join(os.homedir(), '.rocksky');
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,name), content, {mode:0o600});
};
export const loadEnvironment = () => { dotenv.config({quiet:true}); };
export const statusText = response => response.statusText;
export const relativeTime = date => () => dayjs(date).fromNow();
export const style = name => value => c[name](value);
export const initializeDatabaseImpl = async () => (await import('../../cli/runtime/drizzle.js')).initializeDatabase();
export const openBrowserImpl = url => async () => { await (await import('open')).default(url); };
const commands = {
 'scrobble-api': async () => (await import('../../cli/runtime/cmd/scrobble-api.js')).scrobbleApi,
 mcp: async () => (await import('../../cli/runtime/cmd/mcp.js')).mcp,
 mpd: async () => (await import('../../cli/runtime/cmd/mpd.js')).mpd,
 'nfc status': async () => (await import('../../cli/runtime/cmd/nfc.js')).nfcStatus,
 'nfc read': async () => (await import('../../cli/runtime/cmd/nfc.js')).nfcRead,
 'nfc write': async () => (await import('../../cli/runtime/cmd/nfc.js')).nfcWrite,
 'card read': async () => (await import('../../cli/runtime/cmd/card.js')).cardRead,
 'card write': async () => (await import('../../cli/runtime/cmd/card.js')).cardWrite,
 upload: async () => (await import('../../cli/runtime/cmd/upload.js')).upload,
 tui: async () => (await import('../../cli/runtime/cmd/tui.js')).tui,
};
export const invokeImpl = name => args => async () => {
 const command=await commands[name]();
 await command(...args);
};
export const nowSeconds=()=>Math.floor(Date.now()/1000);

export const exit=code=>()=>{process.exit(code);};
