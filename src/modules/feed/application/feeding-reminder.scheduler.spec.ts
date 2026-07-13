import { DeviceTokenRepositoryPort } from '../../notifications/application/ports/device-token-repository.port';
import { NotificationChannel } from '../../notifications/domain/notification-channel.port';
import { DeviceToken } from '../../notifications/domain/device-token.entity';
import { ProjectMembersDirectoryPort } from '../../identity/application/ports/project-members-directory.port';
import { ProjectMembership } from '../../identity/domain/project-membership.entity';
import { BatchEventRepositoryPort } from '../../ponds/application/ports/batch-event-repository.port';
import { SpeciesRepositoryPort } from '../../ponds/application/ports/species-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { Species } from '../../ponds/domain/species.entity';
import { FeedingReminderScheduler } from './feeding-reminder.scheduler';

const carp = Species.reconstitute({
  id: 'sp-carp',
  name: 'Carp',
  category: 'FISH',
  defaultDensityMin: null,
  defaultDensityMax: null,
});

function makeBatch(overrides: Partial<Parameters<typeof Batch.reconstitute>[0]> = {}): Batch {
  return Batch.reconstitute({
    id: 'batch-1',
    projectId: 'p-1',
    pondId: 'pond-1',
    stockingId: 'stocking-1',
    speciesId: 'sp-carp',
    initialCount: 1000,
    cumulativeMortality: 0,
    harvestedCount: 0,
    latestAvgWeightG: 50,
    status: 'ACTIVE',
    stockedOn: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeMembership(userId: string, role: 'OWNER' | 'WORKER' | 'PARTNER'): ProjectMembership {
  return ProjectMembership.reconstitute({
    id: `m-${userId}`,
    userId,
    projectId: 'p-1',
    role,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
  });
}

function makeToken(userId: string, fcmToken: string): DeviceToken {
  return DeviceToken.reconstitute({
    id: `d-${userId}`,
    userId,
    fcmToken,
    platform: 'ANDROID',
    registeredAt: new Date('2026-01-01'),
  });
}

function setup(
  overrides: {
    activeBatches?: Batch[];
    allSpecies?: Species[];
    memberships?: ProjectMembership[];
    tokensByUser?: Record<string, DeviceToken[]>;
  } = {},
) {
  const batches: jest.Mocked<BatchEventRepositoryPort> = {
    findById: jest.fn(),
    findAllActive: jest.fn().mockResolvedValue(overrides.activeBatches ?? [makeBatch()]),
    save: jest.fn(),
  };
  const species: jest.Mocked<SpeciesRepositoryPort> = {
    findAll: jest.fn().mockResolvedValue(overrides.allSpecies ?? [carp]),
  };
  const members: jest.Mocked<ProjectMembersDirectoryPort> = {
    findActiveByProjectId: jest
      .fn()
      .mockResolvedValue(overrides.memberships ?? [makeMembership('owner-1', 'OWNER'), makeMembership('worker-1', 'WORKER')]),
  };
  const tokensByUser = overrides.tokensByUser ?? { 'worker-1': [makeToken('worker-1', 'fcm-worker-1')] };
  const devices: jest.Mocked<DeviceTokenRepositoryPort> = {
    findByUserId: jest.fn().mockImplementation((userId: string) => Promise.resolve(tokensByUser[userId] ?? [])),
    findByFcmToken: jest.fn(),
    save: jest.fn(),
  };
  const channel: jest.Mocked<NotificationChannel> = {
    name: 'FCM',
    send: jest.fn().mockResolvedValue({ success: true }),
  };

  const scheduler = new FeedingReminderScheduler(batches, species, members, devices, channel);
  return { scheduler, batches, species, members, devices, channel };
}

describe('FeedingReminderScheduler (TASK-021, F4, AC-081)', () => {
  it('AC-081: delivers a reminder to the project worker for the active batch feed type', async () => {
    const { scheduler, channel } = setup();
    await scheduler.remind();

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith(
      'fcm-worker-1',
      expect.objectContaining({ data: { projectId: 'p-1', feedType: 'FLOATING' } }),
    );
  });

  it('module doc §2.3: only the WORKER receives the reminder, never the OWNER/PARTNER', async () => {
    const { scheduler, members, devices } = setup({
      memberships: [
        makeMembership('owner-1', 'OWNER'),
        makeMembership('partner-1', 'PARTNER'),
        makeMembership('worker-1', 'WORKER'),
      ],
    });
    await scheduler.remind();

    expect(members.findActiveByProjectId).toHaveBeenCalledWith('p-1');
    expect(devices.findByUserId).toHaveBeenCalledWith('worker-1');
    expect(devices.findByUserId).not.toHaveBeenCalledWith('owner-1');
    expect(devices.findByUserId).not.toHaveBeenCalledWith('partner-1');
  });

  it('one reminder per (project, feed type) — two active batches of the same type collapse into one send', async () => {
    const { scheduler, channel } = setup({
      activeBatches: [makeBatch({ id: 'b-1' }), makeBatch({ id: 'b-2' })],
    });
    await scheduler.remind();
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('no active batches means no reminder is sent', async () => {
    const { scheduler, channel } = setup({ activeBatches: [] });
    await scheduler.remind();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('a worker with no registered device is skipped without error', async () => {
    const { scheduler, channel } = setup({ tokensByUser: {} });
    await expect(scheduler.remind()).resolves.toBeUndefined();
    expect(channel.send).not.toHaveBeenCalled();
  });
});
