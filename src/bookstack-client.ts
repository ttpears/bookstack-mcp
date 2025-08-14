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

export interface Shelf {
  id: number;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
  owned_by: number;
  books: Book[];
  tags: Tag[];
}

export interface Tag {
  name: string;
  value: string;
}

export interface Attachment {
  id: number;
  name: string;
  extension: string;
  uploaded_to: number;
  external: boolean;
  order: number;
  created_at: string;
  updated_at: string;
  created_by: number;
  updated_by: number;
  links?: {
    html: string;
    markdown: string;
  };
}

export interface SearchResult {
  type: string;
  id: number;
  name: string;
  slug: string;
  book_id?: number;
  chapter_id?: number;
  created_at?: string;
  updated_at?: string;
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

  private generateShelfUrl(shelf: Shelf): string {
    return `${this.baseUrl}/shelves/${shelf.slug || shelf.id}`;
  }

  private generateSearchUrl(query: string): string {
    const encodedQuery = encodeURIComponent(query);
    return `${this.baseUrl}/search?term=${encodedQuery}`;
  }

  // Enhanced response helpers
  private enhanceBookResponse(book: Book): any {
    const lastUpdated = this.formatDate(book.updated_at);
    const created = this.formatDate(book.created_at);
    
    return {
      ...book,
      url: this.generateBookUrl(book),
      direct_link: `[${book.name}](${this.generateBookUrl(book)})`,
      last_updated_friendly: lastUpdated,
      created_friendly: created,
      summary: book.description ? `${book.description.substring(0, 100)}${book.description.length > 100 ? '...' : ''}` : 'No description available',
      content_info: `Book created ${created}, last updated ${lastUpdated}`
    };
  }

  private enhancePageResponse(page: Page): any {
    const lastUpdated = this.formatDate(page.updated_at);
    const created = this.formatDate(page.created_at);
    const contentPreview = page.text ? `${page.text.substring(0, 200)}${page.text.length > 200 ? '...' : ''}` : 'No content preview available';
    
    return {
      ...page,
      url: this.generatePageUrl(page),
      direct_link: `[${page.name}](${this.generatePageUrl(page)})`,
      last_updated_friendly: lastUpdated,
      created_friendly: created,
      content_preview: contentPreview,
      content_info: `Page created ${created}, last updated ${lastUpdated}`,
      word_count: page.text ? page.text.split(' ').length : 0,
      location: `Book ID ${page.book_id}${page.chapter_id ? `, Chapter ID ${page.chapter_id}` : ''}`
    };
  }

  private enhanceChapterResponse(chapter: Chapter): any {
    const lastUpdated = this.formatDate(chapter.updated_at);
    const created = this.formatDate(chapter.created_at);
    
    return {
      ...chapter,
      url: this.generateChapterUrl(chapter),
      direct_link: `[${chapter.name}](${this.generateChapterUrl(chapter)})`,
      last_updated_friendly: lastUpdated,
      created_friendly: created,
      summary: chapter.description ? `${chapter.description.substring(0, 100)}${chapter.description.length > 100 ? '...' : ''}` : 'No description available',
      content_info: `Chapter created ${created}, last updated ${lastUpdated}`,
      location: `In Book ID ${chapter.book_id}`
    };
  }

  private enhanceShelfResponse(shelf: Shelf): any {
    const lastUpdated = this.formatDate(shelf.updated_at);
    const created = this.formatDate(shelf.created_at);
    const bookCount = shelf.books?.length || 0;
    
    return {
      ...shelf,
      url: this.generateShelfUrl(shelf),
      direct_link: `[${shelf.name}](${this.generateShelfUrl(shelf)})`,
      last_updated_friendly: lastUpdated,
      created_friendly: created,
      summary: shelf.description ? `${shelf.description.substring(0, 100)}${shelf.description.length > 100 ? '...' : ''}` : 'No description available',
      content_info: `Shelf with ${bookCount} book${bookCount !== 1 ? 's' : ''}, created ${created}, last updated ${lastUpdated}`,
      book_count: bookCount,
      books: shelf.books?.map(book => this.enhanceBookResponse(book)),
      tags_summary: shelf.tags?.length ? `Tagged with: ${shelf.tags.map(t => `${t.name}${t.value ? `=${t.value}` : ''}`).join(', ')}` : 'No tags'
    };
  }

