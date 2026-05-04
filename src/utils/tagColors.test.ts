import { describe, it, expect } from 'vitest';
import { getTagColor, getTodayStr, TAG_COLORS } from '../utils/tagColors';

describe('tagColors utils', () => {
  describe('getTagColor', () => {
    it('should return a valid TAG_COLORS entry', () => {
      const color = getTagColor('work');
      expect(TAG_COLORS).toContain(color);
    });

    it('should return consistent color for same tag', () => {
      const color1 = getTagColor('test');
      const color2 = getTagColor('test');
      expect(color1).toBe(color2);
    });

    it('should distribute different tags across colors', () => {
      const colors = new Set([
        getTagColor('apple'),
        getTagColor('banana'),
        getTagColor('cherry'),
        getTagColor('date'),
        getTagColor('elderberry'),
      ]);
      // At least some variation expected
      expect(colors.size).toBeGreaterThan(1);
    });
  });

  describe('getTodayStr', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const today = getTodayStr();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return a valid date string', () => {
      const today = getTodayStr();
      const date = new Date(today);
      expect(date).toBeInstanceOf(Date);
      expect(isNaN(date.getTime())).toBe(false);
    });
  });
});
