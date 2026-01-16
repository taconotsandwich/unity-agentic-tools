#!/usr/bin/env bun

const { exec } = require('child_process');

const args = process.argv.slice(2);

if (args.length < 4) {
  console.error('Usage: bun edit.ts <file_path> <object_name> <property> <new_value>');
  process.exit(1);
}

exec(`bun ${__dirname}/../../../unity-yaml/dist/cli.js edit ${args.join(' ')}`, (error, stdout, _stderr) => {
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(stdout);
});
