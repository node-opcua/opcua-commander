const fs = require('fs');
const path = require('path');

console.log('Running cross-platform post-bundle script...');

// 1. Rename bin/index.cjs to bin/bundle.cjs
const srcIndex = path.join(process.cwd(), 'bin', 'index.cjs');
const destBundle = path.join(process.cwd(), 'bin', 'bundle.cjs');

if (fs.existsSync(srcIndex)) {
  fs.renameSync(srcIndex, destBundle);
  console.log('Successfully renamed bin/index.cjs to bin/bundle.cjs');
} else {
  console.log('bin/index.cjs not found, skipping rename');
}

// 2. Copy node_modules/blessed/usr to bin/usr
const srcUsr = path.join(process.cwd(), 'node_modules', 'blessed', 'usr');
const destUsr = path.join(process.cwd(), 'bin', 'usr');

if (fs.existsSync(srcUsr)) {
  // Use recursive fs.cpSync which is natively supported on Node.js 16.7+
  fs.cpSync(srcUsr, destUsr, { recursive: true, force: true });
  console.log('Successfully copied node_modules/blessed/usr to bin/usr recursively');
} else {
  console.error('Source node_modules/blessed/usr does not exist');
  process.exit(1);
}
