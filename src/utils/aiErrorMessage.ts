/**
 * Translate technical AI error messages into user-friendly actionable guidance.
 *
 * Shared by AIChat, FloatingAIPanel, and Notes (AI Summary panel) so every
 * AI call surfaces the same kind of error UX. Previously the function was
 * duplicated verbatim in AIChat.tsx and FloatingAIPanel.tsx, and Notes.tsx
 * had no friendly mapping at all (ux-audit 2026-07-12 §3).
 */
export function getFriendlyAiErrorMessage(
  rawError: string,
  language: 'en' | 'zh',
  providerName: string
): string {
  const lower = rawError.toLowerCase();

  // Network / fetch failures
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econnrefused')) {
    return language === 'zh'
      ? `网络连接失败。请检查：\n1. 网络连接是否正常\n2. API 地址是否正确\n3. 防火墙/代理设置\n\n可前往「模型 & Skills」检查配置。`
      : `Network connection failed. Check:\n1. Internet connection\n2. API URL is correct\n3. Firewall/proxy settings\n\nGo to "Models & Skills" to verify config.`;
  }

  // Auth failures (401/403)
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('invalid_api_key')) {
    return language === 'zh'
      ? `API Key 无效或已过期。\n\n请前往「模型 & Skills」→ 编辑 ${providerName} → 更新 API Key。\n\n获取新 Key 请访问对应平台官网。`
      : `API Key is invalid or expired.\n\nGo to "Models & Skills" → Edit ${providerName} → Update API Key.\n\nGet a new key from the provider's website.`;
  }

  // Rate limit / quota (429)
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return language === 'zh'
      ? `API 请求超限或额度不足。\n\n请检查账户余额，或稍后重试。\n若持续出现，可在「模型 & Skills」切换到其他供应商。`
      : `API rate limit exceeded or quota insufficient.\n\nCheck account balance or try again later.\n\nSwitch to another provider in "Models & Skills" if it persists.`;
  }

  // Model not found / invalid model
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('does not exist'))) {
    return language === 'zh'
      ? `模型 ID 不存在或拼写错误。\n\n请前往「模型 & Skills」→ 编辑 ${providerName} → 确认 Model ID 正确。`
      : `Model ID not found or misspelled.\n\nGo to "Models & Skills" → Edit ${providerName} → Verify Model ID.`;
  }

  // Timeout
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return language === 'zh'
      ? `请求超时，可能是网络较慢或模型负载高。\n\n建议稍后重试，或切换到其他供应商。`
      : `Request timed out. Network may be slow or model is overloaded.\n\nRetry later or switch providers.`;
  }

  // Generic fallback
  return language === 'zh'
    ? `调用 ${providerName} 时出错：\n${rawError}\n\n请前往「模型 & Skills」检查配置，或切换到其他供应商。`
    : `Error calling ${providerName}:\n${rawError}\n\nCheck config in "Models & Skills" or switch providers.`;
}
