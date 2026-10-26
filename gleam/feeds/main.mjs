import 'dotenv/config';
import {startTelemetry} from './telemetry.mjs';
await startTelemetry();
const {main}=await import('../build/dev/javascript/rocksky_feeds/rocksky_feeds.mjs');
main();
if(process.exitCode&&globalThis.__rockskyFeedsShutdown)await globalThis.__rockskyFeedsShutdown();
