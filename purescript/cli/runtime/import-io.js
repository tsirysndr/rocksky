import * as Checkpoint from './lib/importCheckpoint.js';
export const loadCheckpoint=source=>()=>Checkpoint.loadCheckpoint(source);
export const saveCheckpoint=checkpoint=>()=>Checkpoint.saveCheckpoint(checkpoint);
export const clearCheckpoint=source=>()=>Checkpoint.clearCheckpoint(source);
