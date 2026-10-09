import { PactError } from "../errors";
import type { Tool } from "./types";

// Deterministic arithmetic. A tiny recursive-descent parser: no eval, no
// Function(), only numbers, + - * / % ^, parentheses and percent literals.

const TOKEN = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?)|([-+*/%^()]))/giy;

export function evaluate(expression: string): number {
  const expr = expression.replace(/,/g, "").trim();
  if (!expr || expr.length > 200) throw new PactError("INVALID_REQUEST", "Expression is empty or too long.");
  const tokens: (number | string)[] = [];
  TOKEN.lastIndex = 0;
  let last = 0;
  for (;;) {
    const m = TOKEN.exec(expr);
    if (!m) break;
    tokens.push(m[1] !== undefined ? Number(m[1]) : m[2]);
    last = TOKEN.lastIndex;
    if (last >= expr.length) break;
  }
  if (last < expr.length && expr.slice(last).trim()) throw new PactError("INVALID_REQUEST", "Expression contains unsupported characters.");

  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];

  function primary(): number {
    const t = take();
    if (typeof t === "number") {
      if (peek() === "%") {
        take();
        return t / 100;
      }
      return t;
    }
    if (t === "(") {
      const v = expression_();
      if (take() !== ")") throw new PactError("INVALID_REQUEST", "Unbalanced parentheses.");
      return v;
    }
    if (t === "-") return -primary();
    if (t === "+") return primary();
    throw new PactError("INVALID_REQUEST", "Malformed expression.");
  }

  function power(): number {
    const base = primary();
    if (peek() === "^") {
      take();
      return base ** power();
    }
    return base;
  }

  function term(): number {
    let v = power();
    while (peek() === "*" || peek() === "/") {
      const op = take();
      const r = power();
      if (op === "/" && r === 0) throw new PactError("INVALID_REQUEST", "Division by zero.");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }

  function expression_(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = take();
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  const value = expression_();
  if (i !== tokens.length) throw new PactError("INVALID_REQUEST", "Malformed expression.");
  if (!Number.isFinite(value)) throw new PactError("INVALID_REQUEST", "Result is not a finite number.");
  return value;
}

export const calculatorTool: Tool<{ expression: string }, { expression: string; value: number }> = {
  name: "calculator",
  description: "Evaluate an arithmetic expression exactly (+ - * / % ^ and parentheses).",
  stage: "analyzing",
  inputSchema: {
    type: "object",
    properties: { expression: { type: "string", description: "e.g. (1200 * 1.06) - 340" } },
    required: ["expression"],
  },
  outputSchema: { type: "object", properties: { expression: { type: "string" }, value: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input) {
    const value = evaluate(input.expression);
    const shown = Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
    return {
      data: { expression: input.expression, value },
      summary: `${input.expression} = ${shown}`,
      evidence: [{ kind: "calc", label: "Calculation", text: `${input.expression} = ${shown}` }],
    };
  },
};
