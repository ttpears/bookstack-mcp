import { test } from 'node:test';
import assert from 'node:assert';
import { BookStackClient } from '../src/bookstack-client.js';

// Simple mock for Axios
const createMockAxios = (responses: Record<string, any>) => {
  return {
    get: async (url: string, config?: any) => {
      // Simple matching logic
      for (const [key, value] of Object.entries(responses)) {
        if (url.includes(key)) {
            if (value instanceof Error) throw value;
            return { data: value };
        }
      }
      return { data: {} };
    },
    post: async (url: string, data?: any) => {
      return { data: { id: 1, ...data } };
    },
    put: async (url: string, data?: any) => {
        return { data: { id: 1, ...data } };
    },
    delete: async (url: string) => {
        return { data: { success: true } };
    },
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: () => {} }, response: { use: () => {} } },
    create: () => createMockAxios(responses)
  } as any;
};

test('BookStackClient - getBooks', async (t) => {
  const mockData = {
    data: [
      { id: 1, name: 'Test Book', slug: 'test-book', description: 'Desc', created_at: '2023-01-01', updated_at: '2023-01-01' }
    ],
    total: 1
  };

  const mockAxios = createMockAxios({
    '/books': mockData
  });

  const client = new BookStackClient({
    baseUrl: 'http://test.com',
    tokenId: 'token',
    tokenSecret: 'secret'
  }, mockAxios);

  const result = await client.getBooks();
  assert.strictEqual(result.data.length, 1);
  assert.strictEqual(result.data[0].name, 'Test Book');
  assert.ok(result.data[0].url); // Check if enhanced
});

test('BookStackClient - getBook', async (t) => {
    const mockData = { id: 1, name: 'Test Book', slug: 'test-book', description: 'Desc', created_at: '2023-01-01', updated_at: '2023-01-01' };
  
    const mockAxios = createMockAxios({
      '/books/1': mockData
    });
  
    const client = new BookStackClient({
      baseUrl: 'http://test.com',
      tokenId: 'token',
      tokenSecret: 'secret'
    }, mockAxios);
  
    const result = await client.getBook(1);
    assert.strictEqual(result.name, 'Test Book');
    assert.ok(result.direct_link);
});

test('BookStackClient - Write operations disabled', async (t) => {
    const client = new BookStackClient({
        baseUrl: 'http://test.com',
        tokenId: 'token',
        tokenSecret: 'secret',
        enableWrite: false
    });

    await assert.rejects(async () => {
        await client.createPage({ name: 'Test', book_id: 1 });
    }, /Write operations are disabled/);
});

test('BookStackClient - API Error Handling', async (t) => {
    const mockError = new Error('Not Found');
    (mockError as any).response = { status: 404, data: { error: { message: 'Book not found' } } };
    (mockError as any).isAxiosError = true; // Mock axios error check if needed, but our mock implementation throws it directly

    // We need to mock axios.isAxiosError since we use it in handleError
    // But since we can't easily mock the static method on the imported axios module,
    // we'll rely on the fallback error handling or we'd need to mock the module itself.
    // However, our handleError checks axios.isAxiosError(error).
    // Since we are running in node environment where we can't easily mock module exports without a loader,
    // let's just test the generic error fallback or try to simulate an axios error structure that might pass if isAxiosError was just checking properties (which it isn't, it checks prototype/flag).
    
    // Actually, since we can't mock axios.isAxiosError easily here without a proper test runner setup,
    // we will test the generic error path which is also valuable.
    
    const mockAxios = createMockAxios({
        '/books/999': new Error('Network Error')
    });

    const client = new BookStackClient({
        baseUrl: 'http://test.com',
        tokenId: 'token',
        tokenSecret: 'secret'
    }, mockAxios);

    await assert.rejects(async () => {
        await client.getBook(999);
    }, /BookStack Error \(getBook:999\): Network Error/);
});
