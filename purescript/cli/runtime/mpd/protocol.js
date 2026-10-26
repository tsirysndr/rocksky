import * as Protocol from '../../../output/Rocksky.Cli.Mpd.Protocol/index.js';
export const MPD_VERSION = Protocol.version;
export const GREETING = Protocol.greeting;
export const Ack = {NOT_LIST:1,ARG:2,PASSWORD:3,PERMISSION:4,UNKNOWN:5,NO_EXIST:50,PLAYLIST_MAX:51,SYSTEM:52,PLAYLIST_LOAD:53,PLAYER_SYNC:55,EXIST:56};
export class MpdError extends Error {
 constructor(code,message) {super(message);this.name='MpdError';this.code=code;}
}
export const ackLine = (code,position,command,message) => Protocol.ackLine(code)(position)(command)(message);
export const tokenize = Protocol.tokenize;
export const kv = (key,value) => Protocol.kv(key)(String(value));
