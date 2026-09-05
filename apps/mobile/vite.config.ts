import { createBaseAppConfig } from '@opendraw/config-theme/vite-base';

export default createBaseAppConfig({
  mode: 'mobile',
  port: 5174,
  outDir: 'dist',
  // dev.ts orchestrace přepisuje cíl /api proxy přes API_TARGET
  // (default v createBaseAppConfig: http://localhost:3001).
  apiTarget: process.env.API_TARGET || undefined,
});
