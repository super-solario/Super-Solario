#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const file = path.join(__dirname, '..', 'data', 'leaderboard.json');
const data = fs.readFileSync(file, 'utf8');
const content = Buffer.from(data).toString('base64');
const branch = 'cursor/aaa-solario-backend-9913';
let sha = '';
try {
  sha = execFileSync('gh', ['api', `repos/super-solario/Super-Solario/contents/data/leaderboard.json?ref=${branch}`, '-q', '.sha'], { encoding: 'utf8' }).trim();
} catch (e) {}
const args = ['api', '-X', 'PUT', 'repos/super-solario/Super-Solario/contents/data/leaderboard.json',
  '-f', 'message=chore: sync global leaderboard',
  '-f', `content=${content}`,
  '-f', `branch=${branch}`];
if (sha) args.push('-f', `sha=${sha}`);
execFileSync('gh', args, { stdio: 'inherit' });
