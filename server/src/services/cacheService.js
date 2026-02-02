class CacheService {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 30 * 60 * 1000; // 30 minutes in milliseconds
  }

  // Generate cache key
  generateKey(boardId, type = 'metrics') {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `${type}:${boardId}:${date}`;
  }

  // Set cache with TTL
  set(key, value, ttl = this.defaultTTL) {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, {
      value,
      expiresAt
    });
    console.log(`✓ Cache set: ${key} (expires in ${ttl / 1000 / 60} minutes)`);
  }

  // Get from cache
  get(key) {
    const cached = this.cache.get(key);

    if (!cached) {
      console.log(`✗ Cache miss: ${key}`);
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      console.log(`✗ Cache expired: ${key}`);
      this.cache.delete(key);
      return null;
    }

    console.log(`✓ Cache hit: ${key}`);
    return cached.value;
  }

  // Clear specific key
  clear(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`✓ Cache cleared: ${key}`);
    }
    return deleted;
  }

  // Clear all cache
  clearAll() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`✓ All cache cleared (${size} entries)`);
  }

  // Clear expired entries
  clearExpired() {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`✓ Cleared ${cleared} expired cache entries`);
    }
  }

  // Get cache stats
  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const [, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.cache.size,
      active,
      expired
    };
  }
}

export default new CacheService();
