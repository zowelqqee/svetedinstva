import {readFile, writeFile, rm, mkdir, cp, access, readdir} from 'node:fs/promises';
import config, {clientConfig} from '../lib/config.js';
export async function build() {
  const client = clientConfig(config);
  for (const file of [config.heroPath, config.cultureLogoPath, config.maskPath, config.rulesPath].filter(Boolean)) {
    if (!file.startsWith('public/')) throw new Error('Assets must be inside public/');
    await access(file);
  }
  if (config.rulesPath && !config.rulesPath.toLowerCase().endsWith('.pdf')) throw new Error('Rules must be a PDF');
  await rm('dist', {recursive:true, force:true});
  await mkdir('dist', {recursive:true});
  await cp('public', 'dist', {recursive:true});
  await cp(config.heroPath, 'dist/hero.png');
  await cp(config.cultureLogoPath, 'dist/culture-logo.png');
  for (const name of ['index.html','style.css','stats.html','stats.css','stats.js']) await cp('src/'+name, 'dist/'+name);
  const js = (await readFile('src/client.js','utf8')).replace('__CONFIG__', JSON.stringify(client));
  await writeFile('dist/client.js',js);
  await writeFile('dist/favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2134A0"/><path d="M29 10h6v13h7v26H22V23h7z" fill="white"/><path d="M19 49h26v7H19z" fill="#DE2726"/></svg>');
  await writeFile('dist/404.html','<!doctype html><html lang="ru"><meta charset="utf-8"><title>Страница не найдена</title><link rel="stylesheet" href="/style.css"><body><main class="container participation"><h1>Страница не найдена</h1><a class="text-link" href="/">На главную ↗</a></main></body></html>');
  const analytics = (await readFile('src/analytics.html', 'utf8')).trim();
  async function addAnalytics(directory) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const file = directory + '/' + entry.name;
      if (entry.isDirectory()) { await addAnalytics(file); continue; }
      if (!entry.name.endsWith('.html')) continue;
      let html = await readFile(file, 'utf8');
      if (html.includes('data-cf-beacon=')) continue;
      html = /<\/body\s*>/i.test(html)
        ? html.replace(/<\/body\s*>/i, analytics + '\n</body>')
        : html + '\n' + analytics;
      await writeFile(file, html);
    }
  }
  await addAnalytics('dist');
  console.log('Static site built in dist/ with Cloudflare Web Analytics');
}
if (process.argv[1]?.endsWith('/build.mjs')) await build();
