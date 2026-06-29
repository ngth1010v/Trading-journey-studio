import { repository } from './strategies.repository.js';
import { Strategy, StrategyTag } from './strategies.model.js';

function isValidThemeColor(color: any): boolean {
  if (!Array.isArray(color)) return false;
  for (const item of color) {
    if (!Array.isArray(item) || item.length !== 3) return false;
    if (item.some(num => typeof num !== 'number')) return false;
  }
  return true;
}

function validateTag(tag: any): string | null {
  if (!tag.name || typeof tag.name !== 'string' || tag.name.trim() === '') {
    return "Invalid request: 'name' cannot be empty.";
  }
  if (tag.createdTimestamp === undefined || tag.createdTimestamp === null || typeof tag.createdTimestamp !== 'number') {
    return "Invalid request: 'createdTimestamp' cannot be empty and must be a number.";
  }
  if (!isValidThemeColor(tag.themeColor)) {
    return "Invalid request: 'themeColor' must be a list of [r, g, b] lists.";
  }
  return null;
}

function validateStrategy(strategy: any): string | null {
  if (!strategy.name || typeof strategy.name !== 'string' || strategy.name.trim() === '') {
    return "Invalid request: 'name' cannot be empty.";
  }
  if (strategy.createdTimestamp === undefined || strategy.createdTimestamp === null || typeof strategy.createdTimestamp !== 'number') {
    return "Invalid request: 'createdTimestamp' cannot be empty and must be a number.";
  }
  if (!isValidThemeColor(strategy.themeColor)) {
    return "Invalid request: 'themeColor' must be a list of [r, g, b] lists.";
  }
  
  // Tag cross-validation
  if (!Array.isArray(strategy.tagNames)) {
    return "Invalid request: 'tagNames' must be an array of strings.";
  }
  for (const tagName of strategy.tagNames) {
    const existingTag = repository.getTagByName(tagName);
    if (!existingTag) {
      return `Invalid request: tag '${tagName}' does not exist in tags table.`;
    }
  }

  return null;
}

export const service = {
  validateTag,
  validateStrategy
};