/**
 * A highly performant pre-compiled mathematical evaluator.
 * It compiles all shape definition strings (render data, conditions, and edit points)
 * into native functions on initialization, eliminating parsing overhead during real-time rendering.
 */

export type CompiledExpr = (ctx: any) => any;

let compiledShapeMap: Record<string, any>;

export function getCompiledShapeMap(): Record<string, any> {
    return compiledShapeMap;
}

export function initShapeParser(shapeMap: Record<string, any>) {
    compiledShapeMap = {};
    for (const key in shapeMap) {
        const shape = shapeMap[key];
        
        // Define explicitly typed fallback function expecting context parameter
        let compiledCondition: CompiledExpr = (_ctx: any) => true;
        if (shape.style && shape.style.condition) {
            compiledCondition = compileExpr(shape.style.condition);
        }

        compiledShapeMap[key] = {
            ...shape,
            compiledCondition,
            compiledRender: (shape.render || []).map((r: any) => ({
                type: r.type,
                compiledCondition: r.condition ? compileExpr(r.condition) : (_ctx: any) => true,
                compiledData: compileObject(r.data || {})
            })),
            compiledEditPoints: {
                create: shape.editPoints?.create ?? {},
                edit: compileEditPoints(shape.editPoints?.edit ?? {})
            }
        };
    }
}

function compileEditPoints(editObj: Record<string, string>) {
    const compiled: Array<{
        evaluateX: CompiledExpr;
        evaluateY: CompiledExpr;
        targetKeysStr: string;
    }> = [];

    for (const posFormula in editObj) {
        const targetKeysStr = editObj[posFormula];
        const parts = posFormula.match(/(?:[^ (]+|\([^)]*\))+/g);
        if (parts && parts.length >= 2) {
            compiled.push({
                evaluateX: compileExpr(parts[0]),
                evaluateY: compileExpr(parts[1]),
                targetKeysStr
            });
        }
    }
    return compiled;
}

function compileObject(obj: Record<string, any>): CompiledExpr {
    const compiledKeys: Record<string, CompiledExpr> = {};
    for (const k in obj) {
        compiledKeys[k] = compileExpr(obj[k]);
    }
    return (ctx: any) => {
        const res: Record<string, any> = {};
        for (const k in compiledKeys) {
            res[k] = compiledKeys[k](ctx);
        }
        return res;
    };
}

function compileExpr(expr: any): CompiledExpr {
    if (typeof expr === 'number') return (_ctx: any) => expr;
    if (typeof expr === 'string') {
        if ((expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith('"') && expr.endsWith('"'))) {
            const str = expr.slice(1, -1);
            return (_ctx: any) => str;
        }
        const rpn = toRPN(tokenize(expr));
        return (ctx: any) => evaluateRPN(rpn, ctx);
    }
    if (Array.isArray(expr)) {
        const compiledArr = expr.map(compileExpr);
        return (ctx: any) => compiledArr.map(fn => fn(ctx));
    }
    if (typeof expr === 'object' && expr !== null) {
        return compileObject(expr);
    }
    return (_ctx: any) => expr;
}

function tokenize(expr: string): string[] {
    const regex = /'[^']*'|"[^"]*"|&&|\|\||==|!=|<=|>=|[A-Za-z0-9_.]+|\d+\.\d+|\d+|[()+\-*/<>,]/g;
    const tokens: string[] = [];
    let match;
    while ((match = regex.exec(expr)) !== null) {
        tokens.push(match[0].trim());
    }
    return tokens;
}

function validateArgs(tokens: string[]) {
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === 'min' || tokens[i] === 'max' || tokens[i] === 'abs') {
            if (tokens[i + 1] !== '(') {
                throw new Error(`Function ${tokens[i]} must be followed by '('`);
            }
            let depth = 0;
            let commas = 0;
            let foundEnd = false;
            for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j] === '(') depth++;
                else if (tokens[j] === ')') {
                    depth--;
                    if (depth === 0) {
                        foundEnd = true;
                        break;
                    }
                } else if (tokens[j] === ',' && depth === 1) {
                    commas++;
                }
            }
            if (!foundEnd || commas !== 1) {
                throw new Error(`Function ${tokens[i]} requires exactly 2 arguments.`);
            }
        }
    }
}

