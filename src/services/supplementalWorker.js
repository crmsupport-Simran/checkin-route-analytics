import { parseAttendanceBuffer, parseDealersBuffer } from './supplementalParser';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ stage: 'Parsing workbook…', progress: 40 });
    const result = data.kind === 'dealers'
      ? parseDealersBuffer(data.fileBuffer)
      : parseAttendanceBuffer(data.fileBuffer);
    self.postMessage({ stage: 'Building search indexes…', progress: 90 });
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message || 'The file could not be read.' });
  }
};
