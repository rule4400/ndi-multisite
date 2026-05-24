#!/usr/bin/env node
/**
 * release.js
 *
 * バージョン番号を package.json に書き込み、git タグを作成して push する。
 *
 * 使い方:
 *   node scripts/release.js 1.7.0
 *   npm run release 1.7.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('使い方: npm run release <version>');
  console.error('例:     npm run release 1.7.0');
  process.exit(1);
}

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const prev = pkg.version;

// package.json を更新
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✓ package.json: ${prev} → ${version}`);

// git add & commit & tag & push
try {
  execSync('git add package.json', { stdio: 'inherit' });
  execSync(`git commit -m "chore: bump version to ${version}"`, { stdio: 'inherit' });
  execSync(`git tag v${version}`, { stdio: 'inherit' });
  execSync(`git push origin main v${version}`, { stdio: 'inherit' });
  console.log(`✓ タグ v${version} を push しました → GitHub Actions でビルドが開始されます`);
} catch (e) {
  console.error('git 操作に失敗しました:', e.message);
  process.exit(1);
}
