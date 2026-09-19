// Run with: npx tsx shapeType.check.ts
import assert from "node:assert";
import { shapeTimeBounds, constrainPoints, moveRectHandle } from "./shapeType";

// shapeTimeBounds
{
  const p = [{ ts: 100, price: 1 }, { ts: 200, price: 2 }];
  assert.deepStrictEqual(shapeTimeBounds("trendLine", p), { fromTs: 100, toTs: 200 });
  assert.deepStrictEqual(shapeTimeBounds("hSegment", p), { fromTs: 100, toTs: 200 });
  assert.deepStrictEqual(shapeTimeBounds("vSegment", p), { fromTs: 100, toTs: 200 });
  assert.deepStrictEqual(shapeTimeBounds("rectangle", p), { fromTs: 100, toTs: 200 });

  const hLine = shapeTimeBounds("hLine", [{ ts: 100, price: 1 }]);
  assert.strictEqual(hLine.fromTs, -Number.MAX_SAFE_INTEGER);
  assert.strictEqual(hLine.toTs, Number.MAX_SAFE_INTEGER);
  // A range query window anywhere must still find it: toTs > from && fromTs < to
  assert.ok(hLine.toTs > 500 && hLine.fromTs < 1000);

  const hRay = shapeTimeBounds("hRay", [{ ts: 100, price: 1 }]);
  assert.strictEqual(hRay.fromTs, 100);
  assert.strictEqual(hRay.toTs, Number.MAX_SAFE_INTEGER);
  assert.ok(hRay.toTs > 5000 && hRay.fromTs < 10000);

  const vLine = shapeTimeBounds("vLine", [{ ts: 100, price: 1 }]);
  assert.deepStrictEqual(vLine, { fromTs: 100, toTs: 100 });

  const text = shapeTimeBounds("text", [{ ts: 100, price: 1 }]);
  assert.deepStrictEqual(text, { fromTs: 100, toTs: 100 });
}

// constrainPoints
{
  const hSeg = constrainPoints("hSegment", [{ ts: 0, price: 1 }, { ts: 10, price: 2 }], 0);
  assert.strictEqual(hSeg[1].price, 1); // other point's price follows the moved one
  assert.strictEqual(hSeg[1].ts, 10); // ts untouched

  const vSeg = constrainPoints("vSegment", [{ ts: 0, price: 1 }, { ts: 10, price: 2 }], 1);
  assert.strictEqual(vSeg[0].ts, 10); // other point's ts follows the moved one
  assert.strictEqual(vSeg[0].price, 1); // price untouched

  const unchanged = constrainPoints("trendLine", [{ ts: 0, price: 1 }, { ts: 10, price: 2 }], 0);
  assert.strictEqual(unchanged[1].price, 2);
}

// moveRectHandle: rect ts 0..10, price 0..100 (points given in any corner order)
{
  const rect = [{ ts: 10, price: 0 }, { ts: 0, price: 100 }];
  // right edge (5) moves only maxTs
  assert.deepStrictEqual(moveRectHandle(rect, 5, { ts: 20, price: 999 }), [{ ts: 0, price: 100 }, { ts: 20, price: 0 }]);
  // top edge (4) moves only maxPrice
  assert.deepStrictEqual(moveRectHandle(rect, 4, { ts: 999, price: 150 }), [{ ts: 0, price: 150 }, { ts: 10, price: 0 }]);
  // bottom-left corner (3) moves minTs + minPrice
  assert.deepStrictEqual(moveRectHandle(rect, 3, { ts: -5, price: -5 }), [{ ts: -5, price: 100 }, { ts: 10, price: -5 }]);
}

console.log("shapeType.check.ts: all assertions passed");
