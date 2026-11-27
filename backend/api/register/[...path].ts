import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApp } from '../../dist/vercel.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();
    const server = app.getHttpAdapter().getInstance();
    return server(req, res);
  } catch (error) {
    console.error('Registration API initialization failed:', error);
    return res.status(500).json({
      statusCode: 500,
      message: 'Backend initialization failed',
    });
  }
}
