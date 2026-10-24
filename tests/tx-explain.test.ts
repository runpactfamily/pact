import "./setup";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { shortAddr } from "../src/server/onchain/format";
import { EvmRpc, TRANSFER_TOPIC, type Erc20Meta, type EvmReceipt, type EvmTransaction } from "../src/server/onchain/sources/evmRpc";
import { txExplainTool } from "../src/server/tools/onchain/txExplain";
import { fresh } from "./helpers";

const HASH = "0x" + "ab".repeat(32);
const FROM = "0x" + "aa".repeat(20);
const TO = "0x" + "bb".repeat(20);
const CLEAR_CHAIN_KEYS = {
  ANKR_API_KEY: "",
  BLOCKSCOUT_API_KEY: "",
  ALCHEMY_API_KEY: "",
  NODEREAL_API_KEY: "",
  COINGECKO_API_KEY: "",
  CODEX_API_KEY: "",
  HELIUS_API_KEY: "",
};

type Meta = Erc20Meta & { isContract: boolean };
type TransferLog = EvmReceipt["logs"][number];

const token = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const addressTopic = (address: string) => `0x${address.slice(2).padStart(64, "0")}`;
const transferLog = (tokenAddress: string, raw: bigint): TransferLog => ({
  address: tokenAddress,
  topics: [TRANSFER_TOPIC, addressTopic(FROM), addressTopic(TO)],
  data: `0x${raw.toString(16)}`,
});

function evmResult(logs: TransferLog[]): { tx: EvmTransaction; receipt: EvmReceipt } {
  return {
    tx: { hash: HASH, from: FROM, to: TO, value: "0x0", input: "0x", gas: "0x5208", gasPrice: "0x3b9aca00", blockNumber: "0x1", nonce: "0x1" },
    receipt: { status: "0x1", gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00", contractAddress: null, logs, blockNumber: "0x1" },
  };
}

async function runEvm(t: TestContext, fixture: { logs: TransferLog[]; metas?: Meta[]; metadataError?: Error }) {
  const { providers } = fresh({}, CLEAR_CHAIN_KEYS);
  const metadataCalls: string[][] = [];
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;

  // No real fetch can succeed, and every escape is recorded so a test can assert zero network calls.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    throw new Error("network is disabled in tx-explain tests");
  }) as typeof fetch;

  const txMock = t.mock.method(EvmRpc.prototype, "transaction", async () => evmResult(fixture.logs));
  const metaMock = t.mock.method(EvmRpc.prototype, "erc20Many", async (addresses: string[]) => {
    metadataCalls.push([...addresses]);
    if (fixture.metadataError) throw fixture.metadataError;
    return fixture.metas ?? [];
  });

  try {
    const result = await txExplainTool.execute(
      { chain: "base", hash: HASH },
      { runId: "run_tx", userId: "u", providers, signal: new AbortController().signal, timeoutMs: 5000 },
    );
    return { result, metadataCalls, fetchCalls };
  } finally {
    txMock.mock.restore();
    metaMock.mock.restore();
    globalThis.fetch = originalFetch;
  }
}

test("EVM transfers with valid decimals keep the token-unit conversion, including decimals 0, 6 and 18", async (t) => {
  const tokens = [token(1), token(2), token(3)];
  const { result, metadataCalls, fetchCalls } = await runEvm(t, {
    logs: [transferLog(tokens[0], 42n), transferLog(tokens[1], 1_000_000n), transferLog(tokens[2], 1_500_000_000_000_000_000n)],
    metas: [
      { address: tokens[0], symbol: "ZERO", decimals: 0, isContract: true },
      { address: tokens[1], symbol: "SIX", decimals: 6, isContract: true },
      { address: tokens[2], symbol: "EIGHTEEN", decimals: 18, isContract: true },
    ],
  });

  const text = result.evidence?.[0]?.text ?? "";
  assert.deepEqual(metadataCalls, [tokens]);
  assert.equal(fetchCalls.length, 0);
  assert.equal(result.data.transfers, 3);
  assert.equal(result.data.status, "success");
  assert.ok(text.includes(`- 42 ZERO from ${shortAddr(FROM)} to ${shortAddr(TO)}`));
  assert.ok(text.includes(`- 1 SIX from ${shortAddr(FROM)} to ${shortAddr(TO)}`));
  assert.ok(text.includes(`- 1.50 EIGHTEEN from ${shortAddr(FROM)} to ${shortAddr(TO)}`));
});

