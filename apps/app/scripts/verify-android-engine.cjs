const fs = require('node:fs');
const path = require('node:path');

function verifyLibrary(file, machine) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 64 || bytes.toString('hex', 0, 4) !== '7f454c46' || bytes[4] !== 2 || bytes[5] !== 1) throw new Error(`${file}: expected little-endian ELF64`);
  if (bytes.readUInt16LE(18) !== machine) throw new Error(`${file}: wrong CPU architecture`);
  const table = Number(bytes.readBigUInt64LE(32));
  const size = bytes.readUInt16LE(54);
  const count = bytes.readUInt16LE(56);
  let loads = 0;
  for (let i = 0; i < count; i++) {
    const offset = table + i * size;
    if (bytes.readUInt32LE(offset) !== 1) continue;
    loads++;
    const alignment = bytes.readBigUInt64LE(offset + 48);
    const fileOffset = bytes.readBigUInt64LE(offset + 8);
    const virtualAddress = bytes.readBigUInt64LE(offset + 16);
    if (alignment < 16384n || (virtualAddress - fileOffset) % 16384n !== 0n) throw new Error(`${file}: LOAD segment is not 16 KB aligned`);
  }
  if (!loads) throw new Error(`${file}: no loadable segments`);
}

if (require.main === module) {
  const root = path.resolve(__dirname, '../modules/rocksky-engine/android/src/main/jniLibs');
  for (const [abi, machine] of [['arm64-v8a', 183], ['x86_64', 62]]) {
    verifyLibrary(path.join(root, abi, 'librocksky_engine.so'), machine);
    console.log(`${abi}: Rust engine present; ELF architecture and 16 KB alignment verified`);
  }
}
module.exports = { verifyLibrary };
