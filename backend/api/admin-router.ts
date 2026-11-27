import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApp } from '../dist/vercel.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  try {
    const rawPath = req.query.__adminPath;

    if (
      typeof rawPath !== 'string' ||
      !rawPath ||
      rawPath.startsWith('/') ||
      rawPath.split('/').some(
        (part) => !part || part === '.' || part === '..',
      )
    ) {
      return res.status(400).json({ message: 'Invalid admin API path' });
    }

    const incomingUrl = new URL(req.url || '/', 'http://localhost');
    incomingUrl.searchParams.delete('__adminPath');

    const query = incomingUrl.searchParams.toString();
    req.url = `/api/admin/${rawPath}${query ? `?${query}` : ''}`;

    const app = await getApp();
    const server = app.getHttpAdapter().getInstance();

    return server(req, res);
  } catch (error) {
    console.error('Vercel admin router failed:', error);
    return res.status(500).json({
      statusCode: 500,
      message: 'Admin backend initialization failed',
    });
  }
}
