import {
  CanvasServiceResponseTooLargeError,
  getAssignments,
  MAX_CANVAS_SERVICE_RESPONSE_BYTES,
} from '../service';

describe('CourseWing tool-service response limits', () => {
  const originalFetch = global.fetch;
  const originalServiceKey = process.env.COURSEWING_SERVICE_KEY;

  beforeEach(() => {
    process.env.COURSEWING_SERVICE_KEY = 'coursewing-response-limit-test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (originalServiceKey == null) {
      delete process.env.COURSEWING_SERVICE_KEY;
    } else {
      process.env.COURSEWING_SERVICE_KEY = originalServiceKey;
    }
  });

  it.each([
    ['successful', 200],
    ['error', 502],
  ])(
    'rejects and cancels a %s response whose Content-Length exceeds the cap',
    async (_label, status) => {
      let cancelled = false;
      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancelled = true;
            },
          }),
          {
            status,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': String(MAX_CANVAS_SERVICE_RESPONSE_BYTES + 1),
            },
          },
        ),
      ) as unknown as typeof fetch;

      await expect(getAssignments({ tenantId: 'tenant-1' })).rejects.toMatchObject({
        name: 'CanvasServiceResponseTooLargeError',
        code: 'CANVAS_SERVICE_RESPONSE_TOO_LARGE',
        message:
          `Canvas service response exceeds the ${MAX_CANVAS_SERVICE_RESPONSE_BYTES}-byte ` +
          `safety limit (received at least ${MAX_CANVAS_SERVICE_RESPONSE_BYTES + 1} bytes)`,
      });
      expect(cancelled).toBe(true);
    },
  );

  it.each([
    ['successful', 200],
    ['error', 502],
  ])(
    'cancels a %s response as soon as its streamed body exceeds the cap',
    async (_label, status) => {
      let cancelled = false;
      let chunksEmitted = 0;
      const chunkBytes = 512 * 1024;
      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              chunksEmitted += 1;
              controller.enqueue(new Uint8Array(chunkBytes));
              if (chunksEmitted >= 20) {
                controller.close();
              }
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status, headers: { 'Content-Type': 'application/json' } },
        ),
      ) as unknown as typeof fetch;

      await expect(getAssignments({ tenantId: 'tenant-1' })).rejects.toEqual(
        expect.objectContaining({
          name: CanvasServiceResponseTooLargeError.name,
          code: 'CANVAS_SERVICE_RESPONSE_TOO_LARGE',
          message: expect.stringContaining(
            `exceeds the ${MAX_CANVAS_SERVICE_RESPONSE_BYTES}-byte safety limit`,
          ),
        }),
      );
      expect(cancelled).toBe(true);
      expect(chunksEmitted).toBeLessThan(20);
    },
  );

  it('retains a bounded service error body after streaming it', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Canvas is temporarily unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    await expect(getAssignments({ tenantId: 'tenant-1' })).rejects.toThrow(
      'CourseWing service responded 503 for /api/coursewing/assignments: ' +
        '{"error":"Canvas is temporarily unavailable"}',
    );
  });
});
