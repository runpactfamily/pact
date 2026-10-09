import { fetchJson } from "../http";

// GoPlus Security public API. No key. Token contract risk checks for EVM
// chains and Solana mints.

const BASE = "https://api.gopluslabs.io/api/v1";
const VENDOR = "GoPlus";

export interface EvmTokenSecurity {
  token_name?: string;
  token_symbol?: string;
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  owner_address?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  selfdestruct?: string;
  external_call?: string;
  buy_tax?: string;
  sell_tax?: string;
  cannot_buy?: string;
  cannot_sell_all?: string;
  slippage_modifiable?: string;
  is_honeypot?: string;
  transfer_pausable?: string;
  is_blacklisted?: string;
  is_whitelisted?: string;
  is_anti_whale?: string;
  trading_cooldown?: string;
  is_in_dex?: string;
  holder_count?: string;
  total_supply?: string;
  lp_holder_count?: string;
  lp_total_supply?: string;
  creator_address?: string;
  creator_percent?: string;
  owner_percent?: string;
  holders?: { address: string; percent: string; is_locked?: number; is_contract?: number; tag?: string }[];
  lp_holders?: { address: string; percent: string; is_locked?: number; tag?: string }[];
  dex?: { name: string; liquidity: string; pair: string }[];
  is_airdrop_scam?: string;
  trust_list?: string;
  fake_token?: { true_token_address?: string; value?: number };
  other_potential_risks?: string;
  note?: string;
}

export interface SolanaTokenSecurity {
  metadata?: { name?: string; symbol?: string; description?: string; uri?: string };
  mintable?: { status?: string; authority?: { address?: string; malicious_address?: number }[] };
  freezable?: { status?: string; authority?: { address?: string }[] };
  closable?: { status?: string };
  non_transferable?: string;
  transfer_fee?: unknown;
  transfer_hook?: unknown[];
  balance_mutable_authority?: { status?: string };
  default_account_state?: string;
  holder_count?: string;
  total_supply?: string;
  holders?: { account: string; percent: string; is_locked?: number; tag?: string }[];
  lp_holders?: { account: string; percent: string; is_locked?: number }[];
  dex?: { dex_name?: string; open_time?: string; tvl?: string; price?: string }[];
  creators?: { address?: string; malicious_address?: number }[];
  trusted_token?: number;
}

interface Options {
  timeoutMs: number;
  signal?: AbortSignal;
}

export async function evmTokenSecurity(goplusChainId: string, addresses: string[], options: Options): Promise<Record<string, EvmTokenSecurity>> {
  if (!addresses.length) return {};
  const url = `${BASE}/token_security/${goplusChainId}?contract_addresses=${addresses.slice(0, 20).map((a) => a.toLowerCase()).join(",")}`;
  const data = await fetchJson<{ code?: number; message?: string; result?: Record<string, EvmTokenSecurity> }>(url, { ...options, vendor: VENDOR });
  return data.result ?? {};
}

/** Batch lookups return a subset on some chains; the rest are fetched one by one (at most 5 extra requests). */
export async function evmTokenSecurityMany(goplusChainId: string, addresses: string[], options: Options): Promise<Record<string, EvmTokenSecurity>> {
  const wanted = [...new Set(addresses.map((a) => a.toLowerCase()))].slice(0, 20);
  const result = await evmTokenSecurity(goplusChainId, wanted, options);
  const missing = wanted.filter((a) => !result[a]).slice(0, 5);
  const extra = await Promise.all(missing.map((a) => evmTokenSecurity(goplusChainId, [a], options).catch(() => ({}) as Record<string, EvmTokenSecurity>)));
  for (const r of extra) Object.assign(result, r);
  return result;
}

export async function solanaTokenSecurity(mints: string[], options: Options): Promise<Record<string, SolanaTokenSecurity>> {
  if (!mints.length) return {};
  const url = `${BASE}/solana/token_security?contract_addresses=${mints.slice(0, 20).join(",")}`;
  const data = await fetchJson<{ code?: number; message?: string; result?: Record<string, SolanaTokenSecurity> }>(url, { ...options, vendor: VENDOR });
  return data.result ?? {};
}

