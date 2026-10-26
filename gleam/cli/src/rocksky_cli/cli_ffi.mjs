import { Command } from 'commander';
import { toList as fromArray } from '../../gleam_stdlib/gleam.mjs';
export async function parse(spec, version, callback) {
  const root = new Command().name(spec.name).description(spec.description).version(version);
  function register(parent, entries, prefix = '') {
    for (const spec of entries) {
      const name = prefix ? `${prefix} ${spec.name}` : spec.name;
      const command = parent.command(spec.name).description(spec.description);
      for (const [flags, description] of spec.arguments) command.argument(flags, description);
      for (const option of spec.options) {
        if (option.default !== '') command.option(option.flags, option.description, option.default);
        else command.option(option.flags, option.description);
      }
      if (Array.from(spec.children).length) register(command, spec.children, name);
      else command.action((...values) => {
        const command = values.pop();
        const options = values.pop();
        return callback(name, fromArray(values.flat().filter(x => x !== undefined)), options);
      });
    }
  }
  register(root, spec.children);
  if (process.argv.length === 2) await callback('tui', fromArray([]), {});
  else await root.parseAsync(process.argv);
}
