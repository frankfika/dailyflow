/**
 * Translate technical AI error messages into user-friendly actionable guidance.
 *
 * Shared by AIChat and Notes (AI Summary panel) so every
 * AI call surfaces the same kind of error UX. Previously the function was
 * duplicated across AI surfaces
 * had no friendly mapping at all (ux-audit 2026-07-12 §3).
 *
 * C6: the server (server/routes/ai.ts) sanitizes upstream failures into
 * `{ error, category, upstreamStatus? }`. The plain Error thrown by the API
 * client carries the sanitized text plus an HTTP `status`; both are matched
 * here so 401/404/429 become actionable instead of falling through to the
 * generic fallback. Browser-side network failures ("Failed to fetch") are
 * matched too — previously only the Node-side "fetch failed" was.
 */

export type AiErrorCategory =
  | 'auth'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'bad_request'
  | 'timeout'
  | 'unknown';

export interface ClassifiedAiError {
  category: AiErrorCategory;
  upstreamStatus?: number;
}

/**
 * Map a raw AI error (sanitized server text and/or client-side network
 * failure) to the contract-3 category vocabulary. `upstreamStatus` is the
 * HTTP status carried by the client's httpError when available.
 */
export function classifyAiError(rawError: string, upstreamStatus?: number): ClassifiedAiError {
  const lower = rawError.toLowerCase();

  // Browser fetch failures surface as "Failed to fetch"; Node as "fetch failed".
  if (
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed') ||
    lower.includes('network error') ||
    lower.includes('networkrequest failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('eai_again') ||
    lower.includes('err_internet_disconnected')
  ) {
    return { category: 'network', upstreamStatus };
  }

  if (upstreamStatus === 401 || upstreamStatus === 403 || lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('invalid_api_key')) {
    return { category: 'auth', upstreamStatus: upstreamStatus ?? (lower.includes('403') ? 403 : 401) };
  }

  if (upstreamStatus === 429 || lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return { category: 'rate_limit', upstreamStatus: upstreamStatus ?? 429 };
  }

  if (upstreamStatus === 404 || lower.includes('404') || (lower.includes('model') && (lower.includes('not found') || lower.includes('does not exist')))) {
    return { category: 'not_found', upstreamStatus: upstreamStatus ?? 404 };
  }

  if (upstreamStatus === 400 || lower.includes('400') || lower.includes('bad request') || lower.includes('invalid ai request')) {
    return { category: 'bad_request', upstreamStatus: upstreamStatus ?? 400 };
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { category: 'timeout', upstreamStatus };
  }

  return { category: 'unknown', upstreamStatus };
}

export function getFriendlyAiErrorMessage(
  rawError: string,
  language: 'en' | 'zh',
  providerName: string,
  upstreamStatus?: number
): string {
  const { category } = classifyAiError(rawError, upstreamStatus);

  switch (category) {
    case 'network':
      return language === 'zh'
        ? `网络连接失败。请检查：\n1. 网络连接是否正常\n2. API 地址是否正确\n3. 防火墙/代理设置\n\n可前往「模型 & Skills」检查配置。`
        : `Network connection failed. Check:\n1. Internet connection\n2. API URL is correct\n3. Firewall/proxy settings\n\nGo to "Models & Skills" to verify config.`;

    case 'auth':
      return language === 'zh'
        ? `API Key 无效或已过期。请到「模型 & Skills」→ 编辑 ${providerName} → 检查并更新 API Key。\n\n获取新 Key 请访问对应平台官网。`
        : `API Key is invalid or expired.\n\nGo to "Models & Skills" → Edit ${providerName} → Update API Key.\n\nGet a new key from the provider's website.`;

    case 'rate_limit':
      return language === 'zh'
        ? `API 请求过于频繁或额度不足，请稍后再试。\n\n可检查账户余额；若持续出现，可在「模型 & Skills」切换到其他供应商。`
        : `API rate limit exceeded or quota insufficient. Try again later.\n\nCheck account balance; switch to another provider in "Models & Skills" if it persists.`;

    case 'not_found':
      return language === 'zh'
        ? `模型 ID 或 Base URL 错误（Base URL 常需以 /v1 结尾）。\n\n请前往「模型 & Skills」→ 编辑 ${providerName} → 核对 Model ID 与 Base URL。`
        : `Model ID or Base URL is wrong (the Base URL usually needs to end with /v1).\n\nGo to "Models & Skills" → Edit ${providerName} → Verify Model ID and Base URL.`;

    case 'bad_request':
      return language === 'zh'
        ? `请求被拒绝（参数无效）。请检查模型 ID 与 API 地址配置是否匹配该供应商。`
        : `The request was rejected as invalid. Check that the Model ID and Base URL match this provider's API.`;

    case 'timeout':
      return language === 'zh'
        ? `请求超时，可能是网络较慢或模型负载高。\n\n建议稍后重试，或切换到其他供应商。`
        : `Request timed out. Network may be slow or model is overloaded.\n\nRetry later or switch providers.`;

    default:
      return language === 'zh'
        ? `调用 ${providerName} 时出错：\n${rawError}\n\n请前往「模型 & Skills」检查配置，或切换到其他供应商。`
        : `Error calling ${providerName}:\n${rawError}\n\nCheck config in "Models & Skills" or switch providers.`;
  }
}
