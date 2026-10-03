import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('Employee Tour Plan renders temporary stay date labels in anchor history', async () => {
  const vite = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { default: EmployeeTourPlanReport } = await vite.ssrLoadModule('/src/components/EmployeeTourPlanReport.jsx');
    const home = [28.6139, 77.2090];
    const hotel = [28.6500, 77.2500];
    const attendance = {
      records: [
        { id: 'a1', empId: '100', employee: 'Test Employee', dateKey: '2026-10-01', start: new Date('2026-10-01T09:00:00'), stop: new Date('2026-10-01T18:00:00'), startPoint: home, stopPoint: home, startAddress: 'Home', stopAddress: 'Home' },
        { id: 'a2', empId: '100', employee: 'Test Employee', dateKey: '2026-10-02', start: new Date('2026-10-02T09:00:00'), stop: new Date('2026-10-02T18:00:00'), startPoint: home, stopPoint: home, startAddress: 'Home', stopAddress: 'Home' },
        { id: 'a3', empId: '100', employee: 'Test Employee', dateKey: '2026-10-03', start: new Date('2026-10-03T09:00:00'), stop: new Date('2026-10-03T18:00:00'), startPoint: hotel, stopPoint: hotel, startAddress: 'Hotel', stopAddress: 'Hotel' },
        { id: 'a4', empId: '100', employee: 'Test Employee', dateKey: '2026-10-04', start: new Date('2026-10-04T09:00:00'), stop: new Date('2026-10-04T18:00:00'), startPoint: hotel, stopPoint: hotel, startAddress: 'Hotel', stopAddress: 'Hotel' },
        { id: 'a5', empId: '100', employee: 'Test Employee', dateKey: '2026-10-05', start: new Date('2026-10-05T09:00:00'), stop: new Date('2026-10-05T18:00:00'), startPoint: home, stopPoint: home, startAddress: 'Home', stopAddress: 'Home' },
      ],
    };

    const html = renderToStaticMarkup(React.createElement(EmployeeTourPlanReport, { report: null, attendance, dealers: null }));
    assert.match(html, /Hotel \(03-10-2026–04-10-2026\)/);
    assert.match(html, /View inferred Home \/ Hotel anchor history/);
  } finally {
    await vite.close();
  }
});
