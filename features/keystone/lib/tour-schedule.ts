// Wall-clock start times are interpreted in the tour timezone (DST aware).
export function zonedStart(date: string, time: string, timeZone: string) {
  let at = new Date(`${date}T${time}:00Z`);
  const target = at.getTime();
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const represented = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`).getTime();
    at = new Date(at.getTime() + target - represented);
  }
  return at;
}
export function expandSchedule(schedule: any, tour: any, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const weekdays = /BYDAY=([^;]+)/.exec(schedule.rrule || '')?.[1]?.split(',');
  for (let day = new Date(from.toISOString().slice(0, 10) + 'T12:00:00Z'); day <= to; day = new Date(day.getTime() + 86400000)) {
    if ((schedule.validFrom && day < schedule.validFrom) || (schedule.validTo && day > schedule.validTo)) continue;
    if (weekdays && !weekdays.includes(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day.getUTCDay()])) continue;
    for (const time of (schedule.startTimes as string[]) || ['09:00']) {
      if (!/^\d\d:\d\d$/.test(time)) throw new Error('Invalid schedule time');
      const startAt = zonedStart(day.toISOString().slice(0, 10), time, tour.timezone || 'America/New_York');
      if (startAt >= from && startAt <= to) out.push(startAt);
    }
  }
  return out;
}
export function departureData(schedule: any, tour: any, startAt: Date, departureKey: string) {
  return { departureKey, tourId: tour.id, scheduleId: schedule.id, startAt, endAt: new Date(startAt.getTime() + (tour.durationDays ? tour.durationDays * 1440 : tour.durationMinutes) * 60000), capacity: Math.min(schedule.capacityOverride || tour.maxParticipants, tour.maxParticipants), status: 'on_sale' };
}
