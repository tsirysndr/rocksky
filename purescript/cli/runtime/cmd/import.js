import {run} from "../../../output/Rocksky.Cli.Command.Import/index.js";
import {fromAff} from "../../../output/Control.Promise/index.js";
export const importCmd=(file,options={})=>fromAff(run(file)(options))();
export {renderProgress} from "../import-renderer.js";
