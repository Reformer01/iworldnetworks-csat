import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getEmailQueue } from '@/lib/queues/email-queue';
import { getRedis } from '@/lib/redis';
import { NextRequest, NextResponse } from 'next/server';

let serverAdapter: ExpressAdapter | null = null;

function getServerAdapter(): ExpressAdapter {
  if (!serverAdapter) {
    serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [new BullMQAdapter(getEmailQueue())],
      serverAdapter,
    });
  }
  return serverAdapter;
}

export async function GET(request: NextRequest) {
  const adapter = getServerAdapter();
  const router = adapter.getRouter();

  const url = new URL(request.url);
  const path = url.pathname.replace('/admin/queues', '') || '/';

  const mockReq = {
    method: 'GET',
    url: path,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
  } as any;

  const mockRes = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '' as string,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    write(data: string) {
      this.body += data;
    },
    end(data?: string) {
      if (data) this.body += data;
    },
  } as any;

  return new Promise<NextResponse>((resolve) => {
    const originalEnd = mockRes.end;
    mockRes.end = function (data?: string) {
      originalEnd.call(this, data);
      resolve(
        new NextResponse(mockRes.body, {
          status: mockRes.statusCode,
          headers: mockRes.headers,
        })
      );
    };
    router(mockReq, mockRes);
  });
}

export async function POST(request: NextRequest) {
  const adapter = getServerAdapter();
  const router = adapter.getRouter();

  const url = new URL(request.url);
  const path = url.pathname.replace('/admin/queues', '') || '/';

  const body = await request.text();

  const mockReq = {
    method: 'POST',
    url: path,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
    body,
  } as any;

  const mockRes = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '' as string,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    write(data: string) {
      this.body += data;
    },
    end(data?: string) {
      if (data) this.body += data;
    },
  } as any;

  return new Promise<NextResponse>((resolve) => {
    const originalEnd = mockRes.end;
    mockRes.end = function (data?: string) {
      originalEnd.call(this, data);
      resolve(
        new NextResponse(mockRes.body, {
          status: mockRes.statusCode,
          headers: mockRes.headers,
        })
      );
    };
    router(mockReq, mockRes);
  });
}