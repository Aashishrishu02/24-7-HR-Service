
import dns from 'node:dns';

const defaultLookup = dns.lookup;
// Override DNS lookup for neon.tech domains to prevent local ISP RCODE_REFUSED errors
(dns as any).lookup = (hostname: string, options: any, callback: any) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (hostname && hostname.includes('neon.tech')) {
    const resolver = new dns.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    return resolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        return defaultLookup(hostname, options, callback);
      }
      if (options && options.all) {
        return callback(null, addresses.map((addr) => ({ address: addr, family: 4 })));
      }
      return callback(null, addresses[0], 4);
    });
  }
  return defaultLookup(hostname, options, callback);
};

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // API global prefix
  app.setGlobalPrefix('api');

  // CORS configuration for Vite frontend
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://indiccloud.vercel.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;

  await app.listen(port);

  console.log(`24/7 backend running on port ${port}`);
}

await bootstrap();
