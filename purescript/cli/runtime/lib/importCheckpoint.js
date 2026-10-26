import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Checkpoint from '../../../output/Rocksky.Cli.Import.Checkpoint/index.js';
const directory = () => path.join(os.homedir(), '.rocksky', 'import-checkpoints');
export function checkpointPath(source) {
 return path.join(directory(), crypto.createHash('sha1').update(path.resolve(source)).digest('hex').slice(0,16)+'.json');
}
export function loadCheckpoint(source) {
 try { return JSON.parse(fs.readFileSync(checkpointPath(source),'utf8')); } catch { return null; }
}
export function saveCheckpoint(checkpoint) {
 fs.mkdirSync(directory(),{recursive:true});
 const file=checkpointPath(checkpoint.source);
 fs.writeFileSync(file+'.tmp',JSON.stringify(checkpoint,null,2));
 fs.renameSync(file+'.tmp',file);
}
export function clearCheckpoint(source) {
 try {fs.unlinkSync(checkpointPath(source));} catch {}
}
export const resumeIndex = (scrobbles,cursor) => Checkpoint.resumeIndex(scrobbles)(cursor);
export class ContiguousTracker {
 constructor(tracker = Checkpoint.newTracker()) {this.tracker=tracker;}
 complete(i) {return Checkpoint.complete(this.tracker)(i)();}
 get mark() {return Checkpoint.mark(this.tracker)();}
 get outstanding() {return Checkpoint.outstanding(this.tracker)();}
}
export function restoreProgress(scrobbles,saved) {
 const {tracker,pendingIndices}=Checkpoint.restoreProgress(scrobbles)(saved)();
 return {tracker:new ContiguousTracker(tracker),pendingIndices};
}
