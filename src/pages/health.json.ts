import type { APIRoute } from 'astro';

// 静态站点：prerender 在 build 时执行一次，输出固定 JSON。
// health 反映部署状态 + build 时间（无 Workers runtime，不做动态探活）。
export const prerender = true;

const buildTime = new Date().toISOString();

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      service: 'daily-book',
      buildTime,
      version: '0.0.1',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
};
