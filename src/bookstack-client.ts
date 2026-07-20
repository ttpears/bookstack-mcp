import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import https from 'https';

const MAX_RETRIES_429 = 5;

function parseRetryAfter(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

// BookStack's advanced search silently ignores {created_by:X}/{updated_by:X}/{owned_by:X}
// when X isn't a numeric user ID — the query falls back to unfiltered results, which is
// a confusing footgun. Reject the bad form up front and point the caller at find_users.
function validateUserIdFilters(query: string): void {
  const re = /\{(created_by|updated_by|owned_by):([^}\s]+)\}/g;
  for (const match of query.matchAll(re)) {
    const [, field, value] = match;
    if (!/^\d+$/.test(value)) {
      throw new Error(
        `Search filter {${field}:${value}} requires a numeric user ID, not "${value}". ` +
        `Use the find_users tool to look up a user's ID by name, email, or slug.`
      );
    }
  }
}

export interface BookStackConfig {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  enableWrite?: boolean;
  insecureSkipTlsVerify?: boolean;
  /** Per-request HTTP timeout in ms. Bounds a slow/hung BookStack response so a
   *  call fails cleanly instead of hanging until the MCP client gives up. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

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

export interface User {
  id: number;
  name: string;
  slug: string;
  email?: string;
  external_auth_id?: string;
  created_at?: string;
  updated_at?: string;
  last_activity_at?: string;
  profile_url?: string;
  edit_url?: string;
  avatar_url?: string;
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

// How long a completed bulk warm stays fresh before the next lookup re-sweeps
// `/books` (books get created/renamed). Gaps within the window are handled by
// the lazy per-id fetch in getBookSlug.
const SLUG_CACHE_TTL_MS = 10 * 60 * 1000;

interface SlugCacheEntry {
  cache: Map<number, string>;
  // In-flight single-book lookups, keyed by id, so concurrent callers for the
  // same book share one request instead of stampeding BookStack.
  inflight: Map<number, Promise<string>>;
  // The in-progress bulk warm (present only while one is running), so concurrent
  // callers await one warm instead of each sweeping /books.
  warm?: Promise<void>;
  // When the last warm completed (ms); undefined until the first warm finishes.
  warmedAt?: number;
}

// Process-wide slug caches keyed by BookStack base URL. The book-id -> slug
// mapping is identical for every caller of the same BookStack instance
// regardless of which API token is used, so sharing it across the per-session
// BookStackClient instances (index.ts builds one per MCP session) turns a
// per-session bulk warm into one warm per process per TTL — far fewer /books
// calls against the single, rate-limited (180/min) shared service token.
const slugCaches: Map<string, SlugCacheEntry> = new Map();

function getSlugCacheEntry(baseUrl: string): SlugCacheEntry {
  let entry = slugCaches.get(baseUrl);
  if (!entry) {
    entry = { cache: new Map(), inflight: new Map() };
    slugCaches.set(baseUrl, entry);
  }
  return entry;
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
      timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: {
        'Authorization': `Token ${config.tokenId}:${config.tokenSecret}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: config.insecureSkipTlsVerify
        ? new https.Agent({ rejectUnauthorized: false })
        : undefined
    });

    this.client.interceptors.response.use(undefined, async (error: AxiosError) => {
      const cfg = error.config as (InternalAxiosRequestConfig & { __retry429?: number }) | undefined;
      if (!cfg || error.response?.status !== 429) throw error;
      cfg.__retry429 = (cfg.__retry429 ?? 0) + 1;
      if (cfg.__retry429 > MAX_RETRIES_429) throw error;
      const retryAfter = parseRetryAfter(error.response.headers?.['retry-after']);
      const backoff = Math.min(30000, 1000 * 2 ** (cfg.__retry429 - 1));
      const delay = retryAfter ?? backoff;
      console.error(`BookStack rate limited (429); retry ${cfg.__retry429}/${MAX_RETRIES_429} in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.client.request(cfg);
    });
  }

  private applyFilters(params: Record<string, any>, filter?: Record<string, any>): void {
    if (!filter) return;
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined || value === null) continue;
      params[`filter[${key}]`] = value;
    }
  }

  /**
   * Populate the process-wide book-slug cache from a single bulk `/books`
   * listing. Enhancing a result set resolves a slug per item; without a warm
   * cache a search whose results span (or even share) many books fires a
   * concurrent `GET /books/{id}` per item — a cache stampede that BookStack
   * rate-limits (429), and the retrying requests pile up in memory until the
   * process OOMs. The warm is shared across all client instances for this base
   * URL (see slugCaches) and re-runs at most once per SLUG_CACHE_TTL_MS, so
   * many MCP sessions cost one sweep, not one each. Concurrent callers await the
   * single in-flight warm. Failure is non-fatal: getBookSlug lazily fills gaps.
   */
  private async warmBookSlugCache(): Promise<void> {
    const entry = getSlugCacheEntry(this.baseUrl);

    // A completed warm is still fresh → nothing to do (lazy fetch covers gaps).
    if (entry.warmedAt !== undefined && Date.now() - entry.warmedAt < SLUG_CACHE_TTL_MS) {
      return;
    }
    // A warm is already running → join it instead of starting another sweep.
    if (entry.warm) return entry.warm;

    entry.warm = (async () => {
      const pageSize = 500;
      const maxPages = 20; // safety cap (10k books) — huge wikis fall back to lazy fills
      try {
        for (let page = 0; page < maxPages; page++) {
          const response = await this.client.get('/books', {
            params: { count: pageSize, offset: page * pageSize }
          });
          const books: Book[] = response.data?.data ?? [];
          for (const book of books) {
            if (book?.id != null) entry.cache.set(book.id, book.slug || String(book.id));
          }
          if (books.length < pageSize) break;
        }
      } catch {
        // Non-fatal: leave the cache partially warm; getBookSlug lazily fills gaps.
      } finally {
        // Stamp on completion (success or caught failure) so a broken BookStack
        // can't trigger a warm-storm; clear the in-flight promise so the next
        // lookup after the TTL can re-sweep.
        entry.warmedAt = Date.now();
        entry.warm = undefined;
      }
    })();
    return entry.warm;
  }

