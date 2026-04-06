import { describe, it, expect } from 'vitest';
import { emailSchema, passwordSchema, uuidSchema, paginationSchema } from '../../src/utils/validation.js';

describe('Validation schemas', () => {
  describe('emailSchema', () => {
    it('should accept valid emails', () => {
      expect(emailSchema.parse('user@example.com')).toBe('user@example.com');
      expect(emailSchema.parse('a.b+c@test.co.uk')).toBe('a.b+c@test.co.uk');
    });

    it('should reject invalid emails', () => {
      expect(() => emailSchema.parse('')).toThrow();
      expect(() => emailSchema.parse('not-an-email')).toThrow();
      expect(() => emailSchema.parse('@example.com')).toThrow();
    });

    it('should reject too-long emails', () => {
      expect(() => emailSchema.parse('a'.repeat(250) + '@b.com')).toThrow();
    });
  });

  describe('passwordSchema', () => {
    it('should accept valid passwords', () => {
      expect(passwordSchema.parse('12345678')).toBe('12345678');
      expect(passwordSchema.parse('a'.repeat(100))).toBe('a'.repeat(100));
    });

    it('should reject short passwords', () => {
      expect(() => passwordSchema.parse('1234567')).toThrow();
    });

    it('should reject too-long passwords', () => {
      expect(() => passwordSchema.parse('a'.repeat(101))).toThrow();
    });
  });

  describe('uuidSchema', () => {
    it('should accept valid UUIDs', () => {
      expect(uuidSchema.parse('550e8400-e29b-41d4-a716-446655440000')).toBeTruthy();
    });

    it('should reject invalid UUIDs', () => {
      expect(() => uuidSchema.parse('not-a-uuid')).toThrow();
      expect(() => uuidSchema.parse('')).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('should apply defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should parse valid values', () => {
      const result = paginationSchema.parse({ page: '3', limit: '25' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
    });

    it('should reject out-of-range limit', () => {
      expect(() => paginationSchema.parse({ limit: '0' })).toThrow();
      expect(() => paginationSchema.parse({ limit: '201' })).toThrow();
    });

    it('should reject non-positive page', () => {
      expect(() => paginationSchema.parse({ page: '0' })).toThrow();
    });
  });
});
