/**
 * A lightweight, safe mathematical string evaluator for shapeMap formulas and conditions.
 * Implements a basic Shunting-yard algorithm to convert infix to RPN, then evaluates.
 * Caches the compiled RPN for maximum real-time performance.
 */

// type Token = string | number | { isVar: boolean; name: string };
const cache = new Map<string, any[]>();

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
        '| |': 1, '||': 1,
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

export function evaluateFormula(formula: string, context: Record<string, any>): any {
    if (!isNaN(Number(formula))) return Number(formula);
    if (context[formula] !== undefined) return context[formula];

    let rpn = cache.get(formula);
    if (!rpn) {
        rpn = toRPN(tokenize(formula));
        cache.set(formula, rpn);
    }

    const stack: any[] = [];
    
    const resolveValue = (val: any) => {
        if (val && typeof val === 'object' && val.isVar) {
            // Returns NaN if the variable is unselected/missing
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

export function evaluateCondition(expr: string, context: Record<string, any>): boolean {
    if (!expr || expr.trim() === "") return true;
    return Boolean(evaluateFormula(expr, context));
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
    flattenObj(shape.styles, "style");
    return flat;
}

/**
 * Parses a combined position string like "(t0+t1)/2 p0" into [timestamp, price]
 */
export function parsePosition(posStr: string, context: Record<string, number>): [number, number] {
    const parts = posStr.match(/(?:[^ (]+|\([^)]*\))+/g);
    if (!parts || parts.length < 2) return [NaN, NaN];
    
    return [
        Number(evaluateFormula(parts[0], context)),
        Number(evaluateFormula(parts[1], context))
    ];
}

export function resolveValue(value: any, context: any): any {
    if (typeof value !== "string") return value;
    
    // Arguments wrapped in quotes are treated as literal values
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        return value.slice(1, -1);
    }

    // Arguments without quotes are treated as formula code expressions evaluated against the full flattened context
    return evaluateFormula(value, context);
}

export function resolveStyle(styleDef: any, context: any): any {
    if (!styleDef) return {};

    const out: any = {};

    for (const key in styleDef) {
        const value = styleDef[key];

        out[key] =
            value && typeof value === "object" && !Array.isArray(value)
                ? resolveStyle(value, context)
                : resolveValue(value, context);
    }

    return out;
}