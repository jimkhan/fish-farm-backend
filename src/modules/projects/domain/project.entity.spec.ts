import { Project } from './project.entity';

const baseProps = {
  id: 'p-1',
  name: 'North Pond Farm',
  siteLat: 23.8103,
  siteLng: 90.4125,
  address: 'Dhaka',
  currency: 'BDT' as const,
  landUnit: 'BIGHA' as const,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
};

describe('Project (TASK-011, MOD-03 §4.3)', () => {
  it('is not closed when ACTIVE', () => {
    const project = Project.reconstitute(baseProps);
    expect(project.isClosed).toBe(false);
  });

  it('is closed when status is CLOSED', () => {
    const project = Project.reconstitute({ ...baseProps, status: 'CLOSED' });
    expect(project.isClosed).toBe(true);
  });

  it('withUpdate() applies only the given fields, leaving others untouched', () => {
    const project = Project.reconstitute(baseProps);
    const updated = project.withUpdate({ name: 'Renamed Farm' });

    expect(updated.name).toBe('Renamed Farm');
    expect(updated.address).toBe('Dhaka');
    expect(updated.status).toBe('ACTIVE');
    expect(project.name).toBe('North Pond Farm'); // original untouched
  });

  it('withUpdate() can transition status (reopen/close)', () => {
    const project = Project.reconstitute({ ...baseProps, status: 'CLOSED' });
    const reopened = project.withUpdate({ status: 'ACTIVE' });
    expect(reopened.isClosed).toBe(false);
  });
});
