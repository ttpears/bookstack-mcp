import axios, { AxiosInstance } from 'axios';

export interface BookStackConfig {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
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

  constructor(config: BookStackConfig) {
    this.client = axios.create({
      baseURL: `${config.baseUrl}/api`,
      headers: {
        'Authorization': `Token ${config.tokenId}:${config.tokenSecret}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async searchContent(query: string, type?: string): Promise<SearchResult[]> {
    const params: any = { query };
    if (type) params.type = type;
    
    const response = await this.client.get('/search', { params });
    return response.data.data || response.data;
  }

  async getBooks(offset = 0, count = 50): Promise<ListResponse<Book>> {
    const response = await this.client.get('/books', {
      params: { offset, count }
    });
    return response.data;
  }

  async getBook(id: number): Promise<Book> {
    const response = await this.client.get(`/books/${id}`);
    return response.data;
  }

  async getPages(bookId?: number, offset = 0, count = 50): Promise<ListResponse<Page>> {
    const params: any = { offset, count };
    if (bookId) params.filter = JSON.stringify({ book_id: bookId });
    
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
    const response = await this.client.post('/pages', data);
    return response.data;
  }

  async updatePage(id: number, data: {
    name?: string;
    html?: string;
    markdown?: string;
  }): Promise<Page> {
    const response = await this.client.put(`/pages/${id}`, data);
    return response.data;
  }

  async exportPage(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext'): Promise<string> {
    const response = await this.client.get(`/pages/${id}/export/${format}`);
    return response.data;
  }
}