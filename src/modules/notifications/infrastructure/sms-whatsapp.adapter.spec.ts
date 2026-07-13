import { NotificationChannel } from '../domain/notification-channel.port';
import { SmsAdapter } from './sms.adapter.stub';
import { WhatsAppAdapter } from './whatsapp.adapter.stub';

describe('SMS/WhatsApp stub adapters (TASK-016, AC-057)', () => {
  it('SmsAdapter implements NotificationChannel but is always inactive', async () => {
    const adapter: NotificationChannel = new SmsAdapter();
    expect(adapter.name).toBe('SMS');
    const result = await adapter.send('+8801700000000', { title: 't', body: 'b' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CHANNEL_UNAVAILABLE/);
  });

  it('WhatsAppAdapter implements NotificationChannel but is always inactive', async () => {
    const adapter: NotificationChannel = new WhatsAppAdapter();
    expect(adapter.name).toBe('WHATSAPP');
    const result = await adapter.send('+8801700000000', { title: 't', body: 'b' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CHANNEL_UNAVAILABLE/);
  });
});
