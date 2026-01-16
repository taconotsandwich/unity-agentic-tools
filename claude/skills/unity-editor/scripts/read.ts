#!/usr/bin/env bun

const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Usage: bun read.ts <file_path>');
  process.exit(1);
}

// Call the unity-yaml CLI directly instead of importing
const { exec } = require('child_process');

exec(`bun ${__dirname}/../../../unity-yaml/dist/cli.js`, (error, stdout, _stderr) => {
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(stdout);
});