test("missing, unusable or out-of-range decimals show exact raw units, never an 18-decimal guess", async (t) => {
  const address = token(1);
  const maxU256 = (1n << 256n) - 1n;
  const cases: { name: string; meta?: Meta; raw: bigint }[] = [
    { name: "missing metadata", raw: 1_000_000n },
    { name: "missing decimals with a symbol", meta: { address, symbol: "NODEC", isContract: true }, raw: 5n },
    { name: "negative decimals", meta: { address, symbol: "NEG", decimals: -1, isContract: true }, raw: 7n },
    { name: "fractional decimals", meta: { address, symbol: "FRAC", decimals: 1.5, isContract: true }, raw: 9n },
    { name: "decimals above 255", meta: { address, symbol: "OUT", decimals: 256, isContract: true }, raw: 11n },
    { name: "NaN decimals", meta: { address, symbol: "NAN", decimals: Number.NaN, isContract: true }, raw: 13n },
    { name: "raw zero", raw: 0n },
    { name: "large uint256", raw: maxU256 },
  ];

  for (const item of cases) {
    const { result, fetchCalls } = await runEvm(t, { logs: [transferLog(address, item.raw)], metas: item.meta ? [item.meta] : [] });
    const lines = (result.evidence?.[0]?.text ?? "").split("\n").filter((line) => line.startsWith("- "));
    const symbol = item.meta?.symbol ?? shortAddr(address);
    assert.equal(lines.length, 1, item.name);
    assert.equal(
      lines[0],
      `- ${item.raw.toString()} raw units (decimals unavailable) ${symbol} from ${shortAddr(FROM)} to ${shortAddr(TO)}`,
      item.name,
    );
    assert.equal(fetchCalls.length, 0, item.name);
  }
});

test("the seventh unique token is outside the six-address metadata batch and its raw amount stays exact", async (t) => {
  const tokens = Array.from({ length: 13 }, (_, i) => token(i + 1));
  const metas: Meta[] = [
    { address: tokens[0], symbol: "ZERO", decimals: 0, isContract: true },
    { address: tokens[1], symbol: "SIX", decimals: 6, isContract: true },
    { address: tokens[2], symbol: "EIGHTEEN", decimals: 18, isContract: true },
    { address: tokens[3], symbol: "FOUR", decimals: 4, isContract: true },
    { address: tokens[4], symbol: "TWO", decimals: 2, isContract: true },
    { address: tokens[5], symbol: "THREE", decimals: 3, isContract: true },
  ];
  const logs = tokens.map((address, i) => transferLog(address, i === 6 ? 1_000_000n : BigInt((i + 1) * 10)));

  const { result, metadataCalls, fetchCalls } = await runEvm(t, { logs, metas });
  const text = result.evidence?.[0]?.text ?? "";
  const lines = text.split("\n").filter((line) => line.startsWith("- "));
  const seventh = lines[6];

  assert.deepEqual(metadataCalls, [tokens.slice(0, 6)], "one batch, limited to the first six unique addresses");
  assert.equal(fetchCalls.length, 0);
  assert.ok(text.includes("Token transfers (13):"));
  assert.equal(lines.length, 12, "the display cap is unchanged");
  assert.equal(seventh, `- 1000000 raw units (decimals unavailable) ${shortAddr(tokens[6])} from ${shortAddr(FROM)} to ${shortAddr(TO)}`);
  assert.ok(!text.includes(shortAddr(tokens[12])), "the thirteenth transfer stays outside the display cap");
  assert.equal(result.data.transfers, 13);
  assert.equal(result.data.status, "success");
  assert.equal(result.data.valueNative, 0);
  assert.equal(result.data.feeNative, 0.000021);
  assert.equal(result.summary, "success · native transfer · 0 ETH · 13 token transfers");
  assert.ok(text.includes("Value 0 ETH · fee 0.000021 ETH · gas used 21000"));
});

test("a rejected metadata batch leaves every transfer in raw units rather than assuming 18 decimals", async (t) => {
  const tokens = [token(1), token(2)];
  const { result, metadataCalls, fetchCalls } = await runEvm(t, {
    logs: [transferLog(tokens[0], 1_000_000n), transferLog(tokens[1], 0n)],
    metadataError: new Error("metadata batch rejected"),
  });

  const lines = (result.evidence?.[0]?.text ?? "").split("\n").filter((line) => line.startsWith("- "));
  assert.deepEqual(metadataCalls, [tokens]);
  assert.equal(fetchCalls.length, 0);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], `- 1000000 raw units (decimals unavailable) ${shortAddr(tokens[0])} from ${shortAddr(FROM)} to ${shortAddr(TO)}`);
  assert.equal(lines[1], `- 0 raw units (decimals unavailable) ${shortAddr(tokens[1])} from ${shortAddr(FROM)} to ${shortAddr(TO)}`);
  assert.equal(result.data.transfers, 2);
});
