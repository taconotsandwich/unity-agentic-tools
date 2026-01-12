#!/usr/bin/env node

const { exec } = require('child_process');

const args = process.argv.slice(2);

if (args.length < 4) {
  console.error('Usage: node edit.ts <file_path> <object_name> <property> <new_value>');
  process.exit(1);
}

exec(`node ${__dirname}/../../../unity-yaml/dist/cli.js edit ${args.join(' ')}`, (error, stdout, _stderr) => {
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(stdout);
});