export interface AddressSecurity {
  cybercrime?: string;
  money_laundering?: string;
  number_of_malicious_contracts_created?: string;
  financial_crime?: string;
  darkweb_transactions?: string;
  phishing_activities?: string;
  fake_kyc?: string;
  blacklist_doubt?: string;
  stealing_attack?: string;
  blackmail_activities?: string;
  sanctioned?: string;
  malicious_mining_activities?: string;
  mixer?: string;
  honeypot_related_address?: string;
  contract_address?: string;
  data_source?: string;
}

/** Malicious-address database lookup. EVM chains by chain id; Solana via the same endpoint without a chain. */
export async function addressSecurity(address: string, goplusChainId: string | undefined, options: Options): Promise<AddressSecurity | null> {
  const url = `${BASE}/address_security/${address}${goplusChainId && goplusChainId !== "solana" ? `?chain_id=${goplusChainId}` : ""}`;
  const data = await fetchJson<{ code?: number; result?: AddressSecurity }>(url, { ...options, vendor: VENDOR });
  return data.result ?? null;
}

const ADDRESS_FLAG_LABELS: [keyof AddressSecurity, string][] = [
  ["cybercrime", "linked to cybercrime"],
  ["money_laundering", "linked to money laundering"],
  ["financial_crime", "linked to financial crime"],
  ["phishing_activities", "phishing activity"],
  ["stealing_attack", "stealing attacks"],
  ["blackmail_activities", "blackmail activity"],
  ["sanctioned", "on a sanctions list"],
  ["darkweb_transactions", "darkweb transactions"],
  ["fake_kyc", "fake KYC"],
  ["malicious_mining_activities", "malicious mining"],
  ["mixer", "mixer usage"],
  ["honeypot_related_address", "related to honeypot tokens"],
  ["blacklist_doubt", "suspected blacklist"],
];

export function addressFlags(report: AddressSecurity | null): string[] {
  if (!report) return [];
  const out = ADDRESS_FLAG_LABELS.filter(([key]) => report[key] === "1").map(([, label]) => label);
  const created = Number(report.number_of_malicious_contracts_created ?? 0);
  if (created > 0) out.push(`created ${created} malicious contract${created === 1 ? "" : "s"}`);
  return out;
}

export interface ApprovalRisk {
  token_address?: string;
  token_name?: string;
  token_symbol?: string;
  chain_id?: string;
  balance?: string;
  is_open_source?: number;
  malicious_address?: number;
  malicious_behavior?: string[];
  approved_list?: { approved_contract?: string; approved_amount?: string; approved_time?: number; address_info?: { contract_name?: string | null; tag?: string | null; is_contract?: number; is_open_source?: number; malicious_behavior?: string[]; doubt_list?: number; trust_list?: number; malicious_address?: number } | null }[];
}

/** ERC-20 approvals granted by a wallet, with risk notes on each spender (v2 endpoint). EVM only. */
export async function tokenApprovals(goplusChainId: string, address: string, options: Options): Promise<ApprovalRisk[]> {
  const data = await fetchJson<{ code?: number; result?: ApprovalRisk[] }>(`${BASE.replace("/api/v1", "/api/v2")}/token_approval_security/${goplusChainId}?addresses=${address}`, { ...options, vendor: VENDOR });
  return data.result ?? [];
}

const yes = (v?: string) => v === "1";

