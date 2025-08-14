import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface CachedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
  filePath: string;
}

export class FileCache {
  private cacheDir: string;
  private cache: Map<string, CachedFile> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private cacheDurationMinutes: number;

  constructor(cacheDir: string = './cache', cacheDurationMinutes: number = 10) {
    this.cacheDir = path.resolve(cacheDir);
    this.cacheDurationMinutes = cacheDurationMinutes;
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Start cleanup interval (every minute)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredFiles();
    }, 60 * 1000);

    console.error(`File cache initialized: ${this.cacheDir} (${cacheDurationMinutes} min expiry)`);
  }

  /**
   * Store binary data in cache and return download info
   */
  async cacheFile(
    data: Buffer, 
    originalFilename: string, 
    mimeType: string
  ): Promise<{ id: string; downloadUrl: string; expiresAt: Date }> {
    const fileId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (this.cacheDurationMinutes * 60 * 1000));
    
    // Generate safe filename
    const extension = path.extname(originalFilename);
    const safeFilename = `${fileId}${extension}`;
    const filePath = path.join(this.cacheDir, safeFilename);

    // Write file to cache
    await fs.promises.writeFile(filePath, data);

    const cachedFile: CachedFile = {
      id: fileId,
      filename: originalFilename,
      mimeType,
      size: data.length,
      createdAt: now,
      expiresAt,
      filePath
    };

    this.cache.set(fileId, cachedFile);

    console.error(`Cached file: ${originalFilename} (${(data.length / 1024).toFixed(1)} KB) - expires at ${expiresAt.toISOString()}`);

    return {
      id: fileId,
      downloadUrl: `/download/${fileId}`,
      expiresAt
    };
  }

  /**
   * Retrieve cached file info
   */
  getCachedFile(id: string): CachedFile | null {
    const cachedFile = this.cache.get(id);
    
    if (!cachedFile) {
      return null;
    }

    // Check if expired
    if (new Date() > cachedFile.expiresAt) {
      this.removeCachedFile(id);
      return null;
    }

    return cachedFile;
  }

  /**
   * Get cached file data for download
   */
  async getCachedFileData(id: string): Promise<{ data: Buffer; file: CachedFile } | null> {
    const cachedFile = this.getCachedFile(id);
    
    if (!cachedFile) {
      return null;
    }

    try {
      const data = await fs.promises.readFile(cachedFile.filePath);
      return { data, file: cachedFile };
    } catch (error) {
      console.error(`Error reading cached file ${id}:`, error);
      this.removeCachedFile(id);
      return null;
    }
  }

  /**
   * Remove a specific cached file
   */
  private removeCachedFile(id: string): void {
    const cachedFile = this.cache.get(id);
    if (cachedFile) {
      try {
        if (fs.existsSync(cachedFile.filePath)) {
          fs.unlinkSync(cachedFile.filePath);
        }
      } catch (error) {
        console.error(`Error removing cached file ${id}:`, error);
      }
      this.cache.delete(id);
    }
  }

  /**
   * Clean up expired files
   */
  private cleanupExpiredFiles(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [id, cachedFile] of this.cache.entries()) {
      if (now > cachedFile.expiresAt) {
        this.removeCachedFile(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.error(`Cleaned up ${cleanedCount} expired cached files`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { totalFiles: number; totalSize: number; cacheDurationMinutes: number } {
    const now = new Date();
    let totalSize = 0;
    let activeFiles = 0;

    for (const cachedFile of this.cache.values()) {
      if (now <= cachedFile.expiresAt) {
        activeFiles++;
        totalSize += cachedFile.size;
      }
    }

    return {
      totalFiles: activeFiles,
      totalSize,
      cacheDurationMinutes: this.cacheDurationMinutes
    };
  }

  /**
   * Update cache duration (for runtime configuration)
   */
  setCacheDuration(minutes: number): void {
    this.cacheDurationMinutes = minutes;
    console.error(`Cache duration updated to ${minutes} minutes`);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Clean up all files
    for (const id of this.cache.keys()) {
      this.removeCachedFile(id);
    }
  }
}