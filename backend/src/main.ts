
import dns from 'node:dns';

const defaultLookup = dns.lookup;
const NEON_FALLBACK_IPS = ['3.147.219.177', '77.113.120.60', '77.113.7.222'];

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
      const validAddresses =
        !err && addresses && addresses.length > 0 ? addresses : NEON_FALLBACK_IPS;
      if (options && options.all) {
        return callback(
          null,
          validAddresses.map((addr) => ({ address: addr, family: 4 })),
        );
      }
      return callback(null, validAddresses[0], 4);
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
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.vercel.app') ||
        origin.includes('indiccloud') ||
        origin.includes('247cloud')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
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
