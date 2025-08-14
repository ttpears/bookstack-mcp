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
  private baseUrl: string;

  constructor(config: BookStackConfig) {
    this.enableWrite = config.enableWrite || false;
    this.baseUrl = config.baseUrl;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/api`,
      headers: {
        'Authorization': `Token ${config.tokenId}:${config.tokenSecret}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // URL generation utilities
  private generateBookUrl(book: Book): string {
    return `${this.baseUrl}/books/${book.slug || book.id}`;
  }

  private generatePageUrl(page: Page): string {
    return `${this.baseUrl}/books/${page.book_id}/page/${page.slug || page.id}`;
  }

  private generateChapterUrl(chapter: Chapter): string {
    return `${this.baseUrl}/books/${chapter.book_id}/chapter/${chapter.slug || chapter.id}`;
  }

  private generateSearchUrl(query: string): string {
    const encodedQuery = encodeURIComponent(query);
    return `${this.baseUrl}/search?term=${encodedQuery}`;
  }

  // Enhanced response helpers
  private enhanceBookResponse(book: Book): any {
    return {
      ...book,
      url: this.generateBookUrl(book),
      direct_link: `[${book.name}](${this.generateBookUrl(book)})`
    };
  }

  private enhancePageResponse(page: Page): any {
    return {
      ...page,
      url: this.generatePageUrl(page),
      direct_link: `[${page.name}](${this.generatePageUrl(page)})`
    };
  }

  private enhanceChapterResponse(chapter: Chapter): any {
    return {
      ...chapter,
      url: this.generateChapterUrl(chapter),
      direct_link: `[${chapter.name}](${this.generateChapterUrl(chapter)})`
    };
  }

  private enhanceSearchResults(results: SearchResult[], originalQuery: string): any {
    return {
      search_query: originalQuery,
      search_url: this.generateSearchUrl(originalQuery),
      results: results.map(result => ({
        ...result,
        url: this.generateContentUrl(result),
        direct_link: `[${result.name}](${this.generateContentUrl(result)})`
      }))
    };
  }

  private generateContentUrl(result: SearchResult): string {
    switch (result.type) {
      case 'page':
        return `${this.baseUrl}/books/${result.book_id}/page/${result.slug || result.id}`;
      case 'chapter':
        return `${this.baseUrl}/books/${result.book_id}/chapter/${result.slug || result.id}`;
      case 'book':
        return `${this.baseUrl}/books/${result.slug || result.id}`;
      case 'bookshelf':
        return `${this.baseUrl}/shelves/${result.slug || result.id}`;
      default:
        return `${this.baseUrl}/link/${result.id}`;
    }
  }

  async searchContent(query: string, options?: {
    type?: 'book' | 'page' | 'chapter' | 'bookshelf';
    count?: number;
    offset?: number;
  }): Promise<any> {
    let searchQuery = query;
    
    // Use advanced search syntax for type filtering
    if (options?.type) {
      searchQuery = `{type:${options.type}} ${query}`.trim();
    }
    
    const params: any = { query: searchQuery };
    if (options?.count) params.count = Math.min(options.count, 500); // BookStack max
    if (options?.offset) params.offset = options.offset;
    
    const response = await this.client.get('/search', { params });
    const results = response.data.data || response.data;
    
    return this.enhanceSearchResults(results, query);
  }

  async searchPages(query: string, options?: {
    bookId?: number;
    count?: number;
    offset?: number;
  }): Promise<any> {
    let searchQuery = `{type:page} ${query}`.trim();
    
    // Add book filtering if specified
    if (options?.bookId) {
      searchQuery = `{book_id:${options.bookId}} ${searchQuery}`;
    }
    
    const params: any = { query: searchQuery };
    if (options?.count) params.count = Math.min(options.count, 500);
    if (options?.offset) params.offset = options.offset;
    
    const response = await this.client.get('/search', { params });
    const results = response.data.data || response.data;
    
    return this.enhanceSearchResults(results, query);
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
    const data = response.data;
    
    return {
      ...data,
      data: data.data.map((book: Book) => this.enhanceBookResponse(book))
    };
  }

  async getBook(id: number): Promise<any> {
    const response = await this.client.get(`/books/${id}`);
    return this.enhanceBookResponse(response.data);
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
    const data = response.data;
    
    return {
      ...data,
      data: data.data.map((page: Page) => this.enhancePageResponse(page))
    };
  }

  async getPage(id: number): Promise<any> {
    const response = await this.client.get(`/pages/${id}`);
    return this.enhancePageResponse(response.data);
  }

  async getChapters(bookId?: number, offset = 0, count = 50): Promise<any> {
    const params: any = { offset, count };
    if (bookId) params.filter = JSON.stringify({ book_id: bookId });
    
    const response = await this.client.get('/chapters', { params });
    const data = response.data;
    
    return {
      ...data,
      data: data.data.map((chapter: Chapter) => this.enhanceChapterResponse(chapter))
    };
  }

  async getChapter(id: number): Promise<any> {
    const response = await this.client.get(`/chapters/${id}`);
    return this.enhanceChapterResponse(response.data);
  }

  async createPage(data: {
    name: string;
    html?: string;
    markdown?: string;
    book_id: number;
    chapter_id?: number;
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.post('/pages', data);
    return this.enhancePageResponse(response.data);
  }

  async updatePage(id: number, data: {
    name?: string;
    html?: string;
    markdown?: string;
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.put(`/pages/${id}`, data);
    return this.enhancePageResponse(response.data);
  }

  async exportPage(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext'): Promise<string> {
    const response = await this.client.get(`/pages/${id}/export/${format}`);
    return response.data;
  }

  async getRecentChanges(options?: {
    type?: 'all' | 'page' | 'book' | 'chapter';
    limit?: number;
    days?: number;
  }): Promise<any> {
    const limit = Math.min(options?.limit || 20, 100);
    const days = options?.days || 30;
    const type = options?.type || 'all';
    
    // Calculate date threshold
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);
    const dateFilter = dateThreshold.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Build search query for recent changes
    let searchQuery = `{updated_at:>=${dateFilter}}`;
    if (type !== 'all') {
      searchQuery = `{type:${type}} ${searchQuery}`;
    }
    
    const params = {
      query: searchQuery,
      count: limit,
      sort: 'updated_at' // Sort by most recently updated
    };
    
    const response = await this.client.get('/search', { params });
    const results = response.data.data || response.data;
    
    return {
      search_query: `Recent changes in the last ${days} days (${type})`,
      date_threshold: dateFilter,
      search_url: this.generateSearchUrl(searchQuery),
      total_found: results.length,
      results: results.map((result: SearchResult) => ({
        ...result,
        url: this.generateContentUrl(result),
        direct_link: `[${result.name}](${this.generateContentUrl(result)})`
      }))
    };
  }
}