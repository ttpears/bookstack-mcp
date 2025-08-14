import axios, { AxiosInstance } from 'axios';

export interface BookStackConfig {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  enableWrite?: boolean;
}

export interface Book {
  id: number;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
  owned_by: number;
}

export interface Page {
  id: number;
  book_id: number;
  chapter_id?: number;
  name: string;
  slug: string;
  html: string;
  markdown: string;
  text: string;
  created_at: string;
  updated_at: string;
  owned_by: number;
}

export interface Chapter {
  id: number;
  book_id: number;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
  owned_by: number;
}

export interface SearchResult {
  type: string;
  id: number;
  name: string;
  slug: string;
  book_id?: number;
  chapter_id?: number;
  preview_content?: {
    name: string;
    content: string;
  };
}

export interface ListResponse<T> {
  data: T[];
  total: number;
}

export class BookStackClient {
  private client: AxiosInstance;
  private enableWrite: boolean;

  constructor(config: BookStackConfig) {
    this.enableWrite = config.enableWrite || false;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/api`,
      headers: {
        'Authorization': `Token ${config.tokenId}:${config.tokenSecret}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async searchContent(query: string, options?: {
    type?: 'book' | 'page' | 'chapter' | 'bookshelf';
    count?: number;
    offset?: number;
  }): Promise<SearchResult[]> {
    let searchQuery = query;
    
    // Use advanced search syntax for type filtering
    if (options?.type) {
      searchQuery = `{type:${options.type}} ${query}`.trim();
    }
    
    const params: any = { query: searchQuery };
    if (options?.count) params.count = Math.min(options.count, 500); // BookStack max
    if (options?.offset) params.offset = options.offset;
    
    const response = await this.client.get('/search', { params });
    return response.data.data || response.data;
  }

  async searchPages(query: string, options?: {
    bookId?: number;
    count?: number;
    offset?: number;
  }): Promise<SearchResult[]> {
    let searchQuery = `{type:page} ${query}`.trim();
    
    // Add book filtering if specified
    if (options?.bookId) {
      searchQuery = `{book_id:${options.bookId}} ${searchQuery}`;
    }
    
    const params: any = { query: searchQuery };
    if (options?.count) params.count = Math.min(options.count, 500);
    if (options?.offset) params.offset = options.offset;
    
    const response = await this.client.get('/search', { params });
    return response.data.data || response.data;
  }

  async getBooks(options?: {
    offset?: number;
    count?: number;
    sort?: string;
    filter?: Record<string, any>;
  }): Promise<ListResponse<Book>> {
    const params: any = {
      offset: options?.offset || 0,
      count: Math.min(options?.count || 50, 500)
    };
    
    if (options?.sort) params.sort = options.sort;
    if (options?.filter) params.filter = JSON.stringify(options.filter);
    
    const response = await this.client.get('/books', { params });
    return response.data;
  }

  async getBook(id: number): Promise<Book> {
    const response = await this.client.get(`/books/${id}`);
    return response.data;
  }

  async getPages(options?: {
    bookId?: number;
    chapterId?: number;
    offset?: number;
    count?: number;
    sort?: string;
    filter?: Record<string, any>;
  }): Promise<ListResponse<Page>> {
    const params: any = {
      offset: options?.offset || 0,
      count: Math.min(options?.count || 50, 500)
    };
    
    // Build filter object
    const filter: any = { ...options?.filter };
    if (options?.bookId) filter.book_id = options.bookId;
    if (options?.chapterId) filter.chapter_id = options.chapterId;
    
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }
    
    if (options?.sort) params.sort = options.sort;
    
    const response = await this.client.get('/pages', { params });
    return response.data;
  }

  async getPage(id: number): Promise<Page> {
    const response = await this.client.get(`/pages/${id}`);
    return response.data;
  }

  async getChapters(bookId?: number, offset = 0, count = 50): Promise<ListResponse<Chapter>> {
    const params: any = { offset, count };
    if (bookId) params.filter = JSON.stringify({ book_id: bookId });
    
    const response = await this.client.get('/chapters', { params });
    return response.data;
  }

  async getChapter(id: number): Promise<Chapter> {
    const response = await this.client.get(`/chapters/${id}`);
    return response.data;
  }

  async createPage(data: {
    name: string;
    html?: string;
    markdown?: string;
    book_id: number;
    chapter_id?: number;
  }): Promise<Page> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.post('/pages', data);
    return response.data;
  }

  async updatePage(id: number, data: {
    name?: string;
    html?: string;
    markdown?: string;
  }): Promise<Page> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.put(`/pages/${id}`, data);
    return response.data;
  }

  async exportPage(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext'): Promise<string> {
    const response = await this.client.get(`/pages/${id}/export/${format}`);
    return response.data;
  }
}