  private async getBookSlug(bookId: number): Promise<string> {
    // A single bulk warm turns the per-result N+1 into +1; after it, every book
    // that existed at warm time is a cache hit — shared across all sessions.
    await this.warmBookSlugCache();

    const entry = getSlugCacheEntry(this.baseUrl);
    const cached = entry.cache.get(bookId);
    if (cached !== undefined) return cached;

    // Gap (book created after warm, or beyond the warm cap): lazily fetch it, but
    // share one in-flight request across concurrent callers so a batch of results
    // referencing the same new book can't stampede.
    const inflight = entry.inflight.get(bookId);
    if (inflight) return inflight;

    const request = (async () => {
      try {
        const response = await this.client.get(`/books/${bookId}`);
        const slug = response.data.slug || String(bookId);
        entry.cache.set(bookId, slug);
        return slug;
      } catch (error) {
        // Fallback to ID if book fetch fails
        return String(bookId);
      } finally {
        entry.inflight.delete(bookId);
      }
    })();
    entry.inflight.set(bookId, request);
    return request;
  }

  // URL generation utilities
  private generateBookUrl(book: Book): string {
    return `${this.baseUrl}/books/${book.slug || book.id}`;
  }

  private async generatePageUrl(page: Page): Promise<string> {
    const bookSlug = await this.getBookSlug(page.book_id);
    return `${this.baseUrl}/books/${bookSlug}/page/${page.slug || page.id}`;
  }

  private async generateChapterUrl(chapter: Chapter): Promise<string> {
    const bookSlug = await this.getBookSlug(chapter.book_id);
    return `${this.baseUrl}/books/${bookSlug}/chapter/${chapter.slug || chapter.id}`;
  }

  private generateShelfUrl(shelf: Shelf): string {
    return `${this.baseUrl}/shelves/${shelf.slug || shelf.id}`;
  }

  private generateSearchUrl(query: string): string {
    const encodedQuery = encodeURIComponent(query);
    return `${this.baseUrl}/search?term=${encodedQuery}`;
  }

  // Enhanced response helpers. Each one adds only `url` on top of the raw
  // BookStack record — narrated/duplicate fields (direct_link, *_friendly,
  // content_info, summary, location, etc.) were removed to shrink the MCP
  // payload; the LLM can derive them from the raw fields when needed.
  private enhanceBookResponse(book: Book): any {
    return {
      ...book,
      url: this.generateBookUrl(book)
    };
  }

