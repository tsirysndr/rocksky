import fs from 'node:fs';
import path from 'node:path';
export const stat = file => () => {try {return {exists:true,directory:fs.statSync(file).isDirectory()};} catch {return {exists:false,directory:false};}};
export const readFile = file => () => fs.readFileSync(file,'utf8');
export const readDirectory = directory => () => fs.readdirSync(directory);
export const readHead = file => bytes => () => {
 const fd=fs.openSync(file,'r');
 try {const buffer=Buffer.alloc(bytes);return buffer.subarray(0,fs.readSync(fd,buffer,0,bytes,0)).toString('utf8');}
 finally {fs.closeSync(fd);}
};
export const joinPath = directory => name => path.join(directory,name);
export const extension = file => path.extname(file).toLowerCase();
export const timestamp = text => Math.floor(Date.parse(text)/1000);
export const parseInteger = text => parseInt(text,10);