function toRPN(tokens: string[]): any[] {
    validateArgs(tokens);
    const output: any[] = [];
    const operators: string[] = [];
    const precedence: Record<string, number> = {
        '||': 1,
        '&&': 2,
        '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4,
        '+': 5, '-': 5,
        '*': 6, '/': 6,
        'min': 7, 'max': 7, 'abs': 7
    };

    for (const token of tokens) {
        if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
            output.push(token.slice(1, -1)); // String literal
        } else if (!isNaN(Number(token))) {
            output.push(Number(token)); // Number literal
        } else if (token === 'min' || token === 'max' || token === 'abs') {
            operators.push(token);
        } else if (token === ',') {
            while (operators.length && operators[operators.length - 1] !== '(') {
                output.push(operators.pop()!);
            }
        } else if (token === '(') {
            operators.push(token);
        } else if (token === ')') {
            while (operators.length && operators[operators.length - 1] !== '(') {
                output.push(operators.pop()!);
            }
            operators.pop(); // Remove '('
            if (operators.length && (operators[operators.length - 1] === 'min' || operators[operators.length - 1] === 'max' || operators[operators.length - 1] === 'abs')) {
                output.push(operators.pop()!);
            }
        } else if (precedence[token] !== undefined) {
            while (
                operators.length && 
                precedence[operators[operators.length - 1]] >= precedence[token]
            ) {
                output.push(operators.pop()!);
            }
            operators.push(token);
        } else {
            output.push({ isVar: true, name: token }); // Variable
        }
    }
    while (operators.length) {
        output.push(operators.pop()!);
    }
    return output;
}

function evaluateRPN(rpn: any[], context: Record<string, any>): any {
    const stack: any[] = [];
    
    const resolveValue = (val: any) => {
        if (val && typeof val === 'object' && val.isVar) {
            return context[val.name] !== undefined ? context[val.name] : NaN; 
        }
        return val;
    };

    for (const token of rpn) {
        if (typeof token === 'object' && token.isVar) {
            stack.push(token);
        } else if (token !== '+' && token !== '-' && token !== '*' && token !== '/' &&
                   token !== '==' && token !== '!=' && token !== '<' && token !== '>' &&
                   token !== '<=' && token !== '>=' && token !== '&&' && token !== '||' &&
                   token !== 'min' && token !== 'max' && token !== 'abs') {
            stack.push(token);
        } else {
            const b = resolveValue(stack.pop());
            const a = resolveValue(stack.pop());
            switch (token) {
                case '+': stack.push(Number(a) + Number(b)); break;
                case '-': stack.push(Number(a) - Number(b)); break;
                case '*': stack.push(Number(a) * Number(b)); break;
                case '/': stack.push(Number(a) / Number(b)); break;
                case '==': stack.push(a == b); break;
                case '!=': stack.push(a != b); break;
                case '<': stack.push(a < b); break;
                case '>': stack.push(a > b); break;
                case '<=': stack.push(a <= b); break;
                case '>=': stack.push(a >= b); break;
                case '&&': stack.push(Boolean(a) && Boolean(b)); break;
                case '||': stack.push(Boolean(a) || Boolean(b)); break;
                case 'min': stack.push(Math.min(Number(a), Number(b))); break;
                case 'max': stack.push(Math.max(Number(a), Number(b))); break;
                case 'abs': stack.push(Math.abs(Number(a) - Number(b))); break;
                default: stack.push(0);
            }
        }
    }
    
    return stack.length ? resolveValue(stack[0]) : NaN;
}

export function flattenContext(shape: any): Record<string, any> {
    const flat: Record<string, any> = {};
    if (shape.data) {
        for (const [k, v] of Object.entries(shape.data)) {
            flat[k] = v;
        }
    }
    const flattenObj = (obj: any, prefix: string) => {
        if (!obj) return;
        for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                flattenObj(v, key);
            } else {
                flat[key] = v;
            }
        }
    };
    flattenObj(shape.style, "style");
    return flat;
}