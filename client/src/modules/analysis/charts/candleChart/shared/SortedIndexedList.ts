interface BaseObject {
  id: string | number;
  [key: string]: any;
}

export interface TimestampObject extends BaseObject {
  timestamp: number;
}

export interface PriceObject extends BaseObject {
  price: number;
}

abstract class BaseSortedIndexedList<T extends BaseObject> {
  protected items: T[] = [];
  protected idMap = new Map<string | number, T>();

  protected abstract getSortValue(item: T): number;

  constructor(initialItems: T[] = []) {
    this.items = [...initialItems].sort(
      (a, b) => this.getSortValue(a) - this.getSortValue(b)
    );

    for (const item of this.items) {
      this.idMap.set(item.id, item);
    }
  }

  public insert(item: T): void {
    if (this.idMap.has(item.id)) {
      this.update(item);
      return;
    }

    const value = this.getSortValue(item);

    let low = 0;
    let high = this.items.length;

    while (low < high) {
      const mid = (low + high) >> 1;

      if (this.getSortValue(this.items[mid]) < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.items.splice(low, 0, item);
    this.idMap.set(item.id, item);
  }

  public findById(id: string | number): T | undefined {
    return this.idMap.get(id);
  }

  public find(value: number): T | undefined {
    let low = 0;
    let high = this.items.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const midValue = this.getSortValue(this.items[mid]);

      if (midValue === value) return this.items[mid];

      if (midValue < value) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return undefined;
  }

  public findRange(start: number, end: number): T[] {
    let low = 0;
    let high = this.items.length;

    while (low < high) {
      const mid = (low + high) >> 1;

      if (this.getSortValue(this.items[mid]) < start) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const result: T[] = [];

    while (
      low < this.items.length &&
      this.getSortValue(this.items[low]) <= end
    ) {
      result.push(this.items[low]);
      low++;
    }

    return result;
  }

  public remove(id: string | number): boolean {
    const item = this.idMap.get(id);
    if (!item) return false;

    this.idMap.delete(id);

    const index = this.items.findIndex(x => x.id === id);

    if (index !== -1) {
      this.items.splice(index, 1);
    }

    return true;
  }

  public getAll(): readonly T[] {
    return this.items;
  }

  private update(item: T): void {
    this.remove(item.id);
    this.insert(item);
  }
}

export class SortedIndexedTimestampList<
  T extends TimestampObject
> extends BaseSortedIndexedList<T> {
  protected getSortValue(item: T): number {
    return item.timestamp;
  }

  public findTimestamp(timestamp: number): T | undefined {
    return this.find(timestamp);
  }

  public findTimestampRange(start: number, end: number): T[] {
    return this.findRange(start, end);
  }
}

export class SortedIndexedPriceList<
  T extends PriceObject
> extends BaseSortedIndexedList<T> {
  protected getSortValue(item: T): number {
    return item.price;
  }

  public findPrice(price: number): T | undefined {
    return this.find(price);
  }

  public findPriceRange(start: number, end: number): T[] {
    return this.findRange(start, end);
  }
}