  private enhanceSearchResults(results: SearchResult[], originalQuery: string): any {
    return {
      search_query: originalQuery,
      search_url: this.generateSearchUrl(originalQuery),
      summary: `Found ${results.length} results for "${originalQuery}"`,
      results: results.map(result => ({
        ...result,
        url: this.generateContentUrl(result),
        direct_link: `[${result.name}](${this.generateContentUrl(result)})`,
        content_preview: result.preview_content?.content ? `${result.preview_content.content.substring(0, 150)}${result.preview_content.content.length > 150 ? '...' : ''}` : 'No preview available',
        content_type: result.type.charAt(0).toUpperCase() + result.type.slice(1),
        location_info: result.book_id ? `In book ID ${result.book_id}${result.chapter_id ? `, chapter ID ${result.chapter_id}` : ''}` : 'Location unknown'
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
      case 'shelf':
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

  async exportPage(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext' | 'zip'): Promise<any> {
    try {
      const config: any = {};
      
      // For binary formats (PDF, ZIP), we need to handle them differently
      if (format === 'pdf' || format === 'zip') {
        config.responseType = 'arraybuffer';
      }
      
      console.error(`Exporting page ${id} as ${format}...`);
      const response = await this.client.get(`/pages/${id}/export/${format}`, config);
      console.error(`Export response status: ${response.status}`);
      
      // For binary formats, return base64 encoded data with metadata
      if (format === 'pdf' || format === 'zip') {
        if (!response.data || response.data.byteLength === 0) {
          throw new Error(`Empty ${format} file returned from BookStack API`);
        }
        
        const buffer = Buffer.from(response.data);
        console.error(`PDF/ZIP buffer size: ${buffer.length} bytes`);
        
        return {
          format: format,
          filename: `page-${id}.${format}`,
          size_bytes: buffer.length,
          content_base64: buffer.toString('base64'),
          download_note: 'Binary content encoded as base64. Save and decode to access the file.',
          content_type: format === 'pdf' ? 'application/pdf' : 'application/zip',
          export_success: true,
          page_id: id
        };
      }
      
      // For text formats, validate and return as string
      if (!response.data) {
        throw new Error(`Empty ${format} content returned from BookStack API`);
      }
      
      console.error(`Text export length: ${response.data.length} characters`);
      return response.data;
      
    } catch (error) {
      console.error(`Export error for page ${id}:`, error);
      throw new Error(`Failed to export page ${id} as ${format}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async exportBook(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext' | 'zip'): Promise<any> {
    const config: any = {};
    
    // For binary formats (PDF, ZIP), we need to handle them differently
    if (format === 'pdf' || format === 'zip') {
      config.responseType = 'arraybuffer';
    }
    
    const response = await this.client.get(`/books/${id}/export/${format}`, config);
    
    // For binary formats, return base64 encoded data with metadata
    if (format === 'pdf' || format === 'zip') {
      const buffer = Buffer.from(response.data);
      return {
        format: format,
        filename: `book-${id}.${format}`,
        size_bytes: buffer.length,
        content_base64: buffer.toString('base64'),
        download_note: 'Binary content encoded as base64. Save and decode to access the file.',
        content_type: format === 'pdf' ? 'application/pdf' : 'application/zip'
      };
    }
    
    // For text formats, return as string
    return response.data;
  }

  async exportChapter(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext' | 'zip'): Promise<any> {
    const config: any = {};
    
    // For binary formats (PDF, ZIP), we need to handle them differently
    if (format === 'pdf' || format === 'zip') {
      config.responseType = 'arraybuffer';
    }
    
    const response = await this.client.get(`/chapters/${id}/export/${format}`, config);
    
    // For binary formats, return base64 encoded data with metadata
    if (format === 'pdf' || format === 'zip') {
      const buffer = Buffer.from(response.data);
      return {
        format: format,
        filename: `chapter-${id}.${format}`,
        size_bytes: buffer.length,
        content_base64: buffer.toString('base64'),
        download_note: 'Binary content encoded as base64. Save and decode to access the file.',
        content_type: format === 'pdf' ? 'application/pdf' : 'application/zip'
      };
    }
    
    // For text formats, return as string
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
    
    // Enhance results with additional context
    const enhancedResults = await Promise.all(
      results.map(async (result: SearchResult) => {
        let contextualInfo = '';
        let contentPreview = result.preview_content?.content || '';
        
        try {
          // Get additional context based on content type
          if (result.type === 'page' && result.id) {
            const fullPage = await this.client.get(`/pages/${result.id}`);
            const pageData = fullPage.data;
            contentPreview = pageData.text?.substring(0, 200) || contentPreview;
            contextualInfo = `Updated in book: ${pageData.book?.name || 'Unknown Book'}`;
            if (pageData.chapter) {
              contextualInfo += `, chapter: ${pageData.chapter.name}`;
            }
          } else if (result.type === 'book' && result.id) {
            const fullBook = await this.client.get(`/books/${result.id}`);
            const bookData = fullBook.data;
            contentPreview = bookData.description?.substring(0, 200) || 'No description available';
            contextualInfo = `Book with ${bookData.page_count || 0} pages`;
          } else if (result.type === 'chapter' && result.id) {
            const fullChapter = await this.client.get(`/chapters/${result.id}`);
            const chapterData = fullChapter.data;
            contentPreview = chapterData.description?.substring(0, 200) || 'No description available';
            contextualInfo = `Chapter in book: ${chapterData.book?.name || 'Unknown Book'}`;
          }
        } catch (error) {
          // If we can't get additional context, use what we have
          contextualInfo = `${result.type.charAt(0).toUpperCase() + result.type.slice(1)} content`;
        }

        return {
          ...result,
          url: this.generateContentUrl(result),
          direct_link: `[${result.name}](${this.generateContentUrl(result)})`,
          content_preview: contentPreview ? `${contentPreview}${contentPreview.length >= 200 ? '...' : ''}` : 'No preview available',
          contextual_info: contextualInfo,
          last_updated: this.formatDate(result.updated_at || result.created_at || ''),
          change_summary: `${result.type === 'page' ? 'Page' : result.type === 'book' ? 'Book' : 'Chapter'} "${result.name}" was updated`
        };
      })
    );
    
    return {
      search_query: `Recent changes in the last ${days} days (${type})`,
      date_threshold: dateFilter,
      search_url: this.generateSearchUrl(searchQuery),
      total_found: results.length,
      summary: `Found ${results.length} items updated in the last ${days} days${type !== 'all' ? ` (${type}s only)` : ''}`,
      results: enhancedResults
    };
  }

  private formatDate(dateString: string): string {
    if (!dateString) return 'Unknown date';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Less than an hour ago';
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} days ago`;
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) return `${diffInWeeks} weeks ago`;
    
    return date.toLocaleDateString();
  }

  // Shelves (Book Collections) Management
  async getShelves(options?: {
    offset?: number;
    count?: number;
    sort?: string;
    filter?: Record<string, any>;
  }): Promise<ListResponse<Shelf>> {
    const params: any = {
      offset: options?.offset || 0,
      count: Math.min(options?.count || 50, 500)
    };
    
    if (options?.sort) params.sort = options.sort;
    if (options?.filter) params.filter = JSON.stringify(options.filter);
    
    const response = await this.client.get('/shelves', { params });
    const data = response.data;
    
    return {
      ...data,
      data: data.data.map((shelf: Shelf) => this.enhanceShelfResponse(shelf))
    };
  }

  async getShelf(id: number): Promise<any> {
    const response = await this.client.get(`/shelves/${id}`);
    return this.enhanceShelfResponse(response.data);
  }

  async createShelf(data: {
    name: string;
    description?: string;
    books?: number[];
    tags?: Tag[];
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.post('/shelves', data);
    return this.enhanceShelfResponse(response.data);
  }

  async updateShelf(id: number, data: {
    name?: string;
    description?: string;
    books?: number[];
    tags?: Tag[];
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.put(`/shelves/${id}`, data);
    return this.enhanceShelfResponse(response.data);
  }

  async deleteShelf(id: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.delete(`/shelves/${id}`);
    return response.data;
  }

  // Attachments Management
  async getAttachments(options?: {
    offset?: number;
    count?: number;
    sort?: string;
    filter?: Record<string, any>;
  }): Promise<ListResponse<Attachment>> {
    const params: any = {
      offset: options?.offset || 0,
      count: Math.min(options?.count || 50, 500)
    };
    
    if (options?.sort) params.sort = options.sort;
    if (options?.filter) params.filter = JSON.stringify(options.filter);
    
    const response = await this.client.get('/attachments', { params });
    const data = response.data;
    
    return {
      ...data,
      data: data.data.map((attachment: Attachment) => ({
        ...attachment,
        page_url: `${this.baseUrl}/books/${Math.floor(attachment.uploaded_to / 1000)}/page/${attachment.uploaded_to}`,
        direct_link: `[${attachment.name}](${this.baseUrl}/attachments/${attachment.id})`
      }))
    };
  }

  async getAttachment(id: number): Promise<any> {
    const response = await this.client.get(`/attachments/${id}`);
    const attachment = response.data;
    
    return {
      ...attachment,
      page_url: `${this.baseUrl}/books/${Math.floor(attachment.uploaded_to / 1000)}/page/${attachment.uploaded_to}`,
      direct_link: `[${attachment.name}](${this.baseUrl}/attachments/${attachment.id})`,
      download_url: `${this.baseUrl}/attachments/${attachment.id}`
    };
  }

  async createAttachment(data: {
    uploaded_to: number;
    name: string;
    link?: string;
    // Note: File uploads would require multipart/form-data which is complex via this interface
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.post('/attachments', data);
    const attachment = response.data;
    
    return {
      ...attachment,
      page_url: `${this.baseUrl}/books/${Math.floor(attachment.uploaded_to / 1000)}/page/${attachment.uploaded_to}`,
      direct_link: `[${attachment.name}](${this.baseUrl}/attachments/${attachment.id})`
    };
  }

  async updateAttachment(id: number, data: {
    name?: string;
    link?: string;
    uploaded_to?: number;
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.put(`/attachments/${id}`, data);
    const attachment = response.data;
    
    return {
      ...attachment,
      page_url: `${this.baseUrl}/books/${Math.floor(attachment.uploaded_to / 1000)}/page/${attachment.uploaded_to}`,
      direct_link: `[${attachment.name}](${this.baseUrl}/attachments/${attachment.id})`
    };
  }

  async deleteAttachment(id: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.delete(`/attachments/${id}`);
    return response.data;
  }
}