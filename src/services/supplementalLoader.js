export function parseSupplemental(file, kind, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./supplementalWorker.js', import.meta.url), { type: 'module' });
    const reader = new FileReader();
    reader.onprogress = (event) => { if (event.lengthComputable) onProgress({ progress: Math.round(event.loaded / event.total * 25), stage: 'Reading file…' }); };
    reader.onerror = () => { worker.terminate(); reject(new Error('The selected file could not be read.')); };
    worker.onerror = () => { worker.terminate(); reject(new Error('This file could not be processed. Please check the workbook and try again.')); };
    worker.onmessage = ({ data }) => {
      if (data.error) { worker.terminate(); reject(new Error(data.error)); }
      else if (data.result) { worker.terminate(); resolve(data.result); }
      else onProgress(data);
    };
    reader.onload = () => worker.postMessage({ kind, fileBuffer: reader.result }, [reader.result]);
    reader.readAsArrayBuffer(file);
  });
}