  private async enhancePageResponse(page: Page, options?: {
    format?: 'markdown' | 'html' | 'text';
    offset?: number;
    limit?: number;
  }): Promise<any> {
    const url = await this.generatePageUrl(page);

    // Pick a single content format to return to avoid 3x duplication (html + markdown + text)
    const format = options?.format ?? 'markdown';
    const fullContent: string =
      (format === 'html' ? page.html : format === 'text' ? page.text : page.markdown) || '';

    // Character-range slicing so very large pages can be paginated
    const DEFAULT_LIMIT = 50000;
    const offset = Math.max(0, options?.offset ?? 0);
    const limit = Math.max(1, options?.limit ?? DEFAULT_LIMIT);
    const totalChars = fullContent.length;
    const slice = fullContent.substring(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const truncated = nextOffset < totalChars;

    // Strip duplicate large fields from the base page object. raw_html is the
    // unprocessed editor source BookStack returns alongside html/markdown/text;
    // leaving it in would bypass the limit/offset pagination and can blow past
    // MCP token caps for large pages.
    const { html: _h, markdown: _m, text: _t, raw_html: _r, ...pageMeta } = page as any;

    return {
      ...pageMeta,
      url,
      word_count: page.text ? page.text.split(' ').length : 0,
      content_format: format,
      content_total_chars: totalChars,
      content_offset: offset,
      content_returned_chars: slice.length,
      content_truncated: truncated,
      content_next_offset: truncated ? nextOffset : null,
      content: slice
    };
  }

  private async enhanceChapterResponse(chapter: Chapter): Promise<any> {
    const url = await this.generateChapterUrl(chapter);
    return { ...chapter, url };
  }

  private enhanceShelfResponse(shelf: Shelf): any {
    return {
      ...shelf,
      url: this.generateShelfUrl(shelf),
      books: shelf.books?.map(book => this.enhanceBookResponse(book))
    };
  }

  private async enhanceSearchResults(results: SearchResult[], originalQuery: string): Promise<any> {
    const enhancedResults = await Promise.all(
      results.map(async (result) => {
        const url = await this.generateContentUrl(result);
        const preview = result.preview_content?.content;
        const out: any = { ...result, url };
        if (preview) {
          out.content_preview = preview.length > 150 ? `${preview.substring(0, 150)}...` : preview;
        }
        return out;
      })
    );

    return {
      search_query: originalQuery,
      search_url: this.generateSearchUrl(originalQuery),
      total: results.length,
      results: enhancedResults
    };
  }

  private async generateContentUrl(result: SearchResult): Promise<string> {
    switch (result.type) {
      case 'page':
        if (result.book_id) {
          const bookSlug = await this.getBookSlug(result.book_id);
          return `${this.baseUrl}/books/${bookSlug}/page/${result.slug || result.id}`;
        }
        return `${this.baseUrl}/link/${result.id}`;
      case 'chapter':
        if (result.book_id) {
          const bookSlug = await this.getBookSlug(result.book_id);
          return `${this.baseUrl}/books/${bookSlug}/chapter/${result.slug || result.id}`;
        }
        return `${this.baseUrl}/link/${result.id}`;
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
    validateUserIdFilters(query);
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

    return await this.enhanceSearchResults(results, query);
  }

  async searchPages(query: string, options?: {
    bookId?: number;
    count?: number;
    offset?: number;
  }): Promise<any> {
    validateUserIdFilters(query);
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

    return await this.enhanceSearchResults(results, query);
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
    this.applyFilters(params, options?.filter);

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

    const filter: Record<string, any> = { ...options?.filter };
    if (options?.bookId) filter.book_id = options.bookId;
    if (options?.chapterId) filter.chapter_id = options.chapterId;
    this.applyFilters(params, filter);

    if (options?.sort) params.sort = options.sort;

    const response = await this.client.get('/pages', { params });
    const data = response.data;

    return {
      ...data,
      data: await Promise.all(data.data.map((page: Page) => this.enhancePageListItem(page)))
    };
  }

  private async enhancePageListItem(page: Page): Promise<any> {
    const url = await this.generatePageUrl(page);

    // List responses from BookStack don't include html/markdown/text/raw_html, but strip
    // defensively and never embed full content here — use get_page for that.
    const { html: _h, markdown: _m, text: _t, raw_html: _r, ...pageMeta } = page as any;

    const out: any = { ...pageMeta, url };
    if (page.text) {
      out.content_preview = page.text.length > 200 ? `${page.text.substring(0, 200)}...` : page.text;
    }
    return out;
  }

  async getPage(id: number, options?: {
    format?: 'markdown' | 'html' | 'text';
    offset?: number;
    limit?: number;
  }): Promise<any> {
    const response = await this.client.get(`/pages/${id}`);
    const pageData = response.data;

    // BookStack stores either markdown or html depending on the editor used to
    // author the page. If markdown was requested but the page was authored in
    // the WYSIWYG editor, page.markdown comes back empty. Fall back to the
    // server-side HTML→markdown export so the caller still gets usable content.
    const requestedFormat = options?.format ?? 'markdown';
    if (requestedFormat === 'markdown' && !pageData.markdown) {
      try {
        const exportResponse = await this.client.get(`/pages/${id}/export/markdown`);
        if (exportResponse.data) {
          pageData.markdown = exportResponse.data;
        }
      } catch (error) {
        console.error(`Markdown export fallback failed for page ${id}:`, error);
      }
    }

    return await this.enhancePageResponse(pageData, options);
  }

  async getChapters(bookId?: number, offset = 0, count = 50): Promise<any> {
    const params: any = { offset, count };
    if (bookId) params['filter[book_id]'] = bookId;

    const response = await this.client.get('/chapters', { params });
    const data = response.data;

    return {
      ...data,
      data: await Promise.all(data.data.map((chapter: Chapter) => this.enhanceChapterResponse(chapter)))
    };
  }

  async getChapter(id: number): Promise<any> {
    const response = await this.client.get(`/chapters/${id}`);
    return await this.enhanceChapterResponse(response.data);
  }

  async createBook(data: {
    name: string;
    description?: string;
    tags?: Tag[];
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.post('/books', data);
    return this.enhanceBookResponse(response.data);
  }

  async createChapter(data: {
    book_id: number;
    name: string;
    description?: string;
    tags?: Tag[];
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.post('/chapters', data);
    return await this.enhanceChapterResponse(response.data);
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
    return await this.enhancePageResponse(response.data);
  }

  async deleteBook(id: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.delete(`/books/${id}`);
    return response.data;
  }

  async deleteChapter(id: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.delete(`/chapters/${id}`);
    return response.data;
  }

  async deletePage(id: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.delete(`/pages/${id}`);
    return response.data;
  }

  async updatePage(id: number, data: {
    name?: string;
    html?: string;
    markdown?: string;
    book_id?: number;
    chapter_id?: number;
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.put(`/pages/${id}`, data);
    return await this.enhancePageResponse(response.data);
  }

  async exportPage(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext' | 'zip'): Promise<any> {
    try {
      // For binary formats (PDF, ZIP), return BookStack web URL using slugs
      if (format === 'pdf' || format === 'zip') {
        // First fetch the page data to get slugs
        const page = await this.getPage(id);
        const book = await this.getBook(page.book_id);
        
        // Construct the correct web URL with slugs
        const directUrl = `${this.baseUrl}/books/${book.slug}/page/${page.slug}/export/${format}`;
        const filename = `${page.slug}.${format}`;
        const contentType = format === 'pdf' ? 'application/pdf' : 'application/zip';
        
        return {
          format: format,
          filename: filename,
          download_url: directUrl,
          content_type: contentType,
          export_success: true,
          page_id: id,
          page_name: page.name,
          book_name: book.name,
          direct_download: true,
          note: "This is a direct link to BookStack's web export. You may need to be logged in to BookStack to access it."
        };
      } else {
        // For text formats, fetch the content via API
        console.error(`Exporting page ${id} as ${format}...`);
        const response = await this.client.get(`/pages/${id}/export/${format}`);
        console.error(`Export response status: ${response.status}`);
        
        // For text formats, validate and return as string
        if (!response.data) {
          throw new Error(`Empty ${format} content returned from BookStack API`);
        }
        
        console.error(`Text export length: ${response.data.length} characters`);
        return response.data;
      }
    } catch (error) {
      console.error(`Export error for page ${id}:`, error);
      throw new Error(`Failed to export page ${id} as ${format}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async exportBook(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext' | 'zip'): Promise<any> {
    // For binary formats (PDF, ZIP), return BookStack web URL using slug
    if (format === 'pdf' || format === 'zip') {
      // First fetch the book data to get slug
      const book = await this.getBook(id);
      
      // Construct the correct web URL with slug
      const directUrl = `${this.baseUrl}/books/${book.slug}/export/${format}`;
      const filename = `${book.slug}.${format}`;
      const contentType = format === 'pdf' ? 'application/pdf' : 'application/zip';
      
      return {
        format: format,
        filename: filename,
        download_url: directUrl,
        content_type: contentType,
        export_success: true,
        book_id: id,
        book_name: book.name,
        direct_download: true,
        note: "This is a direct link to BookStack's web export. You may need to be logged in to BookStack to access it."
      };
    }
    
    // For text formats, fetch the content via API
    const response = await this.client.get(`/books/${id}/export/${format}`);
    return response.data;
  }

  async exportChapter(id: number, format: 'html' | 'pdf' | 'markdown' | 'plaintext' | 'zip'): Promise<any> {
    // For binary formats (PDF, ZIP), return BookStack web URL using slugs
    if (format === 'pdf' || format === 'zip') {
      // First fetch the chapter data to get slugs
      const chapter = await this.getChapter(id);
      const book = await this.getBook(chapter.book_id);
      
      // Construct the correct web URL with both book and chapter slugs
      const directUrl = `${this.baseUrl}/books/${book.slug}/chapter/${chapter.slug}/export/${format}`;
      const filename = `${chapter.slug}.${format}`;
      const contentType = format === 'pdf' ? 'application/pdf' : 'application/zip';
      
      return {
        format: format,
        filename: filename,
        download_url: directUrl,
        content_type: contentType,
        export_success: true,
        chapter_id: id,
        chapter_name: chapter.name,
        book_name: book.name,
        direct_download: true,
        note: "This is a direct link to BookStack's web export. You may need to be logged in to BookStack to access it."
      };
    }
    
    // For text formats, fetch the content via API
    const response = await this.client.get(`/chapters/${id}/export/${format}`);
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

    // Use the search response data as-is — callers fetch full details via
    // get_page/get_book/get_chapter if needed. URL enhancement resolves a book
    // slug per item, but getBookSlug bulk-warms its cache once, so this is +1
    // request, not the per-item N+1 it would otherwise be.
    const enhancedResults = await Promise.all(
      results.map(async (result: SearchResult) => {
        const url = await this.generateContentUrl(result);
        const preview = result.preview_content?.content;
        const out: any = { ...result, url };
        if (preview) {
          out.content_preview = preview.length > 200 ? `${preview.substring(0, 200)}...` : preview;
        }
        return out;
      })
    );

    return {
      date_threshold: dateFilter,
      type,
      total: results.length,
      results: enhancedResults
    };
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
    this.applyFilters(params, options?.filter);

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
    this.applyFilters(params, options?.filter);

    const response = await this.client.get('/attachments', { params });
    const data = response.data;
    
    return {
      ...data,
      data: data.data.map((attachment: Attachment) => ({
        ...attachment,
        download_url: `${this.baseUrl}/attachments/${attachment.id}`
      }))
    };
  }

  async getAttachment(id: number): Promise<any> {
    const response = await this.client.get(`/attachments/${id}`);
    const attachment = response.data;
    return {
      ...attachment,
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
      download_url: `${this.baseUrl}/attachments/${attachment.id}`
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
      download_url: `${this.baseUrl}/attachments/${attachment.id}`
    };
  }

  async deleteAttachment(id: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.delete(`/attachments/${id}`);
    return response.data;
  }

  // Comments (BookStack v25.11+)
  async getComments(options?: {
    pageId?: number;
    offset?: number;
    count?: number;
    sort?: string;
  }): Promise<any> {
    const params: any = {
      offset: options?.offset || 0,
      count: Math.min(options?.count || 50, 500)
    };
    if (options?.pageId) params['filter[commentable_id]'] = options.pageId;
    if (options?.sort) params.sort = options.sort;

    const response = await this.client.get('/comments', { params });
    return response.data;
  }

  async getComment(id: number): Promise<any> {
    const response = await this.client.get(`/comments/${id}`);
    return response.data;
  }

  async createComment(data: {
    page_id: number;
    html: string;
    parent_id?: number;
    content_ref?: string;
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.post('/comments', data);
    return response.data;
  }

  async updateComment(id: number, data: {
    html?: string;
    archived?: boolean;
  }): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.put(`/comments/${id}`, data);
    return response.data;
  }

  async deleteComment(id: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.delete(`/comments/${id}`);
    return response.data;
  }

  // Recycle Bin
  async getRecycleBin(options?: {
    offset?: number;
    count?: number;
    sort?: string;
  }): Promise<any> {
    const params: any = {
      offset: options?.offset || 0,
      count: Math.min(options?.count || 50, 500)
    };
    if (options?.sort) params.sort = options.sort;

    const response = await this.client.get('/recycle-bin', { params });
    return response.data;
  }

  async restoreFromRecycleBin(deletionId: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.put(`/recycle-bin/${deletionId}`);
    return response.data;
  }

  async destroyFromRecycleBin(deletionId: number): Promise<any> {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set BOOKSTACK_ENABLE_WRITE=true to enable.');
    }
    const response = await this.client.delete(`/recycle-bin/${deletionId}`);
    return response.data;
  }

  // Users
  async getUsers(options?: {
    offset?: number;
    count?: number;
    sort?: string;
    filter?: Record<string, any>;
  }): Promise<ListResponse<User>> {
    const params: any = {
      offset: options?.offset || 0,
      count: Math.min(options?.count || 50, 500)
    };
    if (options?.sort) params.sort = options.sort;
    this.applyFilters(params, options?.filter);

    const response = await this.client.get('/users', { params });
    return response.data;
  }
}