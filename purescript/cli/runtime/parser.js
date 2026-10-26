import {Command} from 'commander';
import chalk from 'chalk';
import {c} from './theme.js';
export const parseImpl = version => specs => handler => async () => {
 const program = new Command().name('rocksky').version(version)
  .description('Command-line interface for Rocksky — scrobble tracks, view stats, manage your listening history, and stream your music.');
 program.configureHelp({styleTitle:s=>chalk.bold(c.primary(s)),styleCommandText:c.secondary,styleDescriptionText:c.muted,styleOptionText:c.highlight,styleArgumentText:c.accent,styleSubcommandText:c.secondary});
 program.addHelpText('after','\nLearn more: https://docs.rocksky.app\nDiscord: https://discord.gg/EVcBy2fVa3\n');
 const commands=new Map([['',program]]);
 for(const spec of specs){
  const parts=spec.path.split(' ');const name=parts.pop();
  const command=commands.get(parts.join(' ')).command(name).description(spec.description);
  commands.set(spec.path,command);
  for(const arg of spec.arguments) command.argument(arg.flags,arg.description);
  for(const option of spec.options) command.option(option.flags,option.description,option.defaultValue || undefined);
  if(!specs.some(other=>other.path.startsWith(spec.path+' '))) command.action((...args)=>{
   const invoked=args.at(-1);
   return handler({command:spec.path, arguments:invoked.processedArgs, options:invoked.opts()})();
  });
 }
 await program.parseAsync(process.argv);
};
