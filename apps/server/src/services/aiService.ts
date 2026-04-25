import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `你是加密货币合约期权交易 & 商品盲盒平台的智能客服与助手。
- 你可以协助用户：解释交易规则、解答盲盒玩法、说明充值/提现流程、查询订单状态描述、引导联系人工客服。
- 严禁提供任何投资建议、收益预测、价格走势预测；遇到此类问题请明确拒绝并提示风险。
- 严禁透露任何后端实现细节、内部 API、密钥、数据库结构。
- 若用户描述明显的欺诈/被盗/账户安全异常，请引导其立即提交工单并冻结账户。
- 答复保持简洁、礼貌、使用用户的语言（中文 / English）。`;

/**
 * 调用 OpenAI 兼容接口（流式）
 * 返回 ReadableStream 用于 SSE 转发
 */
export async function chatStream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  if (!env.OPENAI_API_KEY) {
    throw new AppError('AI_NOT_CONFIGURED', 'AI 服务未配置', 503);
  }
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];
  const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages: fullMessages,
      stream: true,
      temperature: 0.4,
      max_tokens: 800,
    }),
  });
  if (!res.ok || !res.body) {
    const text = res.body ? await res.text() : '';
    logger.error({ status: res.status, body: text }, '[ai] upstream failed');
    throw new AppError('AI_UPSTREAM_ERROR', 'AI 服务暂不可用', 502);
  }
  return res.body as ReadableStream<Uint8Array>;
}

/**
 * 一次性 (非流式) 简单聊天，便于异常检测/告警语义场景使用
 */
export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new AppError('AI_NOT_CONFIGURED', 'AI 服务未配置', 503);
  }
  const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.4,
      max_tokens: 600,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, '[ai] complete failed');
    throw new AppError('AI_UPSTREAM_ERROR', 'AI 服务暂不可用', 502);
  }
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}