/** Plain-language risk flags from an EVM report. Empty means nothing flagged by GoPlus. */
export function evmRiskFlags(r: EvmTokenSecurity): { severe: string[]; warnings: string[] } {
  const severe: string[] = [];
  const warnings: string[] = [];
  if (yes(r.is_honeypot)) severe.push("flagged as a honeypot (buyers may be unable to sell)");
  if (yes(r.cannot_sell_all)) severe.push("holders cannot sell their full balance");
  if (yes(r.cannot_buy)) severe.push("buying is blocked");
  if (yes(r.is_airdrop_scam)) severe.push("flagged as an airdrop scam");
  if (r.fake_token?.true_token_address) severe.push(`imitates another token (${r.fake_token.true_token_address})`);
  if (yes(r.selfdestruct)) severe.push("contract can self-destruct");
  const buyTax = Number(r.buy_tax ?? 0) * 100;
  const sellTax = Number(r.sell_tax ?? 0) * 100;
  if (sellTax >= 20 || buyTax >= 20) severe.push(`very high tax (buy ${buyTax.toFixed(0)}%, sell ${sellTax.toFixed(0)}%)`);
  else if (sellTax > 0 || buyTax > 0) warnings.push(`trading tax (buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%)`);
  if (yes(r.is_mintable)) warnings.push("supply can be minted by the owner");
  if (yes(r.is_proxy)) warnings.push("proxy contract: logic can be changed");
  if (r.is_open_source === "0") warnings.push("source code is not verified");
  if (yes(r.hidden_owner)) warnings.push("hidden owner");
  if (yes(r.can_take_back_ownership)) warnings.push("ownership can be taken back");
  if (yes(r.owner_change_balance)) warnings.push("owner can change balances");
  if (yes(r.transfer_pausable)) warnings.push("transfers can be paused");
  if (yes(r.is_blacklisted)) warnings.push("has a blacklist function");
  if (yes(r.slippage_modifiable)) warnings.push("tax can be changed");
  if (yes(r.trading_cooldown)) warnings.push("trading cooldown");
  if (yes(r.external_call)) warnings.push("makes external calls");
  const creator = Number(r.creator_percent ?? 0) * 100;
  if (creator >= 20) warnings.push(`creator holds ${creator.toFixed(1)}% of supply`);
  const top = (r.holders ?? []).filter((h) => !h.is_contract).slice(0, 10).reduce((s, h) => s + Number(h.percent ?? 0) * 100, 0);
  if (top >= 50) warnings.push(`top 10 wallets hold ${top.toFixed(0)}% of supply`);
  const lpLocked = (r.lp_holders ?? []).filter((h) => h.is_locked === 1).reduce((s, h) => s + Number(h.percent ?? 0) * 100, 0);
  if (r.lp_holders && lpLocked < 50 && r.is_in_dex === "1") warnings.push(`only ${lpLocked.toFixed(0)}% of liquidity is locked or burned`);
  return { severe, warnings };
}

export function solanaRiskFlags(r: SolanaTokenSecurity): { severe: string[]; warnings: string[] } {
  const severe: string[] = [];
  const warnings: string[] = [];
  if (r.non_transferable === "1") severe.push("token is non-transferable");
  if (r.mintable?.status === "1") warnings.push("mint authority is still active (supply can grow)");
  if (r.freezable?.status === "1") warnings.push("freeze authority is still active (accounts can be frozen)");
  if (r.closable?.status === "1") warnings.push("mint can be closed");
  if (r.balance_mutable_authority?.status === "1") severe.push("balances can be changed by an authority");
  if (Array.isArray(r.transfer_hook) && r.transfer_hook.length) warnings.push("has a transfer hook");
  if (r.transfer_fee && typeof r.transfer_fee === "object" && Object.keys(r.transfer_fee as object).length) warnings.push("charges a transfer fee");
  if ((r.creators ?? []).some((c) => c.malicious_address === 1)) severe.push("creator address is flagged as malicious");
  const top = (r.holders ?? []).slice(0, 10).reduce((s, h) => s + Number(h.percent ?? 0) * 100, 0);
  if (top >= 50) warnings.push(`top 10 holders own ${top.toFixed(0)}% of supply`);
  const lpLocked = (r.lp_holders ?? []).filter((h) => h.is_locked === 1).reduce((s, h) => s + Number(h.percent ?? 0) * 100, 0);
  if (r.lp_holders?.length && lpLocked < 50) warnings.push(`only ${lpLocked.toFixed(0)}% of liquidity is locked or burned`);
  return { severe, warnings };
}
