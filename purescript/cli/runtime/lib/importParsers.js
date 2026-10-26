import * as Parsers from '../../../output/Rocksky.Cli.Import.Parsers/index.js';
export const parseCsv=Parsers.parseCsv;
export const detectFormat=file=>Parsers.detectFormat(file)();
export const parseImport=(target,options={})=>{
 const result=Parsers.parseImport(target)({force:options.force??null,minSeconds:options.minSeconds??null})();
 return {...result,scrobbles:result.scrobbles.map(item=>Object.fromEntries(Object.entries(item).filter(([,value])=>value!==null)))};
};
