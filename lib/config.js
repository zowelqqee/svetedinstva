import path from 'node:path';
import config from '../src/config.json' with {type: 'json'};
export function publicUrl(file) {
  if (!file) return '';
  const relative = path.posix.normalize(file.replaceAll('\\', '/'));
  if (!relative.startsWith('public/') || relative.includes('..')) {
    throw new Error('Material paths must point to files inside public/');
  }
  return '/' + relative.slice('public/'.length).split('/').map(encodeURIComponent).join('/');
}
export function clientConfig(settings = config) {
  return {
    email: settings.email,
    maskPath: publicUrl(settings.maskPath),
    rulesPath: publicUrl(settings.rulesPath),
    maskName: settings.maskPath ? 'maska-sobora' + path.extname(settings.maskPath) : ''
  };
}
export default config;
