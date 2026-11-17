import type { AutomationEvent } from '@flaretable/shared';
import type { Env } from '../env.js';
import { dispatchAutomationEvent } from '../control-plane/webhook-service.js';

/**
 * Cloudflare Queues 异步消费者
 * @description 负责可靠投递 Outgoing Webhook；单条消息抛出异常时调用 msg.retry() 交由队列执行退避重试或进入 DLQ。
 */
export async function handleAutomationQueueBatch(
  batch: MessageBatch<AutomationEvent>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await dispatchAutomationEvent(env.CONTROL_DB, msg.body);
      msg.ack();
    } catch {
      msg.retry();
    }
  }
}
